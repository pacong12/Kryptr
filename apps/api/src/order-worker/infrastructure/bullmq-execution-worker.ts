import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import { DomainError } from '../../common/domain-error';
import type { ExecuteOrderSlotUseCase } from '../application/execute-order-slot.usecase';
import { EXECUTE_QUEUE_NAME } from './bullmq-job-queue';

/**
 * The stage-2 consumer. Thin by design: job data -> use case -> ack.
 * duplicate_execution is EXPECTED under at-least-once delivery (claim
 * already terminal) — it acks, never retries. Everything else the use
 * case throws is a retryable class (quote layer etc.) and bubbles to
 * BullMQ's bounded retry policy.
 */
export function createExecutionWorker(input: {
  connection: { host: string; port: number };
  prefix?: string;
  executeOrderSlot: ExecuteOrderSlotUseCase;
}): Worker {
  return new Worker(
    EXECUTE_QUEUE_NAME,
    async (job: Job<{ orderId: string; slotKey: string }>) => {
      try {
        const execution = await input.executeOrderSlot.execute({
          orderId: job.data.orderId,
          slotKey: job.data.slotKey,
        });
        return execution.status;
      } catch (error) {
        if (
          error instanceof DomainError &&
          error.code === 'duplicate_execution'
        ) {
          return 'duplicate';
        }
        throw error;
      }
    },
    {
      connection: {
        ...input.connection,
        maxRetriesPerRequest: null,
      },
      prefix: input.prefix,
    },
  );
}
