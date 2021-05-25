const {
	bnMantissa,
	BN,
} = require('./JS');
const {
	address,
	encode,
	encodePacked,
} = require('./Ethereum');
const { hexlify, keccak256, toUtf8Bytes } = require('ethers/utils');
const { ecsign } = require('ethereumjs-util');

//UTILITIES

const MAX_UINT_256 = (new BN(2)).pow(new BN(256)).sub(new BN(1));
const DEADLINE = MAX_UINT_256;

function getAmounts(amount0Desired, amount1Desired, amount0Min, amount1Min, A_IS_0) {
	return {
		amountADesired: A_IS_0 ? amount0Desired : amount1Desired,
		amountBDesired: A_IS_0 ? amount1Desired : amount0Desired,
		amountAMin: A_IS_0 ? amount0Min : amount1Min,
		amountBMin: A_IS_0 ? amount1Min : amount0Min,	
	};
}

function leverage(router, uniswapV2Pair, borrower, amount0Desired, amount1Desired, amount0Min, amount1Min, permitData0, permitData1, A_IS_0) {
	const t = getAmounts(amount0Desired, amount1Desired, amount0Min, amount1Min, A_IS_0);
	const permitDataA = A_IS_0 ? permitData0 : permitData1;
	const permitDataB = A_IS_0 ? permitData1 : permitData0;
	return router.leverage(
		uniswapV2Pair.address, 
		t.amountADesired, 
		t.amountBDesired, 
		t.amountAMin, 
		t.amountBMin, 
		borrower, 
		DEADLINE, 
		permitDataA, 
		permitDataB, 
		{from: borrower}
	);
}

function deleverage(router, uniswapV2Pair, borrower, redeemTokens, amount0Min, amount1Min, permitData, A_IS_0) {
	return router.deleverage(
		uniswapV2Pair.address, 
		redeemTokens, 
		A_IS_0 ? amount0Min : amount1Min,
		A_IS_0 ? amount1Min : amount0Min,
		DEADLINE, 
		permitData, 
		{from: borrower}
	);
}

//EIP712

function getDomainSeparator(name, tokenAddress) {
	return keccak256(
		encode(
			['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
			[
				keccak256(toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
				keccak256(toUtf8Bytes(name)),
				keccak256(toUtf8Bytes('1')),
				1,
				tokenAddress
			]
		)
	);
}

const PERMIT_TYPEHASH = keccak256(
	toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
);
const BORROW_PERMIT_TYPEHASH = keccak256(
	toUtf8Bytes('BorrowPermit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
);

async function getApprovalDigest(name, tokenAddress, approve, nonce, deadline, borrowPermit) {
	const DOMAIN_SEPARATOR = getDomainSeparator(name, tokenAddress);
	const TYPEHASH = borrowPermit ? BORROW_PERMIT_TYPEHASH : PERMIT_TYPEHASH;
	return keccak256(
		encodePacked(
			['bytes1', 'bytes1', 'bytes32', 'bytes32'],
			[
				'0x19',
				'0x01',
				DOMAIN_SEPARATOR,
				keccak256(
					encode(
						['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
						[TYPEHASH, approve.owner, approve.spender, approve.value.toString(), nonce.toString(), deadline.toString()]
					)
				)
			]
		)
	);
}

async function getPermit(opts) {
	const {token, owner, spender, value, deadline, private_key, borrowPermit} = opts;
	const name = await token.name();
	const nonce = await token.nonces(owner);
	const digest = await getApprovalDigest(
		name,
		token.address,
		{owner, spender, value},
		nonce,
		deadline,
		borrowPermit
	);
	const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(private_key, 'hex'));
	return {v, r: hexlify(r), s: hexlify(s)};
}

const permitGenerator = {
	//Note: activatePermit is false by default. If you want to test the permit you need to configure mnemonic with the one of your ganache wallet
	activatePermit: false,
	mnemonic: 'artist rigid narrow swallow catch attend pulp victory drift outside prepare tribe',
	PKs: [],
	initialize: async () => {
		if (!permitGenerator.activatePermit) return;
		const { mnemonicToSeed } = require('bip39');
		const { hdkey } = require('ethereumjs-wallet');
		const seed = await mnemonicToSeed(permitGenerator.mnemonic);
		const hdk = hdkey.fromMasterSeed(seed);
		for (i = 0; i < 10; i++) {
			const borrowerWallet = hdk.derivePath("m/44'/60'/0'/0/"+i).getWallet();
			permitGenerator.PKs[borrowerWallet.getAddressString().toLowerCase()] = borrowerWallet.getPrivateKey();
		}
	},
	_permit: async (token, owner, spender, value, deadline, borrowPermit) => {
		if (permitGenerator.activatePermit) {
			const {v, r, s} = await getPermit({
				token, owner, spender, value, deadline, private_key: permitGenerator.PKs[owner.toLowerCase()], borrowPermit
			});
			return encode (
				['bool', 'uint8', 'bytes32', 'bytes32'],
				[value.eq(MAX_UINT_256), v, r, s]
			);
		}
		else {
			if (borrowPermit) await token.borrowApprove(spender, value, {from: owner});
			else await token.approve(spender, value, {from: owner});
			return '0x';
		}
	},
	permit: async (token, owner, spender, value, deadline) => {
		return await permitGenerator._permit(token, owner, spender, value, deadline, false);
	},
	borrowPermit: async (token, owner, spender, value, deadline) => {
		return await permitGenerator._permit(token, owner, spender, value, deadline, true);
	},
}


module.exports = {
	MAX_UINT_256,
	getAmounts,
	leverage,
	deleverage,
	getDomainSeparator,
	getApprovalDigest,
	getPermit,
	permitGenerator,
};
