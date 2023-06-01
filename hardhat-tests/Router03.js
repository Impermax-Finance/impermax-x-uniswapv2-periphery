const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Router03 contract", function () {
  it("Should perform a sanity check", async function () {
    const [owner] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance("0x459e213d8b5e79d706ab22b945e3af983d51bc4c");
    console.log("balance:", balance);
  });
});