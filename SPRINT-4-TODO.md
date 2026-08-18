# Sprint 4: Phase 3 Live Deployment Rehearsal - Operational Checklist

**Created:** 2026-09-XX  
**Sprint Duration:** 2 weeks (Oct 19 - Oct 31, 2026)  
**Reference:** Sprint Plan docs/NEXT-SPRINT-PLAN.md  
**Status:** 🟢 KICKOFF PENDING TEAM INPUT

---

## Sprint Goal

Execute comprehensive live deployment rehearsal on Base Sepolia testnet with real wallet interactions, validate all kill-switch mechanisms under production-like conditions, and prepare Token Launchpad UI for public rollout.

---

## Phase 3 Live Rehearsal Overview

| Domain | Key Deliverables | Priority | Story Points |
|--------|------------------|----------|--------------|
| Smart Contracts | Deploy & Verify on Testnet | 🔴 CRITICAL | 8 |
| Wallet Controls | Live Kill-Switch Testing | 🟠 HIGH | 5 |
| UI Integration | Real-time Dashboard | 🟡 MEDIUM | 3 |
| Monitoring | Prometheus + Grafana Setup | 🟡 MEDIUM | 2 |

---

## Team Assignments & Branches

| Agent | Branch | Focus Area | Dependencies |
|-------|--------|------------|--------------|
| @auditor-contracts | `feat/contracts-sprint4-live-deploy` | Base Sepolia Deployment | ✅ Mainnet Prep Complete |
| @auditor-ui | `feat/ui-sprint4-monitoring-dashboard` | Kill-Switch Live Controls | ✅ ABI Integration Done |
| @auditor-qa | `feat/qa-sprint4-production-rehearsal` | End-to-End Validation Suite | ✅ All Components Ready |
| @core-team* | `feat/core-sprint4-realtime-monitoring` | Health Dashboard API | ⏳ TBD |

---

## Task 4.1: Base Sepolia Live Deployment

### Owner: @auditor-contracts

#### Week 1 Tasks:

**Critical Path Item:** Must deploy before any UI testing

#### Checklist:
- [ ] **4.1.1** Prepare Base Sepolia Environment
  ```bash
  # scripts/prepare-sepolia.sh
  echo "=== Base Sepolia Preparation ==="
  
  # Check RPC connectivity
  curl -X POST https://base-sepolia.rpc.thirdweb.com \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | jq .result
  
  # Get testnet ETH from faucet
  echo "Requesting 2 ETH via Alchemy faucet..."
  # Implementation depends on available faucet API
  
  # Set environment variables
  export BASE_SEPOLIA_RPC="https://base-sepolia.alchemyapi.io/v2/YOUR_KEY"
  export DEPLOYER_PRIVATE_KEY="${PRIVATE_KEY}"
  export GAS_PRICE_GWEI=10
  ```
  - Status: PENDING
  - Acceptance: RPC endpoint responds within 1 second
  - Balance: Deployer wallet has ≥5 ETH minimum
  - Documentation: Faucet access procedure documented

- [ ] **4.1.2** Deploy Contract Factory to Base Sepolia
  ```bash
  # scripts/deploy-factory-sepolia.sh
  forge script script/DeployLaunchpad.s.sol:DeployLaunchpad \
    --rpc-url $BASE_SEPOLIA_RPC \
    --private-key $DEPLOYER_PRIVATE_KEY \
    --verify \
    --verifier-url https://api-sepolia.basescan.org/api \
    --slow \
    --broadcast \
    --via-ir \
    --gas-limit 10000000 \
    --chain-id 84532 \
    --sender "$(cast wallet address --private-key $DEPLOYER_PRIVATE_KEY)"
  ```
  - Status: PENDING
  - Acceptance: Factory deployed on Base Sepolia (Chain ID 84532)
  - Verification: Contract source code submitted to Basescan
  - Gas Budget: ≤ 3 ETH total cost
  - Output: Addresses saved to `contracts/deployments/base-sepolia-live.json`

