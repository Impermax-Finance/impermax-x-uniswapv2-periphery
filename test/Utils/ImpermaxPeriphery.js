const {
	address,
	encode,
	encodePacked,
} = require('./Ethereum');
const { hexlify, keccak256, toUtf8Bytes } = require('ethers/utils');
const { ecsign } = require('ethereumjs-util');

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


module.exports = {
	getDomainSeparator,
	getApprovalDigest,
	getPermit,
};
