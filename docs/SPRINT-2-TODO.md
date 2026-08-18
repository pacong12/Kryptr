# Sprint 2: Order Automation Infrastructure - Operational Checklist

**Created:** 2026-08-18  
**Sprint Duration:** 3 weeks (Aug 31 - Sep 21)  
**Reference:** Next Sprint Plan (docs/NEXT-SPRINT-PLAN.md)  
**Status:** 🟢 KICKOFF READY

---

## Sprint Goal

Deploy production-grade order automation infrastructure with BullMQ queue system, implement DCA/Limit order execution logic, and complete comprehensive testnet rehearsal before mainnet deployment.

---

## Team Assignments & Branches

| Agent | Branch | Focus Area | Priority Level | Story Points |
|-------|--------|------------|----------------|--------------|
| @auditor-core | `feat/core-sprint2-bullmq-runtime` | BullMQ Queue Runtime | 🔴 CRITICAL | 8 |
| @trading-team* | `feat/trading-sprint2-trigger-engine` | DCA/Limit Order Triggers | 🟠 HIGH | 5 |
| @auditor-qa | `feat/qa-sprint2-testnet-rehearsal` | Testnet Rehearsal Suite | 🟢 MEDIUM | 3 |
| @auditor-contracts | `feat/contracts-sprint2-mainnet-deploy` | Mainnet Contract Prep | 🟡 HIGH | 5 |

*Note: Trading team engagement requires PM coordination

---

## Task 2.1: BullMQ Queue Infrastructure Setup

### Owner: @auditor-core

#### Week 1 Tasks:

**Priority Blocker:** Must complete before any automation testing

#### Checklist:
- [ ] **2.1.1** Provision Redis cluster for production
  ```bash
  # Deploy via Terraform or AWS ElastiCache
  redis-cluster-prod {
    node_type = "cache.r6g.xlarge"
    num_cache_nodes = 3
    port = 6379
    engine_version = "7.0"
  }
  ```
  - Status: PENDING
  - Acceptance: Cluster accessible from all API nodes
  - Dependencies: DevOps approval + budget

- [ ] **2.1.2** Install BullMQ dependencies in order-worker module
  ```bash
  npm install bullmq ioredis
  npm install -D @types/bullmq @types/ioredis
  ```
  - Status: PENDING
  - Acceptance: Package.json updated with pinned versions
  - Files affected: `apps/api/package.json`

- [ ] **2.1.3** Create BullMQ queue configuration module
  ```typescript
  // apps/api/src/order-worker/queue.config.ts
  export const QUEUE_CONFIG = {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: {
        age: 86400, // 24 hours
        count: 1000,
      },
      removeOnFail: {
        age: 604800, // 7 days
      },
    },
  };
  ```
  - Status: PENDING
  - Acceptance: Configuration loads without errors
  - Files affected: `apps/api/src/order-worker/queue.config.ts`

- [ ] **2.1.4** Implement dead letter queue pattern
  ```typescript
  // apps/api/src/order-worker/dlq.manager.ts
  import { Queue, Worker } from 'bullmq';
  
  export class DLQManager {
    private dlq: Queue;
    
    constructor() {
      this.dlq = new Queue('order-workflows-dlq', QUEUE_CONFIG.connection);
    }
    
    async moveToDLQ(job: Job, error: Error): Promise<void> {
      await this.dlq.add('failed-job', {
        jobId: job.id,
        originalQueue: job.queueName,
        errorMessage: error.message,
        failedAt: new Date().toISOString(),
        data: job.data,
      });
    }
  }
  ```
  - Status: PENDING
  - Acceptance: Failed jobs captured in DLQ with metadata
  - Monitoring: Alert triggered when DLQ queue size > 10

- [ ] **2.1.5** Create order worker runtime skeleton
  ```typescript
  // apps/api/src/order-worker/order.worker.ts
  export class OrderWorker {
    private worker: Worker;
    
    constructor() {
      this.worker = new Worker(
        'order-workflows',
        async (job) => this.processOrder(job),
        QUEUE_CONFIG
      );
      
      this.worker.on('completed', (job) => {
        logger.info(`Order ${job.id} completed`);
      });
      
      this.worker.on('failed', (err, job) => {
        logger.error(`Order ${job?.id} failed: ${err.message}`);
      });
    }
    
    private async processOrder(job: Job) {
      // Implementation per task 2.1.6
    }
  }
  ```
  - Status: PENDING
  - Acceptance: Worker starts successfully, connects to Redis
  - Health check endpoint: `/api/health/order-worker`

