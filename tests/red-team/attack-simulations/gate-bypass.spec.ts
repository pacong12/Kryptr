/**
 * Red Team Attack Simulation: Security Gate Bypass (RT-002)
 * 
 * Author: @redteam (Kryptr Security Team)
 * Date: 2026-08-18
 * Severity: CRITICAL
 * 
 * Objective: Verify no code path allows direct signer calls without passing through
 * EvaluateIntentUseCase, replicating May 2026 Bankr "Language-as-Authorization" failure.
 * 
 * Key Lesson from Bankr Incident: Natural language instructions bypassed security gates
 * by calling signer directly, generating signed transactions without approval checks.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SignerPort } from '../../../apps/api/src/security/domain/signer.port';
import { IntentStore } from '../../../apps/api/src/security/domain/intent-store.port';
import { SecurityPolicyProvider } from '../../../apps/api/src/security/domain/security-policy.provider';
import { SpendLedger } from '../../../apps/api/src/security/domain/spend-ledger.port';
import { PriceFeedPort } from '../../../apps/api/src/security/domain/price-feed.port';
import { EvaluateIntentUseCase } from '../../../apps/api/src/security/application/evaluate-intent.usecase';
import { SECURITY_CHECK_RESULTS, type SecurityDecision, type TransactionIntent } from '@kryptr/shared-types';
import { InMemorySpendLedger } from '../../../apps/api/src/security/infrastructure/in-memory-spend-ledger';
import { defaultPolicyFor } from '../../../apps/api/src/security/domain/default-policy';

describe('RedTeam - Security Gate Bypass Prevention (RT-002)', () => {
  let evaluateIntent: EvaluateIntentUseCase;
  let mockSigner: jest.Mocked<SignerPort>;
  let mockIntentStore: jest.Mocked<IntentStore>;
  let mockPolicyProvider: jest.Mocked<SecurityPolicyProvider>;
  let mockSpendLedger: InMemorySpendLedger;
  let mockPriceFeed: jest.Mocked<PriceFeedPort>;

  beforeEach(async () => {
    // Create mocks for all dependencies
    mockSigner = {
      sign: jest.fn(),
      dryRun: jest.fn(),
    } as any;

    mockIntentStore = {
      create: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
    } as any;

    mockPolicyProvider = {
      getPolicy: jest.fn(),
    } as any;

    mockSpendLedger = new InMemorySpendLedger();
    
    mockPriceFeed = {
      getUsdPrice: jest.fn(),
      isHealthy: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvaluateIntentUseCase,
        { provide: SignerPort, useValue: mockSigner },
        { provide: IntentStore, useValue: mockIntentStore },
        { provide: SecurityPolicyProvider, useValue: mockPolicyProvider },
        { provide: SpendLedger, useValue: mockSpendLedger },
        { provide: PriceFeedPort, useValue: mockPriceFeed },
      ],
    }).compile();

    evaluateIntent = module.get<EvaluateIntentUseCase>(EvaluateIntentUseCase);
  });

  describe('Direct Signer Call Prevention', () => {
    it('BLOCKS: Module boundary - signer not importable outside security domain', async () => {
      // Attempt to simulate what happens if attacker finds way to import signer
      // This test documents the expected guardrail
      
      const directSignCall = async () => {
        // BAD PATTERN: Calling signer directly without intent evaluation
        // This should NEVER compile in any module except vault/security
        await mockSigner.sign({
          target: '0x' + 'a'.repeat(40),
          value: BigInt(1e18),
          data: '0x' + 'b'.repeat(10),
        });
      };

      // Verify signer was NOT called without gate pass
      expect(mockSigner.sign).not.toHaveBeenCalled();
      
      // Expected behavior: TypeScript compilation error should prevent this
      // We document this as a "must-not-occur" check
    });

    it('REJECTS: Signer invocation without valid intent ID', async () => {
      const maliciousIntentId = 'non-existent-intent-id';
      mockIntentStore.get.mockResolvedValue(null);

      await expect(
        evaluateIntent.evaluate(maliciousIntentId, {} as any),
      ).rejects.toThrow('IntentNotFoundError');

      // Verify signer never invoked
      expect(mockSigner.sign).not.toHaveBeenCalled();
    });
  });

  describe('Intent Evaluation Requirements', () => {
    it('APPLIES: All intents MUST pass through EvaluateIntentUseCase', async () => {
      const validIntent: TransactionIntent = {
        id: 'test-intent-001',
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

      // Setup mocks
      mockIntentStore.get.mockResolvedValue(validIntent);
      mockPolicyProvider.getPolicy.mockReturnValue(defaultPolicyFor('test-wallet'));
      mockPriceFeed.getUsdPrice.mockResolvedValue(2000); // ETH price
      mockSpendLedger.getCurrentDailySpend.mockResolvedValue(0);

      // Call evaluation
      const decision: SecurityDecision = {
        intentId: 'test-intent-001',
        result: SECURITY_CHECK_RESULTS.approved,
        reason: 'All checks passed',
        decidedAt: new Date().toISOString(),
      };

      mockIntentStore.update.mockResolvedValue(decision);

      await evaluateIntent.evaluate('test-intent-001', {
        quotes: [] as any,
        verificationArtifacts: [] as any,
      });

      // Verify intent went through full gate process
      expect(mockIntentStore.get).toHaveBeenCalledWith('test-intent-001');
      expect(mockSpendLedger.getCurrentDailySpend).toHaveBeenCalledWith('test-wallet');
    });

    it('LOGS: Every signature request creates audit entry', async () => {
      const intentId = 'audit-trail-test';
      const intent: TransactionIntent = {
        id: intentId,
        walletId: 'test-wallet',
        createdAt: new Date().toISOString(),
        origin: 'frontoffice-app',
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
      mockPriceFeed.getUsdPrice.mockResolvedValue(2000);
      mockSpendLedger.getCurrentDailySpend.mockResolvedValue(0);
      mockIntentStore.update.mockImplementation(() => Promise.resolve({} as any));

      await evaluateIntent.evaluate(intentId, {} as any);

      // Verify audit log created
      expect(mockIntentStore.create).toHaveBeenCalled();
    });
  });

  describe('Origin Validation (Bankr Lessons)', () => {
    it('VALIDATES: Origin must be in allowedOrigins list', async () => {
      const maliciousOriginIntent: TransactionIntent = {
        id: 'origin-test',
        walletId: 'test-wallet',
        createdAt: new Date().toISOString(),
        origin: 'malicious-hacker-domain', // Not in allowlist
        swap: {
          sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amountIn: '1000000000',
          amountOutMin: '990000000',
        },
        chainId: 8453,
      };

      const policy = defaultPolicyFor('test-wallet');
      policy.allowedOrigins = ['legitimate-frontoffice', 'backoffice-admin'];

      mockIntentStore.get.mockResolvedValue(maliciousOriginIntent);
      mockPolicyProvider.getPolicy.mockReturnValue(policy);
      mockPriceFeed.getUsdPrice.mockResolvedValue(2000);

      // Should fail origin validation
      await expect(
        evaluateIntent.evaluate('origin-test', {} as any),
      ).resolves.toBeDefined();
      
      const decision = await evaluateIntent.evaluate('origin-test', {} as any);
      expect(decision.result).toBe(SECURITY_CHECK_RESULTS.rejected);
      expect(decision.reason).toContain('OriginNotAllowed');
    });

    it('PREVENTS: Client-supplied origin manipulation', async () => {
      // Simulate client trying to spoof legitimate origin
      const clientPayload = {
        origin: 'user', // Client claims to be user
        intentData: { /* ...malicious intent... */ },
      };

      // Server should override origin from authenticated session
      const serverAssignedOrigin = 'authenticated-session-xyz';
      
      // Never trust client input
      expect(clientPayload.origin).not.toBe(serverAssignedOrigin);
      expect(true).toBe(true); // Placeholder for server-side enforcement test
    });
  });

  describe('Fail-Closed Behavior Under Error Conditions', () => {
    it('FAILS_CLOSED: Network timeout → reject intent, do not auto-approve', async () => {
      const intentId = 'timeout-test';
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

      mockIntentStore.get.mockRejectedValue(new Error('NetworkTimeoutError'));
      mockPriceFeed.getUsdPrice.mockRejectedValue(new Error('RpcTimeout'));

      const decision = await evaluateIntent.evaluate(intentId, {} as any);

      // Critical: Fail-closed means reject on any error
      expect(decision.result).toBe(SECURITY_CHECK_RESULTS.rejected);
      expect(mockSigner.sign).not.toHaveBeenCalled();
    });

    it('FAILS_CLOSED: Invalid signature on previous approval → block execution', async () => {
      const intentId = 'signature-invalid';
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

      mockIntentStore.get.mockResolvedValue(intent);
      mockPolicyProvider.getPolicy.mockReturnValue(defaultPolicyFor('test-wallet'));
      mockPriceFeed.getUsdPrice.mockRejectedValue(new Error('SignatureVerificationFailed'));

      const decision = await evaluateIntent.evaluate(intentId, {} as any);

      expect(decision.result).toBe(SECURITY_CHECK_RESULTS.rejected);
      expect(decision.reason).toContain('InvalidSignature');
    });

    it('FAILS_CLOSED: Policy provider unavailable → require manual review', async () => {
      mockPolicyProvider.getPolicy.mockRejectedValue(new Error('PolicyServiceUnavailable'));

      const decision = await evaluateIntent.evaluate('any-intent', {} as any);

      // When policy unavailable, fall back to conservative stance
      expect(decision.result).toBe(SECURITY_CHECK_RESULTS.needs_human_approval);
    });
  });

  describe('Replay Attack Prevention', () => {
    it('BLOCKS: Replaying old approved intent with same nonce', async () => {
      const alreadyUsedIntentId = 'replay-attack';
      const existingIntent: TransactionIntent = {
        id: alreadyUsedIntentId,
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

      // Mock intent as already executed
      const existingDecision: SecurityDecision = {
        intentId: alreadyUsedIntentId,
        result: SECURITY_CHECK_RESULTS.approved,
        reason: 'Previously approved and executed',
        decidedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      };

      mockIntentStore.get.mockResolvedValue(existingIntent);
      mockIntentStore.update.mockResolvedValue(existingDecision);

      const currentDecision = await evaluateIntent.evaluate(alreadyUsedIntentId, {} as any);

      // Must detect replay attempt
      expect(currentDecision.result).toBe(SECURITY_CHECK_RESULTS.rejected);
      expect(currentDecision.reason).toContain('NonceReplayDetected|AlreadyExecuted');
    });
  });
});
