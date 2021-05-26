pragma solidity >=0.5.0;

interface IStakingRewards {
    function rewardsToken() external view returns (address);
    function stakingToken() external view returns (address);
    function balanceOf(address account) external view returns (uint256);

    function stake(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function getReward() external;
}