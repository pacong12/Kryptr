# Shared Contract Artifacts (Sprint 1)

Directory ini berisi compiled ABI dari Wave 5 TokenFactory & TokenTemplate untuk konsumsi Backend API dan UI.

## Files

| File | Purpose |
|------|---------|
| `TokenFactory.json` | ABI bytecode + metadata untuk interaksi Factory deployment |
| `KryptrLaunchTokenTemplate.json` | Template implementation ABI (read-only operations) |

## Usage Example

```javascript
// From Backend API (@kryptr/api)
const { ethers } = require('ethers');
const factoryABI = require('./shared/artifacts/TokenFactory.json').abi;

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL_BASE_SEPOLIA);
const factory = new ethers.Contract(factoryAddress, factoryABI, provider);

// Deploy token via factory
const deployTx = await factory.deployToken(deployParams, { value: BOND_AMOUNT });
await deployTx.wait();
```

## Source of Truth

Artifacts ini di-generate dari:
- Contract: `contracts/src/TokenFactory.sol` (line 106-230)
- Contract: `contracts/src/TokenTemplate.sol` (line 1-150)
- Compiler: solc v0.8.24
- Optimization: enabled, runs=200

**Last Updated:** 2026-08-18 (Sprint 1 kickoff)
