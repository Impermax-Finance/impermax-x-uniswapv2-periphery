module.exports = {
	contracts_directory: "./contracts",
	networks: {
		development: {
			host: "127.0.0.1",	
			port: 7545,		
			network_id: "*",
			gasPrice: 2000,
		},
	},
	compilers: {
		solc: {
			version: "0.6.6",
			optimizer: {
				enabled: true,
				runs: 1000000
			},
		},
	},
};