- [ ] **4.1.3** Deploy TokenTemplate to Base Sepolia
  ```bash
  # Same script as factory but different entry point
  forge script script/DeployTemplate.s.sol:DeployTemplate \
    --rpc-url $BASE_SEPOLIA_RPC \
    --private-key $DEPLOYER_PRIVATE_KEY \
    --verify \
    --verifier-url https://api-sepolia.basescan.org/api \
    --slow \
    --broadcast \
    --via-ir \
    --gas-limit 5000000 \
    --chain-id 84532
  ```
  - Status: PENDING
  - Acceptance: Template deployed with correct factory reference
  - Fee Cap: Hard-coded at 175 bps (verified in bytecode)
  - Ownership: Only factory can call initialize()

- [ ] **4.1.4** Create Contract Registry Manifest
  ```typescript
  // contracts/deployments/base-sepolia-manifest.ts
  export interface DeployedContracts {
    factoryAddress: string;
    templateAddress: string;
    chainId: number;
    deployedAt: string;
    deployTxHash: string;
    verifierUrl: string;
  }
  
  export const SEPOLIA_MANIFEST: DeployedContracts = {
    factoryAddress: '0x...',
    templateAddress: '0x...',
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    deployTxHash: '0x...',
    verifierUrl: 'https://api-sepolia.basescan.org/api',
  };
  ```
  - Status: PENDING
  - Acceptance: Manifest matches actual deployments exactly
  - Backup: Copy stored in private S3 bucket for disaster recovery
  - Validation: JSON schema validated before commit

---

## Task 4.2: Kill-Switch Live Testing

### Owner: @auditor-ui

#### Week 2 Tasks:

**Dependencies:** Factory deployed (Task 4.1 complete)

#### Checklist:
- [ ] **4.2.1** Implement Real-Time Freeze Indicator
  ```vue
  <!-- apps/frontoffice/src/components/KillSwitchLiveIndicator.vue -->
  <script setup lang="ts">
  import { ref, onMounted, watch } from 'vue';
  import { killSwitchService } from '@/services/kill-switch.service';
  import { useWebSocket } from '@/composables/useWebSocket';
  
  const isFrozen = ref(false);
  const freezeTimestamp = ref<number | null>(null);
  const freezeReason = ref<string>('');
  const wsConnected = ref(false);
  
  const { connect, disconnect } = useWebSocket('wss://api.kryptr.test/kills-switch-events');
  
  function handleFreezeEvent(data: { frozen: boolean; reason: string }) {
    isFrozen.value = data.frozen;
    freezeReason.value = data.reason;
    
    if (data.frozen && !freezeTimestamp.value) {
      freezeTimestamp.value = Date.now();
      
      // Show toast notification
      showNotification({
        title: 'Orders Paused',
        message: freezeReason.value,
        type: 'danger',
        duration: 10000,
      });
    }
  }
  
  onMounted(() => {
    connect(handleFreezeEvent);
    checkStatus(); // Initial polling fallback
    
    setInterval(checkStatus, 5000);
  });
  
  async function checkStatus() {
    if (!wsConnected.value) {
      const status = await killSwitchService.getStatus();
      isFrozen.value = status.frozen;
      freezeReason.value = status.reason || '';
    }
  }
  </script>

  <template>
    <Transition name="fade-scale">
      <div v-if="isFrozen" class="kill-switch-indicator alert-banner">
        <span class="icon">🚨</span>
        <span>
          System FROZEN since {{ formatTime(freezeTimestamp) }}
          Reason: {{ freezeReason }}
        </span>
        <a href="/admin/kill-switch" target="_blank" class="manage-link">
          Manage Freeze →
        </a>
      </div>
    </Transition>
  </template>

  <style scoped>
  .kill-switch-indicator {
    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
    border: 2px solid #ef4444;
    color: #b91c1c;
    padding: 1rem 1.5rem;
    border-radius: 0.75rem;
    margin: 1rem 0;
    display: flex;
    align-items: center;
    gap: 1rem;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  }
  
  .icon {
    font-size: 1.5rem;
  }
  </style>
  ```
  - Status: PENDING
  - Acceptance: WebSocket connection establishes within 500ms
  - Visual: Banner appears instantly when freeze activated
  - Accessibility: High contrast meets WCAG AA standards

