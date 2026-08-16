import type { ChainId } from './chains.js';

/**
 * Wave-2 trading contracts (conductor-owned).
 *
 * A swap never starts as a transaction. The flow is:
 *   1. client requests a Quote (read-only, signed by no one);
 *   2. client submits a TransactionIntent with kind='swap' bound to that
 *      quote via SwapContext.quoteId;
 *   3. the security gate evaluates the intent (expiry, slippage, caps);
 *   4. only an approved intent may produce unsigned calldata.
 * Signing stays outside the API (Bankr lesson: gate first, sign later).
 */

/** One hop of a swap route (per-hop shape adopted from DeckUI). */
export interface SwapRouteHop {
  /** Venue/DEX name for display, e.g. 'uniswap-v3'. */
  venue: string;
  /** null = native asset of the chain. */
  assetIn: `0x${string}` | null;
  /** null = native asset of the chain. */
  assetOut: `0x${string}` | null;
  /** Raw units; optional — some aggregators only return the total. */
  amountIn?: string;
  /** Raw units; optional — some aggregators only return the total. */
  amountOut?: string;
}

export interface QuoteFee {
  /** null = native asset of the chain. */
  asset: `0x${string}` | null;
  /** Raw units. */
  amount: string;
}

/** A read-only price quote for a swap. Never executable on its own. */
export interface SwapQuote {
  id: string;
  /** Adapter that produced it, e.g. 'static-mock', '0x', '1inch'. */
  source: string;
  chain: ChainId;
  /** null = native asset of the chain. */
  assetIn: `0x${string}` | null;
  /** null = native asset of the chain. */
  assetOut: `0x${string}` | null;
  /** Raw units being sold. */
  amountIn: string;
  /** Raw units expected to be bought at `price`. */
  amountOut: string;
  /** Price of one unit of assetIn denominated in assetOut. */
  price: number;
  /** Worst-case buy amount after slippage (raw units) — the on-chain floor. */
  minAmountOut: string;
  fees?: QuoteFee[];
  /** Slippage tolerance applied, in basis points. */
  slippageBps: number;
  /** Execution path; may be empty for single-venue quotes. */
  route: SwapRouteHop[];
  /** ISO-8601. */
  fetchedAt: string;
  /** ISO-8601; the gate must reject intents bound to an expired quote. */
  expiresAt: string;
}

/** Request shape for POST /api/quotes. */
export interface QuoteRequest {
  walletId: string;
  chain: ChainId;
  /** null = native asset of the chain. */
  assetIn: `0x${string}` | null;
  /** null = native asset of the chain. */
  assetOut: `0x${string}` | null;
  /** Raw units to sell. */
  amount: string;
  /** Optional slippage tolerance override (basis points). */
  slippageBps?: number;
}

/**
 * Swap-specific context attached to a TransactionIntent with kind='swap'.
 * Binds the intent to exactly one quote so a decision can never be
 * replayed against a different (re-priced) quote.
 */
export interface SwapContext {
  /** Quote this swap is bound to; single-use. */
  quoteId: string;
  /** null = native asset of the chain. */
  buyAsset: `0x${string}` | null;
  /** Raw units; minimum acceptable buy amount (slippage floor). */
  minBuyAmount: string;
  /** Policy ceiling on slippage for this swap, in basis points. */
  maxSlippageBps: number;
  /** Copy of quote.expiresAt so the gate can check without refetching. */
  quoteExpiresAt: string;
}
