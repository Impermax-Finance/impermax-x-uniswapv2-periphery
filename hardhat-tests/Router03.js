const { expect } = require("chai");
const { ethers } = require("hardhat");
const ERC20_ABI = require('./abis/ERC20.json');
const UNISWAPV2ROUTER02_ABI = require('./abis/UniswapV2Router02.json');

const USDT_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const MAI_ADDRESS = "0xa3fa99a148fa48d14ed51d610c367c61876997f1";
const USDT_MAI_QUICKSWAP_LP_ADDRESS = "0xE89faE1B4AdA2c869f05a0C96C87022DaDC7709a";
const USER = "0x459e213d8b5e79d706ab22b945e3af983d51bc4c";
const QUICKSWAP_ROUTER = "0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff";
const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

describe("Router03 contract", function () {
  it("Should add MAI/USDT liquidity to QuickSwap and then mint collateral", async function () {
    const impersonatedUSDTwhale = await ethers.getImpersonatedSigner("0xf977814e90da44bfa03b6295a0616a897441acec");
    const impersonatedMAIwhale = await ethers.getImpersonatedSigner("0xc63c477465a792537d291adb32ed15c0095e106b");
    const impersonatedUSER = await ethers.getImpersonatedSigner(USER);

    // Give 1000 UDST and 1000 MAI to USER
    var USDTcontract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI);
    USDTcontract = USDTcontract.connect(impersonatedUSDTwhale);
    var MAIcontract = new ethers.Contract(MAI_ADDRESS, ERC20_ABI);
    MAIcontract = MAIcontract.connect(impersonatedMAIwhale);
    await USDTcontract.transfer(USER, "1000000000");
    await MAIcontract.transfer(USER, "1000000000000000000000");

    // Give USDT and MAI approvals to quick swap router for USER
    USDTcontract = USDTcontract.connect(impersonatedUSER);
    await USDTcontract.approve(QUICKSWAP_ROUTER, MAX_UINT256);
    MAIcontract = MAIcontract.connect(impersonatedUSER);
    await MAIcontract.approve(QUICKSWAP_ROUTER, MAX_UINT256);

    // Deposit USDT + MAI liquidity into quickswap
    var quickSwapRouterContract = new ethers.Contract(QUICKSWAP_ROUTER, UNISWAPV2ROUTER02_ABI);
    quickSwapRouterContract = quickSwapRouterContract.connect(impersonatedUSER);

    var LPcontract = new ethers.Contract(USDT_MAI_QUICKSWAP_LP_ADDRESS, ERC20_ABI);
    LPcontract = LPcontract.connect(impersonatedUSER);

    console.log(await LPcontract.balanceOf(USER));
    const x = await quickSwapRouterContract.addLiquidity(
      "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      "0xa3Fa99A148fA48D14Ed51d610c367C61876997F1",
      // Desired 1.991837 USDT
      "1991837",
      // Desired 2.0102 MAI
      "2010263787060743761",
      "1989845",
      "2008253523273683017",
      USER,
      16858989410
    );
    console.log(await LPcontract.balanceOf(USER));
  });
});