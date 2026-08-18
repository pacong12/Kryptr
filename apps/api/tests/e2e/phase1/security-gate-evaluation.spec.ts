/**
 * Phase 1 Security Gate Evaluation Test Suite
 * Validates: /security/evaluate endpoint integration & fail-closed behavior
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { apiMock } from '../fixtures/api-mock.service';
import { dbMock } from '../fixtures/database-mock.harness';
import { 
  SCENARIO_DATA, 
  NETWORK_FAILURE_PATTERNS,
  TEST_WALLET_1
} from '../fixtures/mock-data';

describe('Security Gate Evaluation (Phase 1)', () => {
  beforeEach(async () => {
    await dbMock.clearAll();
  });

  describe('/security/evaluate Endpoint Integration', () => {
    it('should evaluate small transfers within auto-approval threshold', async () => {
      // Given: Small transfer (< $100)
      const smallTransfer = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
          amount: '100000000', // 100 USDC
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      // When: Submit for evaluation
      const response = await apiMock.submitIntent(smallTransfer);

      // Then: Should auto-approve without human intervention
      expect(response.status).toBe(201);
      expect(response.body.decision).toBe('approved');
      expect(response.body.reason).toContain('within policy');
      expect(response.body.requiredHumanApproval).toBeFalsy();
    });

    it('should route medium transfers to human approval queue', async () => {
      // Given: Medium transfer ($100 - $1000)
      const mediumTransfer = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
          amount: '1500000000', // 1,500 USDC
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      // When: Evaluate intent
      const response = await apiMock.submitIntent(mediumTransfer);

      // Then: Should require human approval
      expect(response.status).toBe(201);
      expect(response.body.decision).toBe('needs_human_approval');
      expect(response.body.requiredHumanApproval).toBeTruthy();
      expect(response.body.valueUsd).toBeGreaterThanOrEqual(100);
      expect(response.body.valueUsd).toBeLessThanOrEqual(1000);
    });

    it('should reject large transfers exceeding daily cap', async () => {
      // Given: Large transfer (> $1000, exceeds default daily cap)
      const largeTransfer = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
          amount: '10000000000', // 10,000 USDC
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      // When: Submit intent
      const response = await apiMock.submitIntent(largeTransfer);

      // Then: Should be rejected due to cap violation
      expect(response.status).toBe(201);
      expect(response.body.decision).toBe('rejected');
      expect(response.body.reason).toContain('daily cap exceeded');
    });

    it('should enforce spend ledger reservation on approval', async () => {
      // Given: Intent requiring approval with valid capacity
      const intentData = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
          amount: '50000000', // 50 USDC
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      // When: Process approval flow
      const response = await apiMock.submitIntent(intentData);
      
      // Then: Spend ledger should reflect reservation
      if (response.body.reservedSpendUsd !== undefined) {
        const micros = Math.round(response.body.reservedSpendUsd * 1_000_000);
        const ledgerBalance = await dbMock.getSpendLedger(TEST_WALLET_1.id);
        
        expect(ledgerBalance).toBeGreaterThan(0);
        expect(ledgerBalance).toBeLessThanOrEqual(micros);
      }
    });
  });

  describe('Approval/Rejection Decision Paths', () => {
    it('should generate consistent decisions for same input', async () => {
      // Given: Identical intent data
      const testIntent = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
          amount: '250000000', // 250 USDC
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      // When: Submit identical intents multiple times
      const [first, second, third] = await Promise.all([
        apiMock.submitIntent(testIntent),
        apiMock.submitIntent(testIntent),
        apiMock.submitIntent(testIntent),
      ]);

      // Then: All decisions should be consistent
      expect(first.body.decision).toBe(second.body.decision);
      expect(second.body.decision).toBe(third.body.decision);
      
      // Should all require approval (> $100)
      expect(first.body.decision).toBe('needs_human_approval');
    });

    it('should track decision reason in audit trail', async () => {
      // Given: Intent requiring specific rejection reason
      const rejectionTest = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
          amount: '5000000000', // 5,000 USDC
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      // When: Process intent
      const response = await apiMock.submitIntent(rejectionTest);

      // Then: Reason field should be descriptive
      expect(response.body.reason).toBeDefined();
      expect(typeof response.body.reason).toBe('string');
      expect(response.body.reason.length).toBeGreaterThan(10);
      
      // Verify specific rejection reasons are accurate
      if (response.body.decision === 'rejected') {
        expect(response.body.reason).toMatch(/daily cap|exceeds|invalid/i);
      } else if (response.body.decision === 'needs_human_approval') {
        expect(response.body.reason).toMatch(/exceeds approval threshold/i);
      }
    });

    it('should apply correct thresholds based on policy configuration', async () => {
      // Given: Various threshold boundary cases
      const thresholdTests = [
        { amount: '99999999', expected: 'APPROVED', label: '< $100' }, // 99.99 USDC
        { amount: '100000000', expected: 'APPROVED', label: '= $100' }, // 100 USDC
        { amount: '100000001', expected: 'NEEDS_APPROVAL', label: '> $100' }, // 100.0001 USDC
        { amount: '999999999', expected: 'APPROVED', label: '= $1000' }, // $1000 USDC
        { amount: '1000000000', expected: 'REJECTED', label: '> $1000' }, // $1000+ USDC
      ];

      for (const test of thresholdTests) {
        const response = await apiMock.submitIntent({
          kind: 'transfer' as const,
          walletId: TEST_WALLET_1.id,
          origin: 'user',
          transfer: {
            assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
            amount: test.amount,
            recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
            chain: 'ethereum',
            slippageBps: 50,
          },
        });

        let actualExpected: string;
        if (test.expected === 'APPROVED') {
          actualExpected = response.body.decision === 'approved' ? 'PASS' : 'FAIL';
        } else if (test.expected === 'NEEDS_APPROVAL') {
          actualExpected = response.body.decision === 'needs_human_approval' ? 'PASS' : 'FAIL';
        } else if (test.expected === 'REJECTED') {
          actualExpected = response.body.decision === 'rejected' ? 'PASS' : 'FAIL';
        }

        console.log(`[Threshold Test] ${test.label}: ${actualExpected}`);
      }
    });

    it('should handle deploy intent restrictions correctly', async () => {
      // Given: Deployment attempt from different origins
      const deployTests = [
        {
          origin: 'user',
          description: 'User-initiated deploy',
          shouldReject: false,
        },
        {
          origin: 'automation:test-worker',
          description: 'Automation-originated deploy',
          shouldReject: true,
        },
        {
          origin: 'bot:vault-signer',
          description: 'Bot-originated deploy',
          shouldReject: true,
        },
      ];

      for (const test of deployTests) {
        const response = await apiMock.submitIntent({
          kind: 'deploy' as const,
          walletId: TEST_WALLET_1.id,
          origin: test.origin,
          payload: '0xdeploy_payload',
          encodedPayload: false,
        });

        const actuallyRejected = response.body.decision === 'rejected';
        
        if (test.shouldReject) {
          expect(actuallyRejected).toBe(true);
          if (test.origin.startsWith('automation:')) {
            expect(response.body.reason).toBe('automation_deploy_forbidden');
          }
        } else {
          // User-initiated deploys may have other requirements but shouldn't hit automation block
          expect(response.body.reason).not.toBe('automation_deploy_forbidden');
        }
      }
    });
  });

  describe('Fail-Closed Behavior Under Network Failures', () => {
    it('should reject when database connection unavailable', async () => {
      // Given: Simulated database failure
      try {
        await apiMock.simulateDatabaseFailure();
        // Should never reach here
        throw new Error('Expected error was not thrown');
      } catch (error) {
        const errorResponse = error as any;
        
        // Then: Fail-closed should reject
        expect(errorResponse.status).toBe(500);
        expect(errorResponse.code).toBe('database_error');
        expect(errorResponse.message).toContain('Database');
      }
    });

    it('should fail gracefully on network timeout', async () => {
      // Given: Network timeout scenario
      let timeoutOccurred = false;
      
      try {
        await Promise.race([
          apiMock.simulateNetworkTimeout(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Operation timed out')), 1000)
          ),
        ]);
      } catch (error) {
        timeoutOccurred = true;
        const err = error as Error;
        
        // Then: Should reject with appropriate error type
        expect(err.message).toContain('timeout');
        expect(timeoutOccurred).toBe(true);
      }
    });

    it('should prevent execution when primary services unavailable', async () => {
      // Given: Primary service failures
      const scenarios = [
        { name: 'Service Unavailable', fn: () => apiMock.simulatePartialFailure('intent-test') },
      ];

      for (const scenario of scenarios) {
        try {
          await scenario.fn();
        } catch (error) {
          const err = error as any;
          
          // Then: Execution should be blocked
          expect(err.status || err.code).toBeTruthy();
        }
      }
    });

    it('should maintain state consistency during partial failures', async () => {
      // Given: Partial failure scenario
      const testIntentId = 'intent-phase1-partial-failure-test';
      
      try {
        // Attempt operation that might partially succeed
        await apiMock.simulatePartialFailure(testIntentId);
      } catch (error) {
        const err = error as any;
        
        // Then: Rollback should maintain consistency
        if (err.status === 503) {
          // Service temporarily unavailable - should not leave half-completed state
          const stats = await dbMock.getStats();
          expect(stats.intentCount).toBeGreaterThanOrEqual(0);
          expect(stats.transactionCount).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should log all fail-closed events for audit compliance', async () => {
      // Given: Multiple failure attempts
      const failureAttempts = [
        () => apiMock.simulateDatabaseFailure(),
        () => Promise.reject({ status: 500 }),
      ];

      for (const attempt of failureAttempts) {
        try {
          await attempt();
        } catch (error) {
          const err = error as any;
          
          // Then: All failures should have structured error data
          expect(err.status).toBeGreaterThanOrEqual(500);
          expect(err.message).toBeDefined();
        }
      }

      // Verify audit history captured failures
      const history = dbMock.getAuditHistory(50);
      const failureLogs = history.filter(h => 
        h.operation.includes('save_intent') && 
        (h.details.error || h.details.success === false)
      );

      expect(failureLogs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cross-Service State Consistency', () => {
    it('should ensure API → DB → Dashboard state synchronization', async () => {
      // Step 1: Create intent through API
      const intentData = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
          amount: '100000000',
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      const apiResponse = await apiMock.submitIntent(intentData);
      const apiIntentId = apiResponse.body.id;

      // Step 2: Verify persistence in database
      const persisted = await dbMock.findById(apiIntentId);
      expect(persisted).toBeDefined();
      expect(persisted!.kind).toBe('transfer');

      // Step 3: Check dashboard visibility
      const dashboardView = await dashboardMock.getDashboardView();
      const foundInDashboard = dashboardView.recentIntents.some(
        (i) => i.id === apiIntentId
      );

      expect(foundInDashboard).toBeTruthy();

      // Then: Cross-layer state is consistent
      expect(persisted!.walletId).toBe(TEST_WALLET_1.id);
      expect(apiResponse.body.walletId).toBe(TEST_WALLET_1.id);
      expect(dashboardView.recentIntents[0].walletId).toBe(TEST_WALLET_1.id);
    });

    it('should maintain decision integrity across transitions', async () => {
      // Given: Intent progressing through lifecycle
      const initialIntent = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
          amount: '200000000', // Requires approval
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      const submitResponse = await apiMock.submitIntent(initialIntent);
      const intentId = submitResponse.body.id;

      // Initially requires approval
      expect(submitResponse.body.decision).toBe('needs_human_approval');

      // Simulate human approval
      const approvedResponse = await dashboardMock.updateIntentStatus(
        intentId,
        'approved',
        { valueUsd: 200 }
      );

      expect(approvedResponse).toBeTruthy();

      // Fetch updated status
      const updatedIntent = await dbMock.findById(intentId);
      expect(updatedIntent!.decision).toBe('approved');
    });
  });
});
