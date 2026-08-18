# Next Sprint Plan - Kryptr W4-W7 Audit Follow-up

**Created:** 2026-08-18  
**Based on:** Team consensus from IRC discussion  
**Reference:** Master Audit Report W4-W7 (docs/MASTER-AUDIT-W4-W7.md)

---

## Executive Summary

Phase 1 DoD **100% COMPLETE** ✅  
Overall Audit Score: **77.5/100** (CONDITIONAL PASS)  

This sprint plan addresses critical remediation items identified in the W4-W7 audit while initiating Phase 2 automation infrastructure.

---

## Sprint 1: Critical Remediation (Duration: 2 weeks)

### Priority 1: Authentication & Authorization Layer 🔴 CRITICAL

**Owner:** @core-team  
**Story Points:** 8  
**Dependencies:** None (BLOCKER for all other work)

#### Tasks:
1. Implement JWT authentication middleware with Passport.js
   - Configurable via environment variables (`JWT_SECRET`, `JWT_EXPIRY`)
   - Scope-based authorization (admin, user, system roles)
   - Refresh token rotation strategy
   
2. Secure credential storage integration
   - HashiCorp Vault or AWS Secrets Manager for JWT secret management
   - Environment variable validation at startup
   
3. API Gateway rate limiting implementation
   - `@nestjs/throttler` with Redis-backed storage
   - Per-IP limits: 100 req/min for read, 20 req/min for write
   - Burst protection for auth endpoints

**Acceptance Criteria:**
- All sensitive endpoints require valid JWT token
- Unauthorized requests return 401 with proper error envelope
- Rate limiting enforced across entire API layer
- Zero authentication bypasses (verified by security team)

**Estimated Effort:** 3 days  
**Risk Level:** HIGH (blocking all production deployment)

---

### Priority 2: Wallet ID Migration to UUID v4 🔴 CRITICAL

**Owner:** @core-team  
**Story Points:** 5  
**Dependencies:** Sprint 1 Task 1 (authentication first)

#### Tasks:
1. Add migration script for existing wallet IDs
   - Create mapping table: old_hash_id → new_uuid
   - Handle active sessions and queued operations
   - Data consistency checks pre/post migration
   
2. Update all references to wallet ID throughout codebase
   - Database queries use UUID format
   - API responses use canonical UUID strings
   - Frontoffice displays formatted UUIDs (with copy button)
   
3. Implement UUID generation pattern
   - Cryptographically secure random generator
   - No derivation from public data (ownerId + address)
   - Prefix strategy: `wallet-{uuid}` for external APIs

**Acceptance Criteria:**
- All new wallets created with UUID v4
- Existing wallets migrated within 24 hours of deployment
- No prediction possible even with owner ID knowledge
- Privacy audit shows zero enumeration attack surface

**Estimated Effort:** 2 days  
**Risk Level:** HIGH (privacy & security vulnerability)

---

### Priority 3: CSP Headers Implementation 🟡 HIGH

**Owner:** @ui-team  
**Story Points:** 3  
**Dependencies:** Sprint 1 Task 1 (auth complete before hardening headers)

#### Tasks:
1. Add Content-Security-Policy headers to both apps

   **Frontoffice (Vue 3/Vite):**
   ```javascript
   // vite.config.mts
   export default defineConfig({
     build: {
       rollupOptions: {
         plugins: [cspPlugin('default-src \'self\'; script-src \'self\' \'unsafe-inline\'; ...')]
       }
     }
   })
   ```

   **Backoffice (Next.js 16):**
   ```javascript
   // next.config.js
   async headers() {
     return [{
       source: '/:path*',
       headers: [{
         key: 'Content-Security-Policy',
         value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; ..."
       }]
     }]
   }
   ```

2. Integrate CSP reporting endpoint
   - Log violations to `/api/security/csp-reports`
   - Monitor first 48 hours post-deployment
   - Adjust policy based on legitimate violations

3. Remove unsafe-inline scripts where possible
   - Migrate inline event handlers to addEventListener
   - Use nonce or hash-based CSP instead of 'unsafe-inline'

**Acceptance Criteria:**
- CSP headers present on all production responses
- No violations logged after 48-hour monitoring period
- XSS attack simulations fail due to CSP blocking
- Compliance with OWASP CSP recommendation

**Estimated Effort:** 1.5 days  
**Risk Level:** MEDIUM (elevated attack surface without protection)

---

### Priority 4: E2E Test Automation Infrastructure 🟡 HIGH

**Owner:** @qa-team  
**Story Points:** 5  
**Dependencies:** Sprint 1 Task 1 (mock backend for isolated testing)

#### Tasks:
1. Implement Playwright E2E test suite
   - Install Playwright dependencies
   - Create base page objects for common flows:
     * WalletConnectPage.tsx
     * TransferIntentForm.vue
     * BackofficeDashboard.tsx
   
2. Record browser automation scenarios
   - Happy path: Connect wallet → Send transfer → View backoffice
   - Negative paths: Network failure, insufficient funds, invalid amounts
   - Performance: Load time budgets, TTI < 3s

3. Integrate with CI pipeline
   - Run on every PR to main
   - Fail-fast on any regression
   - Generate HTML reports per run

4. Set up test fixtures & mock services
   - Mock Privy connection responses
   - Mock blockchain RPC calls (viem mocks)
   - Isolated PostgreSQL instance for each test file

**Acceptance Criteria:**
- 90%+ coverage of critical user journeys
- Zero flaky tests in stable baseline
- CI pipeline fails if E2E test suite breaks
- Manual verification confirms automated test accuracy

**Estimated Effort:** 3 days  
**Risk Level:** MEDIUM (quality assurance gap without automation)

---

