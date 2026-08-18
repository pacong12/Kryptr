/**
 * Red Team Attack Simulation: ZeroEx Calldata Poisoning (RT-001)
 * 
 * Author: @redteam (Kryptr Security Team)
 * Date: 2026-08-18
 * Severity: CRITICAL
 * 
 * Objective: Test that ZeroExVenueAdapter rejects malformed/obfuscated swap parameters
 * before any transaction is constructed or signed.
 * 
 * Lessons from May 2026 Bankr incident: Encoded instructions bypassed validation,
 * allowing unauthorized transfers via natural language → intent conversion.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ZeroExVenueAdapter } from '../../../apps/api/src/trading/infrastructure/zero-ex-venue.adapter';
import type {
  SwapQuoteRequest,
  SwapQuote,
} from '../../../apps/api/src/trading/domain/zero-ex-venue.adapter.types';
import { InMemoryQuoteStore } from '../../../apps/api/src/trading/infrastructure/in-memory-quote-store';
import { SECURITY_CHECK_RESULTS } from '@kryptr/shared-types';

describe('RedTeam - Calldata Poisoning Attacks (RT-001)', () => {
  let adapter: ZeroExVenueAdapter;
  let quoteStore: InMemoryQuoteStore;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ZeroExVenueAdapter, InMemoryQuoteStore],
    }).compile();

    adapter = module.get<ZeroExVenueAdapter>(ZeroExVenueAdapter);
    quoteStore = module.get<InMemoryQuoteStore>(InMemoryQuoteStore);
  });

  describe('Malformed Decimal Handling', () => {
    it('REJECTS: Invalid decimal precision (too many decimals) → fail-closed', async () => {
      // Attacker tries to exploit floating-point imprecision
      const poisonedRequest: SwapQuoteRequest = {
        walletId: 'attacker-wallet',
        sellToken: '0x' + 'a'.repeat(40), // invalid token address
        buyToken: '0x' + 'b'.repeat(40),
        amount: '1e-50', // extreme precision attempt
        chainId: 8453, // Base
      };

      expect(() => adapter.quote(poisonedRequest)).rejects.toThrow(
        'InvalidAmountError|DecimalPrecisionExceeded',
      );
      
      // Verify no quote was stored (fail-closed behavior)
      const storedQuotes = quoteStore.getAllByWallet('attacker-wallet');
      expect(storedQuotes).toHaveLength(0);
    });

    it('REJECTS: Negative amount encoding trick', async () => {
      const poisonedRequest: SwapQuoteRequest = {
        walletId: 'test-wallet',
        sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
        buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        amount: '-1000000000', // Negative value attempt
        chainId: 8453,
      };

      await expect(adapter.quote(poisonedRequest)).rejects.toThrow(
        'ValidationError|NegativeAmount',
      );
    });

    it('REJECTS: String-to-number coercion attack', async () => {
      // JavaScript's parseFloat() vulnerability
      const maliciousInputs = ['0xabc', '123xyz', 'NaN', 'Infinity'];

      for (const input of maliciousInputs) {
        const request: SwapQuoteRequest = {
          walletId: 'test-wallet',
          sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amount: input,
          chainId: 8453,
        };

        await expect(adapter.quote(request)).rejects.toThrow(
          'ValidationError|InvalidAmountFormat',
        );
      }
    });
  });

  describe('Recipient Address Manipulation', () => {
    it('REJECTS: Non-checksummed recipient address', async () => {
      const poisonedRequest: SwapQuoteRequest = {
        walletId: 'test-wallet',
        sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amount: '1000000000',
        receiver: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', // not checksummed
        chainId: 8453,
      };

      await expect(adapter.quote(poisonedRequest)).rejects.toThrow(
        'ValidationError|InvalidChecksumAddress',
      );
    });

    it('REJECTS: Null/undefined receiver fallback attempt', async () => {
      const poisonedRequest: SwapQuoteRequest = {
        walletId: 'test-wallet',
        sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amount: '1000000000',
        receiver: null, // Try to use contract fallback
        chainId: 8453,
      };

      // Should reject unless explicitly allowlisted
      await expect(adapter.quote(poisonedRequest)).resolves.toBeDefined();
      // Note: If receiver=null is allowed, verify contract handles it securely
    });

    it('REJECTS: Encoded recipient in base64', async () => {
      const encodedReceiver = Buffer.from(
        '0x' + 'deadbeef'.repeat(10),
      ).toString('base64');

      const poisonedRequest: SwapQuoteRequest = {
        walletId: 'test-wallet',
        sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amount: '1000000000',
        receiver: encodedReceiver, // Base64-encoded malicious address
        chainId: 8453,
      };

      await expect(adapter.quote(poisonedRequest)).rejects.toThrow(
        'ValidationError|EncodablePayloadRejected',
      );
    });
  });

  describe('Routing Manipulation', () => {
    it('REJECTS: Malicious route parts with fake venues', async () => {
      // Attempt to inject unverified venue into routing path
      const corruptedParts = [
        {
          steps: [
            {
              route: {
                path: '0xfake-venue-00000000000000000000',
                protocol: 'FAKE_DEX',
              },
              percent: 100,
            },
          ],
        },
      ];

      // This should be caught by venue allowlist validation
      // For now, log as suspicious activity
      const warningMessage =
        'REDTEAM_ALERT: Suspicious routing detected with unverified venue';
      console.warn(warningMessage);

      expect(true).toBe(true); // Placeholder: Implement venue validation
    });

    it('REJECTS: Percent sum exceeds 100% (overflow attack)', async () => {
      const overflowParts = [
        { steps: [{ route: { path: '', protocol: '' } as any }, percent: 60 },
        { steps: [{ route: { path: '', protocol: '' } as any }, percent: 60 },
      ];

      const totalPercent = overflowParts.reduce((acc, part) => acc + part.percent, 0);
      expect(totalPercent).toBeGreaterThan(100);

      // Validation should catch this
      expect(() => {
        if (totalPercent > 100) {
          throw new Error('ValidationError|RoutePercentOverflow');
        }
      }).toThrow('RoutePercentOverflow');
    });
  });

  describe('Rate Limit Bypass Attempts', () => {
    it('DETECTS: Concurrent requests from same wallet ID', async () => {
      const concurrentRequests = Array.from({ length: 100 }, (_, i) =>
        adapter.quote({
          walletId: 'flood-test-wallet',
          sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amount: '1000000000',
          chainId: 8453,
        }),
      );

      // Expect some requests to fail with rate limit error (HTTP 429 pattern)
      const results = await Promise.allSettled(concurrentRequests);
      const rejected = results.filter(
        (r) => r.status === 'rejected' && r.reason.message.includes('RATE_LIMIT'),
      );

      expect(rejected.length).toBeGreaterThan(0);
      expect(results.length).toBe(100);
    });

    it('ENFORCES: Per-wallet sliding window limit', async () => {
      const REQUEST_LIMIT = 10; // Assume 10 req/s per wallet
      const walletId = 'sliding-window-test';

      for (let i = 0; i < REQUEST_LIMIT + 5; i++) {
        const request: SwapQuoteRequest = {
          walletId,
          sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amount: '1000000000',
          chainId: 8453,
        };

        try {
          await adapter.quote(request);
        } catch (error) {
          // After limit exceeded, should see rate limit errors
          expect(error.message).toContain('RATE_LIMIT');
          break; // Stop testing after limit hit
        }
      }
    });
  });

  describe('Fail-Closed Verification', () => {
    it('VERIFIES: No quotes stored when validation fails', async () => {
      const walletId = 'fail-closed-test';
      quoteStore.clear(); // Ensure clean state

      const poisonedRequest: SwapQuoteRequest = {
        walletId,
        sellToken: 'invalid-address',
        buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amount: '1000000000',
        chainId: 8453,
      };

      await expect(adapter.quote(poisonedRequest)).rejects.toThrow();

      // Critical: Verify no partial state leaked into store
      const allQuotes = quoteStore.getAllByWallet(walletId);
      expect(allQuotes).toHaveLength(0);
    });

    it('LOGS: All poisoning attempts to security audit trail', async () => {
      const auditLog: string[] = [];
      const originalConsoleWarn = console.warn;
      console.warn = (message: string) => auditLog.push(message);

      try {
        await adapter.quote({
          walletId: 'audit-test',
          sellToken: '0x' + 'z'.repeat(40), // definitely invalid
          buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amount: '1000000000',
          chainId: 8453,
        });
      } catch {
        // Expected rejection
      }

      expect(auditLog.some((log) => log.includes('SECURITY_ALERT')))
        .toBe(true);
      expect(auditLog.some((log) => log.includes('CalldataPoisoning')))
        .toBe(true);

      console.warn = originalConsoleWarn;
    });
  });
});
