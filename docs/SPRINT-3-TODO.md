# SPRINT 3 ACTIONABLE TODO LIST (Mainnet Deployment & Verification)

Sprint target: Production Mainnet Deployment (Base Sepolia → Robinhood Testnet)  
Reference: docs/NEXT-SPRINT-PLAN.md  
Status: ACTIVE

---

## 1. `auditor-contracts` (Production Deployment Execution)
Branch: `feat/contracts-sprint3-mainnet-deploy`  
Worktree: `/home/muting/kryptr-wt/new-contracts`

- [ ] **Task 1.1: Base Sepolia Live Deployment**
  - [ ] Execute DeployLaunchpad.s.sol with real RPC_URL_BASE_SEPOLIA
  - [ ] Capture deployment receipts and verify gas costs vs rehearsal estimates
  - [ ] Generate final manifest with actual deployed addresses

- [ ] **Task 1.2: Blockscout Explorer Verification**
  - [ ] Submit TokenFactory.sol source code for verification on explorer
  - [ ] Submit TokenTemplate.sol implementation verification
  - [ ] Verify contract ABI matches deployed bytecode exactly

- [ ] **Task 1.3: T21 Chip Artifact Generation**
  - [ ] Run generate-verification-artifact.mjs for production artifact
  - [ ] Create cryptographic proof binding factory → verified source
  - [ ] Store artifacts in deployments/*.verification.json files

---

## 2. `auditor-core` (Factory Integration & Allowlist Enrollment)
Branch: `feat/core-sprint3-factory-integration`  
Worktree: `/home/muting/kryptr-wt/new-core`

- [ ] **Task 2.1: Factory ABI Consumer Module**
  - [ ] Integrate contracts/shared/artifacts/TokenFactory.json into launchpad service
  - [ ] Implement deployer validation: check bond balance before intent submission
  - [ ] Add factory address allowlist to vault configuration

- [ ] **Task 2.2: Bond Validator Service**
  - [ ] Create Postgres table tracking bond payments per deployer
  - [ ] Implement balance check against bondAmount from factory
  - [ ] Trigger failure if insufficient bond or unauthorized sink

- [ ] **Task 2.3: Manifest Parser**
  - [ ] Consume deployments/base-sepolia.json after deployment
  - [ ] Validate chain, factoryAddress, bondSink fields match config
  - [ ] Reject any mismatched manifest entries (fail-closed policy)

---

## 3. `auditor-ui` (Deploy Confirmation & Status Display)
Branch: `feat/ui-sprint3-deploy-status`  
Worktree: `/home/muting/kryptr-wt/new-ui`

- [ ] **Task 3.1: Deployment Status Dashboard**
  - [ ] Display active factory addresses across chains in backoffice
  - [ ] Show deployment timestamps and block numbers
  - [ ] Link to Blockscout explorer URLs for each deployment

- [ ] **Task 3.2: Bond Balance Check UI**
  - [ ] Pre-deployment validation: show current wallet balance vs required bond
  - [ ] Post-deployment receipt: display tx hash and token address prediction
  - [ ] Error states for insufficient bonds or network issues

---

## 4. `auditor-qa` (Production Smoke Tests & Security Validation)
Branch: `feat/qa-sprint3-smoke-and-security`  
Worktree: `/home/muting/kryptr-wt/new-qa`

- [ ] **Task 4.1: E2E Production Smoke Test Suite**
  - [ ] Deploy test token using live factory on Base Sepolia
  - [ ] Verify deterministic address matches predictTokenAddress()
  - [ ] Confirm bond forwarded to configured bondSink
  - [ ] Ensure factory zero-balance post-deploy (INV-BOND-2)

- [ ] **Task 4.2: Security Gate Bypass Attempt Simulation**
  - [ ] Attempt duplicate salt deployment (should revert)
  - [ ] Attempt wrong bond value (should fail with BondMismatch)
  - [ ] Attempt invalid fee schedule sum (should revert ScheduleSumInvalid)

- [ ] **Task 4.3: Slither Nightly Scan Automation**
  - [ ] Configure CI job running slither --fail-medium daily
  - [ ] Set up Never-Triangle guard enforcement via tools/check-slither-triage.mjs
  - [ ] Alert team immediately if new findings detected

---

## 5. `conductor` (Release Management & Stakeholder Communication)
- [ ] Monitor task completion via IRC updates
- [ ] Approve merge gates when GitHub Actions green
- [ ] Coordinate Go-No-Go meeting for production deployment
- [ ] Post-deployment announcement to all channels

---

## Acceptance Criteria (All Tasks)

### Deployment Quality
✅ Zero high/medium security findings (Slither clean)  
✅ All forge tests passing (61/61 baseline maintained)  
✅ Gas cost variance < 5% vs rehearsal estimates  
✅ Verification artifacts successfully submitted to explorers

### Integration Readiness
✅ Core API consuming correct ABI and factory addresses  
✅ Frontoffice displaying live deployment status  
✅ Backoffice admin panel showing bond ledger  
✅ All manifests validated against deployments.schema.json

### Security Verification
✅ Deterministic address prediction working correctly  
✅ Bond invariant enforced (each deploy pays exact bondAmount)  
✅ Fee cap validation at both factory and template level  
✅ No reentrancy vulnerabilities (structural protection verified)

---

## Timeline & Dependencies

| Day | Milestone | Dependencies |
|-----|-----------|--------------|
| Day 1 | Final rehearsal simulation | Sprint 2 artifacts ready |
| Day 2 | Base Sepolia deployment | RPC_URL confirmed, funds prepared |
| Day 3 | Explorer verification + T21 chip generation | Deployments successful |
| Day 4 | Core integration validation | ABI + manifest files available |
| Day 5 | E2E smoke tests pass | Factory operational on-chain |

**Success Condition:** Production deployment complete with all guards intact, core integration validated, and audit trail complete. 🚀

