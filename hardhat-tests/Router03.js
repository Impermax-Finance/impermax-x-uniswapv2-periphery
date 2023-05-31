const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Token contract", function () {
  it("Should perform a sanity check", async function () {
    const [owner] = await ethers.getSigners();

    console.log(owner);
  });
});