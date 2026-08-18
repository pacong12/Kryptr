import { describePostgres } from '../../test/env-gate';
import {
  disconnectTestClient,
  makePostgresTestClient,
  truncateAllTables,
} from '../../test/postgres-harness';
import { PostgresOrderStore } from './postgres-order-store';
import { PostgresExecutionStore } from './postgres-execution-store';
import { PostgresKillSwitch } from './postgres-kill-switch';
import type { PrismaClient } from '../../generated/prisma/client';
import type { Order } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';

describePostgres('Order Worker Postgres Adapters (S1 Fase 2, live Postgres)', () => {
  let db: PrismaClient;
  let orderStore: PostgresOrderStore;
  let executionStore: PostgresExecutionStore;
  let killSwitch: PostgresKillSwitch;

  const makeOrder = (id = 'ord-1', status: Order['status'] = 'open'): Order => ({
    id,
    walletId: '0x0000000000000000000000000000000000000001',
    chain: 'base',
    kind: 'swap',
    status,
    schedule: {
      cron: '* * * * *',
      maxExecutions: 5,
      executedCount: 0,
    },
    intentTemplate: {
      walletId: '0x0000000000000000000000000000000000000001',
      kind: 'swap',
      chain: 'base',
      params: {
        assetIn: '0x0000000000000000000000000000000000000002',
        assetOut: '0x0000000000000000000000000000000000000003',
        amountIn: '1000',
        minAmountOut: '990',
        slippageBps: 100,
      },
    },
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  });

  beforeEach(async () => {
    db = makePostgresTestClient();
    await truncateAllTables(db);
    orderStore = new PostgresOrderStore(db);
    executionStore = new PostgresExecutionStore(db);
    killSwitch = new PostgresKillSwitch(db);
  });

  afterEach(async () => {
    await disconnectTestClient(db);
  });

  describe('PostgresOrderStore', () => {
    it('saves and finds order by id', async () => {
      const order = makeOrder();
      await orderStore.save(order);

      const found = await orderStore.findById('ord-1');
      expect(found).toMatchObject({ id: 'ord-1', status: 'open' });
    });

    it('filters orders by findOpen, findLive, and findAll', async () => {
      await orderStore.save(makeOrder('ord-1', 'open'));
      await orderStore.save(makeOrder('ord-2', 'paused'));
      await orderStore.save(makeOrder('ord-3', 'filled'));

      const open = await orderStore.findOpen();
      expect(open.map((o) => o.id)).toEqual(['ord-1']);

      const live = await orderStore.findLive();
      expect(live.map((o) => o.id).sort()).toEqual(['ord-1', 'ord-2']);

      const all = await orderStore.findAll();
      expect(all.map((o) => o.id).sort()).toEqual(['ord-1', 'ord-2', 'ord-3']);
    });

    it('setStatus updates non-terminal orders and rejects terminal order writes (409)', async () => {
      await orderStore.save(makeOrder('ord-1', 'open'));
      const updated = await orderStore.setStatus(
        'ord-1',
        'filled',
        '2026-08-17T12:00:00.000Z',
      );
      expect(updated.status).toBe('filled');

      await expect(
        orderStore.setStatus('ord-1', 'open', '2026-08-17T12:01:00.000Z'),
      ).rejects.toThrow(DomainError);
    });

    it('setStatus throws 404 for missing orders', async () => {
      await expect(
        orderStore.setStatus('missing', 'cancelled', '2026-08-17T12:00:00.000Z'),
      ).rejects.toThrow(DomainError);
    });

    it('racing setStatus callers serialize cleanly on live order', async () => {
      await orderStore.save(makeOrder('ord-1', 'open'));
      const clients: PrismaClient[] = [];
      try {
        const results = await Promise.allSettled(
          Array.from({ length: 5 }, (_, i) => {
            const client = makePostgresTestClient();
            clients.push(client);
            return new PostgresOrderStore(client).setStatus(
              'ord-1',
              i === 0 ? 'paused' : 'filled',
              '2026-08-17T12:00:00.000Z',
            );
          }),
        );
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        expect(fulfilled.length).toBeGreaterThan(0);
      } finally {
        await Promise.all(clients.map((c) => disconnectTestClient(c)));
      }
    });
  });

  describe('PostgresExecutionStore', () => {
    beforeEach(async () => {
      await orderStore.save(makeOrder('ord-1', 'open'));
    });

    it('claim set-if-absent returns execution on first claim and null on duplicate', async () => {
      const exec1 = await executionStore.claim(
        'ord-1',
        'slot-1',
        '2026-08-17T00:00:00.000Z',
      );
      expect(exec1).toMatchObject({
        id: 'ord-1:slot-1',
        orderId: 'ord-1',
        slotKey: 'slot-1',
        status: 'claimed',
      });

      const exec2 = await executionStore.claim(
        'ord-1',
        'slot-1',
        '2026-08-17T00:01:00.000Z',
      );
      expect(exec2).toBeNull();
    });

    it('concurrent claims for one slot admit exactly one winner', async () => {
      const clients: PrismaClient[] = [];
      try {
        const results = await Promise.all(
          Array.from({ length: 8 }, () => {
            const client = makePostgresTestClient();
            clients.push(client);
            return new PostgresExecutionStore(client).claim(
              'ord-1',
              'slot-1',
              '2026-08-17T00:00:00.000Z',
            );
          }),
        );
        const winners = results.filter((r) => r !== null);
        expect(winners).toHaveLength(1);
      } finally {
        await Promise.all(clients.map((c) => disconnectTestClient(c)));
      }
    }, 30_000);

    it('reclaim succeeds for resumable statuses (claimed, quoted) and fails for terminal/submitted', async () => {
      await executionStore.claim('ord-1', 'slot-1', '2026-08-17T00:00:00.000Z');

      const reclaimed = await executionStore.reclaim(
        'ord-1:slot-1',
        '2026-08-17T00:05:00.000Z',
      );
      expect(reclaimed?.status).toBe('claimed');

      await executionStore.update('ord-1:slot-1', { status: 'submitted' });
      const failedReclaim = await executionStore.reclaim(
        'ord-1:slot-1',
        '2026-08-17T00:10:00.000Z',
      );
      expect(failedReclaim).toBeNull();
    });

    it('update patches execution fields', async () => {
      await executionStore.claim('ord-1', 'slot-1', '2026-08-17T00:00:00.000Z');
      const updated = await executionStore.update('ord-1:slot-1', {
        status: 'filled',
        intentId: 'intent-123',
        finishedAt: '2026-08-17T00:02:00.000Z',
        detail: 'done',
      });
      expect(updated).toMatchObject({
        status: 'filled',
        intentId: 'intent-123',
        finishedAt: '2026-08-17T00:02:00.000Z',
        detail: 'done',
      });
    });
  });

  describe('PostgresKillSwitch', () => {
    it('getState materializes default off state on empty database', async () => {
      const state = await killSwitch.getState();
      expect(state).toEqual({
        mode: 'off',
        activatedAt: null,
        reason: null,
        version: 0,
      });
    });

    it('setMode updates state and appends to audit atomically', async () => {
      const updated = await killSwitch.setMode('pause_new', {
        actor: 'admin-1',
        reason: 'test pause',
        at: '2026-08-17T10:00:00.000Z',
      });

      expect(updated).toMatchObject({
        mode: 'pause_new',
        reason: 'test pause',
        version: 1,
      });

      const audit = await killSwitch.getAudit();
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        fromMode: 'off',
        toMode: 'pause_new',
        actor: 'admin-1',
        reason: 'test pause',
      });
    });

    it('setMode back to off clears activatedAt and reason', async () => {
      await killSwitch.setMode('cancel_active', {
        actor: 'admin-1',
        reason: 'emergency',
        at: '2026-08-17T10:00:00.000Z',
      });

      const reset = await killSwitch.setMode('off', {
        actor: 'admin-1',
        reason: 'resolved',
        at: '2026-08-17T11:00:00.000Z',
      });

      expect(reset).toEqual({
        mode: 'off',
        activatedAt: null,
        reason: null,
        version: 2,
      });

      const audit = await killSwitch.getAudit();
      expect(audit).toHaveLength(2);
      expect(audit[1].fromMode).toBe('cancel_active');
      expect(audit[1].toMode).toBe('off');
    });
  });
});
