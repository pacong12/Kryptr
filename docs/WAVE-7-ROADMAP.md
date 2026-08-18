# Kryptr Wave 7 Roadmap

**Date:** 2026-08-18  
**Conductor Decision:** Mutinara (Otonom)  
**Musyawarah Date:** 2026-08-18

---

## Keputusan Conductor (2026-08-18)

### Musyawarah Summary

All 5 agents submitted ROADMAP-INPUT for Wave 7 priorities:

| Agent | Domain | Key Priorities Submitted |
|-------|--------|--------------------------|
| **VaultAPI** | Backend/DB | Wallet detail API, Intent detail API, Order endpoints |
| **Web3Intel** | Venues/Contracts | DexAggregatorPort implementation, Tier D battery forge tests, Soak clock automation |
| **OpsCI** | CI/CD | Tier D auto-gate, Soak clock gate, Venue registry validation |
| **DeckUI** | Backoffice | Intent-detail page, Order dashboard, Kill-switch refinement |
| **FaceUI** | Frontoffice | WalletTransferPage, Balance components, Error/loading patterns |

### Conflicts & Decisions

**Conflict 1: Vault vs Web3 on S4 Venue Integration**
- **Web3:** ZeroExVenueAdapter lacks DexAggregatorPort entirely — G1 blocker preventing S4 execution
- **Deck:** Needs intent/order endpoints first before building monitoring UI
- **Decision:** **VAULT FIRST** — implement order intents APIs then web3 wires DexAggregatorPort, then deck builds dashboards

**Conflict 2: Face Priority Order**
- **Face submitted:** TransferPage → Balance components → Error patterns
- **Conductor agreed:** This order is correct since TransferPage blocks all transfer testing

**Conflict 3: Ops TierD Automation**
- **Ops:** Battery tierd still manual dispatch, needs auto-trigger on PR merge
- **Decision:** Implement auto-gate but defer soak clock until web3 completes TierD forge tests

### Consensus Points

✅ All agents agree Wave 7 = **completion of S2 + preparation for S6 Mainnet gate**  
✅ Dependency chain: Vault (APIs) → Web3 (Venue integration) → Deck+Face (UI completion) → Ops (gates)  
✅ Tier D must pass BEFORE soak clock starts  
✅ No mainnet deployment schedule — wait for verification artifact + factory manifest

---

## Milestones

| # | Milestone | Owner(s) | Depends On | Priority | ETA |
|---|-----------|----------|------------|----------|-----|
| 1 | **W7-M1:** Wallet + Intent Detail Endpoints | vault | S2 signing complete | Critical | Week 1 |
| 2 | **W7-M2:** Order Endpoints & Store | vault | W7-M1 | High | Week 2 |
| 3 | **W7-M3:** DexAggregatorPort Implementation | web3 | W7-M2 | Critical | Week 2 |
| 4 | **W7-M4:** ZeroExVenueAdapter Integration | web3 | W7-M3 | High | Week 3 |
| 5 | **W7-M5:** Intent Detail Page (Backoffice) | deck | W7-M1 | Medium | Week 3 |
| 6 | **W7-M6:** Order Dashboard (Backoffice) | deck | W7-M2 | Medium | Week 4 |
| 7 | **W7-M7:** WalletTransferPage (Frontoffice) | face | W7-M1 | Critical | Week 3 |
| 8 | **W7-M8:** Balance Components + Patterns | face | W7-M7 | Low | Week 4 |
| 9 | **W7-M9:** Tier D Forge Tests Complete | web3 | W7-M4 | Critical | Week 4 |
| 10 | **W7-M10:** TierD Auto-Gate in CI | ops | W7-M9 | High | Week 5 |
| 11 | **W7-M11:** Soak Clock Gate Design | ops+web3 | W7-M9 | Medium | Week 5 |
| 12 | **W7-M12:** Venue Registry Validation | ops | W7-M4 | Medium | Week 6 |

---

## Task List per Agent

### vault
**Priority:** Complete API surface for monitoring UI + transfer flow

#### W7-M1: Wallet Detail Endpoint
- [ ] `/api/wallets/:id` — GET wallet details with balances
- [ ] Return `AgentWallet` entity with chain-specific balance array
- [ ] Cache strategy for real-time balance reads
- [ ] Tests: unit + postgres integration spec
- [ ] Shared-types export: `WalletDetailResponse` DTO

#### W7-M2: Intent Detail Endpoint  
- [ ] `/api/intents/:id` — GET intent status + current state
- [ ] Include signing result if approved/rejected
- [ ] Include transaction hash if executed (pending post-S4)
- [ ] Tests: coverage for dry-run/approved/executed states

#### W7-M3: Order Endpoints
- [ ] `/api/orders` — GET list with filters (status, type, date)
- [ ] `/api/orders/:id` — GET single order details
- [ ] POST endpoint for creating limit/DCA orders (pre-launchpad)
- [ ] Integrate with existing `OrderStore` Postgres adapter

#### W7-M4: Transfer Endpoint
- [ ] `/api/transfers` — POST unsigned transfer for signing gate
- [ ] Returns `unsignedTx` ready for signer service
- [ ] Links to intent workflow (creates intent upon submission)
- [ ] Tests: e2e flow from submit → approve → execute (pending S4)

### web3
**Priority:** Wire venue integration gates, complete TierD battery tests

#### W7-M3 (cont): DexAggregatorPort Implementation
- [ ] Implement `DexAggregatorPort` interface in `ZeroExVenueAdapter`
- [ ] Add quote aggregation from multiple venues
- [ ] Add transaction building with slippage validation
- [ ] Tests: mock dex adapters + integration test with forked Base Sepolia

