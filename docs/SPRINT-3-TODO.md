# SPRINT 3 ACTIONABLE TODO LIST (Wallet Management & Enhanced Controls)

Sprint target: Phase 3 Wallet Control Enhancement & User Experience
Reference: docs/NEXT-SPRINT-PLAN.md
Status: ACTIVE

---

## 1. `auditor-core` (Backend Wallet API Enhancements)
Branch: `feat/core-sprint3-wallet-api`
Worktree: `/home/muting/kryptr-wt/new-core`

- [ ] **Task 1.1: Wallet Balance Caching**
  - [ ] Implement Redis cache for wallet balances with TTL = 30s
  - [ ] Add cache invalidation on order execution events
  - [ ] Benchmark cache hit rate and memory usage
- [ ] **Task 1.2: Multi-Signature Wallet Support**
  - [ ] Design approval workflow for transactions requiring multiple signatures
  - [ ] Add support threshold configuration per wallet

---

## 2. `auditor-ui` (Frontoffice & Backoffice UX Improvements)
Branch: `feat/ui-sprint3-wallet-controls`
Worktree: `/home/muting/kryptr-wt/new-ui`

- [ ] **Task 2.1: Wallet Balance Dashboard**
  - [ ] Create consolidated balance view showing all chains in single table
  - [ ] Add real-time balance updates via polling (5-second interval)
  - [ ] Implement currency toggle (USD/ETH display conversion)
  - [ ] Visual indicator for low balance warnings (< 0.1 ETH threshold)
- [ ] **Task 2.2: Advanced Order Filters**
  - [ ] Add date range picker for order history filtering
  - [ ] Implement status badge filter dropdown (active/pending/completed/failed)
  - [ ] Add type selector (limit/DCA/TWAP) with multi-select capability
  - [ ] Client-side filtering for improved performance
- [ ] **Task 2.3: Export Order History Feature**
  - [ ] Generate CSV export of current filtered orders
  - [ ] Include columns: ID, Type, Side, Asset Pair, Amount, Status, CreatedAt
  - [ ] Download with filename pattern: `{walletId}-orders-{timestamp}.csv`
  - [ ] Handle large datasets with pagination awareness
- [ ] **Task 2.4: Improved Loading States**
  - [ ] Replace spinner skeletons with shimmer loading effect
  - [ ] Add optimistic UI updates for cancel/success actions
  - [ ] Pre-fetch next page data during load while user scrolls

---

## 3. `auditor-contracts` (Testnet Rehearsal & Mainnet Prep)
Branch: `feat/contracts-sprint3-mainnet-prep`
Worktree: `/home/muting/kryptr-wt/new-contracts`

- [ ] **Task 3.1: Gas Optimization Audit**
  - [ ] Run slither gas analyzer on TokenFactory.sol
  - [ ] Optimize DCA slot minting for lower gas costs
  - [ ] Document gas savings per optimization
- [ ] **Task 3.2: Mainnet Deployment Manifest**
  - [ ] Draft deployment plan for Base Mainnet vs Robinhood testnet
  - [ ] Estimate deployment costs based on Sepolia rehearsal data

---

## 4. `auditor-qa` (E2E & Performance Testing)
Branch: `feat/qa-sprint3-performance`
Worktree: `/home/muting/kryptr-wt/new-qa`

- [ ] **Task 4.1: Load Test Dashboard Views**
  - [ ] Simulate 100 concurrent users viewing balance dashboard
  - [ ] Measure p95 response time under load
  - [ ] Verify cache effectiveness metrics
- [ ] **Task 4.2: E2E Flow Regression Tests**
  - [ ] Add tests for new wallet controls: balance view, filters, export
  - [ ] Verify backward compatibility with existing workflows
  - [ ] Nightly regression suite run with Playwright

---

## 5. `conductor` (Master Synchronization & Merge Gate)
- [ ] Monitor IRC updates for Task 1.1 to 4.2.
- [ ] Review PRs when submitted.
- [ ] Ensure all GitHub Actions checks pass before squash-merging.
- [ ] Update `docs/SPRINT-3-TODO.md` checklist status upon each PR merge.

---

## Acceptance Criteria

### Backend (Core):
✅ Wallet balance queries respond within 50ms (with cache)  
✅ Cache hit rate > 80% for repeated balance requests  
✅ Multi-signature wallet creation requires ≥2 approvals  

### Frontend (UI):
✅ Balance dashboard loads < 2 seconds (time to interactive)  
✅ Real-time balance updates never miss a tick (>99% coverage)  
✅ Order filters apply instantly (<100ms latency)  
✅ CSV export completes within 5 seconds for up to 1000 orders  
✅ Shimmer loading improves perceived performance by 30% (user testing)  

### Documentation:
✅ All new features documented in `apps/docs/features/wallet-control.md`  
✅ API reference updated for caching headers (`X-Cache: HIT/MISS`)  
✅ Export feature included in user guide with download examples  

---

## Sprint Metrics Target

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Cycle Time | < 2 days | git commit timestamps |
| PR Review Time | < 4 hours | PR comments timestamps |
| Bug Rate | < 5% | bugs detected per story point |
| Test Coverage | > 85% | vitest coverage reports |

---

## Risk Register

| Risk | Impact | Mitigation Strategy | Owner |
|------|--------|---------------------|-------|
| Cache invalidation bugs | High | Extensive unit tests + staging validation | auditor-core |
| Large dataset export timeout | Medium | Stream-based generation with progress indicator | auditor-ui |
| Multi-sig complexity creep | Medium | Strict scope boundary - MVP only | conductor |
| Performance regression on load | High | Baseline benchmarks before/after changes | auditor-qa |

---

**Note:** Sprint 3 focuses on operational excellence through better monitoring, faster interactions, and enhanced control capabilities. All changes must be backwards compatible and rigorously tested.

🚀 READY FOR KICKOFF!
