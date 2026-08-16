/**
 * Ops-owned CI wiring proof for the wave-4 worker surface (NOT a business
 * suite — vault owns order-worker suites under src/**\/*.workers.ts).
 *
 * Proves deterministically against the real CI redis service:
 *  1. queue → process round trip, observed via event wait (zero sleeps),
 *  2. a job queued before any worker exists is claimed when a worker
 *     attaches (restart/claim semantics),
 *  3. duplicate enqueue protection via BullMQ v6 `deduplication.id` — the
 *     idempotency foundation for `<orderId>.<slotKey>` queue jobs.
 *
 * Connection pattern for ALL worker suites (see env-gate header):
 *  - Worker connections need { maxRetriesPerRequest: null }.
 *  - Unique queue prefix per suite; obliterate between tests.
 *  - waitUntilFinished with a bounded timeout; never wall-clock sleeps;
 *    ALWAYS `await events.waitUntilReady()` on QueueEvents before relying
 *    on completion notifications, and attach the wait BEFORE the Worker is
 *    created. QueueEvents has no event replay: if the job finishes before
 *    the listener subscribes, `waitUntilFinished` hangs to its timeout.
 *    Ordering: add job → events ready → waitUntilFinished() → new Worker.
 *    (A worker needs >=1 redis RTT to connect, so the listener wins.)
 *
 * BullMQ gotcha (caught here, applies to ALL worker suites): a custom
 * jobId MUST NOT contain ':' (Redis key separator). The frozen intent id
 * `intent:<orderId>:<slotKey>` stays colon-bearing in the domain/gate, but
 * when it is projected to a queue jobId the colons are mapped (this suite
 * uses '.'; vault maps `<orderId>:<slotKey>` the same way). Second gotcha:
 * a custom jobId alone does NOT deduplicate — v6 dedup requires
 * `deduplication: { id }`; the re-add returns the ORIGINAL job id and no
 * second queue entry is created.
 *
 * Gated by describeRedis: without REDIS_URL (dev machines without local
 * Redis) the suite skips with a logged reason — CI green never depends on
 * dev machines.
 */
import { Queue, QueueEvents, Worker } from 'bullmq';
import { describeRedis } from './env-gate';

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? '');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null,
  };
}

describeRedis('ops harness: bullmq over the CI redis service', () => {
  const PREFIX = 'kryptr-ci-harness';
  const QUEUE_NAME = 'roundtrip';
  let queue: Queue;

  beforeEach(() => {
    queue = new Queue(QUEUE_NAME, {
      connection: redisConnection(),
      prefix: PREFIX,
    });
  });

  afterEach(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it('queues a deterministic job id; a worker processes it exactly once (event-driven wait)', async () => {
    // Deterministic order: enqueue first, subscribe to completion events
    // BEFORE any worker exists — a worker must connect (>=1 redis RTT)
    // before it can process, so the listener can never miss the event.
    const job = await queue.add(
      'eval',
      { payload: 'wave4' },
      { jobId: 'order-1.once' },
    );
    const events = new QueueEvents(QUEUE_NAME, {
      connection: redisConnection(),
      prefix: PREFIX,
    });
    await events.waitUntilReady();
    const processed: string[] = [];
    const finished = job.waitUntilFinished(events, 15_000);
    const worker = new Worker(
      QUEUE_NAME,
      async (item) => {
        processed.push(String(item.id));
        return { echo: item.data.payload };
      },
      { connection: redisConnection(), prefix: PREFIX },
    );
    try {
      const result = await finished;
      expect(result).toEqual({ echo: 'wave4' });
      expect(processed).toEqual(['order-1.once']);
    } finally {
      await worker.close();
      await events.close();
    }
  });

  it('a job queued before any worker exists is claimed when a worker attaches', async () => {
    const job = await queue.add(
      'eval',
      { payload: 'late' },
      { jobId: 'order-2.once' },
    );
    // The job is provably waiting before any worker exists; the listener
    // subscribes before the worker attaches (see test 1 for the ordering
    // argument).
    expect(await job.getState()).toBe('waiting');
    const events = new QueueEvents(QUEUE_NAME, {
      connection: redisConnection(),
      prefix: PREFIX,
    });
    await events.waitUntilReady();
    const processed: string[] = [];
    const finished = job.waitUntilFinished(events, 15_000);
    const worker = new Worker(
      QUEUE_NAME,
      async (jobItem) => {
        processed.push(String(jobItem.id));
        return 'claimed';
      },
      { connection: redisConnection(), prefix: PREFIX },
    );
    try {
      const result = await finished;
      expect(result).toBe('claimed');
      expect(processed).toEqual(['order-2.once']);
    } finally {
      await worker.close();
      await events.close();
    }
  });

  it('duplicate enqueue is de-duplicated via deduplication.id (one waiting entry, one processing)', async () => {
    // No worker attached: the job stays queued, so a re-add with the same
    // deduplication id must NOT double-enqueue. (Already-executed
    // protection is a claim-store concern — vault's surface — not the
    // queue's.)
    const first = await queue.add(
      'eval',
      { payload: 'dup' },
      { deduplication: { id: 'dedup-order-3' } },
    );
    const again = await queue.add(
      'eval',
      { payload: 'dup' },
      { deduplication: { id: 'dedup-order-3' } },
    );
    // v6 contract: the duplicate add resolves to the original job id.
    expect(again.id).toBe(first.id);
    const waiting = await queue.getJobs(['waiting']);
    expect(waiting.map((job) => job.id)).toEqual([first.id]);

    // Subscribe before the worker exists (ordering argument in test 1).
    const events = new QueueEvents(QUEUE_NAME, {
      connection: redisConnection(),
      prefix: PREFIX,
    });
    await events.waitUntilReady();
    const processed: string[] = [];
    const finished = first.waitUntilFinished(events, 15_000);
    const worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        processed.push(String(job.id));
        return 'done';
      },
      { connection: redisConnection(), prefix: PREFIX },
    );
    try {
      await finished;
      expect(processed).toEqual([first.id]);
    } finally {
      await worker.close();
      await events.close();
    }
  });
});
