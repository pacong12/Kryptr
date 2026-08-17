import { describePostgres } from '../../test/env-gate';
import {
  disconnectTestClient,
  makePostgresTestClient,
  truncateAllTables,
} from '../../test/postgres-harness';
import { PostgresQuoteStore } from './postgres-quote-store';
import type { PrismaClient } from '../../generated/prisma/client';
import type { SwapQuote } from '@kryptr/shared-types';

describePostgres('PostgresQuoteStore (S1, live Postgres)', () => {
  let db: PrismaClient;
  let store: PostgresQuoteStore;

  const makeQuote = (over: Partial<SwapQuote> = {}): SwapQuote => ({
    id: 'quote-1',
    source: 'static-mock',
    chain: 'base',
    assetIn: '0x0000000000000000000000000000000000000001',
    assetOut: '0x0000000000000000000000000000000000000002',
    amountIn: '1000',
    amountOut: '995',
    price: 0.995,
    minAmountOut: '990',
    slippageBps: 100,
    route: [],
    fetchedAt: '2026-08-17T00:00:00.000Z',
    expiresAt: '2026-08-17T12:00:00.000Z',
    ...over,
  });

  beforeEach(async () => {
    db = makePostgresTestClient();
    await truncateAllTables(db);
    store = new PostgresQuoteStore(db);
  });

  afterEach(async () => {
    await disconnectTestClient(db);
  });

  it('saves and reads quotes with a null binding', async () => {
    await store.save(makeQuote());
    await expect(store.findById('quote-1')).resolves.toMatchObject({
      boundIntentId: null,
      quote: { id: 'quote-1', amountIn: '1000' },
    });
  });

  it('re-saving NEVER clears an existing binding (single-use replay guard)', async () => {
    await store.save(makeQuote());
    await store.bind('quote-1', 'intent-1');
    await store.save(makeQuote({ amountIn: '2000' }));
    const stored = await store.findById('quote-1');
    expect(stored?.boundIntentId).toBe('intent-1');
    expect(stored?.quote.amountIn).toBe('2000');
  });

  it('bind semantics: fresh true, same-intent rebind true, different intent false, unknown quote false', async () => {
    await store.save(makeQuote());
    await expect(store.bind('quote-1', 'intent-1')).resolves.toBe(true);
    await expect(store.bind('quote-1', 'intent-1')).resolves.toBe(true);
    await expect(store.bind('quote-1', 'intent-2')).resolves.toBe(false);
    await expect(store.bind('missing', 'intent-1')).resolves.toBe(false);
    await expect(store.findById('quote-1')).resolves.toMatchObject({
      boundIntentId: 'intent-1',
    });
  });

  it('racing binds for DIFFERENT intents admit exactly one winner', async () => {
    await store.save(makeQuote());
    const clients: PrismaClient[] = [];
    try {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) => {
          const client = makePostgresTestClient();
          clients.push(client);
          return new PostgresQuoteStore(client).bind('quote-1', `intent-${i}`);
        }),
      );
      expect(results.filter((r) => r)).toHaveLength(1);
    } finally {
      await Promise.all(clients.map((c) => disconnectTestClient(c)));
    }
  }, 30_000);
});