---

## Task 2.1.6: DCA Slot Scheduler Implementation

### Owner: @auditor-core

#### Checklist:
- [ ] **2.1.6.1** Define DCA job types
  ```typescript
  // apps/api/src/order-worker/types/dca.types.ts
  export interface DCASlotData {
    orderId: string;
    walletId: string;
    amountUsd: number;
    intervalMinutes: number;
    scheduledSlot: number; // Unix timestamp
    idempotencyKey: string; // Prevent double-execution
  }
  ```
  - Status: PENDING
  - Acceptance: Type definitions compile correctly

- [ ] **2.1.6.2** Implement slot scheduler
  ```typescript
  // apps/api/src/order-worker/dca.scheduler.ts
  export class DCAScheduler {
    private queue: Queue;
    
    async scheduleExecution(data: DCASlotData): Promise<Job> {
      const delay = data.scheduledSlot - Date.now();
      
      return this.queue.add('dca-slot', data, {
        jobId: data.idempotencyKey,
        delay: Math.max(delay, 0),
        repeat: {
          every: data.intervalMinutes * 60 * 1000,
          key: data.orderId,
        },
      });
    }
    
    async pauseOrder(orderId: string): Promise<void> {
      await this.queue.pause();
      // Store pause state in database
    }
    
    async resumeOrder(orderId: string): Promise<void> {
      await this.queue.resume();
    }
  }
  ```
  - Status: PENDING
  - Acceptance: Jobs scheduled with correct intervals
  - Testing: Integration test with mock Redis

- [ ] **2.1.6.3** Add kill-switch integration
  ```typescript
  // apps/api/src/order-worker/kill-switch.checker.ts
  import { KillSwitchService } from '../infrastructure/postgres-kill-switch';
  
  export class ExecutionChecker {
    constructor(private killSwitch: KillSwitchService) {}
    
    async canExecute(walletId: string): Promise<boolean> {
      const isFrozen = await this.killSwitch.isWalletFrozen(walletId);
      const globalFrozen = await this.killSwitch.isGlobalFrozen();
      
      return !globalFrozen && !isFrozen;
    }
  }
  ```
  - Status: PENDING
  - Acceptance: Kill switch blocks execution instantly
  - Audit trail: Log all freeze checks to decision_audit table

---

## Task 2.2: Limit Order Trigger Engine

### Owner: @trading-team (+ support from @auditor-core)

#### Week 2 Tasks:

**Dependencies:** BullMQ runtime ready (Task 2.1 complete)

