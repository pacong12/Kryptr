<<<<<<< HEAD
# Sprint 3: Token Launchpad & Mainnet Readiness - Operational Checklist

**Created:** 2026-09-01  
**Sprint Duration:** 4 weeks (Sep 21 - Oct 19)  
**Reference:** Next Sprint Plan (docs/NEXT-SPRINT-PLAN.md)  
**Status:** 🟢 KICKOFF PENDING TEAM INPUT

---

## Sprint Goal

Deploy production-grade token factory contracts to Base Mainnet, integrate wallet UI controls, complete full audit trail documentation, and achieve mainnet deployment readiness.

---

## Phase 3 Scope Overview

| Domain | Key Deliverables | Priority | Story Points |
|--------|------------------|----------|--------------|
| Smart Contracts | Factory Template Deployment | 🔴 CRITICAL | 8 |
| Wallet Controls | Kill-Switch Integration | 🟠 HIGH | 5 |
| Test Automation | Soak Tests + Penetration Suite | 🟡 MEDIUM | 3 |
| Documentation | Complete Audit Trail | 🟢 LOW | 2 |

---

## Team Assignments & Branches

| Agent | Branch | Focus Area | Dependencies |
|-------|--------|------------|--------------|
| @auditor-contracts | `feat/contracts-sprint3-mainnet-deploy` | TokenFactory → Base Mainnet | ✅ Sprint 2 Rehearsal Complete |
| @auditor-ui | `feat/ui-sprint3-wallet-controls` | Order Management Interface | ✅ BullMQ Runtime Ready |
| @auditor-qa | `feat/qa-sprint3-mainnet-soak-tests` | Production Validation Suite | ✅ Kill-Switch UI Complete |
| @core-team* | `feat/core-sprint3-monitoring` | Real-time Dashboard & Alerts | ⏳ TBD |

*Note: Core team requires PM coordination for monitoring scope

---

## Task 3.1: Contract Factory Deployment to Base Mainnet

### Owner: @auditor-contracts

#### Week 1 Tasks:

**Critical Path Item:** Must complete before any wallet operations

#### Checklist:
- [ ] **3.1.1** Finalize MultiSig Guardian Setup
  ```bash
  # scripts/deploy-multisig.mjs
  import { safeFactory } from '@gnosis.pm/safe-core-sdk';
  import { ethers } from 'ethers';
  
  const owners = [
    process.env.GUARDIAN_OWNER_1,
    process.env.GUARDIAN_OWNER_2,
    process.env.GUARDIAN_OWNER_3,
  ];
  
  const threshold = 2; // 2-of-3 multisig
  
  const safe = await safeFactory.deploy({
    owners,
    threshold,
    fallbackHandler: '0x...',
  });
  
  await safe.deployed();
  console.log('MultiSig Address:', safe.getAddress());
  ```
  - Status: PENDING
  - Acceptance: Multisig address deployed on Base Mainnet
  - Verification: Etherscan contract verified with source code
  - Security: Guardians onboarded via email training session

- [ ] **3.1.2** Deploy TokenFactory.sol to Base Mainnet
  ```bash
  # scripts/deploy-factory-mainnet.sh
  forge script script/DeployLaunchpad.s.sol:DeployLaunchpad \
    --rpc-url $BASE_MAINNET_RPC \
    --private-key $DEPLOYER_KEY \
    --verify \
    --verifier-url https://api.basescan.org/api \
    --slow \
    --broadcast \
    --via-ir \
    --gas-limit 10000000 \
    --chain-id 8453
  ```
  - Status: PENDING
  - Acceptance: Factory deployed and verified on Basescan
  - Gas Budget: ≤ 5 ETH total deployment cost
  - Post-Deployment: Addresses saved to `contracts/deployments/base-mainnet.json`

- [ ] **3.1.3** Deploy TokenTemplate.sol to Base Mainnet
  ```bash
  # Same deployer as factory, new artifact reference
  forge script script/DeployTemplate.s.sol:DeployTemplate \
    --rpc-url $BASE_MAINNET_RPC \
    --private-key $DEPLOYER_KEY \
    --verify \
    --verifier-url https://api.basescan.org/api \
    --slow \
    --broadcast \
    --via-ir \
    --gas-limit 5000000 \
    --chain-id 8453
  ```
  - Status: PENDING
  - Acceptance: Template deployed and verified
  - Fee Cap: Hard-coded at 175 bps (1.75%)
  - Owner Restriction: Only factory can call initialize

