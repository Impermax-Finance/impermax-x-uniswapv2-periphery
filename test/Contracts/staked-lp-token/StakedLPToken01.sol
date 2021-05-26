pragma solidity =0.5.16;

import "./PoolToken.sol";
import "./interfaces/IStakingRewards.sol";
import "./interfaces/IStakedLPToken01.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IUniswapV2Router01.sol";
import "./interfaces/IUniswapV2Pair.sol";
import "./libraries/SafeToken.sol";
import "./libraries/Math.sol";

contract StakedLPToken01 is IStakedLPToken01, IUniswapV2Pair, PoolToken {
    using SafeToken for address;
	
	bool public constant isStakedLPToken = true;
	
	address public stakingRewards;
	address public rewardsToken;
	address public router;
	address public WETH;
	address public token0;
	address public token1;
	uint256 public constant REINVEST_BOUNTY = 0.02e18;

	event Reinvest(address indexed caller, uint256 reward, uint256 bounty);
	
	function _initialize(
		address _stakingRewards,
		address _underlying,
		address _rewardsToken,
		address _token0,
		address _token1,
		address _router,
		address _WETH
	) external {
		require(factory == address(0), "StakedLPToken01: FACTORY_ALREADY_SET"); // sufficient check
		factory = msg.sender;
		_setName("Staked Uniswap V2", "STKD-UNI-V2");
		stakingRewards = _stakingRewards;
		underlying = _underlying;
		rewardsToken = _rewardsToken;
		token0 = _token0;
		token1 = _token1;
		router = _router;
		WETH = _WETH;
		_rewardsToken.safeApprove(address(_router), uint256(-1));
		_WETH.safeApprove(address(_router), uint256(-1));
		_underlying.safeApprove(address(_stakingRewards), uint256(-1));
	}
	
	/*** PoolToken Overrides ***/
	
	function _update() internal {
		totalBalance = IStakingRewards(stakingRewards).balanceOf(address(this));
		emit Sync(totalBalance);
	}
	
	// this low-level function should be called from another contract
	function mint(address minter) external nonReentrant update returns (uint mintTokens) {
		uint mintAmount = underlying.myBalance();
		IStakingRewards(stakingRewards).stake(mintAmount);
		mintTokens = mintAmount.mul(1e18).div(exchangeRate());

		if(totalSupply == 0) {
			// permanently lock the first MINIMUM_LIQUIDITY tokens
			mintTokens = mintTokens.sub(MINIMUM_LIQUIDITY);
			_mint(address(0), MINIMUM_LIQUIDITY);
		}
		require(mintTokens > 0, "StakedLPToken01: MINT_AMOUNT_ZERO");
		_mint(minter, mintTokens);
		emit Mint(msg.sender, minter, mintAmount, mintTokens);
	}

	// this low-level function should be called from another contract
	function redeem(address redeemer) external nonReentrant update returns (uint redeemAmount) {
		uint redeemTokens = balanceOf[address(this)];
		redeemAmount = redeemTokens.mul(exchangeRate()).div(1e18);

		require(redeemAmount > 0, "StakedLPToken01: REDEEM_AMOUNT_ZERO");
		require(redeemAmount <= totalBalance, "StakedLPToken01: INSUFFICIENT_CASH");
		_burn(address(this), redeemTokens);
		IStakingRewards(stakingRewards).withdraw(redeemAmount);
		_safeTransfer(redeemer, redeemAmount);
		emit Redeem(msg.sender, redeemer, redeemAmount, redeemTokens);		
	}
	
	/*** Reinvest ***/
	
	function _optimalDepositA(uint256 amountA, uint256 reserveA) internal pure returns (uint256) {
		uint256 a = uint256(1997).mul(reserveA);
		uint256 b = amountA.mul(1000).mul(reserveA).mul(3988);
		uint256 c = Math.sqrt(a.mul(a).add(b));
		return c.sub(a).div(1994);
	}
	
	function approveRouter(address token, uint256 amount) internal {
		if (IERC20(token).allowance(address(this), router) >= amount) return;
		token.safeApprove(address(router), uint256(-1));
	}
	
	function swapExactTokensForTokens(address tokenIn, address tokenOut, uint256 amount) internal {
		address[] memory path = new address[](2);
		path[0] = address(tokenIn);
		path[1] = address(tokenOut);
		approveRouter(tokenIn, amount);
		IUniswapV2Router01(router).swapExactTokensForTokens(amount, 0, path, address(this), now);
	}
	
	function addLiquidity(address tokenA, address tokenB, uint256 amountA, uint256 amountB) internal returns (uint256 liquidity) {
		approveRouter(tokenA, amountA);
		approveRouter(tokenB, amountB);
		(,,liquidity) = IUniswapV2Router01(router).addLiquidity(tokenA, tokenB, amountA, amountB, 0, 0, address(this), now);
	}
	
	function reinvest() external nonReentrant update {
		require(msg.sender == tx.origin);
		// 1. Withdraw all the rewards.		
		IStakingRewards(stakingRewards).getReward();
		uint256 reward = rewardsToken.myBalance();
		if (reward == 0) return;
		// 2. Send the reward bounty to the caller.
		uint256 bounty = reward.mul(REINVEST_BOUNTY) / 1e18;
		rewardsToken.safeTransfer(msg.sender, bounty);
		// 3. Convert all the remaining rewards to token0 or token1.
		address tokenA;
		address tokenB;
		if (token0 == rewardsToken || token1 == rewardsToken) {
			(tokenA, tokenB) = token0 == rewardsToken ? (token0, token1) : (token1, token0);
		}
		else {
			swapExactTokensForTokens(rewardsToken, WETH, reward.sub(bounty));
			if (token0 == WETH || token1 == WETH) { 
				(tokenA, tokenB) = token0 == WETH ? (token0, token1) : (token1, token0);
			}
			else {
				swapExactTokensForTokens(WETH, token0, WETH.myBalance());
				(tokenA, tokenB) = (token0, token1);
			}
		}
		// 4. Convert tokenA to LP Token underlyings.
		uint256 totalAmountA = tokenA.myBalance();
		assert(totalAmountA > 0);
		(uint256 r0, uint256 r1,) = IUniswapV2Pair(underlying).getReserves();
		uint256 reserveA = tokenA == token0 ? r0 : r1;
		uint256 swapAmount = _optimalDepositA(totalAmountA, reserveA);
		swapExactTokensForTokens(tokenA, tokenB, swapAmount);
		uint256 liquidity = addLiquidity(tokenA, tokenB, totalAmountA.sub(swapAmount), tokenB.myBalance());
		// 5. Stake the LP Tokens. 
		IStakingRewards(stakingRewards).stake(liquidity);
		emit Reinvest(msg.sender, reward, bounty);
	}
		
	/*** Mirrored From uniswapV2Pair ***/

	function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) {
		(reserve0, reserve1, blockTimestampLast) = IUniswapV2Pair(underlying).getReserves();
		// if no token has been minted yet mirror uniswap getReserves
		if (totalSupply == 0) return (reserve0, reserve1, blockTimestampLast);
		// else, return the underlying reserves of this contract
		uint256 _totalBalance = totalBalance;
		uint256 _totalSupply = IUniswapV2Pair(underlying).totalSupply();
		reserve0 = safe112(_totalBalance.mul(reserve0).div(_totalSupply));
		reserve1 = safe112(_totalBalance.mul(reserve1).div(_totalSupply));
		require(reserve0 > 100 && reserve1 > 100, "StakedLPToken01: INSUFFICIENT_RESERVES");
	}
	function price0CumulativeLast() external view returns (uint256) {
		return IUniswapV2Pair(underlying).price0CumulativeLast();
	}
	function price1CumulativeLast() external view returns (uint256) {
		return IUniswapV2Pair(underlying).price1CumulativeLast();
	}

	/*** Utilities ***/
	
    function safe112(uint n) internal pure returns (uint112) {
        require(n < 2**112, "StakedLPToken01: SAFE112");
        return uint112(n);
    }
}