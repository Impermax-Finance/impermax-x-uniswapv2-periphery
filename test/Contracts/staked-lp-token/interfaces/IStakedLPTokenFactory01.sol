pragma solidity >=0.5.0;

interface IStakedLPTokenFactory01 {
	
	event StakedLPTokenCreated(address indexed token0, address indexed token1, address indexed stakingRewards, address stakedLPToken, uint);

	function router() external view returns (address);
	function WETH() external view returns (address);
	function getStakedLPToken(address) external view returns (address);
	function allStakedLPToken(uint) external view returns (address);
	function allStakedLPTokenLength() external view returns (uint);
	
	function createStakedLPToken(address stakingRewards) external returns (address stakedLPToken);
	
}