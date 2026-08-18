# SPRINT 2 ACTIONABLE TODO LIST (Phase 2 Order Automation & Rehearsal)

Sprint target: Phase 2 Order Automation & Testnet Rehearsal
Reference: docs/NEXT-SPRINT-PLAN.md
Status: ACTIVE

---

## 1. `auditor-core` (BullMQ Order Execution & Trigger Runtime)
Branch: `feat/core-sprint2-order-automation`
Worktree: `/home/muting/kryptr-wt/new-core`

- [ ] **Task 1.1: BullMQ Runtime Enablement**
  - [ ] Enable BullMQ worker queue processing when `AUTOMATION_MODE=bullmq` in `apps/api/src/order-worker/`.
  - [ ] Implement repeatable job scheduling for DCA tick execution.
- [ ] **Task 1.2: Limit Order Price Monitor & Trigger**
  - [ ] Wire price polling loop from Coingecko / Static price feed to limit order evaluator.
  - [ ] Trigger unsigned tx preview generation when price threshold met.
- [ ] **Task 1.3: Contract ABI Consumer Integration**
  - [ ] Consume `TokenFactory.json` ABI from `contracts/shared/artifacts/` into launchpad service.
- [ ] **Delivery:**
  - [ ] Gate: `npx nx affected -t lint typecheck test build --base=main`.
  - [ ] Open PR & notify IRC: `agent-irc send auditor-core conductor "done: Sprint 2 Core tasks complete"`.

---

## 2. `auditor-contracts` (Testnet Deployment Rehearsal)
Branch: `feat/contracts-sprint2-testnet-rehearsal`
Worktree: `/home/muting/kryptr-wt/new-contracts`

- [ ] **Task 2.1: Base Sepolia Deployment Rehearsal**
  - [ ] Execute `script/DeployLaunchpad.s.sol` dry-run against Base Sepolia testnet fork.
  - [ ] Validate generated `deployments/base-sepolia.json` against `deployments.schema.json`.
- [ ] **Task 2.2: Verification Artifact Generator**
  - [ ] Create script emitting deterministic deployment proof artifact (T21 chip verification).
- [ ] **Delivery:**
  - [ ] Gate: `cd contracts && forge test && forge fmt --check`.
  - [ ] Open PR & notify IRC: `agent-irc send auditor-contracts conductor "done: Sprint 2 Contracts tasks complete"`.

---

## 3. `auditor-ui` (Orders Live Control & Rehearsal Feedback)
Branch: `feat/ui-sprint2-order-control`
Worktree: `/home/muting/kryptr-wt/new-ui`

- [ ] **Task 3.1: Backoffice Order Kill-Switch Controls**
  - [ ] Wire emergency freeze button in `OrdersTablePage.tsx` to `POST /kill-switch/freeze`.
  - [ ] Add live execution badge and real-time ledger updates.
- [ ] **Task 3.2: Frontoffice Order History View**
  - [ ] Implement active order list + cancel order modal in `apps/frontoffice/src/pages/WalletOrdersPage.vue`.
- [ ] **Task 3.3: VitePress Phase 2 Docs Update**
  - [ ] Document order automation features in `apps/docs/features/orders-and-kill-switch.md`.
  - [ ] Verify `npx nx run @kryptr/docs:build` exits 0.
- [ ] **Delivery:**
  - [ ] Gate: `npx nx run frontoffice:test && npx nx run backoffice:test && npx nx run @kryptr/docs:build`.
  - [ ] Open PR & notify IRC: `agent-irc send auditor-ui conductor "done: Sprint 2 UI tasks complete"`.

---

## 4. `auditor-qa` (24h Soak Test & Attack Resilience)
Branch: `feat/qa-sprint2-soak-and-pentest`
Worktree: `/home/muting/kryptr-wt/new-qa`

- [ ] **Task 4.1: Automated Order Execution Verification**
  - [ ] Implement test suite asserting zero missed DCA executions across 10 consecutive ticks.
- [ ] **Task 4.2: Red Team Kill-Switch Resilience Audit**
  - [ ] Simulate adversarial execution attempt while kill-switch frozen (assert 100% blocked).
- [ ] **Task 4.3: E2E Phase 2 Flow Test**
  - [ ] Full flow: Schedule DCA Order -> Worker Trigger -> Security Gate Check -> Execution Record.
- [ ] **Delivery:**
  - [ ] Gate: `npx nx affected -t test --base=main`.
  - [ ] Open PR & notify IRC: `agent-irc send auditor-qa conductor "done: Sprint 2 QA tasks complete"`.

---

## 5. `conductor` (Master Synchronization & Merge Gate)
- [ ] Direct sub-agents to Sprint 2 branches.
- [ ] Monitor task completion via Redis IRC.
- [ ] Review & merge PRs when GitHub Actions checks green.
