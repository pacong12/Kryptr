import { FEED_STATUSES, type SwapQuote } from '@kryptr/shared-types';
import type { DexAggregatorPort, DexQuoteRequest } from './dex-aggregator.port';
import { DomainError } from '../../common/domain-error';

/**
 * Shared contract suite for DexAggregatorPort implementations.
 * StaticMockDexAdapter runs it in wave 2; the real 0x/1inch adapters
 * must run the SAME suite before they are wired in.
 */

export const USDC_BASE = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

export function baseQuoteRequest(
  overrides: Partial<DexQuoteRequest> = {},
): DexQuoteRequest {
  return {
    walletId: 'wallet-1',
    /** Server-resolved wallet address; adapters that need a taker use it. */
    taker: '0x2222222222222222222222222222222222222222',
    chain: 'base',
    assetIn: null,
    assetOut: USDC_BASE,
    amount: '1000000000000000000',
    slippageBps: 50,
    ...overrides,
  };
}

export interface DexContractOptions {
  /**
   * Live-aggregator mode (keyed runs against the real 0x API): relaxes
   * market-dependent assertions (byte-identical quotes, cross-request
   * amountOut equality). Per-quote invariants still hold.
   */
  live?: boolean;
}

export function dexAggregatorContractSuite(
  name: string,
  factory: () => DexAggregatorPort,
  options: DexContractOptions = {},
): void {
  describe(`${name} — DexAggregatorPort contract`, () => {
    let dex: DexAggregatorPort;

    beforeEach(() => {
      dex = factory();
    });

    /**
     * Live markets can legitimately refuse a quote: in live mode a
     * no_liquidity DomainError is a valid market outcome, so the test
     * warns and passes instead of failing (0x Base routing is known to
     * flap between liquidityAvailable true/false minute to minute).
     * Keyless/static adapters never reach this branch.
     */
    async function liveQuote(
      request: DexQuoteRequest,
    ): Promise<SwapQuote | null> {
      try {
        return await dex.getQuote(request);
      } catch (error) {
        if (
          options.live &&
          error instanceof DomainError &&
          error.code === 'no_liquidity'
        ) {
          // eslint-disable-next-line no-console
          console.warn(
            `[contract:live] ${name}: no_liquidity accepted as market outcome`,
          );
          return null;
        }
        throw error;
      }
    }

    it('returns a complete SwapQuote shape', async () => {
      const quote = await liveQuote(baseQuoteRequest());
      if (!quote) return;
      expect(quote.id).toEqual(expect.any(String));
      expect(quote.source).toEqual(expect.any(String));
      expect(quote.chain).toBe('base');
      expect(quote.assetIn).toBeNull();
      expect(quote.assetOut).toBe(USDC_BASE);
      expect(quote.amountIn).toBe('1000000000000000000');
      expect(BigInt(quote.amountOut)).toBeGreaterThan(0n);
      expect(typeof quote.price).toBe('number');
      expect(quote.slippageBps).toBe(50);
      expect(Array.isArray(quote.route)).toBe(true);
      expect(Date.parse(quote.fetchedAt)).not.toBeNaN();
      expect(Date.parse(quote.expiresAt)).not.toBeNaN();
    });

    // Live markets move between calls; byte-determinism is a static-only
    // guarantee. Live adapters still must produce stable per-quote txs.
    const determinismIt = options.live ? it.skip : it;
    determinismIt(
      'is deterministic: identical requests produce identical quotes',
      async () => {
        const first = await dex.getQuote(baseQuoteRequest());
        const second = await dex.getQuote(baseQuoteRequest());
        expect(second).toEqual(first);
      },
    );

    it('distinguishes quotes by input (different amount -> different id)', async () => {
      const one = await liveQuote(baseQuoteRequest());
      const two = await liveQuote(
        baseQuoteRequest({ amount: '2000000000000000000' }),
      );
      if (!one || !two) return;
      expect(two.id).not.toBe(one.id);
    });

    it('applies slippage as a floor on amountOut', async () => {
      const tight = await liveQuote(baseQuoteRequest({ slippageBps: 10 }));
      const loose = await liveQuote(baseQuoteRequest({ slippageBps: 500 }));
      if (!tight || !loose) return;
      const floorOf = (quote: SwapQuote) =>
        (BigInt(quote.amountOut) * BigInt(10_000 - quote.slippageBps)) /
        10_000n;
      expect(BigInt(tight.minAmountOut)).toBe(floorOf(tight));
      expect(BigInt(loose.minAmountOut)).toBe(floorOf(loose));
      if (!options.live) {
        expect(BigInt(loose.minAmountOut)).toBeLessThan(
          BigInt(tight.minAmountOut),
        );
        expect(BigInt(loose.amountOut)).toBe(BigInt(tight.amountOut));
      }
    });

    it('quotes expire after they are fetched', async () => {
      const quote = await liveQuote(baseQuoteRequest());
      if (!quote) return;
      expect(Date.parse(quote.expiresAt)).toBeGreaterThan(
        Date.parse(quote.fetchedAt),
      );
    });

    it('names every route hop and keeps assets consistent', async () => {
      const quote = await liveQuote(baseQuoteRequest());
      if (!quote) return;
      expect(quote.route.length).toBeGreaterThan(0);
      for (const hop of quote.route) {
        expect(hop.venue).toEqual(expect.any(String));
        expect(hop.venue.length).toBeGreaterThan(0);
      }
      expect(quote.route[0].assetIn).toBe(quote.assetIn);
      expect(quote.route[quote.route.length - 1].assetOut).toBe(quote.assetOut);
    });

    it('rejects chains outside the phase-1 allowlist with a domain error', async () => {
      await expect(
        dex.getQuote(baseQuoteRequest({ chain: 'solana' })),
      ).rejects.toThrow(DomainError);
    });

    it('buildSwapTx returns unsigned calldata only', async () => {
      const quote = await liveQuote(baseQuoteRequest());
      if (!quote) return;
      const tx = await dex.buildSwapTx(quote);
      expect(tx.to).toMatch(/^0x[0-9a-f]{40}$/);
      expect(tx.data).toMatch(/^0x[0-9a-f]+$/);
      // native sell: value equals the sell amount; never signed fields
      expect(tx.value).toBe(quote.amountIn);
    });

    it('buildSwapTx sends no ETH when selling an ERC-20', async () => {
      const quote = await liveQuote(
        baseQuoteRequest({ assetIn: USDC_BASE, assetOut: null }),
      );
      if (!quote) return;
      const tx = await dex.buildSwapTx(quote);
      expect(tx.value).toBe('0');
    });

    it('buildSwapTx is deterministic for the same quote', async () => {
      const quote = await liveQuote(baseQuoteRequest());
      if (!quote) return;
      const first = await dex.buildSwapTx(quote);
      const second = await dex.buildSwapTx(quote);
      expect(second).toEqual(first);
    });

    it('reports FeedHealth', () => {
      const health = dex.health();
      expect(health.feedId).toEqual(expect.any(String));
      expect(health.source).toEqual(expect.any(String));
      expect(FEED_STATUSES).toContain(health.status);
    });
  });
}

describe('baseQuoteRequest fixture', () => {
  it('builds a valid QuoteRequest with deterministic defaults', () => {
    const request = baseQuoteRequest();
    expect(request.chain).toBe('base');
    expect(request.assetIn).toBeNull();
    expect(request.assetOut).toBe(USDC_BASE);
    expect(request.amount).toMatch(/^[1-9][0-9]*$/);
    expect(request.slippageBps).toBe(50);
  });
});
