pragma solidity >=0.5.0;

interface IRouter02 {
	function factory() external pure returns (address);
	function bDeployer() external pure returns (address);
	function cDeployer() external pure returns (address);
	function WETH() external pure returns (address);
	
	function mint(address poolToken, uint amount, address to, uint deadline) external returns (uint tokens);
	function mintETH(address poolToken, address to, uint deadline) external payable returns (uint tokens);
	function mintCollateral(address poolToken, uint amount, address to, uint deadline, bytes calldata permitData) external returns (uint tokens);
	
	function redeem(address poolToken, uint tokens, address to, uint deadline, bytes calldata permitData) external returns (uint amount);
	function redeemETH(address poolToken, uint tokens, address to, uint deadline, bytes calldata permitData) external returns (uint amountETH);

	function borrow(address borrowable, uint amount, address to, uint deadline, bytes calldata permitData) external;
	function borrowETH(address borrowable, uint amountETH, address to, uint deadline, bytes calldata permitData) external;
	
	function repay(address borrowable, uint amountMax, address borrower, uint deadline) external returns (uint amount);
	function repayETH(address borrowable, address borrower, uint deadline) external payable returns (uint amountETH);

	function liquidate(address borrowable, uint amountMax, address borrower, address to, uint deadline) external returns (uint amount, uint seizeTokens);
	function liquidateETH(address borrowable, address borrower, address to, uint deadline) external payable returns (uint amountETH, uint seizeTokens);
	
	function leverage(
		address uniswapV2Pair, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin,
		address to, uint deadline, bytes calldata permitDataA, bytes calldata permitDataB
	) external;
	function deleverage(
		address uniswapV2Pair, uint redeemTokens, uint amountAMin, uint amountBMin, uint deadline, bytes calldata permitData
	) external;
	
	function isStakedLPToken(address underlying) external view returns(bool);
	function getUniswapV2Pair(address underlying) external view returns (address);
	function getBorrowable(address uniswapV2Pair, uint8 index) external view returns (address borrowable);
	function getCollateral(address uniswapV2Pair) external view returns (address collateral);
	function getLendingPool(address uniswapV2Pair) external view returns (address collateral, address borrowableA, address borrowableB);
}