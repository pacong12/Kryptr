import type { Order } from '@kryptr/shared-types';
import { InMemoryExecutionStore } from './in-memory-execution.store';
import { InMemoryOrderStore } from './in-memory-order.store';

const AT = '2026-05-01T12:00:00.000Z';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bfa02913' as const;

describe('InMemoryExecutionStore — claim contract', () => {
  it('claims exactly once per (orderId, slotKey) — the SpendLedger pattern', async () => {
    const store = new InMemoryExecutionStore();
    // 50 concurrent claims for the same slot: exactly ONE winner.
    const results = await Promise.all(
      Array.from({ length: 50 }, () => store.claim('ord-1', 'slot-0', AT)),
    );
    const wins = results.filter((r) => r !== null);
    expect(wins).toHaveLength(1);
    expect(wins[0]).toMatchObject({
      id: 'ord-1:slot-0',
      orderId: 'ord-1',
      slotKey: 'slot-0',
      status: 'claimed',
      claimedAt: AT,
    });
    // Redelivery finds the record via findById (resume path).
    expect(await store.findById('ord-1:slot-0')).toMatchObject({
      status: 'claimed',
    });
  });

  it('tracks executions per order and applies update patches', async () => {
    const store = new InMemoryExecutionStore();
    await store.claim('ord-1', 'a', AT);
    await store.claim('ord-1', 'b', AT);
    await store.claim('ord-2', 'a', AT);
    await store.update('ord-1:a', {
      status: 'submitted',
      intentId: 'intent:ord-1:a',
      finishedAt: AT,
    });
    const byOrder = await store.findByOrderId('ord-1');
    expect(byOrder.map((e) => e.id).sort()).toEqual(['ord-1:a', 'ord-1:b']);
    expect(await store.findById('ord-1:a')).toMatchObject({
      status: 'submitted',
      intentId: 'intent:ord-1:a',
    });
  });

  it('update refuses unknown executions', async () => {
    const store = new InMemoryExecutionStore();
    await expect(store.update('ghost:x', { status: 'failed' })).rejects.toThrow(
      'execution "ghost:x" not found',
    );
  });
});

describe('InMemoryOrderStore — terminal guard', () => {
  function order(status: Order['status']): Order {
    return {
      id: 'ord-1',
      walletId: 'w-1',
      type: 'limit',
      status,
      chain: 'base',
      baseAsset: null,
      quoteAsset: USDC,
      side: 'buy',
      amount: '1000',
      limitPrice: '3000',
      interval: null,
      createdAt: AT,
    };
  }

  it.each(['filled', 'partially_filled', 'cancelled', 'expired', 'failed', 'rejected'] as const)(
    'refuses any status write once %s (worker never touches terminal orders)',
    async (status) => {
      const store = new InMemoryOrderStore();
      await store.save(order(status));
      await expect(store.setStatus('ord-1', 'open', AT)).rejects.toMatchObject({
        code: 'order_not_live',
      });
    },
  );

  it('findOpen returns only open orders; findAll everything', async () => {
    const store = new InMemoryOrderStore();
    await store.save(order('open'));
    await store.save({ ...order('open'), id: 'ord-2', status: 'cancelled' });
    expect((await store.findOpen()).map((o) => o.id)).toEqual(['ord-1']);
    expect((await store.findAll()).map((o) => o.id).sort()).toEqual([
      'ord-1',
      'ord-2',
    ]);
  });

  it('setStatus on a missing order is order_not_found', async () => {
    const store = new InMemoryOrderStore();
    await expect(store.setStatus('ghost', 'open', AT)).rejects.toMatchObject({
      code: 'order_not_found',
    });
  });
});
