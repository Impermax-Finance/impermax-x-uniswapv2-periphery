const {
	expectEqual,
	expectEvent,
	expectRevert,
	expectAlmostEqualMantissa,
	bnMantissa,
	BN,
} = require('./Utils/JS');
const {
	address,
	increaseTime,
	encode,
} = require('./Utils/Ethereum');
const {
	getAmounts,
	leverage,
	deleverage,
	permitGenerator,
} = require('./Utils/ImpermaxPeriphery');
const { keccak256, toUtf8Bytes } = require('ethers/utils');

const MAX_UINT_256 = (new BN(2)).pow(new BN(256)).sub(new BN(1));
const DEADLINE = MAX_UINT_256;

const MockERC20 = artifacts.require('MockERC20');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');
const UniswapV2Pair = artifacts.require('UniswapV2Pair');
const SimpleUniswapOracle = artifacts.require('SimpleUniswapOracle');
const Factory = artifacts.require('Factory');
const BDeployer = artifacts.require('BDeployer');
const CDeployer = artifacts.require('CDeployer');
const Collateral = artifacts.require('Collateral');
const Borrowable = artifacts.require('Borrowable');
const Router02 = artifacts.require('Router02');
const WETH9 = artifacts.require('WETH9');
const Quick = artifacts.require('QuickToken');
const StakingRewards = artifacts.require('StakingRewards');
const StakingRewardsFactory = artifacts.require('StakingRewardsFactory');
const StakedLPToken = artifacts.require('StakedLPToken');
const StakedLPTokenFactory = artifacts.require('StakedLPTokenFactory');

const oneMantissa = (new BN(10)).pow(new BN(18));
const UNI_LP_AMOUNT = oneMantissa;
const ETH_LP_AMOUNT = oneMantissa.div(new BN(100));
const UNI_LEND_AMOUNT = oneMantissa.mul(new BN(10));
const ETH_LEND_AMOUNT = oneMantissa.div(new BN(10));
const UNI_BORROW_AMOUNT = UNI_LP_AMOUNT.div(new BN(2));
const ETH_BORROW_AMOUNT = ETH_LP_AMOUNT.div(new BN(2));
const UNI_LEVERAGE_AMOUNT = oneMantissa.mul(new BN(6));
const ETH_LEVERAGE_AMOUNT = oneMantissa.mul(new BN(6)).div(new BN(100));
const LEVERAGE = new BN(7);
const DLVRG = new BN(5);
const UNI_DLVRG_AMOUNT = oneMantissa.mul(new BN(5));
const ETH_DLVRG_AMOUNT = oneMantissa.mul(new BN(5)).div(new BN(100));
const DLVRG_REFUND_NUM = new BN(13);
const DLVRG_REFUND_DEN = new BN(2);

let LP_AMOUNT;
let LP_TOKENS;
let ETH_IS_A;
const INITIAL_EXCHANGE_RATE = oneMantissa;
const MINIMUM_LIQUIDITY = new BN(1000);

