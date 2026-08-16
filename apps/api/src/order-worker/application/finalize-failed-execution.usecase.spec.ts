import type { Order } from '@kryptr/shared-types';
import { InMemoryExecutionStore } from '../infrastructure/in-memory-execution.store';
import { InMemoryOrderStore } from '../infrastructure/in-memory-order.store';
import { InMemoryDecisionAudit } from '../../security/infrastructure/in-memory-decision-audit';
import { FinalizeFailedExecutionUseCase } from './finalize-failed-execution.usecase';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bfa02913' as const;

function order(status: Order['status']): Order {
  return {
    id: 'ord-1',
    walletId: 'w-1',
    type: 'dca',
    status,
    chain: 'base',
    baseAsset: null,
    quoteAsset: USDC,
    side: 'sell',
    amount: '1000',
    limitPrice: null,
    interval: 'P1D',
    createdAt: new Date(NOW).toISOString(),
  };
}

describe('FinalizeFailedExecutionUseCase (review M1)', () => {
  let executions: InMemoryExecutionStore;
  let orders: InMemoryOrderStore;
  let audit: InMemoryDecisionAudit;
  let usecase: FinalizeFailedExecutionUseCase;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
    executions = new InMemoryExecutionStore();
    orders = new InMemoryOrderStore();
    audit = new InMemoryDecisionAudit();
    usecase = new FinalizeFailedExecutionUseCase(executions, orders, audit);
  });

  afterEach(() => jest.useRealTimers());

  it('finalizes a non-terminal execution + live order and leaves a forensic audit trail', async () => {
    await orders.save(order('triggered'));
    await executions.claim('ord-1', 'slot-0', new Date(NOW).toISOString());

    await usecase.execute({
      orderId: 'ord-1',
      slotKey: 'slot-0',
      reason: 'quote_unavailable',
    });

    const record = await executions.findById('ord-1:slot-0');
    expect(record).toMatchObject({
      status: 'failed',
      detail: 'retry_exhausted: quote_unavailable',
      finishedAt: new Date(NOW).toISOString(),
    });
    expect((await orders.findById('ord-1'))?.status).toBe('failed');

    const entries = await audit.findByIntentId('intent:ord-1:slot-0');
    expect(entries).toEqual([
      expect.objectContaining({
        result: 'rejected',
        reason: 'retry_exhausted (worker, not gate): quote_unavailable',
        decisionUsd: null,
      }),
    ]);
  });

  it('is idempotent: a terminal record is never overwritten', async () => {
    await orders.save(order('open'));
    await executions.claim('ord-1', 'slot-0', new Date(NOW).toISOString());
    await executions.update('ord-1:slot-0', {
      status: 'submitted',
      finishedAt: new Date(NOW).toISOString(),
      detail: 'gate approved; unsigned execution ready (dry-run boundary)',
    });

    await usecase.execute({
      orderId: 'ord-1',
      slotKey: 'slot-0',
      reason: 'late failed event',
    });

    expect((await executions.findById('ord-1:slot-0'))?.status).toBe(
      'submitted',
    );
  });

  it('tolerates a missing record (crash before claim) and still fails the order + audit', async () => {
    await orders.save(order('open'));
    await usecase.execute({
      orderId: 'ord-1',
      slotKey: 'slot-x',
      reason: 'boom',
    });
    expect((await orders.findById('ord-1'))?.status).toBe('failed');
    expect(await audit.findByIntentId('intent:ord-1:slot-x')).toHaveLength(1);
  });

  it('never touches a terminal order', async () => {
    await orders.save(order('cancelled'));
    await usecase.execute({
      orderId: 'ord-1',
      slotKey: 'slot-0',
      reason: 'boom',
    });
    expect((await orders.findById('ord-1'))?.status).toBe('cancelled');
  });
});
