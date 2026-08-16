import type { Order } from '@kryptr/shared-types';
import { InMemoryOrderStore } from '../infrastructure/in-memory-order.store';
import { InMemoryKillSwitch } from '../infrastructure/in-memory-kill-switch';
import { InMemoryJobQueue } from '../infrastructure/in-memory-job-queue';
import { SetKillSwitchUseCase } from './set-kill-switch.usecase';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bfa02913' as const;

function order(id: string, status: Order['status']): Order {
  return {
    id,
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
    createdAt: new Date(NOW).toISOString(),
  };
}

describe('SetKillSwitchUseCase', () => {
  let orders: InMemoryOrderStore;
  let killSwitch: InMemoryKillSwitch;
  let queue: InMemoryJobQueue;
  let usecase: SetKillSwitchUseCase;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
    orders = new InMemoryOrderStore();
    killSwitch = new InMemoryKillSwitch();
    queue = new InMemoryJobQueue();
    usecase = new SetKillSwitchUseCase(killSwitch, orders, queue);
  });

  afterEach(() => jest.useRealTimers());

  it('flips state and returns the shared KillSwitchState shape', async () => {
    const state = await usecase.execute({
      mode: 'pause_new',
      actor: 'backoffice:deck',
      reason: 'stale oracle',
    });
    expect(state).toEqual({
      mode: 'pause_new',
      activatedAt: new Date(NOW).toISOString(),
      reason: 'stale oracle',
    });
  });

  it('records every transition in the shared audit shape', async () => {
    await usecase.execute({
      mode: 'cancel_active',
      actor: 'deck',
      reason: 'halt',
    });
    await usecase.execute({ mode: 'off', actor: 'deck', reason: 'restored' });
    const audit = await usecase.getAudit();
    expect(audit).toEqual([
      {
        actor: 'deck',
        at: new Date(NOW).toISOString(),
        from: 'off',
        to: 'cancel_active',
        reason: 'halt',
      },
      {
        actor: 'deck',
        at: new Date(NOW).toISOString(),
        from: 'cancel_active',
        to: 'off',
        reason: 'restored',
      },
    ]);
  });

  it('pause_new pauses the execute queue but leaves orders registered', async () => {
    const pause = jest.spyOn(queue, 'pauseExecutions');
    await orders.save(order('ord-1', 'open'));
    await usecase.execute({ mode: 'pause_new', actor: 'deck', reason: 'x' });
    expect(pause).toHaveBeenCalled();
    expect((await orders.findById('ord-1'))?.status).toBe('open');
  });

  it('cancel_active fan-out cancels every LIVE order (open + paused, freeze §3) and skips terminal ones', async () => {
    await orders.save(order('ord-open', 'open'));
    await orders.save(order('ord-paused', 'paused'));
    await orders.save(order('ord-filled', 'filled'));
    await usecase.execute({
      mode: 'cancel_active',
      actor: 'deck',
      reason: 'x',
    });
    const cancelled = await usecase.cancelLiveOrders();
    expect(cancelled.sort()).toEqual(['ord-open', 'ord-paused']);
    expect((await orders.findById('ord-open'))?.status).toBe('cancelled');
    expect((await orders.findById('ord-paused'))?.status).toBe('cancelled');
    expect((await orders.findById('ord-filled'))?.status).toBe('filled');
  });

  it('off resumes the queue', async () => {
    const resume = jest.spyOn(queue, 'resumeExecutions');
    await usecase.execute({ mode: 'off', actor: 'deck', reason: 'x' });
    expect(resume).toHaveBeenCalled();
    expect((await usecase.getState()).mode).toBe('off');
  });
});
