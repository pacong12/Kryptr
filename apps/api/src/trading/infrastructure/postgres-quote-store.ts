import type { SwapQuote } from '@kryptr/shared-types';
import type { QuoteStore, StoredQuote } from '../domain/quote-store.port';
import { getPrismaClient } from '../../persistence/prisma-client';
import type { PrismaClient } from '../../generated/prisma/client';

/**
 * Postgres-backed quote store with single-use binding (wave-6 S1). The
 * StoredQuote (quote + binding) is one JSONB row keyed by quote id.
 *
 * Binding semantics mirror the in-memory store exactly:
 *  - save() NEVER clears an existing binding (single-use cannot be
 *    replayed away by re-saving a re-priced quote);
 *  - bind() is ONE conditional UPDATE — the row lock serializes racing
 *    binds, the loser re-evaluates the WHERE against the committed row
 *    and gets zero rows.
 */
export class PostgresQuoteStore implements QuoteStore {
  constructor(private readonly db: PrismaClient = getPrismaClient()) {}

  async save(quote: SwapQuote): Promise<void> {
    const payload = JSON.stringify({ quote, boundIntentId: null });
    await this.db.$executeRaw`
      INSERT INTO quotes (quote_id, payload, stored_at)
      VALUES (${quote.id}, ${payload}::jsonb, now())
      ON CONFLICT (quote_id) DO UPDATE
      SET payload = EXCLUDED.payload || jsonb_build_object(
            'boundIntentId', quotes.payload -> 'boundIntentId'
          ),
          stored_at = now()
    `;
  }

  async findById(id: string): Promise<StoredQuote | null> {
    const row = await this.db.quote.findUnique({ where: { quoteId: id } });
    if (!row) {
      return null;
    }
    return row.payload as unknown as StoredQuote;
  }

  async bind(quoteId: string, intentId: string): Promise<boolean> {
    const updated = await this.db.$executeRaw`
      UPDATE quotes
      SET payload = payload || jsonb_build_object('boundIntentId', to_jsonb(${intentId}::text))
      WHERE quote_id = ${quoteId}
        AND (payload ->> 'boundIntentId' IS NULL OR payload ->> 'boundIntentId' = ${intentId})
    `;
    return updated > 0;
  }
}
