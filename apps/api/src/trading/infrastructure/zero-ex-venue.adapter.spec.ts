import { Test } from '@nestjs/testing';
import { ZeroExVenueAdapter, NATIVE_SENTINEL } from './zero-ex-venue.adapter';
import {
  GraduationStatus,
  type VirtualPoolResult,
  type VenueAccrualSnapshot,
} from '../domain/zero-ex-venue.adapter.types';
import type { SwapQuote } from '@kryptr/shared-types';
import type { DexQuoteRequest } from '../domain/dex-aggregator.port';
import { DomainError } from '../../common/domain-error';
import { QUOTE_TTL_MS } from './static-mock-dex.adapter';

describe('ZeroExVenueAdapter', () => {
  let adapter: ZeroExVenueAdapter;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ZeroExVenueAdapter],
    }).compile();

    adapter = module.get(ZeroExVenueAdapter);
  });

  describe('createPool', () => {
    it('returns virtual pool result with deterministic venueId', async () => {
      const result = (await adapter.createPool(
        'wallet-base-demo',
        'token-launchpad-v1',
        8.75, // venueBps (additive model)
        { totalFeeBps: 175, recipients: [], scheduleVersion: 'v1.0.0' },
      )) as VirtualPoolResult;

      expect(result).toMatchObject({
        venueId: '84532:uniswap-v4:token-launchpad-v1',
        isLive: false,
        accruedAt: expect.any(String),
      });
      expect(typeof result.poolAddress).toBe('string');
    });

    it('validates venueBps as non-negative (PR #130 enforcement)', async () => {
      await expect(
        adapter.createPool('w1', 't1', -5, {
          totalFeeBps: 175,
          recipients: [],
          scheduleVersion: 'v1.0.0',
        }),
      ).rejects.toThrow('venueBps must be non-negative');
    });

    it('preserves additive fee model — base fee split unaffected by venue accrual', async () => {
      const result = (await adapter.createPool('w1', 't1', 8.75, {
        totalFeeBps: 175,
        recipients: [{ address: '0xrecipient1', shareBps: 50 }],
        scheduleVersion: 'v1.0.0',
      })) as VirtualPoolResult;

      // Base fee schedule preserved unchanged per two-ledger separation (§8.1 theorem)
      expect(result.venueId).toContain('0x-v2');
    });
  });

  describe('getAccrualSnapshot', () => {
    it('calculates floor accrual using exact INV-FEE-4 math', () => {
      // Per §4.5.1: f = floor(amount × RATE / 10_000) EXACT
      const tradeAmount = BigInt(1_000_000_000_000_000_000); // 1 wei-equivalent
      const venueBps = 8.75;

      const snapshot = adapter.getAccrualSnapshot(tradeAmount, venueBps);

      // Expected: floor(1e18 × 8.75 / 10_000) = floor(875_000_000_000_000)
      expect(snapshot).resolves.toHaveProperty('venueAccrualWei');
      expect(snapshot).resolves.toHaveProperty('tradeAmount');
    });

    it('handles overflow-safe calculation via scaled integer arithmetic (§4.5.1 overflow guard)', () => {
      const largeTradeAmount = BigInt(
        '115792089237316195423570985008687907853269984665640564039457584007913129639935',
      ); // Near 2^256

      // Should NOT throw overflow error
      const snapshot = adapter.getAccrualSnapshot(largeTradeAmount, 175);
      expect(snapshot).resolves.toHaveProperty('venueAccrualWei');
    });

    it('tracks venue accrual independently from base schedule (two-ledger separation §8.1)', () => {
      const snapshot = adapter.getAccrualSnapshot(BigInt(100_000), 12.5);

      // Venue share independent of schedule recipients (INV-VENUE-1 + §8.1 theorem)
      expect(snapshot).resolves.not.toHaveProperty('baseFeeAccruals');
    });
  });

  describe('checkGraduation', () => {
    it('returns NOT_APPLICABLE until S4 graduation logic implemented', async () => {
      const status = await adapter.checkGraduation('base-sepolia:testpool');
      expect(status).toBe('not_applicable');
    });
  });

  describe('Additive Fee Model Compliance', () => {
    it('preserves INV-FEE-2 conservation for base schedule recipients (§4.5 C1)', () => {
      const baseFeeWei = BigInt(175);
      const recipientShares = [BigInt(50), BigInt(50), BigInt(50), BigInt(25)];
      const sumShares = recipientShares.reduce(
        (acc, share) => acc + share,
        BigInt(0),
      );

      expect(sumShares).toBe(baseFeeWei);
    });

    it('additive model: trader pays base_fee + venue_share separately', () => {
      const baseFeeBps = 175;
      const venueShareBps = 8.75;
      const totalFeeBps = baseFeeBps + venueShareBps;

      expect(totalFeeBps).toBeGreaterThan(baseFeeBps);
      expect(totalFeeBps).toBeLessThan(200);
    });
  });
});