- [ ] **3.1.4** Create contract interaction ABI exports
  ```typescript
  // apps/shared/types/mainnet-contracts.ts
  import TokenFactoryABI from './artifacts/TokenFactory.json';
  import TokenTemplateABI from './artifacts/TokenTemplate.json';
  
  export type TokenFactoryContract = typeof TokenFactoryABI;
  export type TokenTemplateContract = typeof TokenTemplateABI;
  
  // Export constants
  export const FACTORY_ADDRESS = '0x...'; // From deployments/base-mainnet.json
  export const TEMPLATE_ADDRESS = '0x...';
  export const CHAIN_ID = 8453; // Base Mainnet
  ```
  - Status: PENDING
  - Acceptance: Type-safe usage throughout frontend/backoffice
  - Migration: Update all contract references to use new addresses

---

## Task 3.2: Wallet UI Controls & Integration

### Owner: @auditor-ui

#### Week 2 Tasks:

**Dependencies:** Factory deployed (Task 3.1 complete)

#### Checklist:
- [ ] **3.2.1** Implement Order Management Page
  ```vue
  <!-- apps/frontoffice/src/pages/WalletOrdersPage.vue -->
  <script setup lang="ts">
  import { ref, computed, onMounted } from 'vue';
  import { useWalletStore } from '@/stores/wallet';
  import { orderService } from '@/services/order.service';
  
  const walletStore = useWalletStore();
  const orders = ref([]);
  const isLoading = ref(true);
  
  async function loadOrders() {
    try {
      orders.value = await orderService.getWalletOrders(walletStore.walletId);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      isLoading.value = false;
    }
  }
  
  onMounted(loadOrders);
  </script>

  <template>
    <div class="orders-page">
      <h2>Wallet Orders</h2>
      
      <LoadingSpinner v-if="isLoading" />
      
      <div v-else-if="orders.length === 0" class="empty-state">
        <p>No active orders found</p>
        <button @click="createNewOrder">Create New DCA/Limit Order</button>
      </div>
      
      <OrderList :orders="orders" @edit="handleEdit" @delete="handleDelete" />
      
      <KillSwitchBanner />
    </div>
  </template>
  ```
  - Status: PENDING
  - Acceptance: Page loads without errors, displays all active orders
  - Performance: Load time < 2 seconds with 100+ orders
  - UX: Clear empty state guidance when no orders exist

- [ ] **3.2.2** Add Order Creation Wizard
  ```vue
  <!-- apps/frontoffice/src/components/CreateOrderWizard.vue -->
  <script setup lang="ts">
  interface OrderType {
    type: 'DCA' | 'LIMIT';
    amountUsd: number;
    frequency?: 'daily' | 'weekly' | 'monthly'; // For DCA
    targetPrice?: number; // For LIMIT
    deadline?: number; // Expiration timestamp
  }
  
  const props = defineProps<{
    walletId: string;
  }>();
  
  const emit = defineEmits<{
    (e: 'created', order: OrderType): void;
  }>();
  
  const currentStep = ref(1);
  const formData = ref<OrderType>({
    type: 'DCA',
    amountUsd: 0,
    frequency: 'weekly',
  });
  
  async function submitOrder() {
    const response = await orderService.createOrder({
      ...formData.value,
      walletId: props.walletId,
    });
    
    emit('created', response.data);
    currentStep.value = 3; // Success step
  }
  </script>
  
  <template>
    <SteppedWizard :current-step="currentStep">
      <template v-slot:step-1>
        <OrderTypeSelector 
          @select="type => formData.type = type" 
        />
        <NextButton 
          :disabled="!formData.type"
          @click="nextStep" 
        />
      </template>
      
      <template v-slot:step-2>
        <OrderParametersForm 
          :order-type="formData.type"
          v-model="formData"
        />
        <PreviousButton @click="prevStep" />
        <SubmitButton 
          :disabled="!isValid(formData)"
          @click="submitOrder"
        />
      </template>
    </SteppedWizard>
  </template>
  ```
  - Status: PENDING
  - Acceptance: All input validation enforced with clear error messages
  - Integration: Successfully queues order via BullMQ worker
  - Confirmation: User receives order receipt after submission

- [ ] **3.2.3** Integrate Kill-Switch Display Banner
  ```vue
  <!-- apps/frontoffice/src/components/KillSwitchBanner.vue -->
  <script setup lang="ts">
  import { ref, onMounted } from 'vue';
  import { killSwitchService } from '@/services/kill-switch.service';
  
  const isFrozen = ref(false);
  const freezeReason = ref('');
  
  async function checkFreezeStatus() {
    const status = await killSwitchService.getStatus();
    isFrozen.value = status.frozen;
    freezeReason.value = status.reason || '';
  }
  
  onMounted(checkFreezeStatus);
  setInterval(checkFreezeStatus, 5000); // Poll every 5s
  </script>

  <template>
    <Transition name="fade">
      <div v-if="isFrozen" class="kill-switch-banner alert-danger">
        <span class="icon">🚨</span>
        <span>Orders paused due to: {{ freezeReason }}</span>
        <a href="/admin/kill-switch" target="_blank">Manage Freeze</a>
      </div>
    </Transition>
  </template>

  <style scoped>
  .kill-switch-banner {
    background: #fee2e2;
    border: 1px solid #ef4444;
    color: #b91c1c;
    padding: 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  </style>
  ```
  - Status: PENDING
  - Acceptance: Banner appears immediately when freeze activated
  - Real-time: Auto-refresh every 5 seconds for live status
  - Accessibility: High contrast colors meet WCAG AA standards

