# Kryptr Roadmap

**Last Updated:** 2026-08-18  
**Audit Status:** W4-W7 Complete (See [`MASTER-AUDIT-W4-W7.md`](./MASTER-AUDIT-W4-W7.md))

Phased clone of the BankrBot concept. Each phase ships with its security
requirements — never bolted on afterwards.

---

## Goals — what "done" means per phase

| Phase | Goal (measurable)                                                                                                | Exit criteria                             |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1     | User connects wallet, sees balances, sends a transfer that passes the security gate; backoffice monitors it live | **CONDITIONAL PASS** - Auth layer required |
| 2     | Agent schedules DCA/limit orders that execute on time without human touch                                        | 24h soak test, zero missed executions     |
| 3     | Agent launches a token; fees accrue to its wallet per the fixed schedule                                         | On-chain fee split verified in Blockscout |
| 4     | Natural-language request becomes a gated intent; Grok/Bankr attack replay is blocked                             | Red-team report, 0 unauthorized transfers |

---

## When agents disagree or are confused

Per `docs/ORCHESTRA.md`: contract-first proposals between the two agents
involved; if unresolved after one round, the conductor decides. Roadmap
ambiguities are bugs — report them, don't guess.

---

## W4-W7 Audit Summary

**Audit Date:** 2026-08-18  
**Overall Score:** 77.5/100 ⚠️  
**Status:** CONDITIONAL PASS - Production ready with critical remediation required  

### Domain Scores:
| Domain | Score | Status | Notes |
|--------|-------|--------|-------|
| Smart Contracts (Wave 5) | 95/100 | ✅ EXCELLENT | All invariants pass, production-ready for Phase 3 |
| Frontend UI (Waves 4-7) | 85/100 | ✅ GOOD | Strong UX foundations, CSP headers needed before launch |
| Core API Backend (Waves 4,6,7) | 65/100 | ⚠️ MIXED | Architecture solid, authentication layer mandatory |
| QA/Test Infrastructure (Waves 4-7) | 65/100 | ⚠️ NEEDS WORK | E2E automation missing, performance baselines pending |

### Critical Path Items Before Public Launch:
1. 🔴 Implement JWT authentication middleware (Core API) - Due: Sprint 1
2. 🔴 Fix wallet ID predictability vulnerability (Core API) - Due: Sprint 1
3. 🟡 Add CSP headers to frontend applications (UI) - Due: Sprint 1
4. 🟡 Implement browser-based E2E automation (QA) - Due: Sprint 2
5. 🟡 Establish performance baselines (QA) - Due: Sprint 2

See [`docs/MASTER-AUDIT-W4-W7.md`](./MASTER-AUDIT-W4-W7.md) for full details.

---

## Phase 1 — Wallet & basic trading (MVP)

**Status:** CONDITIONAL PASS - Remediation in progress

### Completed Components:
- ✅ Wallet service: create/list agent wallets (`AgentWallet`) - Implemented
- ✅ Balance reads via viem + Blockscout (Base, Robinhood Chain) - Functional
- ✅ Transfers + swaps through DEX aggregator (0x integration) - Tested
- ✅ Security gate v1: origin allowlist + approval threshold - Active
- ✅ Backoffice: wallet list, transaction feed, health dashboard - Deployed
- ✅ Frontoffice: connect wallet, view balances, send/swap - Deployed

### Signing boundary (DECIDED 2026, wave 2 — see docs/research/wave2-trading-research.md):
Phase 1 ships Privy-style embedded wallets with a policy engine ON by
default, with Kryptr's security gate as a mandatory second layer.
Agent wallets migrate to ERC-4337 session keys (on-chain-enforced spend
policy) in a later wave — hybrid Privy-signer + 4337 account is the
target. WalletConnect remains an optional self-custody connect mode;
it is not viable for autonomous server agents. Until signing lands,
the API only ever produces UNSIGNED calldata behind an approved intent.

### Required Fixes Before Public Beta:
- [ ] 🔴 Implement JWT authentication with scope-based authorization
- [ ] 🔴 Migrate wallet IDs from predictable hash to UUID v4
- [ ] 🟡 Add rate limiting across all endpoints
- [ ] 🟡 Implement CSRF token protection
- [ ] 🟢 Generate OpenAPI/Swagger documentation

**Target Date for Public Beta:** 2026-09-15 (3 weeks from audit)

---

## Phase 2 — Order automation

**Status:** READY FOR PLANNING

All infrastructure in place:
- ✅ BullMQ (Redis) job queue registered
- ✅ Limit / stop orders, DCA, TWAP models defined in shared-types
- ✅ Daily spend caps enforced at security gate
- ✅ Kill switch functionality implemented and tested

### Wave 4 Completion Checklist:
- [ ] DCA interval-based slot execution fully operational
- [ ] Limit order price trigger monitoring active
- [ ] 24-hour soak test completed with zero missed executions
- [ ] Backoffice order monitoring display enhanced
- [ ] Kill switch UI improvements (digest expansion, role controls)

**Target Date:** Q3 2026 (after Phase 1 remediation complete)

