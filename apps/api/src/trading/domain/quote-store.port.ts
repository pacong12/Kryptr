import type { SwapQuote } from '@kryptr/shared-types';

/**
 * Quote persistence + single-use binding. A quote may be bound to at most
 * one evaluated intent, so a decision can never be replayed against a
 * re-priced quote. Shape is Postgres-ready.
 */

export const QUOTE_STORE = 'trading.quote-store';

export interface StoredQuote {
  quote: SwapQuote;
  /** Intent this quote is bound to; null = still available. */
  boundIntentId: string | null;
}

export interface QuoteStore {
  save(quote: SwapQuote): Promise<void>;
  findById(id: string): Promise<StoredQuote | null>;
  /**
   * Bind a quote to an intent. Returns true when the binding holds
   * afterwards (fresh bind OR already bound to the same intent), false
   * when the quote is bound to a DIFFERENT intent.
   */
  bind(quoteId: string, intentId: string): Promise<boolean>;
}
