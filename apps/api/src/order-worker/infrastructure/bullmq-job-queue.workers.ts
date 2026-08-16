/**
 * BullMQ bindings over the REAL CI redis service (describeRedis-gated;
 * dev machines without Redis skip with a logged reason). Connection
 * pattern per the ops harness (env-gate header): worker connections use
 * maxRetriesPerRequest: null; unique queue prefix per suite; obliterate
 * between tests; subscribe to completion events BEFORE the worker
 * exists (QueueEvents has no replay).
 *
 * Proves the stage-B transport contracts:
 *  1. dot-projected jobIds + deduplication.id → one queue entry,
 *  2. a job queued before any worker exists is claimed exactly once,
 *  3. duplicate_execution acks (no retry), other errors retry bounded,
 *  4. kill-switch pause/resume gates processing,
 *  5. review M1: retry exhaustion finalizes execution+order+audit.
 */
import { Queue as RawQueue, QueueEvents } from 'bullmq';
import type { Order } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import { describeRedis } from '../../test/env-gate';
import type { ExecuteOrderSlotUseCase } from '../application/execute-order-slot.usecase';
import { FinalizeFailedExecutionUseCase } from '../application/finalize-failed-execution.usecase';
import { InMemoryExecutionStore } from './in-memory-execution.store';
import { InMemoryOrderStore } from './in-memory-order.store';
import { InMemoryDecisionAudit } from '../../security/infrastructure/in-memory-decision-audit';
import { BullMqJobQueue, EXECUTE_QUEUE_NAME } from './bullmq-job-queue';
import { createExecutionWorker } from './bullmq-execution-worker';

const PREFIX = 'vault-order-worker';

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? '');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
  };
}

function stubUseCase(
  behavior: (input: { orderId: string; slotKey: string }) => Promise<string>,
): {
  calls: Array<{ orderId: string; slotKey: string }>;
  usecase: ExecuteOrderSlotUseCase;
} {
  const calls: Array<{ orderId: string; slotKey: string }> = [];
  const usecase = {
    execute: async (input: { orderId: string; slotKey: string }) => {
      calls.push(input);
      return { status: await behavior(input) };
    },
  } as unknown as ExecuteOrderSlotUseCase;
  return { calls, usecase };
}

