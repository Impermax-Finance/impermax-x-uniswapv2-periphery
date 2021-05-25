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

const oneMantissa = (new BN(10)).pow(new BN(18));
const UNI_LP_AMOUNT = oneMantissa;
const ETH_LP_AMOUNT = oneMantissa.div(new BN(100));
const UNI_LEND_AMOUNT = oneMantissa.mul(new BN(10));
const ETH_LEND_AMOUNT = oneMantissa.div(new BN(10));
const UNI_BORROW_AMOUNT = UNI_LP_AMOUNT.div(new BN(2));
const ETH_BORROW_AMOUNT = ETH_LP_AMOUNT.div(new BN(2));
const UNI_REPAY_AMOUNT1 = UNI_BORROW_AMOUNT.div(new BN(2));
const ETH_REPAY_AMOUNT1 = ETH_BORROW_AMOUNT.div(new BN(2));
const UNI_REPAY_AMOUNT2 = UNI_BORROW_AMOUNT;
const ETH_REPAY_AMOUNT2 = ETH_BORROW_AMOUNT;
// with default settings the max leverage is 7.61x
const UNI_LEVERAGE_AMOUNT_HIGH = oneMantissa.mul(new BN(7));
const ETH_LEVERAGE_AMOUNT_HIGH = oneMantissa.mul(new BN(7)).div(new BN(100));
const UNI_LEVERAGE_AMOUNT = oneMantissa.mul(new BN(6));
const ETH_LEVERAGE_AMOUNT = oneMantissa.mul(new BN(6)).div(new BN(100));
const LEVERAGE = new BN(7);
// enough price change cause to be liquidatable
const UNI_BUY = oneMantissa.mul(new BN(1200)).div(new BN(1000));
const ETH_BOUGHT = oneMantissa.mul(new BN(10)).div(new BN(1000));
const UNI_LIQUIDATE_AMOUNT = oneMantissa.div(new BN(10));
const ETH_LIQUIDATE_AMOUNT = oneMantissa.mul(new BN(6)).div(new BN(100));
const UNI_LIQUIDATE_AMOUNT2 = oneMantissa.mul(new BN(100));
const ETH_LIQUIDATE_AMOUNT2 = oneMantissa.mul(new BN(10));
const MAX_APPROVE_ETH_AMOUNT = oneMantissa.mul(new BN(6)).div(new BN(100));

let LP_AMOUNT;
let ETH_IS_A;
const INITIAL_EXCHANGE_RATE = oneMantissa;
const MINIMUM_LIQUIDITY = new BN(1000);

async function checkETHBalance(operation, user, expectedChange, negative = false) {
	const balancePrior = await web3.eth.getBalance(user)
	const receipt = await operation;
	const balanceAfter = await web3.eth.getBalance(user);
	const gasUsed = receipt.receipt.gasUsed;
	if (negative) {
		const balanceDiff = bnMantissa((balancePrior*1 - balanceAfter*1) / 1e18);
		const expected = bnMantissa((expectedChange*1 + gasUsed*1) / 1e18);
		expectAlmostEqualMantissa(balanceDiff, expected);
	} else {
		const balanceDiff = bnMantissa((balanceAfter*1 - balancePrior*1) / 1e18);
		const expected = bnMantissa((expectedChange*1 - gasUsed*1) / 1e18);
		expectAlmostEqualMantissa(balanceDiff, expected);
	}
}

