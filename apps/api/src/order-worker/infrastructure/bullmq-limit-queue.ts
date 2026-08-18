import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type { LimitSlotExecutionUseCase } from '../application/limit-execution.usecase';

export const LIMIT_EXECUTE_QUEUE_NAME = 'automation.limit.execute';

/**
 * Limit order execution worker.
 * Polls price periodically and triggers when limit is reached.
 */
export function createLimitWorker(input: {
  connection: { host: string; port: number };
  prefix?: string;
  limitExecution: LimitSlotExecutionUseCase;
}): Worker {
  const worker = new Worker(
    LIMIT_EXECUTE_QUEUE_NAME,
    async (job: Job<{ orderId: string }>) => {
      try {
        return await input.limitExecution.execute({
          orderId: job.data.orderId,
        });
      } catch (error) {
        console.error(`Limit execution failed: ${String(error)}`);
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

  worker.on('completed', (job) => {
    console.log(`Limit job completed: ${job.id} - ${JSON.stringify(job.returnvalue)}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`Limit job failed: ${job?.id ?? 'unknown'} - ${String(error)}`);
  });

  return worker;
}

/**
 * Limit order scheduler polls active limit orders at configured intervals.
 * Default: poll every 30 seconds for price checks.
 */
export const LIMIT_POLL_INTERVAL_MS = Number(process.env.LIMIT_POLL_INTERVAL_MS || 30_000);
