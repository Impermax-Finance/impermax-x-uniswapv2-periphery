### Impermax x Uniswap V2 Periphery

This repository contains the periphery contracts of the application Impermax x Uniswap V2. They are meant to act as an adapter that users can connect to in order to utilize Impermax x Uniswap V2 Core contracts.

### Testing

Since Truffle can't handle different versions of the Solidity compiler in the same project, in order to correctly run the tests you need to use the following commands:

```
truffle compile
truffle compile --config truffle-test-config.js
truffle test --compiler=none
```
