var HDWalletProvider = require("truffle-hdwallet-provider");

module.exports = {
	contracts_directory: "./contracts",
	networks: {
		development: {
			host: "127.0.0.1",	
			port: 7545,		
			network_id: "*",
			gasPrice: 2000,
		},
		ropsten: {
			provider: function() {
				return new HDWalletProvider(process.env.MNEMONIC, "https://ropsten.infura.io/v3/" + process.env.API_KEY)
			},
			network_id: 3,
			gas: 8000000      //make sure this gas allocation isn't over 8M
		}
	},
	compilers: {
		solc: {
			version: "0.6.6",
			settings: {
				optimizer: {
					enabled: true,
					runs: 999999
				},
			},
		},
	},
	plugins: [
		'truffle-plugin-verify'
	],
	api_keys: {
		etherscan: process.env.ETHERSCAN_KEY
	},
};
