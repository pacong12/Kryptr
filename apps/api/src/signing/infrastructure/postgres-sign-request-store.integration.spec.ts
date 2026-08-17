import { describePostgres } from '../../test/env-gate';
import {
  disconnectTestClient,
  makePostgresTestClient,
  truncateAllTables,
} from '../../test/postgres-harness';
import { PostgresSignRequestStore } from './postgres-sign-request-store';
import type { PrismaClient } from '../../generated/prisma/client';
import type { SignRequest } from '@kryptr/shared-types';

/**
 * PostgresSignRequestStore integration (wave-6 S1 §3.2/§5.3): the
 * UNIQUE(intent_id) constraint IS the cross-replica decision-binding
 * guard — exactly one creator wins per intent, across connections.
 */
describePostgres('PostgresSignRequestStore (S1 §5.3, live Postgres)', () => {
  let db: PrismaClient;
  let store: PostgresSignRequestStore;

  const makeRequest = (over: Partial<SignRequest> = {}): SignRequest => ({
    id: `sr-${Math.random().toString(36).slice(2)}`,
    intentId: 'intent-1',
    status: 'pending',
    unsignedTx: {
      to: '0x0000000000000000000000000000000000000001',
      data: '0x',
      value: '0x0',
    },
    digest: null,
    note: 'integration test',
    createdAt: new Date().toISOString(),
    ...over,
  });

  beforeEach(async () => {
    db = makePostgresTestClient();
    await truncateAllTables(db);
    store = new PostgresSignRequestStore(db);
  });

  afterEach(async () => {
    await disconnectTestClient(db);
  });

  it('createIfAbsent returns the stored request for the winner', async () => {
    const request = makeRequest();
    const created = await store.createIfAbsent(request);
    expect(created).not.toBeNull();
    expect(created?.intentId).toBe('intent-1');
    await expect(store.findByIntentId('intent-1')).resolves.toMatchObject({
      id: request.id,
      status: 'pending',
      note: 'integration test',
    });
  });

  it('a second createIfAbsent for the SAME intent returns null (loser stops)', async () => {
    await store.createIfAbsent(makeRequest({ id: 'sr-first' }));
    const loser = await store.createIfAbsent(makeRequest({ id: 'sr-second' }));
    expect(loser).toBeNull();
    await expect(store.findByIntentId('intent-1')).resolves.toMatchObject({
      id: 'sr-first',
    });
  });

  it('exactly ONE winner across N concurrent creators on separate connections', async () => {
    const clients: PrismaClient[] = [];
    try {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) => {
          const client = makePostgresTestClient();
          clients.push(client);
          return new PostgresSignRequestStore(client).createIfAbsent(
            makeRequest({ id: `sr-race-${i}` }),
          );
        }),
      );
      const winners = results.filter((r) => r !== null);
      expect(winners).toHaveLength(1);
      await expect(store.findByIntentId('intent-1')).resolves.toMatchObject({
        id: winners[0]!.id,
      });
    } finally {
      await Promise.all(clients.map((c) => disconnectTestClient(c)));
    }
  }, 30_000);

  it('markStatus transitions and reports unknown ids as null', async () => {
    const request = makeRequest();
    await store.createIfAbsent(request);
    const signed = await store.markStatus(request.id, 'signed');
    expect(signed?.status).toBe('signed');
    await expect(store.markStatus('missing', 'signed')).resolves.toBeNull();
  });
});
