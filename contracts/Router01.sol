pragma solidity =0.6.6;
pragma experimental ABIEncoderV2;

import "./interfaces/IRouter01.sol";
import "./interfaces/IPoolToken.sol";
import "./interfaces/IBorrowable.sol";
import "./interfaces/ICollateral.sol";
import "./interfaces/IImpermaxCallee.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IUniswapV2Pair.sol";
import "./libraries/SafeMath.sol";
import "./libraries/TransferHelper.sol";
import "./libraries/UniswapV2Library.sol";

contract Router01 is IRouter01, IImpermaxCallee {

	address public immutable override factory;
	address public immutable override bDeployer;
	address public immutable override cDeployer;
	address public immutable override WETH;

	modifier ensure(uint deadline) {
		require(deadline >= block.timestamp, "ImpermaxRouter: EXPIRED");
		_;
	}

	modifier checkETH(address poolToken) {
		require(WETH == IPoolToken(poolToken).underlying(), "ImpermaxRouter: NOT_WETH");
		_;
	}

	constructor(address _factory, address _bDeployer, address _cDeployer, address _WETH) public {
		factory = _factory;
		bDeployer = _bDeployer;
		cDeployer = _cDeployer;
		WETH = _WETH;
	}

	receive() external payable {
		assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
	}

	/*** Mint ***/
	
	function _mint(
		address poolToken, 
		address underlying, 
		uint amount,
		address from,
		address to
	) internal virtual returns (uint tokens) {
		if (from == address(this)) TransferHelper.safeTransfer(underlying, poolToken, amount);
		else TransferHelper.safeTransferFrom(underlying, from, poolToken, amount);
		tokens = IPoolToken(poolToken).mint(to);
	}
	function mint(
		address poolToken, 
		uint amount,
		address to,
		uint deadline
	) external virtual override ensure(deadline) returns (uint tokens) {
		return _mint(poolToken, IPoolToken(poolToken).underlying(), amount, msg.sender, to);
	}
	function mintETH(
		address poolToken, 
		address to,
		uint deadline
	) external virtual override payable ensure(deadline) checkETH(poolToken) returns (uint tokens) {
		IWETH(WETH).deposit{value: msg.value}();
		return _mint(poolToken, WETH, msg.value, address(this), to);
	}
	function mintCollateral(
		address poolToken, 
		uint amount,
		address to,
		uint deadline,
		bytes calldata permitData
	) external virtual override ensure(deadline) returns (uint tokens) {
		address uniswapV2Pair = IPoolToken(poolToken).underlying();
		_permitUniswapV2Pair(uniswapV2Pair, amount, deadline, permitData);
		return _mint(poolToken, uniswapV2Pair, amount, msg.sender, to);
	}
	
	/*** Redeem ***/
	
	function redeem(
		address poolToken,
		uint tokens,
		address to,
		uint deadline,
		bytes memory permitData
	) public virtual override ensure(deadline) returns (uint amount) {
		_permit(poolToken, tokens, deadline, permitData);
		IPoolToken(poolToken).transferFrom(msg.sender, poolToken, tokens);
		amount = IPoolToken(poolToken).redeem(to);
	}
	function redeemETH(
		address poolToken, 
		uint tokens,
		address to,
		uint deadline,
		bytes memory permitData
	) public virtual override ensure(deadline) checkETH(poolToken) returns (uint amountETH) {
		amountETH = redeem(poolToken, tokens, address(this), deadline, permitData);
		IWETH(WETH).withdraw(amountETH);
		TransferHelper.safeTransferETH(to, amountETH);
	}
			
	/*** Borrow ***/

	function borrow(
		address borrowable, 
		uint amount,
		address to,
		uint deadline,
		bytes memory permitData
	) public virtual override ensure(deadline) {
		_borrowPermit(borrowable, amount, deadline, permitData);
		IBorrowable(borrowable).borrow(msg.sender, to, amount, new bytes(0));
	}
	function borrowETH(
		address borrowable, 
		uint amountETH,
		address to,
		uint deadline,
		bytes memory permitData
	) public virtual override ensure(deadline) checkETH(borrowable) {
		borrow(borrowable, amountETH, address(this), deadline, permitData);
		IWETH(WETH).withdraw(amountETH);
		TransferHelper.safeTransferETH(to, amountETH);
	}
	
	/*** Repay ***/
	
	function _repayAmount(
		address borrowable, 
		uint amountMax,
		address borrower
	) internal virtual returns (uint amount) {
		IBorrowable(borrowable).accrueInterest();
		uint borrowedAmount = IBorrowable(borrowable).borrowBalance(borrower);
		amount = amountMax < borrowedAmount ? amountMax : borrowedAmount;
	}
	function repay(
		address borrowable, 
		uint amountMax,
		address borrower,
		uint deadline
	) external virtual override ensure(deadline) returns (uint amount) {
		amount = _repayAmount(borrowable, amountMax, borrower);
		TransferHelper.safeTransferFrom(IBorrowable(borrowable).underlying(), msg.sender, borrowable, amount);
		IBorrowable(borrowable).borrow(borrower, address(0), 0, new bytes(0));
	}
	function repayETH(
		address borrowable, 
		address borrower,
		uint deadline
	) external virtual override payable ensure(deadline) checkETH(borrowable) returns (uint amountETH) {
		amountETH = _repayAmount(borrowable, msg.value, borrower);
		IWETH(WETH).deposit{value: amountETH}();
		assert(IWETH(WETH).transfer(borrowable, amountETH));
		IBorrowable(borrowable).borrow(borrower, address(0), 0, new bytes(0));
		// refund surpluss eth, if any
		if (msg.value > amountETH) TransferHelper.safeTransferETH(msg.sender, msg.value - amountETH);
	}
	
	/*** Liquidate ***/

	function liquidate(
		address borrowable, 
		uint amountMax,
		address borrower,
		address to,
		uint deadline
	) external virtual override ensure(deadline) returns (uint amount, uint seizeTokens) {
		amount = _repayAmount(borrowable, amountMax, borrower);
		TransferHelper.safeTransferFrom(IBorrowable(borrowable).underlying(), msg.sender, borrowable, amount);
		seizeTokens = IBorrowable(borrowable).liquidate(borrower, to, amount, new bytes(0));
	}
	function liquidateETH(
		address borrowable, 
		address borrower,
		address to,
		uint deadline
	) external virtual override payable ensure(deadline) checkETH(borrowable) returns (uint amountETH, uint seizeTokens) {
		amountETH = _repayAmount(borrowable, msg.value, borrower);
		IWETH(WETH).deposit{value: amountETH}();
		assert(IWETH(WETH).transfer(borrowable, amountETH));
		seizeTokens = IBorrowable(borrowable).liquidate(borrower, to, amountETH, new bytes(0));
		// refund surpluss eth, if any
		if (msg.value > amountETH) TransferHelper.safeTransferETH(msg.sender, msg.value - amountETH);
	}
		
	/*** Leverage LP Token ***/
	
	function _leverage(
		address uniswapV2Pair, 
		uint amountA,
		uint amountB,
		address to
	) internal virtual {
		address borrowableA = _getBorrowable(uniswapV2Pair, 0);
		// mint collateral
		bytes memory borrowBData = abi.encode(CalleeData({
			callType: CallType.ADD_LIQUIDITY_AND_MINT,
			uniswapV2Pair: uniswapV2Pair,
			borrowableIndex: 1,
			data: abi.encode(AddLiquidityAndMintCalldata({
				amountA: amountA,
				amountB: amountB,
				to: to
			}))
		}));	
		// borrow borrowableB
		bytes memory borrowAData = abi.encode(CalleeData({
			callType: CallType.BORROWB,
			uniswapV2Pair: uniswapV2Pair,
			borrowableIndex: 0,
			data: abi.encode(BorrowBCalldata({
				borrower: msg.sender,
				receiver: address(this),
				borrowAmount: amountB,
				data: borrowBData
			}))
		}));
		// borrow borrowableA
		IBorrowable(borrowableA).borrow(msg.sender, address(this), amountA, borrowAData);	
	}
	function leverage(
		address uniswapV2Pair,  
		uint amountADesired,
		uint amountBDesired,
		uint amountAMin,
		uint amountBMin,
		address to,
		uint deadline,
		bytes calldata permitDataA,
		bytes calldata permitDataB
	) external virtual override ensure(deadline) {
		_borrowPermit(_getBorrowable(uniswapV2Pair, 0), amountADesired, deadline, permitDataA);
		_borrowPermit(_getBorrowable(uniswapV2Pair, 1), amountBDesired, deadline, permitDataB);
		(uint amountA, uint amountB) = _optimalLiquidity(uniswapV2Pair, amountADesired, amountBDesired, amountAMin, amountBMin);
		_leverage(uniswapV2Pair, amountA, amountB, to);
	}

	function _addLiquidityAndMint(
		address uniswapV2Pair, 
		uint amountA,
		uint amountB,
		address to
	) internal virtual {
		(address collateral, address borrowableA, address borrowableB) = _getLendingPool(uniswapV2Pair);
		// add liquidity to uniswap pair
		TransferHelper.safeTransfer(IBorrowable(borrowableA).underlying(), uniswapV2Pair, amountA);
		TransferHelper.safeTransfer(IBorrowable(borrowableB).underlying(), uniswapV2Pair, amountB);
		IUniswapV2Pair(uniswapV2Pair).mint(collateral);
		// mint collateral
		ICollateral(collateral).mint(to);
	}
		
	/*** Impermax Callee ***/
		
	enum CallType {ADD_LIQUIDITY_AND_MINT, BORROWB}
	struct CalleeData {
		CallType callType;
		address uniswapV2Pair;
		uint8 borrowableIndex;
		bytes data;		
	}
	struct AddLiquidityAndMintCalldata {
		uint amountA;
		uint amountB;
		address to;
	}
	struct BorrowBCalldata {
		address borrower; 
		address receiver;
		uint borrowAmount;
		bytes data;
	}
	
	function _callee(address sender, bytes memory data) internal virtual {
		CalleeData memory calleeData = abi.decode(data, (CalleeData));
		// only succeeds if called by a borrowable and if that borrowable has been called by the router
		require(sender == address(this), "ImpermaxRouter: SENDER_NOT_ROUTER");
		address declaredCaller = _getBorrowable(calleeData.uniswapV2Pair, calleeData.borrowableIndex);
		require(msg.sender == declaredCaller, "ImpermaxRouter: UNAUTHORIZED_CALLER");
		if (calleeData.callType == CallType.ADD_LIQUIDITY_AND_MINT) {
			AddLiquidityAndMintCalldata memory d = abi.decode(calleeData.data, (AddLiquidityAndMintCalldata));
			_addLiquidityAndMint(calleeData.uniswapV2Pair, d.amountA, d.amountB, d.to);
		}
		else if (calleeData.callType == CallType.BORROWB) {
			BorrowBCalldata memory d = abi.decode(calleeData.data, (BorrowBCalldata));
			address borrowableB = _getBorrowable(calleeData.uniswapV2Pair, 1);
			IBorrowable(borrowableB).borrow(d.borrower, d.receiver, d.borrowAmount, d.data);
		}
		else revert();
	}
	function impermaxBorrow(address sender, address borrower, uint borrowAmount, bytes calldata data) external virtual override {
		borrower; borrowAmount;
		_callee(sender, data);
	}
	function impermaxLiquidate(address sender, address borrower, uint repayAmount, bytes calldata data) external virtual override {
		borrower; repayAmount;
		_callee(sender, data);
	}
		
	/*** Utilities ***/
	
	function _permit(
		address poolToken, 
		uint amount, 
		uint deadline,
		bytes memory permitData
	) internal virtual {
		if (permitData.length == 0) return;
		(bool approveMax, uint8 v, bytes32 r, bytes32 s) = abi.decode(permitData, (bool, uint8, bytes32, bytes32));
		uint value = approveMax ? uint(-1) : amount;
		IPoolToken(poolToken).permit(msg.sender, address(this), value, deadline, v, r, s);
	}
	function _permitUniswapV2Pair(
		address uniswapV2Pair, 
		uint amount, 
		uint deadline,
		bytes memory permitData
	) internal virtual {
		if (permitData.length == 0) return;
		(bool approveMax, uint8 v, bytes32 r, bytes32 s) = abi.decode(permitData, (bool, uint8, bytes32, bytes32));
		uint value = approveMax ? uint(-1) : amount;
		IUniswapV2Pair(uniswapV2Pair).permit(msg.sender, address(this), value, deadline, v, r, s);
	}
	function _borrowPermit(
		address borrowable, 
		uint amount, 
		uint deadline,
		bytes memory permitData
	) internal virtual {
		if (permitData.length == 0) return;
		(bool approveMax, uint8 v, bytes32 r, bytes32 s) = abi.decode(permitData, (bool, uint8, bytes32, bytes32));
		uint value = approveMax ? uint(-1) : amount;
		IBorrowable(borrowable).borrowPermit(msg.sender, address(this), value, deadline, v, r, s);
	}
	
	function _optimalLiquidity(
		address uniswapV2Pair,
		uint amountADesired,
		uint amountBDesired,
		uint amountAMin,
		uint amountBMin
	) public virtual view returns (uint amountA, uint amountB) {
		(uint reserveA, uint reserveB,) = IUniswapV2Pair(uniswapV2Pair).getReserves();
		uint amountBOptimal = UniswapV2Library.quote(amountADesired, reserveA, reserveB);
		if (amountBOptimal <= amountBDesired) {
			require(amountBOptimal >= amountBMin, "ImpermaxRouter: INSUFFICIENT_B_AMOUNT");
			(amountA, amountB) = (amountADesired, amountBOptimal);
		} else {
			uint amountAOptimal = UniswapV2Library.quote(amountBDesired, reserveB, reserveA);
			assert(amountAOptimal <= amountADesired);
			require(amountAOptimal >= amountAMin, "ImpermaxRouter: INSUFFICIENT_A_AMOUNT");
			(amountA, amountB) = (amountAOptimal, amountBDesired);
		}
	}
	
	function _getBorrowable(address uniswapV2Pair, uint8 index) public virtual view returns (address borrowable) {
		require(index < 2, "ImpermaxRouter: INDEX_TOO_HIGH");
		borrowable = address(uint(keccak256(abi.encodePacked(
			hex"ff",
			bDeployer,
			keccak256(abi.encodePacked(factory, uniswapV2Pair, index)),
			hex"cfb224d4e917b5004e396310f6a654421defcf94c20d9800aa0dd2048b47c017" // Borrowable bytecode keccak256
		))));
	}
	function _getCollateral(address uniswapV2Pair) public virtual view returns (address collateral) {
		collateral = address(uint(keccak256(abi.encodePacked(
			hex"ff",
			cDeployer,
			keccak256(abi.encodePacked(factory, uniswapV2Pair)),
			hex"be370b6d1c8c4594feca05c9cd57348064883592ba196d65f7924f1f804a2c51" // Collateral bytecode keccak256
		))));
	}
	function _getLendingPool(address uniswapV2Pair) public virtual view returns (address collateral, address borrowableA, address borrowableB) {
		collateral = _getCollateral(uniswapV2Pair);
		borrowableA = _getBorrowable(uniswapV2Pair, 0);
		borrowableB = _getBorrowable(uniswapV2Pair, 1);
	}
}
