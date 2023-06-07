const { expect } = require("chai");
const { ethers } = require("hardhat");
const ERC20_ABI = require('./abis/ERC20.json');
const UNISWAPV2ROUTER02_ABI = require('./abis/UniswapV2Router02.json');
const ROUTER02_ABI = require('./abis/Router02.json');

const USDT_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const MAI_ADDRESS = "0xa3fa99a148fa48d14ed51d610c367c61876997f1";
const USDT_MAI_QUICKSWAP_LP_ADDRESS = "0xE89faE1B4AdA2c869f05a0C96C87022DaDC7709a";
const ROUTER02_ADDRESS = "0x4e69cf49ff3af82efe304a3c723556efb7434736";
const USER = "0x459e213d8b5e79d706ab22b945e3af983d51bc4c";
const QUICKSWAP_ROUTER = "0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff";

describe.only("Router03 contract", function () {
  // USER (0x459...) already has USDT and MAI in their account. They have already given USDT & MAI token approval
  // to quickSwapRouterContract.
  it("Should add MAI/USDT liquidity to QuickSwap and then mint collateral", async function () {
    const impersonatedUSER = await ethers.getImpersonatedSigner(USER);

    // Deposit USDT + MAI liquidity into quickswap
    var quickSwapRouterContract = new ethers.Contract(QUICKSWAP_ROUTER, UNISWAPV2ROUTER02_ABI);
    quickSwapRouterContract = quickSwapRouterContract.connect(impersonatedUSER);

    var LPcontract = new ethers.Contract(USDT_MAI_QUICKSWAP_LP_ADDRESS, ERC20_ABI);
    LPcontract = LPcontract.connect(impersonatedUSER);

    console.log(await LPcontract.balanceOf(USER));
    const x = await quickSwapRouterContract.addLiquidity(
      USDT_ADDRESS,
      MAI_ADDRESS,
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

    var router02Contract = new ethers.Contract(ROUTER02_ADDRESS, ROUTER02_ABI);
    router02Contract = router02Contract.connect(impersonatedUSER);
  });
});