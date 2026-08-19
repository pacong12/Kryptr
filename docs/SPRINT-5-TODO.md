# SPRINT 5 ACTIONABLE TODO LIST (Mainnet Gate & Production Readiness)

Sprint target: Phase 3 Mainnet Gate Verification & Production Release
Reference: docs/NEXT-SPRINT-PLAN.md
Status: ACTIVE

---

## 1. `auditor-contracts` (Mainnet Factory Deployment Script & Gas Profiling)
Branch: `feat/contracts-sprint5-mainnet-prep`
Worktree: `/home/muting/kryptr-wt/new-contracts`

- [ ] **Task 1.1: Mainnet Deployment Configuration**
  - [ ] Configure `contracts/script/DeployLaunchpadMainnet.s.sol` with MultiSig bond sink address.
  - [ ] Profile gas usage on factory deployment (< 2,500,000 gas limit).
- [ ] **Task 1.2: Slither Zero-Tolerance Final Gate**
  - [ ] Run full `slither .` audit and confirm 0 High, 0 Medium findings.
- [ ] **Delivery:**
  - [ ] Run: `cd contracts && forge test && forge fmt --check`.
  - [ ] Open PR & notify IRC: `agent-irc send auditor-contracts conductor "done: Sprint 5 Contracts tasks complete"`.

---

## 2. `auditor-core` (Live Mainnet Multi-Node Connection & Rate Limiter)
Branch: `feat/core-sprint5-production-hardening`
Worktree: `/home/muting/kryptr-wt/new-core`

- [ ] **Task 2.1: Multi-RPC Fallback Integration**
  - [ ] Configure Viem client with fallback RPC transport for Base Mainnet.
- [ ] **Task 2.2: Production Database Pool Tuning**
  - [ ] Optimize Prisma connection pool & query timeouts for high-throughput intent creation.
- [ ] **Delivery:**
  - [ ] Run: `npx nx affected -t test typecheck --base=main`.
  - [ ] Open PR & notify IRC: `agent-irc send auditor-core conductor "done: Sprint 5 Core tasks complete"`.

---

## 3. `auditor-ui` (Production Launchpad Wizard & Mainnet Banner)
Branch: `feat/ui-sprint5-mainnet-launchpad`
Worktree: `/home/muting/kryptr-wt/new-ui`

- [ ] **Task 3.1: Token Launch Flow Polish**
  - [ ] Complete TokenLaunchWizard in `apps/frontoffice/src/pages/WalletLaunchPage.vue`.
  - [ ] Add network warning banner when connected to testnet vs mainnet.
- [ ] **Task 3.2: Production User Documentation Build**
  - [ ] Update `apps/docs/features/` with final Mainnet launch steps.
  - [ ] Ensure `npx nx run @kryptr/docs:build` passes cleanly.
- [ ] **Delivery:**
  - [ ] Run: `npx nx run frontoffice:test && npx nx run @kryptr/docs:build`.
  - [ ] Open PR & notify IRC: `agent-irc send auditor-ui conductor "done: Sprint 5 UI tasks complete"`.

---

## 4. `auditor-qa` (Full System Production Smoke Test)
Branch: `feat/qa-sprint5-production-smoke`
Worktree: `/home/muting/kryptr-wt/new-qa`

- [ ] **Task 4.1: Production Readiness Verification**
  - [ ] Execute complete smoke test suite against simulated production network.
  - [ ] Validate end-to-end intent creation -> security gate evaluation -> signing flow.
- [ ] **Delivery:**
  - [ ] Run: `npx nx affected -t test --base=main`.
  - [ ] Open PR & notify IRC: `agent-irc send auditor-qa conductor "done: Sprint 5 QA tasks complete"`.

---

## 5. `conductor` (Production Release Gate)
- [ ] Ensure all 4 PRs for Sprint 5 pass CI and merge cleanly.
- [ ] Publish `docs/PRODUCTION-RELEASE-NOTES.md`.