- [ ] **4.2.2** Add Manual Freeze Activation Button (Admin Only)
  ```vue
  <!-- apps/backoffice/src/pages/admin/KillSwitchAdmin.vue -->
  <script setup lang="ts">
  import { ref } from 'vue';
  import { adminApi } from '@/services/admin-api';
  
  const isGlobalFreezing = ref(false);
  const freezingWallets = ref<string[]>([]);
  const freezeReason = ref('');
  const loading = ref(false);
  
  async function activateGlobalFreeze(reason: string) {
    loading.value = true;
    try {
      await adminApi.freezeAll(reason);
      isGlobalFreezing.value = true;
      freezeReason.value = reason;
      
      // Broadcast to all connected clients
      emit('global-freeze', { frozen: true, reason });
    } finally {
      loading.value = false;
    }
  }
  
  async function deactivateGlobalFreeze() {
    loading.value = true;
    try {
      await adminApi.unfreezeAll();
      isGlobalFreezing.value = false;
      
      emit('global-unfreeze', {});
    } finally {
      loading.value = false;
    }
  }
  </script>

  <template>
    <div class="kill-switch-admin">
      <h3>Kill Switch Control Panel</h3>
      
      <div class="status-card">
        <h4>Current State</h4>
        <div class="status-indicator">
          <span :class="{ 'frozen': isGlobalFreezing, 'active': !isGlobalFreezing }">
            {{ isGlobalFreezing ? 'GLOBAL FREEZE ACTIVE' : 'SYSTEM OPERATIONAL' }}
          </span>
        </div>
        
        <input 
          v-model="freezeReason" 
          placeholder="Reason for freeze (required)"
          required
          class="reason-input"
        />
      </div>
      
      <button 
        @click="activateGlobalFreeze(freezeReason)" 
        :disabled="!freezeReason || loading"
        class="activate-btn danger-btn"
      >
        {{ loading ? 'Activating...' : 'FREEZE ALL ORDERS' }}
      </button>
      
      <button 
        @click="deactivateGlobalFreeze()" 
        :disabled="!isGlobalFreezing || loading"
        class="deactivate-btn success-btn"
      >
        {{ loading ? 'Releasing...' : 'UNFREEZE ALL ORDERS' }}
      </button>
    </div>
  </template>
  ```
  - Status: PENDING
  - Acceptance: Only admins with proper role can access page
  - Confirmation: Double-check prompt before activation
  - Audit Trail: All actions logged to decision_audit table

---

## Task 4.3: Production Rehearsal Validation Suite

### Owner: @auditor-qa

#### Week 2 Tasks:

**Dependencies:** Kill-switch UI ready (Task 4.2 complete)

#### Checklist:
- [ ] **4.3.1** Execute Full Order Lifecycle Test
  ```typescript
  // tests/e2e/lifecycle-rehearsal.spec.ts
  describe('Phase 3 Live Deployment Rehearsal', () => {
    let driver: PlaywrightTestContext;
    
    beforeEach(async () => {
      driver = await setupBaseSepoliaEnvironment();
      await driver.apiClient.loginAs('rehearsal@kryptr.test');
    });
    
    it('executes complete DCA order flow on testnet', async () => {
      // Step 1: Create DCA order via UI
      const orderId = await createDcaOrder({
        amountUsd: 10,
        frequency: 'weekly',
      });
      
      expect(orderId).toBeTruthy();
      
      // Step 2: Monitor execution via dashboard
      const execution = await waitForExecution(orderId, { timeoutMs: 60000 });
      
      expect(execution.status).toBe('COMPLETED');
      expect(execution.onChainHash).toBeDefined();
      
      // Step 3: Verify blockchain transaction
      const txReceipt = await verifyOnChainTransaction(execution.onChainHash);
      expect(txReceipt.status).toBe('success');
      
      // Step 4: Validate audit trail
      const auditRecord = await db.query(`
        SELECT * FROM decision_audit 
        WHERE order_id = $1 AND action = 'order_execution'
      `, [orderId]);
      
      expect(auditRecord.rows.length).toBeGreaterThan(0);
    });
  });
  ```
  - Status: PENDING
  - Acceptance: Full lifecycle completes without errors
  - Metrics collected: Latency from creation → execution
  - Success Criteria: Zero failed transactions

