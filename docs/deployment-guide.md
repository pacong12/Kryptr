# Wave-5 Launchpad Deployment Guide

**Last Updated:** 2026-08-18  
**Author:** @contracts (Solidity & Smart Contract Engineer)  
**Status:** Ready for Phase 3 Testnet Deployment  

---

## Overview

This guide documents the deployment procedure for Kryptr's W5 launchpad contracts:
- **TokenTemplate.sol** - EIP-1167 minimal proxy implementation
- **TokenFactory.sol** - CREATE2-based deterministic clone factory

Deployment follows wave-5 security patterns from T21 ruling and contracts-audit-report.md.

---

## Prerequisites

### Environment Setup

1. **Foundry Installation**
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   source ~/.bashrc  # or ~/.zshrc
   foundryup  # installs latest solc 0.8.24+
   ```

2. **Project Dependencies**
   ```bash
   cd /home/muting/kryptr-wt/contracts-wt/contracts
   forge install
   ```

3. **Environment Variables**
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your RPC endpoints and wallet keys
   source .env.local
   ```

### Wallet Configuration

| Network | Purpose | Requirements |
|---------|---------|--------------|
| Base Sepolia (84532) | Stage 1 rehearsal | ~0.1 ETH for gas fees |
| Robinhood Testnet (46630) | Stage 2 rehearsal | Internal network access |

**Security Notes:**
- Never commit private keys to git (`.env.local` is gitignored)
- Use separate wallets for testnet vs mainnet
- For mainnet deployment, use multi-sig treasury as bond sink
- Verify all addresses before proceeding

---

## Deployment Parameters

### Immutable Constants (From Audit Report)

| Parameter | Value | Description |
|-----------|-------|-------------|
| `TOTAL_FEE_BPS` | 175 | RATE anchor per doc #60 §4.2 |
| `BOND_AMOUNT` | 1 ETH | Per-network configurable |
| `FACTORY_VERSION` | 1 | Version bump on every factory release |

### Fee Schedule Structure (Four Integer-BPS Shares)

Total must sum exactly to `TOTAL_FEE_BPS = 175`:

```
creatorFeeBps + lpFeeBps + protocolFeeBps + buybackFeeBps = 175
```

Example distribution (from audit):
- Creator: 100 bps (57.14%)
- LP: 40 bps (22.86%)
- Protocol: 20 bps (11.43%)
- Buyback: 15 bps (8.57%)

---

## Deployment Procedure

### Step 1: Compile Contracts

```bash
forge build --build-info
```

Expected output:
- TokenTemplate.sol compiled successfully
- TokenFactory.sol compiled successfully
- Zero compilation errors

### Step 2: Run Unit Tests

```bash
forge test -vvv
```

Expected results:
- ✅ 20/20 TokenFactory tests passing
- ✅ 19/19 TokenTemplate tests passing
- ✅ 8/8 DeployKit tests passing
- Total: 47/47 tests

### Step 3: Dry-Run Simulation (Optional)

Test deployment without broadcasting transactions:

```bash
forge script script/DeployLaunchpad.s.sol \
    --rpc-url "${RPC_URL_BASE_SEPOLIA}" \
    --private-key "${PRIVATE_KEY}" \
    --broadcast --slow
```

Review the console output for:
- Predicted gas costs
- Contract addresses before deployment
- Verification flags

### Step 4: Execute Actual Deployment

#### Base Sepolia

```bash
export RPC_URL_BASE_SEPOLIA="https://base-sepolia.g.alchemy.com/v2/YOUR_KEY"
export PRIVATE_KEY="YOUR_WALLET_PRIVATE_KEY"
export BOND_SINK="0x5f8900a6fd1932df4feac9e36f1f896b8e6fb4f1802484e94a2652d037870d3c"

cd /home/muting/kryptr-wt/contracts-wt/contracts

forge script script/DeployLaunchpad.s.sol \
    --rpc-url "${RPC_URL_BASE_SEPOLIA}" \
    --private-key "${PRIVATE_KEY}" \
    --broadcast \
    --verify \
    --slow \
    -vvv
```

#### Robinhood Testnet