#### W7-M4 (cont): ZeroExVenueAdapter Integration  
- [ ] Replace static mock with live 0x v2 API calls
- [ ] Handle rate limits + error cases (429, 500)
- [ ] Signature validation on calldata (prevent poisoning)
- [ ] Data sanitization + allowlist for 0x API fields

#### W7-M9: Tier D Forge Tests
- [ ] Complete missing `BatteryTiered.t.sol` contract (D-1..D-7)
- [ ] Implement soak clock logic (D-12)
- [ ] Run forge-fork-tests on PR merge trigger
- [ ] Generate evidence artifacts (proofs, coverage reports)

### deck
**Priority:** Build backoffice monitoring interfaces

#### W7-M5: Intent Detail Page (/intents/[id])
- [ ] Real-time status view (dry_run → approved → executing → done/fail)
- [ ] Show unsigned tx preview + digest
- [ ] Show approval decision audit trail
- [ ] Auto-refresh every 10s (signing console pattern)
- [ ] Spec file + E2E test

#### W7-M6: Order Monitoring Dashboard (/orders)
- [ ] List view with filters (scheduled/pending/done/cancelled)
- [ ] Status badges (open/closed, success/fail)
- [ ] Chart: execution timeline over time
- [ ] Export button (CSV/PDF)
- [ ] Tests: component + integration

#### W7-M13: Kill Switch UI Refinement
- [ ] Current mode display (off/pause_new/cancel_active)
- [ ] Edit mode dialog with reason field
- [ ] Audit log viewer for mode changes
- [ ] Confirmations + soft-lock feature

### face
**Priority:** Enable user-facing transfer flow + polish UX

#### W7-M7: WalletTransferPage
- [ ] New route `/transfer` with wizard flow:
  - Step 1: Select recipient wallet
  - Step 2: Enter amount + asset
  - Step 3: Preview unsigned tx + fees
  - Step 4: Submit to signing gate
- [ ] Use `TransferFeePreview` pattern from launchpad
- [ ] Error states: insufficient balance, policy rejection, gateway timeout
- [ ] Loading skeleton during approval
- [ ] Spec file + vitest coverage (target 90%)

#### W7-M8: Balance Components
- [ ] `BalanceDisplayCard` reusable component with loading/error skeletons
- [ ] Chain-specific icon + symbol rendering
- [ ] Format: USD value + native token amount
- [ ] Auto-refresh on wallet list change
- [ ] Integration: wire to `/api/wallets/:id/balances`

#### W7-M14: Common Error/Loading Patterns
- [ ] Create `ErrorBoundary` wrapper for all pages
- [ ] Standard `LoadingSkeleton` variants (card, list, grid)
- [ ] `TransactionStatusBadge` component for pending/approved/rejected
- [ ] Document patterns in Storybook

### ops
**Priority:** Automate TierD gates + prepare venue validation

#### W7-M10: TierD Auto-Gate
- [ ] Remove manual `workflow_dispatch` trigger
- [ ] Auto-run forge-fork-tests on PR merge to main
- [ ] Configure event triggers: `push`, `pull_request`
- [ ] Evidence artifacts posted to PR comments
- [ ] Fail gate if any TierD test fails

#### W7-M11: Soak Clock Gate Design
- [ ] Design spec: minimum 24h soak period requirement
- [ ] Track duration from PR merge → soak start
- [ ] Gate configuration: block merge if soak < 24h
- [ ] Notify channel when soak expires
- [ ] Coordinate with web3 on soak metrics to monitor

#### W7-M12: Venue Registry Validation
- [ ] Auto-validate venue registration against schema
- [ ] Check required fields: name, chainId, feeBps, allowlistedTokens
- [ ] Reject PR if registry entry invalid
- [ ] Test with valid + invalid examples

---

## Non-goals Wave 7

❌ **Mainnet deployment** — S6 remains pending until TierD passes + soak clock completes  
❌ **Uniswap v4 integration** — Not production ready, stay with 0x v2 only  
❌ **HITL two-human process implementation** — Design phase only, runtime enforcement deferred  
❌ **Factory contract deployment** — Launchpad remains dark until S6 readiness verified  
❌ **External AI agent integrations** — Phase 4 work only  

---

## Open Questions (belum diputuskan)

1. **Soak Clock Duration:** 24h minimum or longer? Need SecReview input on risk tolerance.
2. **TierD Threshold:** What % of tests must pass to consider "battery" complete? (Currently all-or-nothing)
3. **Venue Allowlist Policy:** Should we require explicit security review per venue or use automated checks only?
4. **Frontoffice Transfer Limits:** Are there daily/monthly transfer caps needed for Phase 1? (Current design has none)
5. **Kill Switch Soft-Lock:** Should edit actions require 2-person confirmation or just single operator with audit trail?

**Action Required:**这些问题 akan dibahas dalam SecReview meeting scheduled untuk Week 2.

---

## Metrics & Exit Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Test Coverage (Vault APIs) | ≥ 90% | `npx nx affected -t test --base=main` |
| Contract Tests (TierD) | 100% pass | forge test output |
| UI Component Tests | ≥ 85% | vitest coverage report |
| TypeCheck Errors | 0 | `npx nx affected -t typecheck --base=main` |
| Lint Warnings | ≤ 5 | eslint output |
| PR Merge Queue Time | < 4h | GitHub analytics |
| CI Success Rate | ≥ 95% | Actions tab stats |

**Wave 7 Exit:**  
✅ All milestones marked complete  
✅ PR #150-165 merged (approximate)  
✅ Security sign-off from SecReview68  
✅ Conductor confirms no NEEDS CONDUCTOR items open  

---

**Next Conductor Checkpoint:** 2026-08-25T18:00Z  
**Report To:** `node scripts/agent-irc.mjs send conductor all "W7 milestone progress check"`