contract('Deleverage02 Staked', function (accounts) {
	let root = accounts[0];
	let borrower = accounts[1];
	let lender = accounts[2];
	let liquidator = accounts[3];
	let minter = accounts[4];
	
	let quick;
	let uniswapV2Factory;
	let stakingRewardsFactory;
	let stakedLPTokenFactory;
	let simpleUniswapOracle;
	let impermaxFactory;
	let WETH;
	let UNI;
	let uniswapV2Pair;
	let stakingRewards;
	let stakedLPToken;
	let collateral;
	let borrowableWETH;
	let borrowableUNI;
	let router;
	
	beforeEach(async () => {
		// Create base contracts
		quick = await Quick.new(minter, minter, 0);
		uniswapV2Factory = await UniswapV2Factory.new(address(0));
		stakingRewardsFactory = await StakingRewardsFactory.new(quick.address, 0);
		simpleUniswapOracle = await SimpleUniswapOracle.new();
		const bDeployer = await BDeployer.new();
		const cDeployer = await CDeployer.new();
		impermaxFactory = await Factory.new(address(0), address(0), bDeployer.address, cDeployer.address, simpleUniswapOracle.address);
		WETH = await WETH9.new();
		router = await Router02.new(impermaxFactory.address, bDeployer.address, cDeployer.address, WETH.address);
		stakedLPTokenFactory = await StakedLPTokenFactory.new(address(0), address(0));
		// Create Uniswap Pair
		UNI = await MockERC20.new('Uniswap', 'UNI');
		const uniswapV2PairAddress = await uniswapV2Factory.createPair.call(WETH.address, UNI.address);
		await uniswapV2Factory.createPair(WETH.address, UNI.address);
		uniswapV2Pair = await UniswapV2Pair.at(uniswapV2PairAddress);
		await UNI.mint(borrower, UNI_LP_AMOUNT);
		await UNI.mint(lender, UNI_LEND_AMOUNT);
		await WETH.deposit({value: ETH_LP_AMOUNT, from: borrower});
		await UNI.transfer(uniswapV2PairAddress, UNI_LP_AMOUNT, {from: borrower});
		await WETH.transfer(uniswapV2PairAddress, ETH_LP_AMOUNT, {from: borrower});
		await uniswapV2Pair.mint(borrower);
		LP_AMOUNT = await uniswapV2Pair.balanceOf(borrower);
		// Create staking contract
		await stakingRewardsFactory.deploy(uniswapV2PairAddress, 0, 0);
		stakingRewardsAddress = (await stakingRewardsFactory.stakingRewardsInfoByStakingToken(uniswapV2PairAddress)).stakingRewards;
		stakingRewards = await StakingRewards.at(stakingRewardsAddress);
		// Create staked LP token
		const stakedLPTokenAddress = await stakedLPTokenFactory.createStakedLPToken.call(stakingRewardsAddress);
		await stakedLPTokenFactory.createStakedLPToken(stakingRewardsAddress);
		stakedLPToken = await StakedLPToken.at(stakedLPTokenAddress);
		// Create Pair On Impermax
		collateralAddress = await impermaxFactory.createCollateral.call(stakedLPTokenAddress);
		borrowable0Address = await impermaxFactory.createBorrowable0.call(stakedLPTokenAddress);
		borrowable1Address = await impermaxFactory.createBorrowable1.call(stakedLPTokenAddress);
		await impermaxFactory.createCollateral(stakedLPTokenAddress);
		await impermaxFactory.createBorrowable0(stakedLPTokenAddress);
		await impermaxFactory.createBorrowable1(stakedLPTokenAddress);
		await impermaxFactory.initializeLendingPool(stakedLPTokenAddress);
		collateral = await Collateral.at(collateralAddress);
		const borrowable0 = await Borrowable.at(borrowable0Address);
		const borrowable1 = await Borrowable.at(borrowable1Address);
		ETH_IS_A = await borrowable0.underlying() == WETH.address;
		if (ETH_IS_A) [borrowableWETH, borrowableUNI] = [borrowable0, borrowable1];
		else [borrowableWETH, borrowableUNI] = [borrowable1, borrowable0];
		await increaseTime(3700); // wait for oracle to be ready
		await permitGenerator.initialize();
		
		//Mint UNI
		await UNI.approve(router.address, UNI_LEND_AMOUNT, {from: lender});
		await router.mint(borrowableUNI.address, UNI_LEND_AMOUNT, lender, DEADLINE, {from: lender});
		//Mint ETH
		await router.mintETH(borrowableWETH.address, lender, DEADLINE, {value: ETH_LEND_AMOUNT, from: lender});
		//Mint LP
		const permitData = await permitGenerator.permit(uniswapV2Pair, borrower, router.address, LP_AMOUNT, DEADLINE);
		LP_TOKENS = await router.mintCollateral.call(collateral.address, LP_AMOUNT, borrower, DEADLINE, permitData, {from: borrower});
		await router.mintCollateral(collateral.address, LP_AMOUNT, borrower, DEADLINE, permitData, {from: borrower});
		//Leverage
		const permitBorrowUNI = await permitGenerator.borrowPermit(borrowableUNI, borrower, router.address, UNI_LEVERAGE_AMOUNT, DEADLINE);
		const permitBorrowETH = await permitGenerator.borrowPermit(borrowableWETH, borrower, router.address, ETH_LEVERAGE_AMOUNT, DEADLINE);
		await leverage(router, stakedLPToken, borrower, ETH_LEVERAGE_AMOUNT, UNI_LEVERAGE_AMOUNT, '0', '0', permitBorrowETH, permitBorrowUNI, ETH_IS_A);
	});
	
	it('deleverage', async () => {
		const LP_DLVRG_TOKENS = DLVRG.mul(LP_TOKENS);
		const ETH_DLVRG_MIN = ETH_DLVRG_AMOUNT.mul(new BN(9999)).div(new BN(10000));
		const ETH_DLVRG_HIGH = ETH_DLVRG_AMOUNT.mul(new BN(10001)).div(new BN(10000));
		const UNI_DLVRG_MIN = UNI_DLVRG_AMOUNT.mul(new BN(9999)).div(new BN(10000));
		const UNI_DLVRG_HIGH = UNI_DLVRG_AMOUNT.mul(new BN(10001)).div(new BN(10000));
		await expectRevert(
			deleverage(router, stakedLPToken, borrower, LP_DLVRG_TOKENS, ETH_DLVRG_MIN, UNI_DLVRG_MIN, '0x', ETH_IS_A),
			'Impermax: TRANSFER_NOT_ALLOWED'
		);
		const permit = await permitGenerator.permit(collateral, borrower, router.address, LP_DLVRG_TOKENS, DEADLINE);
		await expectRevert(
			deleverage(router, stakedLPToken, borrower, '0', ETH_DLVRG_MIN, UNI_DLVRG_MIN, permit, ETH_IS_A),
			"ImpermaxRouter: REDEEM_ZERO"
		);
		await expectRevert(
			deleverage(router, stakedLPToken, borrower, LP_DLVRG_TOKENS, ETH_DLVRG_HIGH, UNI_DLVRG_MIN, permit, ETH_IS_A),
			ETH_IS_A ? "ImpermaxRouter: INSUFFICIENT_A_AMOUNT" : "ImpermaxRouter: INSUFFICIENT_B_AMOUNT"
		);
		await expectRevert(
			deleverage(router, stakedLPToken, borrower, LP_DLVRG_TOKENS, ETH_DLVRG_MIN, UNI_DLVRG_HIGH, permit, ETH_IS_A),
			ETH_IS_A ? "ImpermaxRouter: INSUFFICIENT_B_AMOUNT" : "ImpermaxRouter: INSUFFICIENT_A_AMOUNT"
		);
		
		const balancePrior = await collateral.balanceOf(borrower);
		const borrowBalanceUNIPrior = await borrowableUNI.borrowBalance(borrower);
		const borrowBalanceETHPrior = await borrowableWETH.borrowBalance(borrower);
		const receipt = await deleverage(router, stakedLPToken, borrower, LP_DLVRG_TOKENS, ETH_DLVRG_MIN, UNI_DLVRG_MIN, permit, ETH_IS_A);
		const balanceAfter = await collateral.balanceOf(borrower);
		const borrowBalanceUNIAfter = await borrowableUNI.borrowBalance(borrower);
		const borrowBalanceETHAfter = await borrowableWETH.borrowBalance(borrower);
		//console.log(balancePrior / 1e18, balanceAfter / 1e18);
		//console.log(borrowBalanceUNIPrior / 1e18, borrowBalanceUNIAfter / 1e18);
		//console.log(borrowBalanceETHPrior / 1e18, borrowBalanceETHAfter / 1e18);
		//console.log(receipt.receipt.gasUsed);		
		expectAlmostEqualMantissa(balancePrior.sub(balanceAfter), LP_DLVRG_TOKENS);
		expectAlmostEqualMantissa(borrowBalanceUNIPrior.sub(borrowBalanceUNIAfter), UNI_DLVRG_AMOUNT);
		expectAlmostEqualMantissa(borrowBalanceETHPrior.sub(borrowBalanceETHAfter), ETH_DLVRG_AMOUNT);
	});
	
	it('deleverage with refund UNI', async () => {
		const LP_DLVRG_TOKENS = DLVRG_REFUND_NUM.mul(LP_TOKENS).div(DLVRG_REFUND_DEN);
		const permit = await permitGenerator.permit(collateral, borrower, router.address, LP_DLVRG_TOKENS, DEADLINE);
		
		const ETHBalancePrior = await web3.eth.getBalance(borrower);
		const UNIBalancePrior = await UNI.balanceOf(borrower);
		const receipt = await deleverage(router, stakedLPToken, borrower, LP_DLVRG_TOKENS, '0', '0', permit, ETH_IS_A);
		const ETHBalanceAfter = await web3.eth.getBalance(borrower);
		const UNIBalanceAfter = await UNI.balanceOf(borrower);
		expect(await borrowableWETH.borrowBalance(borrower) * 1).to.eq(0);
		expect(await borrowableUNI.borrowBalance(borrower) * 1).to.eq(0);
		expect(ETHBalanceAfter - ETHBalancePrior).to.gt(0);
		expect(UNIBalanceAfter.sub(UNIBalancePrior) * 1).to.gt(0);
	});
});