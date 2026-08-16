import { Queue } from 'bullmq';
import type { WorkerHealth } from '@kryptr/shared-types';
import type { JobQueuePort } from '../domain/job-queue.port';

export const EXECUTE_QUEUE_NAME = 'automation.execute';

/**
 * BullMQ v6 binding for the execute queue. Two stage-B facts (proven in
 * ops harness, see env-gate header):
 *  - queue jobId is the COLON-FREE projection of the deterministic claim
 *    id ('<orderId>.<slotKey>'); domain/gate ids keep colons.
 *  - jobId alone does NOT dedupe in v6 — the `deduplication: { id }`
 *    option does; a duplicate add returns the ORIGINAL job id.
 * Queue dedupe = double-ENQUEUE protection only. Already-EXECUTED
 * protection belongs to the ExecutionStore claim, not this transport.
 */
export class BullMqJobQueue implements JobQueuePort {
  private readonly queue: Queue;

  constructor(options: {
    connection: { host: string; port: number };
    prefix?: string;
  }) {
    this.queue = new Queue(EXECUTE_QUEUE_NAME, {
      connection: {
        ...options.connection,
        maxRetriesPerRequest: null,
      },
      prefix: options.prefix,
    });
  }

  static fromEnv(prefix?: string): BullMqJobQueue {
    const url = new URL(process.env.REDIS_URL ?? '');
    return new BullMqJobQueue({
      connection: { host: url.hostname, port: Number(url.port || 6379) },
      prefix,
    });
  }

  async enqueueExecution(
    orderId: string,
    slotKey: string,
  ): Promise<{ jobId: string; deduplicated: boolean }> {
    const jobId = `${orderId}.${slotKey.replace(/:/g, '.')}`;
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state !== 'completed' && state !== 'failed') {
        return { jobId, deduplicated: true };
      }
    }
    await this.queue.add(
      'execute-slot',
      { orderId, slotKey },
      {
        jobId,
        deduplication: { id: jobId },
        // Freeze retry matrix: bounded, exponential, 2s base.
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
      },
    );
    return { jobId, deduplicated: false };
  }

  async pauseExecutions(): Promise<void> {
    await this.queue.pause();
  }

  async resumeExecutions(): Promise<void> {
    await this.queue.resume();
  }

  async health(nowIso: string): Promise<WorkerHealth> {
    try {
      await this.queue.getJobCounts('waiting', 'active', 'failed');
      return { component: 'order-worker', ok: true, checkedAt: nowIso };
    } catch {
      return {
        component: 'order-worker',
        ok: false,
        detail: 'redis_unreachable',
        checkedAt: nowIso,
      };
    }
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