- [ ] **4.3.2** Stress Test Kill-Switch Response Time
  ```typescript
  // tests/performance/kill-switch-latency.spec.ts
  describe('Kill-Switch Performance Tests', () => {
    const NUM_ORDERS = 1000;
    const TEST_DURATION_MS = 5000; // 5 seconds
    
    let activeQueue: Queue;
    let executionCount = 0;
    let blockedCount = 0;
    
    beforeEach(async () => {
      activeQueue = new Queue('test-kills-switch');
      
      // Enqueue massive batch
      for (let i = 0; i < NUM_ORDERS; i++) {
        await activeQueue.add('dca-slot', createTestPayload(i));
      }
    });
    
    it('freezes entire queue within 100ms', async () => {
      const start = Date.now();
      const freezePromise = killSwitch.freezeAll();
      
      // Block all pending executions
      while ((await activeQueue.getActiveCount()) > 0) {
        await sleep(10);
      }
      
      const freezeTime = Date.now() - start;
      expect(freezeTime).toBeLessThan(100);
      
      // Verify no jobs processed after freeze
      expect(await activeQueue.getCompletedCount()).toBe(0);
    });
    
    it('unfreeze restores normal operation', async () => {
      await killSwitch.freezeAll();
      
      const unfreezeStart = Date.now();
      await killSwitch.unfreezeAll();
      const unfreezeTime = Date.now() - unfreezeStart;
      
      expect(unfreezeTime).toBeLessThan(50);
      
      // Verify jobs resume processing
      await sleep(TEST_DURATION_MS);
      const executed = await activeQueue.getProcessedCount();
      expect(executed).toBeGreaterThan(0);
    });
  });
  ```
  - Status: PENDING
  - Acceptance: Freeze completes in <100ms p95
  - Unfreeze response time <50ms
  - No data corruption during state transitions

- [ ] **4.3.3** Conduct Penetration Test Round
  ```typescript
  // tests/security/live-rehearsal-pentest.spec.ts
  describe('Live Rehearsal Security Audit', () => {
    describe('Bypass Attempt Vectors', () => {
      it('rejects direct database manipulation of order state', async () => {
        const maliciousUpdate = {
          id: generateOrderId(),
          status: 'EXECUTED', // Force execute without approval
        };
        
        await expect(apiRequest.patch(`/orders/${maliciousUpdate.id}`, {
          body: JSON.stringify(maliciousUpdate),
        })).rejects.toThrow(/permission denied/i);
      });
      
      it('blocks wallet enumeration attacks', async () => {
        // Try accessing wallets sequentially
        for (let i = 1; i <= 100; i++) {
          const response = await apiRequest.get(`/wallets/user_${i}/orders`);
          
          // All should return 404 or 403
          expect([404, 403]).toContain(response.status);
        }
      });
      
      it('prevents race condition exploit on concurrent orders', async () => {
        const concurrentPromises = Array(10).fill(0).map(async (_, i) => {
          return apiRequest.post('/orders/create', {
            body: JSON.stringify({
              type: 'DCA',
              amountUsd: 10,
              frequency: 'daily',
            }),
          });
        });
        
        const responses = await Promise.all(concurrentPromises);
        
        // All should succeed independently
        responses.forEach((res, idx) => {
          expect(res.status).toBe(201);
          expect(JSON.parse(res.body).orderId).toBeTruthy();
        });
      });
    });
  });
  ```
  - Status: PENDING
  - Acceptance: All security gates reject invalid operations
  - Coverage: 20+ distinct attack vectors tested
  - Reporting: Detailed vulnerability report generated

---

## Task 4.4: Real-Time Monitoring Dashboard

### Owner: @core-team (+ support from @auditor-qa)

#### Week 1 Tasks:

**Note:** Requires PM coordination for monitoring stack setup

