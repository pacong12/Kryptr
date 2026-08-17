import { describePostgres } from '../../test/env-gate';
import {
  disconnectTestClient,
  makePostgresTestClient,
  truncateAllTables,
} from '../../test/postgres-harness';
import { PostgresDecisionAudit } from './postgres-decision-audit';
import { PostgresIntentStore } from './postgres-intent-store';
import type { PrismaClient } from '../../generated/prisma/client';
import type { TransactionIntent } from '@kryptr/shared-types';

describePostgres('PostgresDecisionAudit (S1 §3, live Postgres)', () => {
  let db: PrismaClient;
  let audit: PostgresDecisionAudit;

  beforeEach(async () => {
    db = makePostgresTestClient();
    await truncateAllTables(db);
    audit = new PostgresDecisionAudit(db);
  });

  afterEach(async () => {
    await disconnectTestClient(db);
  });

  it('appends decisions with micros-stored values and stable ordering', async () => {
    const first = await audit.append({
      intentId: 'intent-1',
      result: 'approved',
      reason: 'approved: within policy',
      decidedAt: '2026-08-17T00:00:00.000Z',
      decisionUsd: 50,
    });
    const second = await audit.append({
      intentId: 'intent-1',
      result: 'rejected',
      reason: 'rejected: daily cap exceeded',
      decidedAt: '2026-08-17T00:01:00.000Z',
      decisionUsd: null,
    });
    expect(BigInt(second.id)).toBeGreaterThan(BigInt(first.id));
    const trail = await audit.findByIntentId('intent-1');
    expect(trail).toHaveLength(2);
    expect(trail[0]).toMatchObject({ result: 'approved', decisionUsd: 50 });
    expect(trail[1]).toMatchObject({ result: 'rejected', decisionUsd: null });
  });

  it('appends and lists sign events per intent', async () => {
    await audit.appendSignEvent({
      intentId: 'intent-9',
      step: 'sign_requested',
      detail: 'dry-run',
      at: '2026-08-17T00:00:00.000Z',
    });
    await audit.appendSignEvent({
      intentId: 'intent-9',
      step: 'dry_run_signed',
      detail: 'digest computed',
      at: '2026-08-17T00:00:01.000Z',
    });
    const events = await audit.findSignEventsByIntentId('intent-9');
    expect(events.map((e) => e.step)).toEqual([
      'sign_requested',
      'dry_run_signed',
    ]);
  });
});

describePostgres('PostgresIntentStore (S1, live Postgres)', () => {
  let db: PrismaClient;
  let store: PostgresIntentStore;

  const makeIntent = (id: string): TransactionIntent =>
    ({
      id,
      walletId: 'wallet-1',
      kind: 'swap',
      origin: 'face:test',
      chain: 'base',
      asset: '0x0000000000000000000000000000000000000000',
      amount: '1000',
      to: '0x0000000000000000000000000000000000000001',
      value: '0x0',
      createdAt: new Date().toISOString(),
    }) as unknown as TransactionIntent;

  beforeEach(async () => {
    db = makePostgresTestClient();
    await truncateAllTables(db);
    store = new PostgresIntentStore(db);
  });

  afterEach(async () => {
    await disconnectTestClient(db);
  });

  it('round-trips an intent and upserts on re-save', async () => {
    const intent = makeIntent('intent-1');
    await store.save(intent);
    await expect(store.findById('intent-1')).resolves.toMatchObject({
      id: 'intent-1',
      walletId: 'wallet-1',
      kind: 'swap',
    });
    await store.save({ ...intent, amount: '2000' });
    await expect(store.findById('intent-1')).resolves.toMatchObject({
      amount: '2000',
    });
  });

  it('returns null for unknown ids', async () => {
    await expect(store.findById('missing')).resolves.toBeNull();
  });
});