#### Checklist:
- [ ] **2.2.1** Integrate price feed source
  ```typescript
  // apps/api/src/order-worker/price-feed.adapter.ts
  import axios from 'axios';
  
  export interface PriceData {
    symbol: string;
    price: number;
    timestamp: number;
  }
  
  export class PriceFeedAdapter {
    private cache: Map<string, { price: number; timestamp: number }>;
    
    constructor() {
      this.cache = new Map();
    }
    
    async getPrice(symbol: string): Promise<number> {
      const cached = this.cache.get(symbol);
      if (cached && Date.now() - cached.timestamp < 30000) {
        return cached.price;
      }
      
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`
      );
      
      const price = response.data[symbol].usd;
      this.cache.set(symbol, { price, timestamp: Date.now() });
      
      return price;
    }
  }
  ```
  - Status: PENDING
  - Acceptance: Price data retrieved within 1 second
  - Fallback: Chainlink oracle integration if primary fails

- [ ] **2.2.2** Build trigger evaluation engine
  ```typescript
  // apps/api/src/order-worker/trigger.engine.ts
  export interface LimitOrderTrigger {
    orderId: string;
    walletId: string;
    targetPrice: number;
    side: 'buy' | 'sell';
    deadline: number; // Expiration timestamp
  }
  
  export class TriggerEngine {
    private activeTriggers: Map<string, LimitOrderTrigger> = new Map();
    
    async registerTrigger(trigger: LimitOrderTrigger): Promise<void> {
      this.activeTriggers.set(trigger.orderId, trigger);
    }
    
    async evaluate(): Promise<string[]> {
      const triggeredOrders: string[] = [];
      
      for (const [orderId, trigger] of this.activeTriggers.entries()) {
        const currentPrice = await this.priceFeed.getPrice(trigger.symbol);
        const expired = Date.now() > trigger.deadline;
        
        if (expired) {
          this.activeTriggers.delete(orderId);
          continue;
        }
        
        const shouldExecute = 
          trigger.side === 'buy' ? currentPrice <= trigger.targetPrice 
                                : currentPrice >= trigger.targetPrice;
        
        if (shouldExecute) {
          triggeredOrders.push(orderId);
          this.activeTriggers.delete(orderId);
          
          // Queue execution job
          await this.executionQueue.add('limit-order', {
            orderId,
            walletId: trigger.walletId,
            currentPrice,
          });
        }
      }
      
      return triggeredOrders;
    }
  }
  ```
  - Status: PENDING
  - Acceptance: Trigger evaluation runs every 10 seconds
  - Performance: p95 latency < 100ms for 1000 active triggers

- [ ] **2.2.3** Implement order lifecycle state machine
  ```typescript
  // apps/api/src/order-worker/state.machine.ts
  export enum OrderState {
    OPEN = 'open',
    TRIGGERED = 'triggered',
    EXECUTING = 'executing',
    COMPLETED = 'completed',
    FAILED = 'failed',
    EXPIRED = 'expired',
  }
  
  export class OrderStateMachine {
    private transitions: Record<OrderState, OrderState[]> = {
      [OrderState.OPEN]: [OrderState.TRIGGERED, OrderState.EXPIRED],
      [OrderState.TRIGGERED]: [OrderState.EXECUTING, OrderState.EXPIRED],
      [OrderState.EXECUTING]: [OrderState.COMPLETED, OrderState.FAILED],
    };
    
    validateTransition(from: OrderState, to: OrderState): boolean {
      const allowed = this.transitions[from];
      return allowed?.includes(to) ?? false;
    }
    
    async transition(orderId: string, from: OrderState, to: OrderState): Promise<void> {
      if (!this.validateTransition(from, to)) {
        throw new Error(`Invalid transition: ${from} → ${to}`);
      }
      
      await db.update('orders', { state: to }, { id: orderId });
      
      // Log transition
      await db.insert('decision_audit', {
        orderId,
        action: 'state_transition',
        from_state: from,
        to_state: to,
        timestamp: new Date(),
      });
    }
  }
  ```
  - Status: PENDING
  - Acceptance: Invalid transitions rejected with proper errors
  - Audit: All state changes logged to decision_audit table

---

## Task 2.3: Base Sepolia Testnet Environment

### Owner: @auditor-qa + @auditor-contracts

#### Week 3 Tasks:

**Dependencies:** BullMQ runtime tested locally

#### Checklist:
- [ ] **2.3.1** Set up Base Sepolia fork environment
  ```yaml
  # docker-compose.testnet.yml
  services:
    anvil-base-sepolia:
      image: ghcr.io/foundry-rs/foundry:latest
      command: anvil --fork-url https://base-sepolia.rpc.thirdweb.com/8e5b2a1c9b7d4e3f --chain-id 84532
      ports:
        - "8545:8545"
    
    redis-testnet:
      image: redis:7-alpine
      ports:
        - "6380:6379"
      command: redis-server --requirepass testpass
    
    postgres-testnet:
      image: postgres:15
      environment:
        POSTGRES_DB: kryptr_testnet
        POSTGRES_USER: testuser
        POSTGRES_PASSWORD: testpass
      ports:
        - "5433:5432"
  ```
  - Status: PENDING
  - Acceptance: All containers start successfully
  - Connectivity: Test RPC calls to fork endpoint

- [ ] **2.3.2** Deploy contract factory to testnet
  ```bash
  # scripts/deploy-testnet.sh
  forge script script/DeployLaunchpad.s.sol:DeployLaunchpad \
    --rpc-url https://sepolia.base.org \
    --private-key $TEST_PRIVATE_KEY \
    --verify \
    --verifier-url https://basescan.org/api \
    --slow \
    --broadcast
  ```
  - Status: PENDING
  - Acceptance: Contracts deployed and verified on Basescan
  - Addresses recorded: Save to `contracts/deployments/base-sepolia-testnet.json`

- [ ] **2.3.3** Pre-fund test wallets
  ```bash
  # scripts/fund-wallets.mjs
  import { createWalletClient, http } from 'viem';
  import { privateKeyToAccount } from 'viem/accounts';
  
  const accounts = [
    privateKeyToAccount('0x...test_key_1'),
    privateKeyToAccount('0x...test_key_2'),
  ];
  
  for (const account of accounts) {
    // Request faucet funds from Base Sepolia faucet
    await requestFaucet(account.address);
  }
  ```
  - Status: PENDING
  - Acceptance: 5 test wallets each with 1 ETH + 1000 USDC
  - Document: Link to faucet documentation

- [ ] **2.3.4** Execute full automation rehearsal
  ```typescript
  // tests/e2e/testnet-rehearsal.spec.ts
  describe('Testnet Automation Rehearsal', () => {
    let driver: PlaywrightTestContext;
    
    beforeEach(async () => {
      driver = await setupTestnetEnvironment();
    });
    
    it('executes 100 DCA orders over simulated time', async () => {
      const batchSize = 100;
      
      for (let i = 0; i < batchSize; i++) {
        const orderId = generateOrderId();
        await driver.queue.add('dca-slot', {
          orderId,
          walletId: TEST_WALLETS[i % TEST_WALLETS.length],
          amountUsd: 50,
          intervalMinutes: 5,
          scheduledSlot: Date.now(),
          idempotencyKey: `${orderId}-slot-0`,
        });
      }
      
      // Wait for simulated completion (compressed time)
      await waitForCompletion(batchSize);
      
      // Verify all executions logged correctly
      const executed = await db.count('decision_audit', {
        action: 'order_execution',
      });
      
      expect(executed).toBe(batchSize);
    });
  });
  ```
  - Status: PENDING
  - Acceptance: All 100 orders execute without failures
  - Performance metrics collected: Latency, gas costs

- [ ] **2.3.5** Stress test kill-switch activation
  ```typescript
  // tests/integration/kill-switch-stress.spec.ts
  describe('Kill Switch Stress Tests', () => {
    it('freezes 1000 pending jobs within 100ms', async () => {
      const pendingJobs = 1000;
      
      // Enqueue massive batch
      for (let i = 0; i < pendingJobs; i++) {
        await queue.add('dca-slot', createTestPayload());
      }
      
      const start = Date.now();
      await killSwitch.freezeAll();
      const freezeTime = Date.now() - start;
      
      expect(freezeTime).toBeLessThan(100);
      
      // Verify no jobs processed after freeze
      const processedAfter = await queue.getActiveCount();
      expect(processedAfter).toBe(0);
    });
  });
  ```
  - Status: PENDING
  - Acceptance: Global freeze completes in <100ms
  - Per-wallet freeze also tested separately

---

## Task 2.4: Documentation & Handoff

### Owner: @auditor-qa + Conductor role

#### Checklist:
- [ ] **2.4.1** Performance benchmark report
  - Queue processing latency (p50, p95, p99)
  - Kill-switch activation time
  - Gas cost estimates per order type
  
- [ ] **2.4.2** Bug report with reproduction steps
  - Document any issues found during rehearsal
  - Include stack traces and logs
  - Propose mitigation strategies
  
- [ ] **2.4.3** Recommendations for mainnet deployment
  - Security hardening checklist
  - Monitoring alert thresholds
  - Incident response procedures

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
- auditor-core: ✅ Completed BullMQ config | 🚧 Starting DCA scheduler | ⚠️ Need Redis cluster access
- trading-team: 🚧 Building trigger engine | ⚠️ Waiting for price feed API credentials
- auditor-qa: ✅ Set up Docker compose | 🚧 Running first rehearsal batch | ⚠️ Faucet rate limits

---

## Completion Criteria

### Sprint 2 Entry Gate (ALL MUST PASS):
- [ ] Every checkbox marked [x] as completed
- [ ] All tests pass (unit + E2E + stress tests)
- [ ] CI pipeline green for each branch
- [ ] Performance benchmarks meet targets
- [ ] Security scan shows zero critical vulnerabilities

### Sprint 2 Exit Gate:
- [ ] Feature branches merged to main
- [ ] Documentation updated (architecture diagrams, runbooks)
- [ ] Release notes published with version tag
- [ ] Stakeholder sign-off for Phase 3
- [ ] Go/No-Go decision documented

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

---

**Approved By:** @conductor  
**Version:** 1.0  
**Last Updated:** 2026-08-18  
**Next Review:** After Sprint 2 Week 1 deliverables  