#### Checklist:
- [ ] **4.4.1** Set Up Prometheus Metrics Collection
  ```yaml
  # docker-compose.monitoring.yml
  services:
    prometheus:
      image: prom/prometheus:latest
      ports:
        - "9090:9090"
      volumes:
        - ./prometheus.yml:/etc/prometheus/prometheus.yml
        - prometheus_data:/prometheus
      
    grafana:
      image: grafana/grafana:latest
      ports:
        - "3000:3000"
      environment:
        GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
        GF_USERS_ALLOW_SIGN_UP: "false"
      volumes:
        - grafana_data:/var/lib/grafana
  
  volumes:
    prometheus_data:
    grafana_data:
  ```
  - Status: PENDING
  - Acceptance: All components start successfully
  - Connectivity: Metrics endpoint accessible at localhost:9090
  - Dashboards: Pre-configured Grafana panels ready

- [ ] **4.4.2** Expose Application Metrics
  ```typescript
  // apps/api/src/metrics/metrics.service.ts
  import { Counter, Histogram, Gauge } from 'prom-client';
  
  export class MetricsService {
    private metrics: Map<string, any> = new Map();
    
    constructor() {
      this.init();
    }
    
    private init() {
      // Order execution latency histogram
      const executionLatency = new Histogram({
        name: 'kryptr_order_execution_latency_seconds',
        help: 'Order execution latency in seconds',
        labelNames: ['order_type', 'status'],
        buckets: [0.01, 0.05, 0.1, 0.5, 1.0, 2.0],
      });
      
      this.metrics.set('execution_latency', executionLatency);
      
      // Active orders counter
      const activeOrders = new Counter({
        name: 'kryptr_active_orders_total',
        help: 'Total active orders',
        labelNames: ['type'],
      });
      
      this.metrics.set('active_orders', activeOrders);
      
      // Kill-switch status gauge
      const isFrozen = new Gauge({
        name: 'kryptr_kill_switch_frozen',
        help: 'Kill-switch frozen status (1=frozen, 0=active)',
      });
      
      this.metrics.set('kill_switch', isFrozen);
    }
    
    recordOrderExecution(type: string, latencyMs: number, status: string) {
      this.metrics.get('execution_latency').observe(
        { order_type: type, status },
        latencyMs / 1000
      );
    }
    
    updateKillSwitchStatus(frozen: boolean) {
      this.metrics.get('kill_switch').set(frozen ? 1 : 0);
    }
  }
  ```
  - Status: PENDING
  - Acceptance: Metrics endpoint responds at `/metrics`
  - Format: Prometheus exposition format standard compliant
  - Integration: Dashboard pulls data automatically

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
- auditor-contracts: ✅ Environment prepared | 🚧 Factory deployment | ⚠️ Need gas estimation approval
- auditor-ui: 🚧 Building kill-switch UI | ⚠️ Waiting for contract addresses
- auditor-qa: ✅ Staging environment up | 🚧 Starting rehearse scripts | ⚠️ None
- core-team: ✅ Docker compose ready | 🚧 Setting up Prometheus | ⚠️ Need Grafana API key

---

## Completion Criteria

### Sprint 4 Entry Gate (ALL MUST PASS):
- [ ] Every checkbox marked [x] as completed
- [ ] All tests pass (unit + E2E + performance + pentest)
- [ ] CI pipeline green for each branch
- [ ] Monitoring dashboards operational
- [ ] Security scan shows zero critical vulnerabilities

### Sprint 4 Exit Gate:
- [ ] Feature branches merged to main
- [ ] Documentation updated (runbooks, escalation procedures)
- [ ] Release notes published with version tag
- [ ] Stakeholder sign-off for production readiness
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
Oct 19, 2026         ──→ Sprint 4 Start 🟠
Oct 26, 2026         ──→ Factory Deployed on Sepolia ✅
Nov 02, 2026         ──→ Kill-Switch UI Live 🟡
Nov 09, 2026         ──→ Full Rehearsal Complete 🟢
Nov 10, 2026         ──→ Phase 4 Readiness Decision 🔴
```

---

**Approved By:** Conductor Agent  
**Version:** 1.0  
**Last Updated:** 2026-09-XX  
**Next Review:** After Sprint 4 kickoff meeting  
