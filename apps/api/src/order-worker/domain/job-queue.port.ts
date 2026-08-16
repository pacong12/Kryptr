import type { WorkerHealth } from '@kryptr/shared-types';

/**
 * Execution transport seam (wave 4). Infra = BullMQ (queues
 * 'automation.trigger' + 'automation.execute'); unit tests use an
 * in-memory fake. Queue-layer ids are the DOT projection of the
 * deterministic '<orderId>:<slotKey>' — BullMQ v6 rejects ':' in custom
 * ids, and dedupe comes from `deduplication: { id }`, NOT the jobId.
 * Queue dedupe protects against double-ENQUEUE only; the
 * ExecutionStore claim owns already-executed protection.
 */

export const JOB_QUEUE = 'order-worker.job-queue';

export interface JobQueuePort {
  /**
   * Enqueue execution of one order slot. Returns the queue job id and
   * whether the add was deduplicated (duplicate returns the ORIGINAL
   * job id).
   */
  enqueueExecution(
    orderId: string,
    slotKey: string,
  ): Promise<{ jobId: string; deduplicated: boolean }>;
  /** Kill switch cancel_active: stop executing queued slots. */
  pauseExecutions(): Promise<void>;
  resumeExecutions(): Promise<void>;
  health(nowIso: string): Promise<WorkerHealth>;
}