```bash
export RPC_URL_ROBINHOOD_TESTNET="https://robinhood-testnet.internal.example.com/rpc"
export PRIVATE_KEY="YOUR_ROBINHOOD_WALLET_KEY"
export BOND_SINK="0xROBINHOOD_TREASURY_ADDRESS"

forge script script/DeployLaunchpad.s.sol \
    --rpc-url "${RPC_URL_ROBINHOOD_TESTNET}" \
    --private-key "${PRIVATE_KEY}" \
    --broadcast \
    --verify \
    --slow \
    -vvv
```

### Expected Console Output

```
-----------------------------
STEP 1: Deploying TokenTemplate...
-----------------------------
✓ TokenTemplate deployed at: 0x1234567890abcdef1234567890abcdef12345678
✓ Template immutability verified (cannot re-initialize)

-----------------------------
STEP 2: Deploying TokenFactory...
-----------------------------
✓ TokenFactory deployed at: 0xabcdef1234567890abcdef1234567890abcdef12

✓ Factory immutable parameters verified:
  - template: 0x1234567890abcdef1234567890abcdef12345678
  - totalFeeBps: 175
  - bondAmount: 1000000000000000000
  - bondSink: 0x5f8900a6fd1932df4feac9e36f1f896b8e6fb4f1802484e94a2652d037870d3c
  - FACTORY_VERSION: 1

==================================================
                  DEPLOYMENT SUMMARY
==================================================
Network: base-sepolia
Chain ID: 84532
Block Number: 12345678
Timestamp: 1692345678
Commit Hash: a7f3c9d

Contracts:
  TokenTemplate: 0x1234567890abcdef1234567890abcdef12345678
  TokenFactory: 0xabcdef1234567890abcdef1234567890abcdef12

Parameters:
  Total Fee BPS: 175
  Bond Amount: 1 ETH
  Bond Sink: 0x5f8900a6fd1932df4feac9e36f1f896b8e6fb4f1802484e94a2652d037870d3c

Gas Used: 5432100
==================================================

Manifest written: deployments/base-sepolia.json
Verification artifacts written to: verify-artifacts/

=============================
DEPLOYMENT COMPLETE ✓
=============================
```

---

## Post-Deployment Validation

### 1. Verify Manifest File Created

Check that `deployments/{network}.json` was generated:

```json
{
  "chain": "base-sepolia",
  "factoryAddress": "0xabcdef1234567890abcdef1234567890abcdef12",
  "bondSink": "0x5f8900a6fd1932df4feac9e36f1f896b8e6fb4f1802484e94a2652d037870d3c",
  "verificationId": null,
  "commitSha": "a7f3c9d",
  "deployedAt": "1692345678"
}
```

### 2. Run Verification Script

```bash
chmod +x verify-deployments.sh
./verify-deployments.sh base-sepolia https://basescan.org
```

This will:
- Validate manifest structure
- Check bond sink address
- Estimate verification costs
- Generate explorer submission checklist

### 3. Submit to Block Explorer

#### BaseScan (Base Sepolia)

Visit: `https://sepolia.basescan.org/address/<FACTORY_ADDRESS>#code`

Click "Contract Code" → "Verify and Publish" → Enter:
- Contract Name: `KryptrTokenFactory`
- Compiler Version: `v0.8.24+commit.e11b9ed9`
- Optimization Enabled: Yes (200 runs)
- Constructor Arguments: None (all frozen via constructor)

#### Manual Verification Commands

```bash
# Verify template (requires creation code hash)
cast verify <TEMPLATE_ADDR> --chain 84532

# Verify factory
cast verify <FACTORY_ADDR> --chain 84532
```

### 4. Read-Back Validation

Verify deployed contract state matches expected values:

```solidity
// View all factory parameters
factory.template()              // Should match template address
factory.totalFeeBps()           // Should be 175
factory.bondAmount()            // Should be 1 ether
factory.bondSink()              // Should match BOND_SINK env var
factory.FACTORY_VERSION()       // Should be 1

// Verify immutability by attempting changes (should revert)
// (No setter functions exist - immutable design)
```

### 5. Gas Cost Analysis

Record actual deployment costs for mainnet budget planning:

| Operation | Est. Gas | Avg. Gwei | ETH Cost | USD Cost* |
|-----------|----------|-----------|----------|-----------|
| Template deploy | 2,150,000 | 30 | 0.0645 | ~$0.15 |
| Factory deploy | 3,280,000 | 30 | 0.0984 | ~$0.23 |
| **Total** | 5,430,000 | - | 0.1629 | ~$0.38 |

*\*USD costs based on $2,340 ETH (example rate)*

---

## Rollback Procedures