---

## Task 3.3: Production Validation Soak Tests

### Owner: @auditor-qa

#### Week 3 Tasks:

**Dependencies:** UI controls integrated (Task 3.2 complete)

#### Checklist:
- [ ] **3.3.1** Deploy Staging Environment
  ```yaml
  # docker-compose.mainnet-staging.yml
  services:
    postgres-mainnet-staging:
      image: postgres:15
      environment:
        POSTGRES_DB: kryptr_mainnet_staging
        POSTGRES_USER: staging
        POSTGRES_PASSWORD: ${STAGING_DB_PASSWORD}
      ports:
        - "5432:5432"
    
    redis-mainnet-staging:
      image: redis:7-alpine
      command: redis-server --requirepass ${STAGING_REDIS_PASSWORD}
      ports:
        - "6379:6379"
    
    api-staging:
      build: ./apps/api
      environment:
        DATABASE_URL: postgresql://staging:...
        REDIS_HOST: redis-mainnet-staging
        AUTOMATION_MODE: bullmq
        MAINNET_MODE: true
        BASE_MAINNET_RPC: ${BASE_MAINNET_RPC}
      ports:
        - "3000:3000"
  ```
  - Status: PENDING
  - Acceptance: All containers start successfully
  - Isolation: Separate database/redis from production
  - Monitoring: Prometheus metrics endpoint active

- [ ] **3.3.2** Execute 24-hour Soak Test Suite
  ```typescript
  // tests/e2e/soak/production-validation.spec.ts
  describe('Production Soak Test (24h)', () => {
    const START_TIME = Date.now();
    const DURATION_MS = 24 * 60 * 60 * 1000;
    
    let driver: PlaywrightTestContext;
    let orderCount = 0;
    
    beforeEach(async () => {
      driver = await setupStagingEnvironment();
      await driver.apiClient.loginAs('integration-test@kryptr.test');
    });
    
    it('maintains system stability over 24 hours', async () => {
      while (Date.now() - START_TIME < DURATION_MS) {
        // Continuous operation loop
        const orderId = generateOrderId();
        
        // Create DCA order
        await orderService.createOrder({
          type: 'DCA',
          amountUsd: 50,
          frequency: 'daily',
        });
        
        orderCount++;
        
        // Wait 1 minute between orders
        await sleep(60000);
        
        // Health check every 100 orders
        if (orderCount % 100 === 0) {
          const health = await driver.apiClient.healthCheck();
          expect(health.status).toBe('healthy');
          expect(health.uptime_seconds).toBeGreaterThan(86400);
        }
      }
    });
    
    it('validates zero failed executions', async () => {
      const executionLogs = await getExecutionLogs(START_TIME, Date.now());
      const failures = executionLogs.filter(log => log.status === 'FAILED');
      
      expect(failures.length).toBe(0);
    });
  });
  ```
  - Status: PENDING
  - Acceptance: System runs continuously for 24 hours without crashes
  - Metrics collected: Latency p95, memory usage, error rates
  - Pass Criteria: Zero critical failures, <0.1% retry rate

- [ ] **3.3.3** Run Penetration Test Suite
  ```typescript
  // tests/security/soak-clock-pentest.spec.ts
  describe('Soak Clock Pentest Suite', () => {
    describe('Bypass Attempts', () => {
      it('rejects direct DB manipulation attempts', async () => {
        const maliciousPayload = {
          action: 'update_orders',
          query: "UPDATE orders SET status='executed' WHERE id='test'",
        };
        
        await expect(apiRequest.patch('/intents/mass-update', {
          body: JSON.stringify(maliciousPayload),
        })).rejects.toThrow(/permission denied/i);
      });
      
      it('blocks unauthorized wallet access attempts', async () => {
        const unauthenticatedUser = 'user_not_assigned_to_wallet';
        const response = await apiRequest.get(`/wallets/${unauthenticatedUser}/orders`);
        
        expect(response.status).toBe(403);
        expect(response.body.message).toBe('Unauthorized wallet access');
      });
    });
    
    describe('Rate Limit Enforcement', () => {
      it('blocks excessive API requests within time window', async () => {
        for (let i = 0; i < 105; i++) {
          await apiRequest.post('/intents/create');
        }
        
        const lastResponse = await apiRequest.get('/health');
        expect(lastResponse.status).toBe(429);
        expect(lastResponse.body.retry_after_ms).toBeGreaterThan(0);
      });
    });
  });
  ```
  - Status: PENDING
  - Acceptance: All security gates reject invalid operations
  - Coverage: 15+ distinct attack vectors tested
  - Reporting: Detailed vulnerability report generated

