# Base Sepolia Production Deployment Guide

## Pre-Deployment Checklist ✅

### Environment Configuration

Required environment variables (set in `.env`):

```bash
# Blockchain RPC
RPC_URL_BASE_SEPOLIA=https://base-sepolia.org/public-rpc  # or Infura/Alchemy

# Contract Parameters
BOND_AMOUNT=1000000000000000000  # 1 ETH in wei (adjustable)
BOND_SINK=0xYourBondSinkAddress  # Must be non-zero address

# Commit Tracking
COMMIT_HASH=$(git rev-parse HEAD)

# Wallet (NOT required for dry-run, needed for actual broadcast)
PRIVATE_KEY=<deployer_private_key>  # Use with --broadcast flag
```

### Infrastructure Requirements

✅ **Redis Connection:** Available for BullMQ integration  
✅ **PostgreSQL Schema:** Migration ready for bond tracking table  
✅ **Blockscout Account:** API key configured for verification submission  
✅ **Slither CI Job:** Configured for nightly scans with Never-Triangle guard  

### Artifacts Verification

Before execution, verify:

```bash
# 1. ABI artifacts exist and are valid
cat shared/artifacts/TokenFactory.json | jq '.abi' >/dev/null && echo "✓ ABI valid"

# 2. Manifests validated against schema
node tools/validate-manifests.mjs && echo "✓ Manifest format correct"

# 3. Forge tests all pass locally
forge test --fork-url ${RPC_URL_BASE_SEPOLIA} && echo "✓ All tests passing"

# 4. Slither analysis clean
slither . --config-file slither.config.json --fail-medium && node tools/check-slither-triage.mjs
```

---

## Deployment Execution Steps

### Step 1: Dry-Run Simulation (No State Change)

```bash
cd contracts
forge script script/DeployLaunchpad.s.sol \
  --rpc-url ${RPC_URL_BASE_SEPOLIA} \
  --simulate-only \
  -vvv
```

**Expected Output:**
- Template deployment preview (no actual transaction)
- Factory deployment preview (no actual transaction)
- Parameter verification checks passing
- Generated manifest path displayed

### Step 2: Broadcast Deployment (State Change Required)

```bash
forge script script/DeployLaunchpad.s.sol \
  --rpc-url ${RPC_URL_BASE_SEPOLIA} \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --slow \
  --verify \
  -vvv
```

**Parameters Explained:**
- `--private-key`: Deployer wallet private key (from environment variable)
- `--broadcast`: Actually send transactions to network
- `--slow`: Simulate gas estimation more accurately (avoids flash-bundling)
- `--verify`: Submit source code to Blockscout automatically

### Step 3: Post-Deployment Verification

```bash
# Check receipts generated in cache directory
ls -la out/latest/

# Verify deployed addresses match expected structure
jq '.factoryAddress' deployments/base-sepolia.json

# Confirm factory parameters frozen correctly
forge inspect <FACTORY_ADDRESS> template() 
forge inspect <FACTORY_ADDRESS> totalFeeBps()
```

---

## Gas Cost Optimization

Target gas budget per deployment:
- Template deployment: ~2,500,000 gas
- Factory deployment: ~3,500,000 gas  
- Verification submissions: ~5,000,000 gas total

**Actual vs Estimated Variance:** Should stay within ±10%

If variance exceeds budget:
1. Review optimizer runs in foundry.toml (currently set to 200)
2. Consider batch deployment patterns for multiple factories
3. Analyze bytecode size for potential compression opportunities

---

## Security Validation Points

After deployment, manually verify on Etherscan/Blockscout:

✅ Factory `template()` matches deployed template address  
✅ Factory `totalFeeBps()` equals 175 (hardcoded constant)  
✅ Factory `bondAmount()` equals configuration value  
✅ Factory `bondSink()` is non-zero and authorized  
✅ No immutable parameter overrides detected in constructor  
✅ Constructor verified as not callable post-deployment  
✅ No admin methods exposed (all setters marked as private/pure)  

---

## Rollback Procedure (Emergency Only)

In case of critical vulnerability discovered post-deployment:

⚠️ **WARNING:** This contract has NO upgrade path by design!  
Any rollback requires:
1. Deploying completely new factory instance
2. Notifying all dependent parties of new factory address
3. Updating allowlist configurations across system
4. Archiving old factory with warning label

**Prevention:** Rigorous rehearsal testing (Sprint 2) prevents rollback scenarios.

---

## Post-Deployment Tasks

### A. Update Core System Integration

```bash
# In @kryptr/core repository
cd apps/api/src/wallet/service/factory.service.ts
# Replace mock addresses with real deployment addresses from base-sepolia.json
```

### B. Notify Stakeholders

Send IRC notification:
```
@conductor: Base Sepolia deployment complete!
• Factory Address: 0x...
• Template Address: 0x...
• Bond Amount: 1 ETH
• Manifest: deployments/base-sepolia.json
• Explorer URLs: [link1](url), [link2](url)
```

### C. Generate T21 Chip Artifact

```bash
node tools/generate-verification-artifact.mjs
# Generates base-sepolia.verification.json with proofHash
```

### D. Update Documentation

- Update `docs/ROADMAP.md` with deployment status
- Add production addresses to `docs/status-manifest.json`
- Sync frontoffice/backoffice deployment status displays

---

## Troubleshooting

### Common Errors

#### Error: "Revert: ScheduleSumInvalid"
**Cause:** Fee distribution shares don't sum to 175 bps  
**Fix:** Check deployParams.creatorFeeBps + lpFeeBps + protocolFeeBps + buybackFeeBps = 175

#### Error: "CloneCreationFailed"  
**Cause:** Salt collision (duplicate deployment attempt)  
**Fix:** Use unique `deployNonce` value in DeployParams struct

#### Error: "BondMismatch"  
**Cause:** msg.value doesn't match configured bondAmount  
**Fix:** Adjust {value: } parameter in forge command or update BOND_AMOUNT env var

#### Error: "Compiler run failed"
**Cause:** View declaration mismatch in script functions  
**Fix:** Run `forge fmt` before script execution to auto-format

---

## Contact & Support

For deployment assistance:
- Main contact: @auditor-contracts via IRC
- Emergency hotline: See team Slack channel #deployment-alerts
- Slither support: #static-analysis-help

**Remember:** Never share PRIVATE_KEY in public channels or commit it to repositories! 🔐
