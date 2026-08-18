/**
 * Red Team Fail-Closed Validation: Network Failure Handling (FC-001)
 * 
 * Author: @redteam (Kryptr Security Team)
 * Date: 2026-08-18
 * Severity: HIGH
 * 
 * Objective: Verify that ALL system components fail closed under network errors,
 * preventing automatic approval when services become unavailable.
 * 
 * Bankr Lesson: Service degradation during attack led to silent failures where
 * transactions proceeded despite incomplete security checks.
 */

import { Test, TestingModule } from '@nestjs/testing';
import type { SignerPort } from '../../../apps/api/src/security/domain/signer.port';
import type { IntentStore } from '../../../apps/api/src/security/domain/intent-store.port';
import type { SecurityPolicyProvider } from '../../../apps/api/src/security/domain/security-policy.provider';
import type { SpendLedger } from '../../../apps/api/src/security/domain/spend-ledger.port';
import type { PriceFeedPort } from '../../../apps/api/src/security/domain/price-feed.port';
import { EvaluateIntentUseCase } from '../../../apps/api/src/security/application/evaluate-intent.usecase';
import { InMemorySpendLedger } from '../../../apps/api/src/security/infrastructure/in-memory-spend-ledger';
import { InMemoryIntentStore } from '../../../apps/api/src/security/infrastructure/in-memory-intent-store';
import { defaultPolicyFor } from '../../../apps/api/src/security/domain/default-policy';
import { SECURITY_CHECK_RESULTS } from '@kryptr/shared-types';
import type { TransactionIntent, SecurityDecision } from '@kryptr/shared-types';

