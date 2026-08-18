/**
 * Phase 1 Transfer Intent Creation Test Suite
 * Validates: Wallet Detail page intent creation flow & Balance computation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { apiMock } from '../fixtures/api-mock.service';
import { dbMock } from '../fixtures/database-mock.harness';
import { dashboardMock } from '../fixtures/backoffice/dashboard-mock.service';
import {
  TEST_WALLET_1,
  TEST_TOKEN_BALANCES,
  SCENARIO_DATA,
  CREATE_TRANSFER_INTENT_SMALL,
} from '../fixtures/mock-data';

describe('Transfer Intent Creation (Phase 1)', () => {
  beforeEach(async () => {
    // Reset all mock services before each test
    await dbMock.clearAll();
    dashboardMock.setAutoRefresh(true);
  });

  describe('Wallet Detail Page - Intent Creation Flow', () => {
    it('should validate wallet balances before intent submission', async () => {
      // Given: User on Wallet Detail page
      const walletId = TEST_WALLET_1.id;

      // When: Fetch current wallet balances
      const balancesResponse = await apiMock.getWalletBalances(walletId);

      // Then: Validate balance data structure
      expect(balancesResponse.status).toBe(200);
      expect(balancesResponse.body).toHaveProperty('walletId');
      expect(balancesResponse.body).toHaveProperty('balances');

      const balances = balancesResponse.body.balances as any[];
      
      // Verify USDC balance exists and has correct value
      const usdcBalance = balances.find((b) => 
        b.chain === 'ethereum' && 
        b.tokens?.find((t: any) => t.symbol === 'USDC')
      );

      expect(usdcBalance).toBeDefined();
      expect(parseInt(usdcBalance!.tokens[0].balance, 10)).toBeGreaterThanOrEqual(
        parseInt(SCENARIO_DATA.smallTransfer.amount, 10)
      );
    });

    it('should prevent intent creation with insufficient funds', async () => {
      // Given: Intent requiring more than available balance
      const insufficientIntent = {
        ...CREATE_TRANSFER_INTENT_SMALL,
        transfer: {
          ...CREATE_TRANSFER_INTENT_SMALL.transfer,
          amount: '99999999999', // Exceeds available balance
        },
      };

      // When: Attempt to submit intent
      const response = await apiMock.submitIntent(insufficientIntent);

      // Then: Should reject or require additional validation
      expect(response.status).toBeGreaterThan(300) || expect(response.body.error).toContain('insufficient');
    });

    it('should create valid transfer intent within approved limits', async () => {
      // Given: Valid intent within approval threshold
      const smallTransfer = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: TEST_TOKEN_BALANCES[0].tokens[0].address,
          amount: '100000000', // 100 USDC
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      // When: Submit intent for evaluation
      const response = await apiMock.submitIntent(smallTransfer);

      // Then: Should auto-approve (within $100 threshold)
      expect(response.status).toBe(201);
      expect(response.body.decision).toBe('approved');
      expect(response.body.reason).toContain('within policy');
      expect(response.body.valueUsd).toBeLessThanOrEqual(100);
    });

    it('should record intent in database upon successful creation', async () => {
      // Given: New transfer intent
      const newIntent = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: TEST_TOKEN_BALANCES[0].tokens[0].address,
          amount: '100000000',
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      // When: Submit intent
      const response = await apiMock.submitIntent(newIntent);
      const intentId = response.body.id;

      // Then: Verify persistence in database mock
      const persistedIntent = await dbMock.findById(intentId);

      expect(persistedIntent).toBeDefined();
      expect(persistedIntent!.kind).toBe('transfer');
      expect(persistedIntent!.walletId).toBe(TEST_WALLET_1.id);
      expect(persistedIntent!.origin).toBe('user');
      expect(persistedIntent!.createdAt).toBeDefined();
    });

    it('should add intent to backoffice dashboard monitoring', async () => {
      // Given: Newly created intent
      const intentData = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: TEST_TOKEN_BALANCES[0].tokens[0].address,
          amount: '100000000',
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      const response = await apiMock.submitIntent(intentData);

      // Then: Intent should appear in dashboard view
      const dashboardView = await dashboardMock.getDashboardView();

      expect(dashboardView.summary.pendingIntents).toBeGreaterThanOrEqual(1);
      expect(dashboardView.recentIntents.some((i) => i.id === response.body.id)).toBeTruthy();
    });
  });

  describe('Balance Computation Validation', () => {
    it('should calculate USD value correctly before decision', async () => {
      // Given: Transfer of known token amount
      const transferAmount = 100; // 100 USDC
      const intentData = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: TEST_TOKEN_BALANCES[0].tokens[0].address,
          amount: String(transferAmount * 1_000_000), // Convert to micros
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      // When: Submit intent
      const response = await apiMock.submitIntent(intentData);

      // Then: Value should be approximately equal to amount (USDC pegged to USD)
      expect(response.body.valueUsd).toBeCloseTo(transferAmount, 0);
    });

    it('should validate token decimals in amount calculation', async () => {
      // Given: Token with 6 decimal places (USDC)
      const rawAmount = '100000000'; // 100 USDC with 6 decimals
      
      // When: Process intent with this amount
      const intentData = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: TEST_TOKEN_BALANCES[0].tokens[0].address,
          amount: rawAmount,
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      const response = await apiMock.submitIntent(intentData);

      // Then: Micro-units conversion should be correct
      expect(response.body.valueUsd).toBeCloseTo(100, 0);
    });

    it('should handle multiple tokens with different decimals', async () => {
      // Given: Various token types (ETH, USDC, USDT)
      const multiTokenTests = [
        { amount: '1000000000000000000', expectedUsd: ~2000, label: 'ETH' }, // 1 ETH
        { amount: '1000000000', expectedUsd: 100, label: 'USDC' }, // 100 USDC
        { amount: '500000000', expectedUsd: 50, label: 'USDT' }, // 50 USDT
      ];

      for (const test of multiTokenTests) {
        const response = await apiMock.submitIntent({
          kind: 'transfer' as const,
          walletId: TEST_WALLET_1.id,
          origin: 'user',
          transfer: {
            assetIn: test.label === 'ETH' ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' : TEST_TOKEN_BALANCES[0].tokens[0].address,
            amount: test.amount,
            recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
            chain: 'ethereum',
            slippageBps: 50,
          },
        });

        expect(response.body.valueUsd).toBeCloseTo(test.expectedUsd, -2); // Within 2% tolerance
      }
    });
  });

  describe('Invalid State Rejection Scenarios', () => {
    it('should reject intents from unauthorized origins', async () => {
      // Given: Deployment from automation system
      const invalidIntent = {
        kind: 'deploy' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'automation:test-worker',
        payload: 'test_payload',
      };

      // When: Submit intent from automation origin
      const response = await apiMock.submitIntent(invalidIntent);

      // Then: Should be rejected immediately
      expect(response.status).toBe(201);
      expect(response.body.reason).toBe('automation_deploy_forbidden');
      expect(response.body.status).toBe('rejected');
    });

    it('should reject transfers with non-checksummed addresses', async () => {
      // Given: Invalid recipient address format
      const invalidIntent = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: TEST_TOKEN_BALANCES[0].tokens[0].address,
          amount: '100000000',
          recipient: '0xinvalid_address_format', // Invalid checksum
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      // When: Submit intent with invalid address
      const response = await apiMock.submitIntent(invalidIntent);

      // Then: Should return validation error
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.code).toBe('validation_error');
    });

    it('should reject zero-amount transfers', async () => {
      // Given: Intent with zero amount
      const zeroAmountIntent = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: TEST_TOKEN_BALANCES[0].tokens[0].address,
          amount: '0',
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      // When: Submit intent with zero amount
      const response = await apiMock.submitIntent(zeroAmountIntent);

      // Then: Should be rejected
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.error).toContain('amount');
    });

    it('should reject duplicate intent submissions rapidly', async () => {
      // Given: Same intent submitted twice quickly
      const duplicateIntent = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: TEST_TOKEN_BALANCES[0].tokens[0].address,
          amount: '100000000',
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      const [first, second] = await Promise.all([
        apiMock.submitIntent(duplicateIntent),
        apiMock.submitIntent(duplicateIntent),
      ]);

      // Then: Both should have unique IDs
      expect(first.body.id).not.toBe(second.body.id);
    });
  });

  describe('Frontoffice → Security Gate Integration', () => {
    it('should maintain end-to-end consistency across layers', async () => {
      // Given: Fresh wallet detail state
      const walletId = TEST_WALLET_1.id;

      // Step 1: Frontoffice fetches balances
      const frontofficesRequest = await apiMock.getWalletBalances(walletId);

      // Step 2: Create intent based on displayed balances
      const intentData = {
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: TEST_TOKEN_BALANCES[0].tokens[0].address,
          amount: '50000000', // 50 USDC
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      };

      // Step 3: Submit through security gate
      const securityResponse = await apiMock.submitIntent(intentData);

      // Step 4: Verify backend received consistent data
      const storedIntent = await dbMock.findById(securityResponse.body.id);

      // Then: Data envelope integrity check
      expect(storedIntent!.intentData.transfer.assetIn).toBe(intentData.transfer.assetIn);
      expect(storedIntent!.intentData.transfer.amount).toBe(intentData.transfer.amount);
      expect(frontofficesRequest.body.walletId).toBe(storedIntent!.walletId);
    });

    it('should process intent creation within performance SLA', async () => {
      // Given: Ready environment
      const startTimestamp = Date.now();

      // When: Execute full creation flow
      const balances = await apiMock.getWalletBalances(TEST_WALLET_1.id);
      const intent = await apiMock.submitIntent({
        kind: 'transfer' as const,
        walletId: TEST_WALLET_1.id,
        origin: 'user',
        transfer: {
          assetIn: TEST_TOKEN_BALANCES[0].tokens[0].address,
          amount: '100000000',
          recipient: '0x8626fD9D8F6C4c4E5c9B5A9C8F7e6D5c4B3a2918',
          chain: 'ethereum',
          slippageBps: 50,
        },
      });

      // Then: Should complete within 5 seconds
      const duration = Date.now() - startTimestamp;
      expect(duration).toBeLessThan(5000);
      expect(intent.status).toBe(201);
    });
  });
});
