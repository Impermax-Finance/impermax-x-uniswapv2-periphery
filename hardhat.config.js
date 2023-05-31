/** @type import('hardhat/config').HardhatUserConfig */
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