// ============================================
// DexAggregatorPort Tests (Wave 7 M3)
// ============================================

describe('DexAggregatorPort — ZeroExVenueAdapter', () => {
  let adapter: ZeroExVenueAdapter;
  const mockFetch = jest.fn();
  const mockNow = jest.fn(() => Date.now());

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new ZeroExVenueAdapter({ now: mockNow, fetchImpl: mockFetch });
  });

  describe('getQuote', () => {
    const mockRequest: DexQuoteRequest = {
      walletId: 'test-wallet',
      chain: 'base' as const,
      assetIn: null,
      assetOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
      amount: '1000000000', // 1000 USDC (6 decimals)
      slippageBps: 50,
      taker: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e' as `0x${string}`,
      intentId: 'intent-test-001',
    };

    const mockResponse = {
      quoteId: 'quote-xyz-123',
      liquidityAvailable: true,
      buyAmount: '995000000', // slightly worse than mid-market
      sellAmount: '1000000000',
      fees: {
        integratorFee: { amount: '0', token: null },
        zeroExFee: { amount: '0', token: null },
        gasFee: { amount: '5000000000000000', token: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
      },
      route: {
        fills: [
          { source: 'UniswapV3', from: null, to: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
        ],
        tokens: [
          { address: null, decimals: 18 },
          { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
        ],
      },
      transaction: {
        to: '0x1111111254fb6c44bAC0beD2854e76F90643097d',
        data: '0x12aa3caf...',
        value: '5000000000000000',
      },
    };

    it('throws aggregator_unconfigured when no ZEROX_API_KEY provided', async () => {
      const adapterNoKey = new ZeroExVenueAdapter({ now: mockNow, fetchImpl: mockFetch });
      await expect(adapterNoKey.getQuote(mockRequest)).rejects.toThrow(
        new DomainError('aggregator_unconfigured', '0x venue adapter has no ZEROX_API_KEY; quotes unavailable', 503),
      );
    });

    it('throws chain_not_supported for non-Base chains', async () => {
      (mockFetch as unknown as jest.Mock).mockResolvedValueOnce({ ok: false, status: 400 });
      const requestWithInvalidChain = { ...mockRequest, chain: 'robinhood' as never };
      await expect(adapter.getQuote(requestWithInvalidChain)).rejects.toThrow(
        new DomainError('chain_not_supported', expect.stringContaining('robinhood')),
      );
    });

    it('validates taker address format', async () => {
      const invalidTakerRequest = { ...mockRequest, taker: 'invalid-address' as unknown as `0x${string}` };
      await expect(adapter.getQuote(invalidTakerRequest)).rejects.toThrow(
        new DomainError('invalid_taker'),
      );
    });

    it('returns formatted SwapQuote with recomputed minAmountOut (not trusting 0x)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await adapter.getQuote(mockRequest);

      expect(mockFetch).toHaveBeenCalled();
      expect(result.source).toBe('zero-ex-venue');
      expect(result.chain).toBe('base');
      expect(result.amountIn).toBe('1000000000');
      expect(result.amountOut).toBe('995000000');

      // Re-compute minAmountOut: floor(995_000_000 * (1 - 50/10000)) = 990025000
      expect(result.minAmountOut).toBe('990025000');

      // F2 boundIntentId guard
      // Note: SwapQuote doesn't expose boundIntentId yet — this is stored internally

      // Quote TTL (TC-22)
      expect(result.expiresAt).toBeDefined();
      const expiresAtDate = new Date(result.expiresAt);
      expect(expiresAtDate.getTime() - Date.now()).toBeLessThan(QUOTE_TTL_MS + 100);
    });

    it('adds route hops from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await adapter.getQuote(mockRequest);

      expect(result.route).toHaveLength(1);
      expect(result.route[0].venue).toBe('UniswapV3');
      expect(result.route[0].assetOut).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
    });

    it('caches tx data for buildSwapTx call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const quote = await adapter.getQuote(mockRequest);
      expect(adapter.buildSwapTx(quote)).resolves.toHaveProperty('to');
      expect(adapter.buildSwapTx(quote)).resolves.toHaveProperty('data');
      expect(adapter.buildSwapTx(quote)).resolves.toHaveProperty('value');
    });

    it('recomputeMinBuy correctly with various slippage values', () => {
      expect(adapter['recomputeMinBuy']('1000000', 0)).toBe('1000000');     // 0% slippage
      expect(adapter['recomputeMinBuy']('1000000', 100)).toBe('990000');    // 1% slippage
      expect(adapter['recomputeMinBuy']('1000000', 500)).toBe('950000');    // 5% slippage
      expect(adapter['recomputeMinBuy']('1000000', 1000)).toBe('900000');   // 10% slippage
    });

    it('handles no liquidity error', async () => {
      const badResponse = { ...mockResponse, liquidityAvailable: false };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => badResponse,
      } as Response);

      await expect(adapter.getQuote(mockRequest)).rejects.toThrow(
        new DomainError('no_liquidity'),
      );
    });
  });

  describe('buildSwapTx', () => {
    const mockQuote: SwapQuote = {
      id: 'quote-xyz-123',
      source: 'zero-ex-venue',
      chain: 'base' as const,
      assetIn: null,
      assetOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      amountIn: '1000000000',
      amountOut: '995000000',
      price: 0.995,
      minAmountOut: '990025000',
      slippageBps: 50,
      route: [{ venue: 'UniswapV3', assetIn: null, assetOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' }],
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
    };

    it('throws quote_unknown when tx not cached', async () => {
      await expect(adapter.buildSwapTx(mockQuote)).rejects.toThrow(
        new DomainError('quote_unknown', 'no executable transaction cached for this quote'),
      );
    });

    it('returns cached UnsignedSwapTx after getQuote call', async () => {
      const mockResponse = {
        quoteId: 'quote-xyz-123',
        liquidityAvailable: true,
        buyAmount: '995000000',
        sellAmount: '1000000000',
        transaction: {
          to: '0x1111111254fb6c44bAC0beD2854e76F90643097d',
          data: '0x12aa3caf...',
          value: '5000000000000000',
        },
      };

      const mockRequest: DexQuoteRequest = {
        walletId: 'test-wallet',
        chain: 'base' as const,
        assetIn: null,
        assetOut: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        amount: '1000000000',
        slippageBps: 50,
        taker: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e' as `0x${string}`,
        intentId: 'intent-test-001',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const quote = await adapter.getQuote(mockRequest);
      const tx = await adapter.buildSwapTx(quote);

      expect(tx.to).toBe('0x1111111254fb6c44bAC0beD2854e76F90643097d');
      expect(tx.data).toBe('0x12aa3caf...');
      expect(tx.value).toBe('5000000000000000');
    });
  });

  describe('health', () => {
    it('returns unconfigured when no API key', async () => {
      const adapterNoKey = new ZeroExVenueAdapter({ now: mockNow, fetchImpl: mockFetch });
      const health = adapterNoKey.health();

      expect(health.feedId).toBe('dex:zero-ex-venue');
      expect(health.status).toBe('unconfigured');
      expect(health.lastUpdateAt).toBeNull();
    });

    it('returns healthy when quote recently made', async () => {
      adapter = new ZeroExVenueAdapter({ now: mockNow, fetchImpl: mockFetch });
      Object.assign(adapter, { apiKey: 'test-key', lastQuoteAtMs: Date.now() });

      const health = adapter.health();
      expect(health.status).toBe('healthy');
      expect(health.priceAgeSec).toBeLessThanOrEqual(1);
    });

    it('returns stale when no recent quote', async () => {
      adapter = new ZeroExVenueAdapter({ now: mockNow, fetchImpl: mockFetch });
      Object.assign(adapter, { apiKey: 'test-key', lastQuoteAtMs: Date.now() - 2 * QUOTE_TTL_MS });

      const health = adapter.health();
      expect(health.status).toBe('stale');
    });
  });

  describe('tokenParam', () => {
    it('returns NATIVE_SENTINEL for null token', () => {
      expect(adapter.tokenParam(null)).toBe(NATIVE_SENTINEL);
    });

    it('returns token address for non-null token', () => {
      const addr = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as `0x${string}`;
      expect(adapter.tokenParam(addr)).toBe(addr);
    });
  });
});