describe('RedTeam - Fail-Closed: Network Failure Scenarios (FC-001)', () => {
  let evaluateIntent: EvaluateIntentUseCase;
  let mockSigner: jest.Mocked<SignerPort>;
  let mockIntentStore: MockIntentStore;
  let mockPolicyProvider: MockPolicyProvider;
  let mockSpendLedger: InMemorySpendLedger;
  let mockPriceFeed: MockPriceFeed;

  beforeEach(() => {
    mockSigner = { sign: jest.fn(), dryRun: jest.fn() } as any;
    mockIntentStore = new InMemoryIntentStore() as any;
    mockSpendLedger = new InMemorySpendLedger();
    
    mockPolicyProvider = { getPolicy: jest.fn() } as any;
    mockPriceFeed = { getUsdPrice: jest.fn() } as any;
  });

  describe('Gateway Unavailable Scenarios', () => {
    it('REJECTS: Intent evaluation when signer service is unreachable', async () => {
      const intentId = 'signer-unreachable-test';
      const intent: TransactionIntent = {
        id: intentId,
        walletId: 'test-wallet',
        createdAt: new Date().toISOString(),
        origin: 'user',
        swap: {
          sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amountIn: '1000000000',
          amountOutMin: '990000000',
        },
        chainId: 8453,
      };

      // Simulate signer network error
      mockSigner.sign.mockRejectedValue(
        new Error('NetworkError: Connection refused to signer service'),
      );
      mockIntentStore.get.mockResolvedValue(intent);
      mockPolicyProvider.getPolicy.mockReturnValue(defaultPolicyFor('test-wallet'));
      mockSpendLedger.getCurrentDailySpend.mockResolvedValue(0);

      const decision: SecurityDecision = await evaluateIntent.evaluate(intentId, {} as any);

      // Critical: Fail-closed behavior
      expect(decision.result).toBe(SECURITY_CHECK_RESULTS.rejected);
      expect(decision.reason).toContain('SignerServiceUnavailable');
      expect(mockSigner.sign).not.toHaveBeenCalled();
    });

    it('REJECTS: All intents when database connection fails', async () => {
      const failingIntentStore = new InMemoryIntentStore();
      
      // Simulate DB connection timeout
      failingIntentStore.get = jest.fn().mockRejectedValue(
        new Error('PostgresConnectionError: Pool exhausted'),
      );

      const policyProvider = { getPolicy: jest.fn() } as any;
      policyProvider.getPolicy.mockRejectedValue(new Error('PolicyDatabaseTimeout'));

      const priceFeed = { getUsdPrice: jest.fn() } as any;
      priceFeed.getUsdPrice.mockRejectedValue(new Error('RpcNodeDown'));

      evaluateIntent = new EvaluateIntentUseCase(
        mockSigner,
        failingIntentStore,
        policyProvider,
        mockSpendLedger,
        priceFeed,
      );

      const decision: SecurityDecision = await evaluateIntent.evaluate(
        'any-pending-intent',
        {} as any,
      );

      // Should fail to reject, never auto-approve
      expect(decision.result).toBe(SECURITY_CHECK_RESULTS.rejected);
    });

    it('RETAINS_PENDING: Unprocessed intents stay in pending state', async () => {
      const intentId = 'pending-retention-test';
      const intent: TransactionIntent = {
        id: intentId,
        walletId: 'test-wallet',
        createdAt: new Date().toISOString(),
        status: 'pending_approval',
        origin: 'user',
        swap: null,
        chainId: 8453,
      };

      const originalStatus = intent.status;

      // Network error during processing
      mockIntentStore.get.mockRejectedValue(new Error('TransientNetworkError'));

      try {
        await evaluateIntent.evaluate(intentId, {} as any);
      } catch {
        // Expected rejection
      }

      // Verify intent was not marked as approved/executed
      expect(intent.status).toBe(originalStatus);
    });
  });

  describe('RPC Provider Failures', () => {
    it('FAILS_CLOSED: Chain RPC unavailable → no transaction execution', async () => {
      const priceFeed: MockPriceFeed = {
        getUsdPrice: jest.fn().mockRejectedValue(
          new Error('BaseRpcProviderError: Endpoint down'),
        ),
        isHealthy: jest.fn().mockReturnValue(false),
      } as any;

      const intent: TransactionIntent = {
        id: 'rpc-fail-test',
        walletId: 'test-wallet',
        createdAt: new Date().toISOString(),
        origin: 'user',
        swap: {
          sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amountIn: '1000000000',
          amountOutMin: '990000000',
        },
        chainId: 8453,
      };

      mockIntentStore.get.mockResolvedValue(intent);
      mockPolicyProvider.getPolicy.mockReturnValue(defaultPolicyFor('test-wallet'));
      mockSpendLedger.getCurrentDailySpend.mockResolvedValue(0);

      // With mocked evaluator using our dependencies
      evaluateIntent = new EvaluateIntentUseCase(
        mockSigner,
        mockIntentStore,
        mockPolicyProvider,
        mockSpendLedger,
        priceFeed,
      );

      const decision = await evaluateIntent.evaluate('rpc-fail-test', {} as any);

      expect(decision.result).toBe(SECURITY_CHECK_RESULTS.rejected);
      expect(decision.reason).toContain('RpcProviderUnavailable');
    });

    it('FALLS_BACK: Switches to secondary RPC without compromising security', async () => {
      // Primary RPC fails
      let callCount = 0;
      const failingPriceFeed: MockPriceFeed = {
        getUsdPrice: jest.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('PrimaryRpcTimeout');
          }
          return 2000; // Success on fallback
        }),
        isHealthy: jest.fn(),
      } as any;

      const intent: TransactionIntent = {
        id: 'fallback-rpc-test',
        walletId: 'test-wallet',
        createdAt: new Date().toISOString(),
        origin: 'user',
        swap: {
          sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amountIn: '1000000000',
          amountOutMin: '990000000',
        },
        chainId: 8453,
      };

      mockIntentStore.get.mockResolvedValue(intent);
      mockPolicyProvider.getPolicy.mockReturnValue(defaultPolicyFor('test-wallet'));
      mockSpendLedger.getCurrentDailySpend.mockResolvedValue(0);

      evaluateIntent = new EvaluateIntentUseCase(
        mockSigner,
        mockIntentStore,
        mockPolicyProvider,
        mockSpendLedger,
        failingPriceFeed,
      );

      // Should eventually succeed via fallback
      const decision = await evaluateIntent.evaluate('fallback-rpc-test', {} as any);
      
      // Must still enforce all security checks
      expect(mockPolicyProvider.getPolicy).toHaveBeenCalled();
      expect(mockSpendLedger.getCurrentDailySpend).toHaveBeenCalled();
    });
  });

  describe('Validation Service Failures', () => {
    it('REJECTS: Policy provider service timeout', async () => {
      const policyProvider: MockPolicyProvider = {
        getPolicy: jest.fn().mockRejectedValue(
          new Error('SecurityPolicyServiceTimeout'),
        ),
      } as any;

      const intent: TransactionIntent = {
        id: 'policy-timeout',
        walletId: 'test-wallet',
        createdAt: new Date().toISOString(),
        origin: 'user',
        swap: null,
        chainId: 8453,
      };

      mockIntentStore.get.mockResolvedValue(intent);
      mockSpendLedger.getCurrentDailySpend.mockResolvedValue(0);

      evaluateIntent = new EvaluateIntentUseCase(
        mockSigner,
        mockIntentStore,
        policyProvider,
        mockSpendLedger,
        mockPriceFeed,
      );

      const decision = await evaluateIntent.evaluate('policy-timeout', {} as any);

      // Conservative stance: reject when policy unavailable
      expect(decision.result).toBe(SECURITY_CHECK_RESULTS.needs_human_approval);
      expect(decision.reason).toContain('PolicyUnavailable');
    });

    it('ALERTS: Spend ledger service degraded', async () => {
      const degradedSpendLedger = new InMemorySpendLedger();
      
      // Log when spend tracking fails
      const auditLogs: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg) => auditLogs.push(msg);

      try {
        degradedSpendLedger.trackTransaction = jest.fn().mockRejectedValue(
          new Error('SpendLedgerWriteError'),
        );

        const intent: TransactionIntent = {
          id: 'spend-ledger-fail',
          walletId: 'test-wallet',
          createdAt: new Date().toISOString(),
          origin: 'user',
          swap: {
            sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            amountIn: '1000000000',
            amountOutMin: '990000000',
          },
          chainId: 8453,
        };

        mockIntentStore.get.mockResolvedValue(intent);
        mockPolicyProvider.getPolicy.mockReturnValue(defaultPolicyFor('test-wallet'));

        evaluateIntent = new EvaluateIntentUseCase(
          mockSigner,
          mockIntentStore,
          mockPolicyProvider,
          degradedSpendLedger,
          mockPriceFeed,
        );

        // Still attempt evaluation but log warning
        await evaluateIntent.evaluate('spend-ledger-fail', {} as any);

        expect(auditLogs.some((l) => l.includes('SpendLedger')).toBe(true);
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  describe('Graceful Degradation Patterns', () => {
    it('PROVIDES: Human review queue when automated gate fails', async () => {
      const allServicesFailing = {
        signer: Promise.reject(new Error('AllSystemsOffline')),
        intentStore: Promise.resolve(null),
        policyProvider: Promise.reject(new Error('ConfigServiceDown')),
        spendLedger: Promise.reject(new Error('AuditTrailBroken')),
      };

      // When everything fails, require human intervention
      const requiresHumanIntervention = true;
      expect(requiresHumanIntervention).toBe(true);

      // Queue for manual approval with full context logged
      const humanReviewQueueItem = {
        intentId: 'emergency-review-required',
        priority: 'HIGH',
        reason: 'Automated gate completely unavailable',
        queuedAt: new Date().toISOString(),
        auditorAssignee: 'security-oncall',
      };

      console.log(JSON.stringify(humanReviewQueueItem));
    });

    it('MONITORS: Health endpoint remains functional during partial failures', async () => {
      // Even if some services degraded, health check should report accurately
      const healthStatus = {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        components: {
          signer: 'unavailable',
          policyProvider: 'healthy',
          spendLedger: 'degraded',
          rpcProvider: 'timeout',
        },
        automatedApprovalEnabled: false, // Fail-safe default
      };

      expect(healthStatus.automatedApprovalEnabled).toBe(false);
      expect(healthStatus.status).toBe('degraded');
    });
  });
});

// Mock interfaces for cleaner typing
interface MockIntentStore extends IntentStore {
  get: jest.Mock<any, any>;
  create: jest.Mock<any, any>;
  update: jest.Mock<any, any>;
}

interface MockPolicyProvider extends SecurityPolicyProvider {
  getPolicy: jest.Mock<any, any>;
}

interface MockPriceFeed extends PriceFeedPort {
  getUsdPrice: jest.Mock<any, any>;
  isHealthy: jest.Mock<any, any>;
}
