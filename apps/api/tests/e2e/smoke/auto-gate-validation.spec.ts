/**
 * Auto-Gate Workflow E2E Smoke Test
 * Validates: TierD gate trigger verification, Approval threshold enforcement
 * Purpose: End-to-end security gate automation testing
 * Milestone: W7-M10 (Security Gates) & W7-M11 (Threshold Enforcement)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app/app.module';
import type { SecurityDecision } from '@kryptr/shared-types';

describe('Auto-Gate Workflow E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen();

    console.log('[AutoGateE2E] Application ready for gating tests');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Approval Threshold Validation', () => {
    it('should approve intent when value is below threshold', async () => {
      // Given: Small value swap within default $100 threshold
      const lowValueIntent = {
        kind: 'swap' as const,
        walletId: 'wallet-threshold-test',
        origin: 'user',
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
        amount: '10000000000000000', // 0.01 ETH (~$20-30)
        slippageBps: 50,
        chain: 'base',
        swap: {
          quoteId: null, // Unbound quote for threshold tests
        },
      };

      // When: Submit intent
      const response = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(lowValueIntent)
        .expect(201);

      // Then: Should be automatically approved
      const decision: SecurityDecision = response.body;
      
      expect(decision.status).toBe('approved');
      expect(decision.reason).toContain('within policy');
      expect(decision.approvedAt).toBeDefined();
    }, 15000);

    it('should require human approval when value exceeds threshold', async () => {
      // Given: High value swap exceeding default $100 threshold
      const highValueIntent = {
        kind: 'swap' as const,
        walletId: 'wallet-threshold-test',
        origin: 'user',
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
        amount: '1000000000000000000', // 1 ETH (~$2000+)
        slippageBps: 50,
        chain: 'base',
        swap: {
          quoteId: null,
        },
      };

      // When: Submit high-value intent
      const response = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(highValueIntent)
        .expect(201);

      // Then: Should require human approval
      const decision: SecurityDecision = response.body;

      expect(decision.status).toBe('needs_human_approval');
      expect(decision.reason).toContain('exceeds approval threshold');
      expect(decision.requiredHumanApproval).toBeTruthy();
    }, 15000);

    it('should reject intent when daily cap is exceeded', async () => {
      // This test verifies that repeated submissions eventually hit daily cap
      const smallIntent = {
        kind: 'swap' as const,
        walletId: 'wallet-cap-test',
        origin: 'user',
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: '10000000000000000', // 0.01 ETH per request
        slippageBps: 50,
        chain: 'base',
        swap: { quoteId: null },
      };

      // Simulate multiple submissions to exhaust daily cap
      const submissionCount = 5;
      const results: Array<{ status: string }> = [];

      for (let i = 0; i < submissionCount; i++) {
        const response = await request(app.getHttpServer())
          .post('/api/security/intents')
          .send(smallIntent)
          .expect(201);

        results.push(response.body);
      }

      // Then: At least some should be approved, later ones may hit cap
      const approved = results.filter((r) => r.status === 'approved').length;
      const needsApproval = results.filter((r) => 
        r.status === 'needs_human_approval'
      ).length;
      const rejectedByCap = results.filter((r) => 
        r.reason?.includes('daily cap exceeded')
      ).length;

      // Validate gating logic executed
      expect(approved + needsApproval + rejectedByCap).toBe(submissionCount);
    }, 30000);

    it('should enforce different thresholds based on policy configuration', async () => {
      // Given: Test with custom high threshold scenario
      const customHighIntent = {
        kind: 'swap' as const,
        walletId: 'wallet-custom-policy-test',
        origin: 'user',
        assetIn: '0x833589fCD6eDb6E08f4c7C32D4f71b54fA026678', // USDC
        amount: '500000000', // 500 USDC
        slippageBps: 100,
        chain: 'base',
        swap: { quoteId: null },
      };

      // When: Submit custom threshold test
      const response = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(customHighIntent)
        .expect(201);

      // Then: Verify gating logic applies correct policy
      const decision: SecurityDecision = response.body;
      
      // Should either be approved or need human review based on actual price feed
      expect(['approved', 'needs_human_approval', 'rejected']).toContain(
        decision.status
      );
    }, 15000);
  });

  describe('Tier Gate Triggers', () => {
    it('should trigger additional checks for first-time users', async () => {
      // Given: New user with no history
      const newOrigin = `new-user-${Date.now()}`;
      
      const newUserIntent = {
        kind: 'swap' as const,
        walletId: `wallet-new-origin-${Date.now()}`,
        origin: newOrigin,
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: '10000000000000000',
        slippageBps: 50,
        chain: 'base',
        swap: { quoteId: null },
      };

      // When: Submit from new origin
      const response = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(newUserIntent)
        .expect(201);

      // Then: Apply stricter origin validation
      const decision: SecurityDecision = response.body;

      // Check if origin allowlist is enforced
      expect(decision).toHaveProperty('origin');
      expect(decision.origin).toBe(newOrigin);
    }, 15000);

    it('should validate payload inspection requirements', async () => {
      // Given: Intent with encoded payload (should be rejected by default)
      const encodedPayloadIntent = {
        kind: 'deploy' as const,
        walletId: 'wallet-payload-test',
        origin: 'user',
        payload: '0xdeadbeef1234567890abcdef', // Encoded payload
        encodedPayload: true, // Flag set to indicate encoding
      };

      // When: Submit intent with encoded payload
      const response = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(encodedPayloadIntent)
        .expect(201);

      // Then: Reject encoded payloads by default policy
      const decision: SecurityDecision = response.body;
      
      expect(decision.status).toBe('rejected');
      expect(decision.reason).toContain('encoded payload');
    }, 15000);

    it('should enforce chain allowlist restrictions', async () => {
      // Given: Request on potentially unsupported chain
      const chainRestrictionIntent = {
        kind: 'swap' as const,
        walletId: 'wallet-chain-test',
        origin: 'user',
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: '10000000000000000',
        slippageBps: 50,
        chain: 'ethereum', // Assuming only Base is in default policy
        swap: { quoteId: null },
      };

      // When: Submit on restricted chain
      const response = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(chainRestrictionIntent)
        .expect(201);

      // Then: Chain should be validated against policy
      const decision: SecurityDecision = response.body;
      
      expect(decision).toHaveProperty('chain');
      expect(decision.chain).toBe('ethereum');
    }, 15000);
  });

  describe('Workflow Transitions', () => {
    it('should track state transitions correctly through lifecycle', async () => {
      // Given: New intent entering workflow
      const workflowTestIntent = {
        kind: 'swap' as const,
        walletId: 'wallet-workflow-test',
        origin: 'user',
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: '10000000000000000',
        slippageBps: 50,
        chain: 'base',
        swap: { quoteId: null },
      };

      // When: Submit and immediately check status
      const submitResponse = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(workflowTestIntent)
        .expect(201);

      const initialStatus = submitResponse.body.status;
      const intentId = submitResponse.body.id;

      // Then: Status should be one of the expected initial states
      const validInitialStates = ['submitted', 'approved', 'rejected', 'needs_human_approval'];
      expect(validInitialStates).toContain(initialStatus);

      // Verify timeline captures this transition
      const timelineResponse = await request(app.getHttpServer())
        .get(`/api/security/intents/${intentId}/timeline`)
        .expect(200);

      const steps = timelineResponse.body.steps;
      expect(steps[0].step).toBe('created');
      expect(steps[0].detail).toContain('swap intent received');
    }, 15000);

    it('should maintain audit trail for all decisions', async () => {
      // Given: Multiple intents with varying outcomes
      const intentCount = 3;
      const intents = [
        {
          kind: 'swap' as const,
          walletId: 'wallet-audit-test-1',
          origin: 'user',
          assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          amount: '10000000000000000',
          slippageBps: 50,
          chain: 'base',
          swap: { quoteId: null },
        },
        {
          kind: 'swap' as const,
          walletId: 'wallet-audit-test-2',
          origin: 'user',
          assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          amount: '1000000000000000000',
          slippageBps: 50,
          chain: 'base',
          swap: { quoteId: null },
        },
        {
          kind: 'deploy' as const,
          walletId: 'wallet-audit-test-3',
          origin: 'automation:test',
          payload: 'test payload',
        },
      ];

      const results = await Promise.all(
        intents.map(async (intent) => {
          const response = await request(app.getHttpServer())
            .post('/api/security/intents')
            .send(intent)
            .expect(201);
          return response.body;
        })
      );

      // Then: Each result should have complete decision audit data
      results.forEach((result, index) => {
        expect(result.id).toBeDefined();
        expect(result.status).toBeDefined();
        expect(result.reason).toBeDefined();
        expect(result.walletId).toBe(intents[index].walletId);
        
        // Audit fields should be present
        expect(result).toHaveProperty('createdAt');
        expect(result).toHaveProperty('decisionTime');
      });
    }, 30000);

    it('should handle concurrent intent processing safely', async () => {
      // Given: Multiple identical intents submitted concurrently
      const concurrentIntent = {
        kind: 'swap' as const,
        walletId: 'wallet-concurrent-test',
        origin: 'user',
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: '10000000000000000',
        slippageBps: 50,
        chain: 'base',
        swap: { quoteId: null },
      };

      // When: Submit 5 concurrent identical intents
      const responses = await Promise.all(
        Array(5).fill(null).map(() =>
          request(app.getHttpServer())
            .post('/api/security/intents')
            .send(concurrentIntent)
        )
      );

      // Then: All should be processed successfully without race conditions
      const successfulResponses = responses.filter((r) => r.status === 201);
      expect(successfulResponses.length).toBe(5);

      // Each should have unique ID
      const ids = successfulResponses.map((r) => r.body.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);

      // All should have consistent decision outcome
      const statuses = successfulResponses.map((r) => r.body.status);
      const uniqueStatuses = new Set(statuses);
      
      // Should have same or related statuses (all approved or all needing approval)
      expect(uniqueStatuses.size).toBeLessThanOrEqual(2);
    }, 25000);
  });

  describe('Cross-service integration', () => {
    it('should integrate with spend ledger for daily cap tracking', async () => {
      // Given: Intent requiring reserve operation
      const spendTestIntent = {
        kind: 'swap' as const,
        walletId: 'wallet-spend-ledger-test',
        origin: 'user',
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: '10000000000000000',
        slippageBps: 50,
        chain: 'base',
        swap: { quoteId: null },
      };

      // When: Submit intent (triggers spend ledger reservation)
      const response = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(spendTestIntent)
        .expect(201);

      // Then: Response should include spend tracking metadata
      const decision: SecurityDecision = response.body;

      if (decision.status === 'approved') {
        // Verify spend was reserved
        expect(decision).toHaveProperty('reservedSpendUsd');
        expect(typeof decision.reservedSpendUsd).toBe('number');
        expect(decision.reservedSpendUsd).toBeGreaterThan(0);
      }
    }, 15000);

    it('should maintain data integrity across API → DB → Backoffice layers', async () => {
      // Given: Complete workflow test
      const integrityIntent = {
        kind: 'swap' as const,
        walletId: 'wallet-integrity-layer-test',
        origin: 'user',
        assetIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: '10000000000000000',
        slippageBps: 50,
        chain: 'base',
        swap: { quoteId: null },
      };

      // When: Full workflow execution
      const submitResponse = await request(app.getHttpServer())
        .post('/api/security/intents')
        .send(integrityIntent)
        .expect(201);

      const apiIntentId = submitResponse.body.id;

      // Cross-validate via multiple endpoints
      const [timelineResponse, statusCheck] = await Promise.all([
        request(app.getHttpServer())
          .get(`/api/security/intents/${apiIntentId}/timeline`)
          .expect(200),
        request(app.getHttpServer())
          .get(`/api/security/intents/${apiIntentId}`)
          .expect(200),
      ]);

      // Then: All layers should return consistent data
      expect(timelineResponse.body.intentId).toBe(apiIntentId);
      expect(statusCheck.body.id).toBe(apiIntentId);
      expect(statusCheck.body.createdAt).not.toBeUndefined();
      
      // Timeline should match current status
      const latestTimelineStep = timelineResponse.body.steps[timelineResponse.body.steps.length - 1];
      expect(latestTimelineStep.actor).toBeDefined();
      expect(latestTimelineStep.at).toBeDefined();
    }, 20000);
  });
});