describeRedis('order-worker bullmq bindings (real redis)', () => {
  let queue: BullMqJobQueue;

  beforeEach(() => {
    queue = new BullMqJobQueue({
      connection: redisConnection(),
      prefix: PREFIX,
    });
  });

  afterEach(async () => {
    await queue.close();
    const raw = new RawQueue(EXECUTE_QUEUE_NAME, {
      connection: { ...redisConnection(), maxRetriesPerRequest: null },
      prefix: PREFIX,
    });
    await raw.obliterate({ force: true });
    await raw.close();
  });

  it('projects jobIds without colons and dedupes via deduplication.id', async () => {
    const first = await queue.enqueueExecution(
      'ord-1',
      '2026-05-01T00:00:00.000Z',
    );
    expect(first.jobId).toBe('ord-1.2026-05-01T00.00.00.000Z');
    expect(first.deduplicated).toBe(false);

    const again = await queue.enqueueExecution(
      'ord-1',
      '2026-05-01T00:00:00.000Z',
    );
    expect(again).toEqual({ jobId: first.jobId, deduplicated: true });
  });

  it('a job queued before any worker exists is claimed exactly once', async () => {
    await queue.enqueueExecution('ord-1', 'slot-0');

    // Subscribe BEFORE the worker exists (no event replay).
    const events = new QueueEvents(EXECUTE_QUEUE_NAME, {
      connection: { ...redisConnection(), maxRetriesPerRequest: null },
      prefix: PREFIX,
    });
    await events.waitUntilReady();

    const { calls, usecase } = stubUseCase(async () => 'submitted');
    const finished = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('wait timed out')),
        15_000,
      );
      events.once('completed', ({ jobId }) => {
        clearTimeout(timer);
        expect(jobId).toBe('ord-1.slot-0');
        resolve();
      });
    });
    const worker = createExecutionWorker({
      connection: redisConnection(),
      prefix: PREFIX,
      executeOrderSlot: usecase,
    });
    try {
      await finished;
      expect(calls).toEqual([{ orderId: 'ord-1', slotKey: 'slot-0' }]);
    } finally {
      await worker.close();
      await events.close();
    }
  });

  it('duplicate_execution acks without retry; other DomainErrors retry bounded', async () => {
    // Slot A: the claim store already finished it → worker must ACK.
    await queue.enqueueExecution('ord-dup', 'slot-0');
    // Slot B: transient quote failure once, then success → attempt 2 wins.
    await queue.enqueueExecution('ord-retry', 'slot-0');

    const events = new QueueEvents(EXECUTE_QUEUE_NAME, {
      connection: { ...redisConnection(), maxRetriesPerRequest: null },
      prefix: PREFIX,
    });
    await events.waitUntilReady();

    let failures = 0;
    const { calls, usecase } = stubUseCase(async (input) => {
      if (input.orderId === 'ord-dup') {
        throw new DomainError('duplicate_execution', 'already done', 409);
      }
      if (failures === 0) {
        failures += 1;
        throw new DomainError('quote_unavailable', 'transient', 502);
      }
      return 'submitted';
    });

    const completedIds: string[] = [];
    events.on('completed', ({ jobId }) => completedIds.push(jobId));

    const worker = createExecutionWorker({
      connection: redisConnection(),
      prefix: PREFIX,
      executeOrderSlot: usecase,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('wait timed out')),
          30_000,
        );
        events.on('completed', () => {
          if (completedIds.length >= 2) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      expect(completedIds.sort()).toEqual([
        'ord-dup.slot-0',
        'ord-retry.slot-0',
      ]);
      // dup: exactly ONE attempt (acked); retry: exactly TWO.
      expect(calls.filter((c) => c.orderId === 'ord-dup')).toHaveLength(1);
      expect(calls.filter((c) => c.orderId === 'ord-retry')).toHaveLength(2);
    } finally {
      await worker.close();
      await events.close();
    }
  }, 40_000);

  it('kill-switch pause holds queued executions; resume releases them', async () => {
    const { calls, usecase } = stubUseCase(async () => 'submitted');
    const worker = createExecutionWorker({
      connection: redisConnection(),
      prefix: PREFIX,
      executeOrderSlot: usecase,
    });
    try {
      await queue.pauseExecutions();
      await queue.enqueueExecution('ord-paused', 'slot-0');
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      expect(calls).toEqual([]); // nothing ran while paused

      const events = new QueueEvents(EXECUTE_QUEUE_NAME, {
        connection: { ...redisConnection(), maxRetriesPerRequest: null },
        prefix: PREFIX,
      });
      await events.waitUntilReady();
      const finished = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('wait timed out')),
          15_000,
        );
        events.once('completed', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      await queue.resumeExecutions();
      await finished;
      expect(calls).toEqual([{ orderId: 'ord-paused', slotKey: 'slot-0' }]);
      await events.close();
    } finally {
      await worker.close();
    }
  }, 30_000);

  it('M1: retry exhaustion finalizes execution + order + audit exactly once', async () => {
    const executions = new InMemoryExecutionStore();
    const orders = new InMemoryOrderStore();
    const audit = new InMemoryDecisionAudit();
    const order: Order = {
      id: 'ord-exhaust',
      walletId: 'w-1',
      type: 'dca',
      status: 'triggered',
      chain: 'base',
      baseAsset: null,
      quoteAsset: null,
      side: 'sell',
      amount: '1000',
      limitPrice: null,
      interval: 'P1D',
      createdAt: new Date().toISOString(),
    };
    await orders.save(order);
    await executions.claim('ord-exhaust', 'slot-0', new Date().toISOString());

    const finalizer = new FinalizeFailedExecutionUseCase(
      executions,
      orders,
      audit,
    );
    const finalized: Array<{ orderId: string; slotKey: string }> = [];
    const { usecase } = stubUseCase(async () => {
      throw new DomainError('quote_unavailable', 'always down', 502);
    });

    await queue.enqueueExecution('ord-exhaust', 'slot-0');
    const worker = createExecutionWorker({
      connection: redisConnection(),
      prefix: PREFIX,
      executeOrderSlot: usecase,
      onRetryExhausted: async (input) => {
        finalized.push(input);
        await finalizer.execute({ ...input, reason: 'quote_unavailable' });
      },
    });
    try {
      // attempts: 3 with exponential backoff (2s, 4s) — poll until the
      // finalizer lands or the deadline passes.
      const deadline = Date.now() + 25_000;
      while (Date.now() < deadline) {
        const record = await executions.findById('ord-exhaust:slot-0');
        if (record?.status === 'failed') {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(finalized).toEqual([
        { orderId: 'ord-exhaust', slotKey: 'slot-0' },
      ]);
      expect(await executions.findById('ord-exhaust:slot-0')).toMatchObject({
        status: 'failed',
        detail: 'retry_exhausted: quote_unavailable',
      });
      expect((await orders.findById('ord-exhaust'))?.status).toBe('failed');
      expect(
        await audit.findByIntentId('intent:ord-exhaust:slot-0'),
      ).toHaveLength(1);
    } finally {
      await worker.close();
    }
  }, 40_000);
});
