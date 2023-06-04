const { expect } = require("chai");
const { ethers } = require("hardhat");
const ERC20_ABI = require('./abis/ERC20.json');

const USDT_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const MAI_ADDRESS = "0xa3fa99a148fa48d14ed51d610c367c61876997f1";
const USER = "0x459e213d8b5e79d706ab22b945e3af983d51bc4c";

describe("Router03 contract", function () {
  it("Should perform a sanity check", async function () {
    // Give 1000 UDST and 1000 MAI to USER
    const impersonatedUSDTwhale = await ethers.getImpersonatedSigner("0xf977814e90da44bfa03b6295a0616a897441acec");
    const impersonatedMAIwhale = await ethers.getImpersonatedSigner("0xc63c477465a792537d291adb32ed15c0095e106b");
    var USDTcontract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI)
    USDTcontract = USDTcontract.connect(impersonatedUSDTwhale);
    var MAIcontract = new ethers.Contract(MAI_ADDRESS, ERC20_ABI)
    MAIcontract = MAIcontract.connect(impersonatedMAIwhale);
    await USDTcontract.transfer(USER, "1000000000");
    await MAIcontract.transfer(USER, "1000000000000000000000");
  });
});