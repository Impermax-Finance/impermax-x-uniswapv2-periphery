pragma solidity =0.5.16;

import "./StakedLPToken01.sol";
import "./interfaces/IStakingRewards.sol";
import "./interfaces/IStakedLPTokenFactory01.sol";
import "./interfaces/IUniswapV2Pair.sol";

contract StakedLPTokenFactory01 is IStakedLPTokenFactory01 {
	address public router;
	address public WETH;

	mapping(address => address) public getStakedLPToken;
	address[] public allStakedLPToken;

	event StakedLPTokenCreated(address indexed token0, address indexed token1, address indexed stakingRewards, address stakedLPToken, uint);

	constructor(address _router, address _WETH) public {
		router = _router;
		WETH = _WETH;
	}

	function allStakedLPTokenLength() external view returns (uint) {
		return allStakedLPToken.length;
	}

	function createStakedLPToken(address stakingRewards) external returns (address stakedLPToken) {
		require(getStakedLPToken[stakingRewards] == address(0), "StakedLPTokenFactory: STAKING_REWARDS_EXISTS");
		address pair = IStakingRewards(stakingRewards).stakingToken();
		address rewardsToken = IStakingRewards(stakingRewards).rewardsToken();
		address token0 = IUniswapV2Pair(pair).token0();
		address token1 = IUniswapV2Pair(pair).token1();
		bytes memory bytecode = type(StakedLPToken01).creationCode;
		assembly {
			stakedLPToken := create2(0, add(bytecode, 32), mload(bytecode), stakingRewards)
		}
		StakedLPToken01(stakedLPToken)._initialize(stakingRewards, pair, rewardsToken, token0, token1, router, WETH);
		getStakedLPToken[stakingRewards] = stakedLPToken;
		allStakedLPToken.push(stakedLPToken);
		emit StakedLPTokenCreated(token0, token1, stakingRewards, stakedLPToken, allStakedLPToken.length);
	}
}
