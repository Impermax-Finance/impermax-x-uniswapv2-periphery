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
  },
  networks: {
    hardhat: {
      forking: {
        url: "https://arbitrum-mainnet.infura.io/v3/6e758ef5d39a4fdeba50de7d10d08448",
        blockNumber: 96406905
      }
    }
  },
};