---

## Phase 3 — Token launchpad (Wave 5+)

**Status:** PRODUCTION READY - Contracts audited

**Contract Audit Results:** 
- Overall Score: 95/100
- Invariants Verified: INV-BOND-1/2/3, INV-FEE-1/INIT-1/SUP-1 (6/6 passing)
- Test Coverage: 57/57 unit tests passing
- Slither Analysis: Clean (0 blocking issues)

### S1-S3 Milestones:
- ✅ S1 Persistence: Complete (#105, #108)
- ✅ S2 Signing Ceremony: Complete (#94, #102)
- ✅ S3 Deploy Rehearsal: Complete & Green (8/8 jobs on Base Sepolia + Robinhood testnet)

### Pending Milestones:
- ⏸️ Tier D: Postponed pending decision
- ⏸️ Soak Clock: Not Started (requires Tier D PASS)
- ⏸️ S4 Venue Marketplace: Not Started (waiting user decision)
- ⏸️ S6 Mainnet Gate: Pending soak completion

### Contract Implementation Status:
- [x] Token factory contract deployed via CREATE2 pattern (`TokenFactory.sol`)
- [x] Fee schedule enforced at 175 bps total (dual validation: factory + template)
- [x] Bond accounting immutable (constructor-immutable parameters)
- [x] Deterministic address prediction via salt generation
- [ ] Bond sink treasury configuration pending
- [ ] Venue marketplace integration awaiting Tier D decision

### Frontend Requirements:
- [ ] Launch flow UI (requires auth implementation)
- [ ] Token pages design (UX wireframes needed)
- [ ] Backoffice moderation queue (requires RBAC)

**Mainnet Schedule:** TBD - No mainnet deployment until Tier D passes verification

---

## Phase 4 — Agent runtime & LLM gateway

**Status:** PLANNING PHASE

### Initial Design Points:
- [ ] OpenAI-compatible LLM gateway with per-agent metering
- [ ] Natural language → structured intent translation layer
- [ ] Prompt-injection defense suite: encoding detection, source whitelists, human-in-the-loop approval above thresholds
- [ ] Social connectors (X / Telegram) — read-only first, execution only after Phase 1–3 security reviews
- [ ] Red-team exercises replaying the Grok/Bankr attack chain

### Dependencies:
- Blocked by Phase 1 authentication milestone (cannot expose agents without identity verification)
- Requires payload inspection system enhancement (currently covers 60% of attack vectors)
- Needs rate limit flood mitigation testing

---

## Timeline Overview

| Quarter | Focus Areas | Key Deliverables |
|---------|-------------|------------------|
| **Q3 2026** | Phase 1 Remediation | JWT auth, E2E automation, CSP headers |
| **Q4 2026** | Phase 2 Automation | DCA/limit orders live, kill switch monitoring |
| **Q1 2027** | Phase 3 Launchpad | Tier D verification, venue marketplace |
| **Q2 2027** | Phase 4 Planning | Agent runtime architecture, red team exercises |

---

## Action Item Tracker

| ID | Description | Owner | Priority | Status | Due Date |
|----|-------------|-------|----------|--------|----------|
| ACTION-001 | Implement JWT authentication | @core-team | 🔴 CRITICAL | OPEN | 2026-08-25 |
| ACTION-002 | Fix wallet ID predictability | @core-team | 🔴 CRITICAL | OPEN | 2026-08-25 |
| ACTION-003 | Add CSP headers to builds | @ui-team | 🟡 HIGH | OPEN | 2026-08-25 |
| ACTION-004 | Implement Playwright E2E | @qa-team | 🟡 HIGH | OPEN | 2026-09-01 |
| ACTION-005 | Add performance baselines | @ops-team | 🟡 HIGH | OPEN | 2026-09-01 |
| ACTION-006 | Complete red team coverage | @security-team | 🟡 HIGH | OPEN | 2026-09-01 |

---

## Related Documents

| Document | Purpose | Link |
|----------|---------|------|
| MASTER AUDIT REPORT | Full W4-W7 audit findings | [`docs/MASTER-AUDIT-W4-W7.md`](./MASTER-AUDIT-W4-W7.md) |
| Core Audit Report | Backend security assessment | [`docs/AUDIT-CORE-W4-W7.md`](./AUDIT-CORE-W4-W7.md) |
| Contracts Audit | Smart contract verification | [`docs/AUDIT-CONTRACTS-W5.md`](./AUDIT-CONTRACTS-W5.md) |
| UI Audit | Frontend UX/security review | [`docs/AUDIT-UI-DOCS.md`](./AUDIT-UI-DOCS.md) |
| QA Audit | Testing infrastructure review | [`docs/AUDIT-QA-SECURITY.md`](./AUDIT-QA-SECURITY.md) |
| ORCHESTRA.md | Agent coordination protocol | [`docs/ORCHESTRA.md`](./ORCHESTRA.md) |

---

**Version:** 2.0  
**Maintained By:** @conductor  
**Next Review Date:** 2026-09-15 (post-authentication implementation)