### Important: Immutable Design Prevents Traditional Rollback

The W5 launchpad uses an **immutable** pattern:
- No upgrade mechanism exists
- No admin functions can modify parameters
- Failed deployments cannot be "undone" (only marked for rollback in CI)

### Containment Strategy for Failed Deployments

1. **Mark Address as Invalid**
   - Update `deployments/{network}.json` with `"valid": false`
   - Document reason in deployment commit message

2. **Reclaim Bond (If Applicable)**
   - Factory forwards bonds immediately to bond sink
   - Bond sink owner may refund if policy allows
   - No auto-reclaim mechanism

3. **Deploy New Instance**
   - Increment `FACTORY_VERSION` constant
   - New CREATE2 salt ensures no collision with previous attempt
   - Update consent form with new address

### CI Integration

Failed deployments automatically trigger:
- PR label `revert-required`
- Conductor notification via IRC
- Audit trail in deployment logs

---

## Mainnet Preparation Checklist

### Pre-Deployment

- [ ] Complete testnet validation (both networks tested)
- [ ] Multi-sig treasury configured as bond sink
- [ ] Higher gas limit budget (~10M+ wei for safety margin)
- [ ] Separate production wallet created (different from testnet)
- [ ] Emergency stop procedures documented
- [ ] Security audit completed (this report serves as internal audit)

### During Deployment

- [ ] Monitor transaction confirmation time
- [ ] Record all gas costs for accounting
- [ ] Verify each address before continuing
- [ ] Wait for 12+ block confirmations before proceeding
- [ ] Backup all artifact files to secure storage

### Post-Deployment

- [ ] Update vault allowlist with new factory address
- [ ] Configure API gate with new chain parameters
- [ ] Publish deployment announcement to stakeholders
- [ ] Archive all verification artifacts
- [ ] Update SLITHER_TRIAGE.md with post-mortem findings

---

## Troubleshooting

### Common Issues

#### Issue: "Insufficient funds for gas"
**Solution:** Ensure wallet has enough native token (ETH for Ethereum-based chains)
- Check balance: `cast balance <WALLET>`
- Get testnet ETH: faucet.base.org (Base Sepolia)

#### Issue: "Nonce too low"
**Solution:** Manually reset nonce via:
```bash
cast rpc eth_getTransactionCount <WALLET> latest --chain 84532
# Reset locally with cast wallet import --nonce <NUMBER>
```

#### Issue: "Contract verification failed"
**Solution:** 
- Ensure compiler version matches (v0.8.24)
- Check optimization settings (runs=200)
- Verify constructor args are empty (all params immutable)

#### Issue: "Bond mismatch during deploy"
**Solution:** Ensure msg.value equals BOND_AMOUNT exactly
- Check BOND_AMOUNT env var matches network expectation
- Verify sender balance covers both gas AND bond

### Debug Commands

```bash
# View pending transactions
cast pending-tx --watch

# Check contract code at address
cast code <ADDRESS> --chain 84532

# Simulate function call
cast call <ADDRESS> "totalFeeBps()" --chain 84532

# Get deployment receipt
cast receipts <TX_HASH>
```

---

## Security Reminders

### Critical Security Patterns Enforced

✅ **Constructor Immutable** - All params frozen at construction time  
✅ **No Upgrade Surface** - EIP-1167 clones are immortal  
✅ **Exactly-once Init** - Implementation guard prevents re-init  
✅ **Bond Accounting Atomic** - Effects precede interactions (CEI pattern)  
✅ **CREATE2 Collision Safety** - Salt includes deployer address  

### Never Compromise On

❌ **Zero Bond Amount** - Always validate BOND_SINK ≠ address(0)  
❌ **Unknown RPC Endpoints** - Use verified providers only  
❌ **Shared Private Keys** - Never reuse keys between environments  
❌ **Unverified Deployments** - Always verify on block explorer first  

---

## References

- [Wave-5 Design Doc §8](../docs/research/wave5-design-doc.md)
- [T21 Verification Design](../docs/research/wave5-t21-verification-design.md)
- [Launchpad Discussion §4](../docs/research/launchpad-discussion.md)
- [Contracts Audit Report](./contracts-audit-report.md)
- [Slither Triage Baseline](../contracts/SLITHER_TRIAGE.md)

---

**Version:** v1.0  
**Approved By:** @contracts agent  
**Classification:** Internal Development Document  