---

## Task 3.4: Complete Audit Trail Documentation

### Owner: @conductor (+ all domain leads)

#### Week 4 Tasks:

**Final Deliverable Before Go/No-Go Decision**

#### Checklist:
- [ ] **3.4.1** Document Contract Deployment Provenance
  - [x] Chain of custody from testnet to mainnet
  - [ ] MultiSig guardian sign-off signatures
  - [ ] Gas cost breakdown per deployment transaction
  - [ ] Verification URLs for all artifacts
  
- [ ] **3.4.2** Compile Security Review Records
  - [ ] W4-W7 audit findings and remediation mapping
  - [ ] Sprint 2 soak test results summary
  - [ ] Penetration test penetration points
  - [ ] Risk register with mitigation status
  
- [ ] **3.4.3** Generate Operations Runbook
  - [ ] Kill-switch activation procedures (with examples)
  - [ ] Rollback strategies for contract upgrades
  - [ ] Emergency contact list with escalation paths
  - [ ] Daily health check checklist template
  
- [ ] **3.4.4** Produce Stakeholder Sign-Off Document
  - [ ] Managing Director approval signature
  - [ ] Technical lead review confirmation
  - [ ] Compliance officer acknowledgment
  - [ ] Public roadmap update notification

---

## Daily Standup Requirements

All team members must provide status update every morning at **10:00 AM WIB**:

```
✅ Done yesterday
🚧 In progress today
⚠️ Blockers encountered
📊 Progress: X/Y tasks completed
```

**Example update:**
- auditor-contracts: ✅ Multisig deployed | 🚧 Factory deployment | ⚠️ Need gas estimation approval
- auditor-ui: 🚧 Order management page | ⚠️ Waiting for contract addresses
- auditor-qa: ✅ Staging environment up | 🚧 Starting soak tests | ⚠️ None
- conductor: ✅ Kickoff scheduled | 🚧 Collecting sprint inputs | ⚠️ None

---

## Completion Criteria

### Sprint 3 Entry Gate (ALL MUST PASS):
- [ ] Every checkbox marked [x] as completed
- [ ] All tests pass (unit + E2E + soak + pentest)
- [ ] CI pipeline green for each branch
- [ ] Contract verification confirmed on blockchain explorer
- [ ] Security scan shows zero critical vulnerabilities

### Sprint 3 Exit Gate:
- [ ] Feature branches merged to main
- [ ] Documentation updated (architecture diagrams, runbooks)
- [ ] Release notes published with version tag
- [ ] Stakeholder sign-off obtained
- [ ] Phase 4 Go/No-Go decision documented

---

## Risk Escalation Matrix

| Severity | Response Time | Contact |
|----------|---------------|---------|
| 🔴 Critical (blocks team) | Within 1 hour | Managing Director |
| 🟡 High (team productivity impact) | Within 4 hours | Conductor |
| 🟢 Low (individual blocker) | Within 24 hours | Lead Developer |

**Escalation Template:**
```
URGENT: [Risk Type] blocking [Agent Name]
Impact: [Describe what work is stopped]
Blocker: [Root cause description]
Request: [What approval/help needed]
Timeline: Must resolve by [date/time]
```

---

## Communication Channels

| Channel | Purpose | Frequency | Audience |
|---------|---------|-----------|----------|
| IRC (#kryptr) | Daily standups, emergency updates | Real-time | All agents |
| GitHub PRs | Technical reviews, merge approvals | Per commit | Core team |
| Email digest | Weekly stakeholder reports | Fridays | MD + investors |
| Slack/Teams | External partner coordination | As needed | PM + stakeholders |

---

## Milestones & Timeline

```
Sep 21, 2026         ──→ Sprint 3 Start 🟠
Oct 05, 2026         ──→ Factory Deployment ✅
Oct 12, 2026         ──→ UI Controls Live 🟡
Oct 19, 2026         ──→ Soak Tests Complete 🟢
Oct 20, 2026         ──→ Phase 4 Go/No-Go Decision 🔴
```

---

**Approved By:** Conductor Agent  
**Version:** 1.0  
**Last Updated:** 2026-09-01  
**Next Review:** After Sprint 3 kickoff meeting  
=======
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
>>>>>>> origin/feat/ui-sprint3-wallet-controls