## Sprint 2: Phase 2 Order Automation (Duration: 3 weeks)

### Priority 1: BullMQ Execution Runtime 🟠 MEDIUM

**Owner:** @core-team + @trading-team  
**Story Points:** 8  
**Dependencies:** Sprint 1 remediation complete

#### Tasks:
1. Deploy BullMQ queue infrastructure to production Redis
   - Configure connection pooling
   - Set up cluster mode for high availability
   - Implement dead letter queue pattern
   
2. Implement order worker runtime
   - DCA slot scheduler (interval-based execution)
   - Limit order trigger monitoring (price feed driven)
   - Automatic retry with exponential backoff
   
3. Integrate with kill-switch infrastructure
   - Global freeze check before every execution
   - Per-wallet pause capability (security requirement)
   - Audit trail for all switch state changes

**Acceptance Criteria:**
- Queue processing latency < 50ms p95
- Zero missed executions during 24h soak test
- Kill switch activation freezes all pending jobs instantly
- Dead letter queue captures failures for manual review

**Estimated Effort:** 4 days  
**Risk Level:** LOW (infrastructure already verified in audit)

---

### Priority 2: DCA/Limit Order Triggers 🟠 MEDIUM

**Owner:** @trading-team  
**Story Points:** 5  
**Dependencies:** BullMQ runtime ready

#### Tasks:
1. Implement DCA interval scheduler
   - Configurable frequency (daily, weekly, custom)
   - Slot-based execution with idempotency
   - Pause/resume capability per wallet
   
2. Implement limit order price trigger
   - Chainlink or Coingecko price feed integration
   - Trigger evaluation engine (real-time monitoring)
   - Price decay/deadline handling
   
3. Build order lifecycle state machine
   - States: open → triggered → executing → completed/failed
   - Transitions validated against business rules
   - Human-in-the-loop approval gates

**Acceptance Criteria:**
- DCA orders execute exactly at configured intervals
- Limit orders trigger when price crosses threshold
- No double-execution under concurrent load
- Accurate state transitions logged to decision_audit table

**Estimated Effort:** 3 days  
**Risk Level:** MEDIUM (requires precise timing implementation)

---

### Priority 3: Testnet Rehearsal 🟢 LOW

**Owner:** @qa-team + @contracts-team  
**Story Points:** 3  
**Dependencies:** Phase 2 infrastructure deployed

#### Tasks:
1. Configure Base Sepolia testnet environment
   - Fork setup for realistic block conditions
   - Pre-funded test wallets for simulation
   - Mock price feeds for deterministic testing
   
2. Execute full order automation rehearsal
   - Deploy contract factory to testnet
   - Simulate real-world usage patterns (100+ orders)
   - Stress test kill-switch activation
   
3. Document rehearsal results
   - Performance metrics (execution speed, gas costs)
   - Bug report with reproduction steps
   - Recommendations for mainnet deployment

**Acceptance Criteria:**
- Zero critical bugs found during rehearsal
- Execution latency matches development environment
- Gas costs within acceptable budget (±10%)
- Comprehensive documentation for mainnet launch

**Estimated Effort:** 2 days  
**Risk Level:** LOW (reduces mainnet deployment risk)

---

## Timeline & Milestones

| Week | Sprint 1 (Remediation) | Sprint 2 (Automation) |
|------|------------------------|-----------------------|
| Week 1 | ✅ JWT Auth + Wallet ID Migration | ⏳ BullMQ Deployment |
| Week 2 | ✅ CSP Headers + E2E Suite Init | ✅ DCA/Limit Triggers |
| Week 3 | (Buffer for blockers) | ✅ Testnet Rehearsal |
| Week 4 | Phase 2 Go-No-Go Decision | Mainnet Launch Prep |

---

## Resource Allocation

| Role | Sprint 1 | Sprint 2 |
|------|----------|----------|
| Backend Developer | 2 FTE | 2 FTE |
| Frontend Developer | 1 FTE | 1 FTE |
| QA Engineer | 1 FTE | 2 FTE |
| DevOps Engineer | 0.5 FTE | 1 FTE |
| Smart Contract Auditor | 0 FTE | 0.5 FTE |

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| JWT auth blocks all progress | HIGH | CATASTROPHIC | Parallel track: start CSP/E2E while auth in dev |
| Wallet ID migration causes data loss | LOW | HIGH | Full backup + staged rollout |
| E2E tests become flaky | MEDIUM | MEDIUM | Dedicated engineer to maintain stability |
| BullMQ cluster outage | LOW | HIGH | Redis sentinel failover configured |

---

## Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Authentication bypass attempts | 0 | Security scanner logs |
| Wallet ID predictability attacks | 0 | External penetration test |
| XSS vulnerability count | 0 | CSP violation logs + SAST scan |
| E2E test pass rate | ≥95% | CI pipeline results |
| Order execution latency | <50ms p95 | Monitoring dashboard |
| Missed executions (24h) | 0 | Auto-generated report |

---

## Dependencies Checklist

- [ ] Sprint 1 Task 1 complete before starting Sprint 2
- [ ] CSP headers verified before Phase 3 launchpad deployment
- [ ] E2E suite baseline established before feature freeze
- [ ] BullMQ cluster health checked daily during Phase 2
- [ ] Testnet rehearsal passes before any mainnet activity

---

## Communication Plan

- **Daily Standup:** 10:00 AM WIB (via IRC #kryptr)
- **Sprint Review:** End of Week 2 & Week 4
- **Stakeholder Update:** Weekly Friday email digest
- **Emergency Escalation:** Managing Director notification channel

---

**Approved By:** @conductor  
**Version:** 1.0  
**Last Updated:** 2026-08-18  
**Next Review:** 2026-08-25 (post-sprint retrospective)
