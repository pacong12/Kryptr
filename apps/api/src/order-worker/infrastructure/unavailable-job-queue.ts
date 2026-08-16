import type { WorkerHealth } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import type { JobQueuePort } from '../domain/job-queue.port';

/**
 * AUTOMATION_MODE=disabled binding: every operation fails closed with
 * worker_unavailable (503). The controller stays registered so the API
 * surface is stable across modes.
 */
export class UnavailableJobQueue implements JobQueuePort {
  async enqueueExecution(): Promise<{ jobId: string; deduplicated: boolean }> {
    throw this.unavailable();
  }

  async pauseExecutions(): Promise<void> {
    throw this.unavailable();
  }

  async resumeExecutions(): Promise<void> {
    throw this.unavailable();
  }

  async health(nowIso: string): Promise<WorkerHealth> {
    return {
      component: 'order-worker',
      ok: false,
      detail: 'worker_unavailable',
      checkedAt: nowIso,
    };
  }

  private unavailable(): DomainError {
    return new DomainError(
      'worker_unavailable',
      'automation is disabled (AUTOMATION_MODE=disabled)',
      503,
    );
  }
}
