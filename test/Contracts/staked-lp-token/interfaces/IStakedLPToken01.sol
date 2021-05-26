pragma solidity >=0.5.0;

interface IStakedLPToken01 {

	/*** Impermax ERC20 ***/
	
	event Transfer(address indexed from, address indexed to, uint value);
	event Approval(address indexed owner, address indexed spender, uint value);
	
	function name() external pure returns (string memory);
	function symbol() external pure returns (string memory);
	function decimals() external pure returns (uint8);
	function totalSupply() external view returns (uint);
	function balanceOf(address owner) external view returns (uint);
	function allowance(address owner, address spender) external view returns (uint);
	function approve(address spender, uint value) external returns (bool);
	function transfer(address to, uint value) external returns (bool);
	function transferFrom(address from, address to, uint value) external returns (bool);
	
	function DOMAIN_SEPARATOR() external view returns (bytes32);
	function PERMIT_TYPEHASH() external pure returns (bytes32);
	function nonces(address owner) external view returns (uint);
	function permit(address owner, address spender, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s) external;
	
	/*** Pool Token ***/
	
	event Mint(address indexed sender, address indexed minter, uint mintAmount, uint mintTokens);
	event Redeem(address indexed sender, address indexed redeemer, uint redeemAmount, uint redeemTokens);
	event Sync(uint totalBalance);
	
	function underlying() external view returns (address);
	function factory() external view returns (address);
	function totalBalance() external view returns (uint);
	function MINIMUM_LIQUIDITY() external pure returns (uint);

	function exchangeRate() external returns (uint);
	function mint(address minter) external returns (uint mintTokens);
	function redeem(address redeemer) external returns (uint redeemAmount);
	function skim(address to) external;
	function sync() external;
	
	function _setFactory() external;
	
	/*** StakedLPToken ***/
	
	event Reinvest(address indexed caller, uint256 reward, uint256 bounty);
	
	function isStakedLPToken() external pure returns (bool);
	function stakingRewards() external view returns (address);
	function rewardsToken() external view returns (address);
	function router() external view returns (address);
	function WETH() external view returns (address);
	function token0() external view returns (address);
	function token1() external view returns (address);
	function REINVEST_BOUNTY() external pure returns (uint256);
	
	function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
	function price0CumulativeLast() external view returns (uint256);
	function price1CumulativeLast() external view returns (uint256);

	function _initialize (
		address _stakingRewards,
		address _underlying,
		address _rewardsToken,
		address _token0,
		address _token1,
		address _router,
		address _WETH
	) external;

	function reinvest() external;
}