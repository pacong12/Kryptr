import type { FeedHealth, QuoteRequest, SwapQuote } from '@kryptr/shared-types';

/**
 * DEX aggregator port — the only way the api touches swap liquidity.
 * Wave 2 ships StaticMockDexAdapter; real adapters (0x/1inch) implement
 * the same port AND the shared contract test suite.
 *
 * buildSwapTx returns UNSIGNED calldata. Nothing in this codebase signs;
 * calldata only ever leaves behind an approved gate decision.
 */

export const DEX_AGGREGATOR = 'trading.dex-aggregator';

export interface UnsignedSwapTx {
  to: `0x${string}`;
  /** 0x-prefixed calldata. */
  data: `0x${string}`;
  /** Wei to send with the call (native sell amount or '0'). */
  value: string;
}

export interface DexAggregatorPort {
  getQuote(request: QuoteRequest): Promise<SwapQuote>;
  buildSwapTx(quote: SwapQuote): Promise<UnsignedSwapTx>;
  /** Freshness for GET /health/feeds. */
  health(): FeedHealth;
}
