import type { SwapQuote } from '@kryptr/shared-types';
import type { QuoteStore, StoredQuote } from '../domain/quote-store.port';

/**
 * In-memory quote store with single-use binding. Once a quote is bound
 * to an evaluated intent it can never be rebound to a different intent,
 * so a gate decision cannot be replayed against a re-priced quote.
 * Replaced by Postgres in the persistence task.
 */
export class InMemoryQuoteStore implements QuoteStore {
  private readonly quotes = new Map<string, StoredQuote>();

  async save(quote: SwapQuote): Promise<void> {
    // Re-saving the same (deterministic) quote id must NEVER clear an
    // existing binding, or single-use could be replayed away.
    const existing = this.quotes.get(quote.id);
    this.quotes.set(quote.id, {
      quote,
      boundIntentId: existing?.boundIntentId ?? null,
    });
  }

  async findById(id: string): Promise<StoredQuote | null> {
    const stored = this.quotes.get(id);
    if (!stored) {
      return null;
    }
    return { quote: { ...stored.quote }, boundIntentId: stored.boundIntentId };
  }

  async bind(quoteId: string, intentId: string): Promise<boolean> {
    const stored = this.quotes.get(quoteId);
    if (!stored) {
      return false;
    }
    if (stored.boundIntentId !== null && stored.boundIntentId !== intentId) {
      return false;
    }
    stored.boundIntentId = intentId;
    return true;
  }
}
