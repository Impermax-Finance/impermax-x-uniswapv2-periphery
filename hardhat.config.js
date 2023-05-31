/** @type import('hardhat/config').HardhatUserConfig */
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.6.6",
      },
    ],
  },
  paths: {
    tests: "./hardhat-tests"
  }
};
