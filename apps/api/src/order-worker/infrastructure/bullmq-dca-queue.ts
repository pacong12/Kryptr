import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type { DCASlotExecutionUseCase } from '../application/dca-execution.usecase';
import { TRIGGER_QUEUE_NAME } from '../order-worker.module';

export const DCA_EXECUTE_QUEUE_NAME = 'automation.dca.execute';
export const DCA_SCHEDULER_NAME = 'automation.dca.scheduler';

/**
 * DCA (Dollar-Cost Averaging) order execution worker.
 * Processes scheduled DCA slots based on time intervals.
 */
export function createDCAWorker(input: {
  connection: { host: string; port: number };
  prefix?: string;
  dcaExecution: DCASlotExecutionUseCase;
}): Worker {
  const worker = new Worker(
    DCA_EXECUTE_QUEUE_NAME,
    async (job: Job<{ orderId: string; slotKey: string }>) => {
      try {
        return await input.dcaExecution.execute({
          orderId: job.data.orderId,
          slotKey: job.data.slotKey,
        });
      } catch (error) {
        // Log error and rethrow for BullMQ retry handling
        console.error(`DCA execution failed: ${String(error)}`);
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
    console.log(`DCA job completed: ${job.id} - ${JSON.stringify(job.returnvalue)}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`DCA job failed: ${job?.id ?? 'unknown'} - ${String(error)}`);
  });

  return worker;
}

/**
 * DCA scheduler creates repeating jobs for each active DCA order.
 * Each order has its own job ID pattern to track individual slot progress.
 */
export async function createDCAScheduler(input: {
  connection: { host: string; port: number };
  prefix?: string;
  dcaExecution: DCASlotExecutionUseCase;
}): Promise<Queue> {
  const queue = new Queue(TRIGGER_QUEUE_NAME, {
    connection: {
      ...input.connection,
      maxRetriesPerRequest: null,
    },
    prefix: input.prefix,
  });

  return queue;
}