contract('Router02', function (accounts) {
	let root = accounts[0];
	let borrower = accounts[1];
	let lender = accounts[2];
	let liquidator = accounts[3];
	
	let uniswapV2Factory;
	let simpleUniswapOracle;
	let impermaxFactory;
	let WETH;
	let UNI;
	let uniswapV2Pair;
	let collateral;
	let borrowableWETH;
	let borrowableUNI;
	let router;
	
	before(async () => {
		uniswapV2Factory = await UniswapV2Factory.new(address(0));
		simpleUniswapOracle = await SimpleUniswapOracle.new();
		const bDeployer = await BDeployer.new();
		const cDeployer = await CDeployer.new();
		impermaxFactory = await Factory.new(address(0), address(0), bDeployer.address, cDeployer.address, simpleUniswapOracle.address);
		WETH = await WETH9.new();
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
		await simpleUniswapOracle.initialize(uniswapV2PairAddress);
		collateralAddress = await impermaxFactory.createCollateral.call(uniswapV2PairAddress);
		borrowable0Address = await impermaxFactory.createBorrowable0.call(uniswapV2PairAddress);
		borrowable1Address = await impermaxFactory.createBorrowable1.call(uniswapV2PairAddress);
		await impermaxFactory.createCollateral(uniswapV2PairAddress);
		await impermaxFactory.createBorrowable0(uniswapV2PairAddress);
		await impermaxFactory.createBorrowable1(uniswapV2PairAddress);
		await impermaxFactory.initializeLendingPool(uniswapV2PairAddress);
		collateral = await Collateral.at(collateralAddress);
		const borrowable0 = await Borrowable.at(borrowable0Address);
		const borrowable1 = await Borrowable.at(borrowable1Address);
		ETH_IS_A = await borrowable0.underlying() == WETH.address;
		if (ETH_IS_A) [borrowableWETH, borrowableUNI] = [borrowable0, borrowable1];
		else [borrowableWETH, borrowableUNI] = [borrowable1, borrowable0]
		router = await Router02.new(impermaxFactory.address, bDeployer.address, cDeployer.address, WETH.address);
		await increaseTime(3700); // wait for oracle to be ready
		await permitGenerator.initialize();
	});

	it('optimal liquidity', async () => {
		const t1 = getAmounts('8', '1000', '0', '600', ETH_IS_A);
		const r1 = await router._optimalLiquidity(uniswapV2Pair.address, t1.amountADesired, t1.amountBDesired, t1.amountAMin, t1.amountBMin);
		expect(r1.amountA * 1).to.eq(ETH_IS_A ? 8 : 800);
		expect(r1.amountB * 1).to.eq(ETH_IS_A ? 800 : 8);
		const t2 = getAmounts('10', '700', '6', '0', ETH_IS_A);
		const r2 = await router._optimalLiquidity(uniswapV2Pair.address, t2.amountADesired, t2.amountBDesired, t2.amountAMin, t2.amountBMin);
		expect(r2.amountA * 1).to.eq(ETH_IS_A ? 7 : 700);
		expect(r2.amountB * 1).to.eq(ETH_IS_A ? 700 : 7);
		const t3 = getAmounts('5', '1000', '0', '600', ETH_IS_A);
		await expectRevert(
			router._optimalLiquidity(uniswapV2Pair.address, t3.amountADesired, t3.amountBDesired, t3.amountAMin, t3.amountBMin),
			ETH_IS_A ? "ImpermaxRouter: INSUFFICIENT_B_AMOUNT" : "ImpermaxRouter: INSUFFICIENT_A_AMOUNT"
		);
		const t4 = getAmounts('10', '500', '6', '0', ETH_IS_A);
		await expectRevert(
			router._optimalLiquidity(uniswapV2Pair.address, t4.amountADesired, t4.amountBDesired, t4.amountAMin, t4.amountBMin),
			ETH_IS_A ? "ImpermaxRouter: INSUFFICIENT_A_AMOUNT" : "ImpermaxRouter: INSUFFICIENT_B_AMOUNT"
		);
	});
	
	it('mint', async () => {
		//Mint UNI
		await expectRevert(router.mint(borrowableUNI.address, UNI_LEND_AMOUNT, lender, '0', {from: lender}), "ImpermaxRouter: EXPIRED");
		await expectRevert.unspecified(router.mint(borrowableUNI.address, UNI_LEND_AMOUNT, lender, DEADLINE, {from: lender}));
		await UNI.approve(router.address, UNI_LEND_AMOUNT, {from: lender});
		await router.mint(borrowableUNI.address, UNI_LEND_AMOUNT, lender, DEADLINE, {from: lender});
		expect(await borrowableUNI.balanceOf(lender) * 1).to.eq(UNI_LEND_AMOUNT.sub(MINIMUM_LIQUIDITY) * 1);
		
		//Mint ETH
		await expectRevert(router.mintETH(borrowableUNI.address, lender, DEADLINE, {value: ETH_LEND_AMOUNT, from: lender}), "ImpermaxRouter: NOT_WETH");
		await expectRevert(router.mintETH(borrowableWETH.address, lender, '0', {value: ETH_LEND_AMOUNT, from: lender}), "ImpermaxRouter: EXPIRED");
		op = router.mintETH(borrowableWETH.address, lender, DEADLINE, {value: ETH_LEND_AMOUNT, from: lender});
		await checkETHBalance(op, lender, ETH_LEND_AMOUNT, true);
		expect(await borrowableWETH.balanceOf(lender) * 1).to.eq(ETH_LEND_AMOUNT.sub(MINIMUM_LIQUIDITY) * 1);
		
		//Mint LP
		await expectRevert.unspecified(router.mintCollateral(collateral.address, LP_AMOUNT, borrower, DEADLINE, '0x', {from: borrower}));
		const permitData = await permitGenerator.permit(uniswapV2Pair, borrower, router.address, LP_AMOUNT, DEADLINE);
		await router.mintCollateral(collateral.address, LP_AMOUNT, borrower, DEADLINE, permitData, {from: borrower});
		expect(await collateral.balanceOf(borrower) * 1).to.eq(LP_AMOUNT.sub(MINIMUM_LIQUIDITY) * 1);
	});

	it('redeem', async () => {
		const UNI_REDEEM_AMOUNT = await borrowableUNI.balanceOf(lender);
		const ETH_REDEEM_AMOUNT = await borrowableWETH.balanceOf(lender);
		expect(UNI_REDEEM_AMOUNT * 1).to.be.gt(1);
		expect(ETH_REDEEM_AMOUNT * 1).to.be.gt(1);
		
		//Redeem UNI
		await expectRevert(router.redeem(borrowableUNI.address, UNI_REDEEM_AMOUNT, lender, '0', '0x', {from: lender}), "ImpermaxRouter: EXPIRED");
		await expectRevert(router.redeem(borrowableUNI.address, UNI_REDEEM_AMOUNT, lender, DEADLINE, '0x', {from: lender}), "Impermax: TRANSFER_NOT_ALLOWED");
		const permitRedeemUNI = await permitGenerator.permit(borrowableUNI, lender, router.address, UNI_REDEEM_AMOUNT, DEADLINE);
		await router.redeem(borrowableUNI.address, UNI_REDEEM_AMOUNT, lender, DEADLINE, permitRedeemUNI, {from: lender});
		expect(await UNI.balanceOf(lender) * 1).to.eq(UNI_REDEEM_AMOUNT * 1);
		
		//Redeem ETH
		await expectRevert(router.redeemETH(borrowableUNI.address, UNI_REDEEM_AMOUNT, lender, DEADLINE, '0x', {from: lender}), "ImpermaxRouter: NOT_WETH");
		await expectRevert(router.redeemETH(borrowableWETH.address, ETH_REDEEM_AMOUNT, lender, '0', '0x', {from: lender}), "ImpermaxRouter: EXPIRED");
		await expectRevert(router.redeemETH(borrowableWETH.address, ETH_REDEEM_AMOUNT, lender, DEADLINE, '0x', {from: lender}), "Impermax: TRANSFER_NOT_ALLOWED");
		const permitRedeemETH = await permitGenerator.permit(borrowableWETH, lender, router.address, ETH_REDEEM_AMOUNT, DEADLINE);
		const op = router.redeemETH(borrowableWETH.address, ETH_REDEEM_AMOUNT, lender, DEADLINE, permitRedeemETH, {from: lender});
		await checkETHBalance(op, lender, ETH_REDEEM_AMOUNT);
		
		//Restore initial state
		await UNI.approve(router.address, UNI_REDEEM_AMOUNT, {from: lender});
		await router.mint(borrowableUNI.address, UNI_REDEEM_AMOUNT, lender, DEADLINE, {from: lender});
		await router.mintETH(borrowableWETH.address, lender, DEADLINE, {value: ETH_REDEEM_AMOUNT, from: lender});		
	});
	
	it('borrow', async () => {
		//Borrow UNI
		await expectRevert(router.borrow(borrowableUNI.address, UNI_BORROW_AMOUNT, borrower, '0', '0x', {from: borrower}), "ImpermaxRouter: EXPIRED");
		await expectRevert(router.borrow(borrowableUNI.address, UNI_BORROW_AMOUNT, borrower, DEADLINE, '0x', {from: borrower}), "Impermax: BORROW_NOT_ALLOWED");
		const permitBorrowUNI = await permitGenerator.borrowPermit(borrowableUNI, borrower, router.address, UNI_BORROW_AMOUNT, DEADLINE);
		await router.borrow(borrowableUNI.address, UNI_BORROW_AMOUNT, borrower, DEADLINE, permitBorrowUNI, {from: borrower});
		expect(await UNI.balanceOf(borrower) * 1).to.eq(UNI_BORROW_AMOUNT * 1);
		const borrowBalanceUNI = UNI_BORROW_AMOUNT.mul(new BN(1001)).div(new BN(1000));
		expect(await borrowableUNI.borrowBalance(borrower) * 1).to.eq(borrowBalanceUNI * 1);
		
		//Borrow ETH
		await expectRevert(router.borrowETH(borrowableUNI.address, UNI_BORROW_AMOUNT, borrower, DEADLINE, '0x', {from: borrower}), "ImpermaxRouter: NOT_WETH");
		await expectRevert(router.borrowETH(borrowableWETH.address, ETH_BORROW_AMOUNT, borrower, '0', '0x', {from: borrower}), "ImpermaxRouter: EXPIRED");
		await expectRevert(router.borrowETH(borrowableWETH.address, ETH_BORROW_AMOUNT, borrower, DEADLINE, '0x', {from: borrower}), "Impermax: BORROW_NOT_ALLOWED");
		const permitBorrowETH = await permitGenerator.borrowPermit(borrowableWETH, borrower, router.address, ETH_BORROW_AMOUNT, DEADLINE);
		const op = router.borrowETH(borrowableWETH.address, ETH_BORROW_AMOUNT, borrower, DEADLINE, permitBorrowETH, {from: borrower});
		await checkETHBalance(op, borrower, ETH_BORROW_AMOUNT);
		const borrowBalanceETH = ETH_BORROW_AMOUNT.mul(new BN(1001)).div(new BN(1000));
		expect(await borrowableWETH.borrowBalance(borrower) * 1).to.eq(borrowBalanceETH * 1);
	});
	
	it('repay', async () => {
		//Repay UNI
		await expectRevert(router.repay(borrowableUNI.address, UNI_REPAY_AMOUNT1, borrower, '0', {from: borrower}), "ImpermaxRouter: EXPIRED");
		await expectRevert.unspecified(router.repay(borrowableUNI.address, UNI_REPAY_AMOUNT1, borrower, DEADLINE, {from: borrower}));
		await UNI.approve(router.address, UNI_REPAY_AMOUNT1, {from: borrower});
		const actualRepayUNI = await router.repay.call(borrowableUNI.address, UNI_REPAY_AMOUNT1, borrower, DEADLINE, {from: borrower});
		expect(actualRepayUNI*1).to.eq(UNI_REPAY_AMOUNT1*1);
		const expectedUNIBalance = (await UNI.balanceOf(borrower)).sub(actualRepayUNI);
		const expectedUNIBorrowed = (await borrowableUNI.borrowBalance(borrower)).sub(actualRepayUNI);
		await router.repay(borrowableUNI.address, UNI_REPAY_AMOUNT1, borrower, DEADLINE, {from: borrower});
		expect(await UNI.balanceOf(borrower) * 1).to.eq(expectedUNIBalance * 1);
		expectAlmostEqualMantissa(await borrowableUNI.borrowBalance(borrower), expectedUNIBorrowed);
		
		//Repay ETH
		await expectRevert(router.repayETH(borrowableUNI.address, borrower, DEADLINE, {value: ETH_REPAY_AMOUNT1, from: borrower}), "ImpermaxRouter: NOT_WETH");
		await expectRevert(router.repayETH(borrowableWETH.address, borrower, '0', {value: ETH_REPAY_AMOUNT1, from: borrower}), "ImpermaxRouter: EXPIRED");
		const actualRepayETH = await router.repayETH.call(borrowableWETH.address, borrower, DEADLINE, {value: ETH_REPAY_AMOUNT1, from: borrower});
		expect(actualRepayETH*1).to.eq(ETH_REPAY_AMOUNT1*1);
		const expectedETHBorrowed = (await borrowableWETH.borrowBalance(borrower)).sub(actualRepayETH);
		const op = router.repayETH(borrowableWETH.address, borrower, DEADLINE, {value: ETH_REPAY_AMOUNT1, from: borrower});
		await checkETHBalance(op, borrower, actualRepayETH, true);
		expectAlmostEqualMantissa(await borrowableWETH.borrowBalance(borrower), expectedETHBorrowed);
	});
	
	it('repay exceeding borrowed', async () => {
		//Repay UNI
		await UNI.mint(borrower, UNI_REPAY_AMOUNT2);
		const borrowedUNI = await borrowableUNI.borrowBalance(borrower);
		expect(borrowedUNI*1).to.be.lt(UNI_REPAY_AMOUNT2*1);
		await UNI.approve(router.address, UNI_REPAY_AMOUNT2, {from: borrower});
		const actualRepayUNI = await router.repay.call(borrowableUNI.address, UNI_REPAY_AMOUNT2, borrower, DEADLINE, {from: borrower});
		expectAlmostEqualMantissa(actualRepayUNI, borrowedUNI);
		const expectedUNIBalance = (await UNI.balanceOf(borrower)).sub(actualRepayUNI);
		const expectedUNIBorrowed = 0;
		await router.repay(borrowableUNI.address, UNI_REPAY_AMOUNT2, borrower, DEADLINE, {from: borrower});
		expectAlmostEqualMantissa(await UNI.balanceOf(borrower), expectedUNIBalance);
		expect(await borrowableUNI.borrowBalance(borrower) * 1).to.eq(expectedUNIBorrowed * 1);
		
		//Repay ETH
		const borrowedETH = await borrowableWETH.borrowBalance(borrower);
		expect(borrowedETH*1).to.be.lt(ETH_REPAY_AMOUNT2*1);
		const actualRepayETH = await router.repayETH.call(borrowableWETH.address, borrower, DEADLINE, {value: ETH_REPAY_AMOUNT2, from: borrower});
		expectAlmostEqualMantissa(actualRepayETH, borrowedETH);
		const expectedETHBorrowed = 0;
		const op = router.repayETH(borrowableWETH.address, borrower, DEADLINE, {value: ETH_REPAY_AMOUNT2, from: borrower});
		await checkETHBalance(op, borrower, actualRepayETH, true);
		expect(await borrowableWETH.borrowBalance(borrower) * 1).to.eq(expectedETHBorrowed * 1);
	});
	
	it('leverage', async () => {
		await expectRevert(
			leverage(router, uniswapV2Pair, borrower, '100', '8000', '90', '7000', '0x', '0x', ETH_IS_A),
			ETH_IS_A ? "ImpermaxRouter: INSUFFICIENT_A_AMOUNT" : "ImpermaxRouter: INSUFFICIENT_B_AMOUNT"
		);
		await expectRevert(
			leverage(router, uniswapV2Pair, borrower, '80', '10000', '70', '9000', '0x', '0x', ETH_IS_A),
			ETH_IS_A ? "ImpermaxRouter: INSUFFICIENT_B_AMOUNT" : "ImpermaxRouter: INSUFFICIENT_A_AMOUNT"
		);
		await expectRevert( 
			leverage(router, uniswapV2Pair, borrower, ETH_LEVERAGE_AMOUNT, UNI_LEVERAGE_AMOUNT, '0', '0', '0x', '0x', ETH_IS_A), 
			'Impermax: BORROW_NOT_ALLOWED'
		);
		
		const permitBorrowUNIHigh = await permitGenerator.borrowPermit(borrowableUNI, borrower, router.address, UNI_LEVERAGE_AMOUNT_HIGH, DEADLINE);
		const permitBorrowETHHigh = await permitGenerator.borrowPermit(borrowableWETH, borrower, router.address, ETH_LEVERAGE_AMOUNT_HIGH, DEADLINE);
		await expectRevert( 
			leverage(router, uniswapV2Pair, borrower, ETH_LEVERAGE_AMOUNT_HIGH, 
				UNI_LEVERAGE_AMOUNT_HIGH, '0', '0', permitBorrowETHHigh, permitBorrowUNIHigh, ETH_IS_A), 
			'Impermax: INSUFFICIENT_LIQUIDITY'
		);

		const balancePrior = await collateral.balanceOf(borrower);
		const permitBorrowUNI = await permitGenerator.borrowPermit(borrowableUNI, borrower, router.address, UNI_LEVERAGE_AMOUNT, DEADLINE);
		const permitBorrowETH = await permitGenerator.borrowPermit(borrowableWETH, borrower, router.address, ETH_LEVERAGE_AMOUNT, DEADLINE);
		const receipt = await leverage(router, uniswapV2Pair, borrower, ETH_LEVERAGE_AMOUNT, UNI_LEVERAGE_AMOUNT, '0', '0', permitBorrowETH, permitBorrowUNI, ETH_IS_A);
		const balanceAfter = await collateral.balanceOf(borrower);
		const expectedDiff = LP_AMOUNT.mul(LEVERAGE.sub(new BN(1)));
		const borrowBalanceUNI = UNI_LEVERAGE_AMOUNT.mul(new BN(1001)).div(new BN(1000));
		const borrowBalanceETH = ETH_LEVERAGE_AMOUNT.mul(new BN(1001)).div(new BN(1000));
		//console.log(balancePrior / 1e18);
		//console.log(balanceAfter / 1e18);
		//console.log(borrowBalanceUNI / 1e18);
		//console.log(borrowBalanceETH / 1e18);
		//console.log(receipt.receipt.gasUsed);
		expectAlmostEqualMantissa(balanceAfter.sub(balancePrior), expectedDiff);
		expect(await borrowableUNI.borrowBalance(borrower) * 1).to.eq(borrowBalanceUNI * 1);
		expect(await borrowableWETH.borrowBalance(borrower) * 1).to.eq(borrowBalanceETH * 1);
	});
	
	it('liquidate', async () => {
		// Change oracle price
		await UNI.mint(uniswapV2Pair.address, UNI_BUY);
		await uniswapV2Pair.swap(ETH_IS_A ? ETH_BOUGHT : '0', ETH_IS_A ? '0' : ETH_BOUGHT, address(0), '0x');
		await simpleUniswapOracle.getResult(uniswapV2Pair.address);
		await expectRevert(
			router.liquidate(borrowableUNI.address, '0', borrower, liquidator, DEADLINE, {from: liquidator}),
			"Impermax: INSUFFICIENT_SHORTFALL"
		);
		await increaseTime(3700);
		await borrowableUNI.accrueInterest();
		await borrowableWETH.accrueInterest();
		
		// Liquidate UNI
		const UNIBorrowedPrior = await borrowableUNI.borrowBalance(borrower);
		const borrowerBalance0 = await collateral.balanceOf(borrower);
		const liquidatorBalance0 = await collateral.balanceOf(liquidator);
		await UNI.mint(liquidator, UNI_LIQUIDATE_AMOUNT);
		await expectRevert(router.liquidate(borrowableUNI.address, '0', borrower, liquidator, '0', {from: liquidator}),"ImpermaxRouter: EXPIRED");
		await expectRevert.unspecified(router.liquidate(borrowableUNI.address, UNI_LIQUIDATE_AMOUNT, borrower, liquidator, DEADLINE, {from: liquidator}));
		await UNI.approve(router.address, UNI_LIQUIDATE_AMOUNT, {from: liquidator});
		const liquidateUNIResult = await router.liquidate.call(borrowableUNI.address, UNI_LIQUIDATE_AMOUNT, borrower, liquidator, DEADLINE, {from: liquidator});
		await router.liquidate(borrowableUNI.address, UNI_LIQUIDATE_AMOUNT, borrower, liquidator, DEADLINE, {from: liquidator});
		const UNIBorrowedAfter = await borrowableUNI.borrowBalance(borrower);
		const borrowerBalance1 = await collateral.balanceOf(borrower);
		const liquidatorBalance1 = await collateral.balanceOf(liquidator);
		expect(await UNI.balanceOf(liquidator) * 1).to.eq(0);
		expect(liquidateUNIResult.amount * 1).to.eq(UNI_LIQUIDATE_AMOUNT * 1);
		expectAlmostEqualMantissa(UNIBorrowedAfter, UNIBorrowedPrior.sub(UNI_LIQUIDATE_AMOUNT));
		expect(liquidateUNIResult.seizeTokens * 1).to.be.gt(0);
		expect(borrowerBalance0.sub(borrowerBalance1) * 1).to.eq(liquidatorBalance1.sub(liquidatorBalance0) * 1);
		expectAlmostEqualMantissa(borrowerBalance0.sub(borrowerBalance1), liquidateUNIResult.seizeTokens);
		
		// Liquidate ETH
		const ETHBorrowedPrior = await borrowableWETH.borrowBalance(borrower);
		await expectRevert(router.liquidateETH(borrowableUNI.address, borrower, liquidator, DEADLINE, {value: ETH_LIQUIDATE_AMOUNT, from: liquidator}),"ImpermaxRouter: NOT_WETH");
		await expectRevert(router.liquidateETH(borrowableWETH.address, borrower, liquidator, '0', {value: ETH_LIQUIDATE_AMOUNT, from: liquidator}),"ImpermaxRouter: EXPIRED");
		const liquidateETHResult = await router.liquidateETH.call(borrowableWETH.address, borrower, liquidator, DEADLINE, {value: ETH_LIQUIDATE_AMOUNT, from: liquidator});
		const op = router.liquidateETH(borrowableWETH.address, borrower, liquidator, DEADLINE, {value: ETH_LIQUIDATE_AMOUNT, from: liquidator});
		await checkETHBalance(op, liquidator, ETH_LIQUIDATE_AMOUNT, true);
		const ETHBorrowedAfter = await borrowableWETH.borrowBalance(borrower);
		const borrowerBalance2 = await collateral.balanceOf(borrower);
		const liquidatorBalance2 = await collateral.balanceOf(liquidator);
		expect(liquidateETHResult.amountETH * 1).to.eq(ETH_LIQUIDATE_AMOUNT * 1);
		expectAlmostEqualMantissa(ETHBorrowedAfter, ETHBorrowedPrior.sub(ETH_LIQUIDATE_AMOUNT));
		expect(liquidateETHResult.seizeTokens * 1).to.be.gt(0);
		expect(borrowerBalance1.sub(borrowerBalance2) * 1).to.eq(liquidatorBalance2.sub(liquidatorBalance1) * 1);
		expectAlmostEqualMantissa(borrowerBalance1.sub(borrowerBalance2), liquidateETHResult.seizeTokens);
		
		// Liquidate MAX
		const expectedUNIAmount = await borrowableUNI.borrowBalance(borrower);
		const expectedETHAmount = await borrowableWETH.borrowBalance(borrower);
		await UNI.mint(liquidator, UNI_LIQUIDATE_AMOUNT2);
		await UNI.approve(router.address, UNI_LIQUIDATE_AMOUNT2, {from: liquidator});
		const liquidateUNIResult2 = await router.liquidate.call(borrowableUNI.address, UNI_LIQUIDATE_AMOUNT2, borrower, liquidator, DEADLINE, {from: liquidator});
		expectAlmostEqualMantissa(liquidateUNIResult2.amount, expectedUNIAmount);
		const op2 = router.liquidateETH(borrowableWETH.address, borrower, liquidator, DEADLINE, {value: ETH_LIQUIDATE_AMOUNT2, from: liquidator});
		await checkETHBalance(op2, liquidator, expectedETHAmount, true);
	});
	
	it('impermaxBorrow is forbidden to non-borrowable', async () => {
		// Fails because data cannot be empty
		await expectRevert.unspecified(router.impermaxBorrow(router.address, address(0), '0', '0x'));
		const data = encode(
			['uint8', 'address', 'uint8', 'bytes'],
			[0, uniswapV2Pair.address, 0, '0x']
		);
		// Fails becasue msg.sender is not a borrowable
		await expectRevert(router.impermaxBorrow(router.address, address(0), '0', data), 'ImpermaxRouter: UNAUTHORIZED_CALLER');
		// Fails because sender is not the router
		const borrowableA = ETH_IS_A ? borrowableWETH : borrowableUNI;
		await expectRevert(borrowableA.borrow(borrower, router.address, '0', data), 'ImpermaxRouter: SENDER_NOT_ROUTER');
	});
	
	it('impermaxRedeem is forbidden to non-collateral', async () => {
		// Fails because data cannot be empty
		await expectRevert.unspecified(router.impermaxRedeem(router.address, '0', '0x'));
		const data = encode(
			['uint8', 'address', 'uint8', 'bytes'],
			[0, uniswapV2Pair.address, 0, '0x']
		);
		// Fails becasue msg.sender is not a borrowable
		await expectRevert(router.impermaxRedeem(router.address, '0', data), 'ImpermaxRouter: UNAUTHORIZED_CALLER');
		// Fails because sender is not the router
		await expectRevert(collateral.flashRedeem(router.address, '0', data), 'ImpermaxRouter: SENDER_NOT_ROUTER');
	});
	
	it('address calculation', async () => {
		//console.log(keccak256(Collateral.bytecode));
		//console.log(keccak256(Borrowable.bytecode));
		//console.log(await router.getLendingPool(uniswapV2Pair.address));
		const expectedBorrowableA = ETH_IS_A ? borrowableWETH.address : borrowableUNI.address;
		const expectedBorrowableB = ETH_IS_A ? borrowableUNI.address : borrowableWETH.address;
		const expectedCollateral = collateral.address;
		expect(await router.getBorrowable(uniswapV2Pair.address, '0')).to.eq(expectedBorrowableA);
		expect(await router.getBorrowable(uniswapV2Pair.address, '1')).to.eq(expectedBorrowableB);
		expect(await router.getCollateral(uniswapV2Pair.address)).to.eq(expectedCollateral);
		const lendingPool = await router.getLendingPool(uniswapV2Pair.address);
		expect(lendingPool.borrowableA).to.eq(expectedBorrowableA);
		expect(lendingPool.borrowableB).to.eq(expectedBorrowableB);
		expect(lendingPool.collateral).to.eq(expectedCollateral);
		const receipt = await router.getBorrowable.sendTransaction(uniswapV2Pair.address, '0');
		//console.log(receipt.receipt.gasUsed); // costs around 1800
	});
	
	it('max approve', async () => {
		//Redeem ETH
		await expectRevert(router.redeemETH(borrowableWETH.address, MAX_APPROVE_ETH_AMOUNT, lender, DEADLINE, '0x', {from: lender}), "Impermax: TRANSFER_NOT_ALLOWED");
		expect(await borrowableWETH.allowance(lender, router.address) * 1).to.eq(0);
		const permitRedeemETH = await permitGenerator.permit(borrowableWETH, lender, router.address, MAX_UINT_256, DEADLINE);
		await router.redeemETH(borrowableWETH.address, MAX_APPROVE_ETH_AMOUNT, lender, DEADLINE, permitRedeemETH, {from: lender});
		expect(await borrowableWETH.allowance(lender, router.address) * 1).to.eq(MAX_UINT_256 * 1);
	});
	
	it('router balance is always 0', async () => {
		expect(await UNI.balanceOf(router.address) * 1).to.eq(0);
		expect(await WETH.balanceOf(router.address) * 1).to.eq(0);
		expect(await borrowableUNI.balanceOf(router.address) * 1).to.eq(0);
		expect(await borrowableWETH.balanceOf(router.address) * 1).to.eq(0);
		expect(await collateral.balanceOf(router.address) * 1).to.eq(0);
		expect(await web3.eth.getBalance(router.address) * 1).to.eq(0);
	});
});