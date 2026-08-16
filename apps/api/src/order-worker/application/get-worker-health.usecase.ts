import { Inject, Injectable } from '@nestjs/common';
import type { WorkerHealth } from '@kryptr/shared-types';
import { JOB_QUEUE, type JobQueuePort } from '../domain/job-queue.port';
import { KILL_SWITCH, type KillSwitchPort } from '../domain/kill-switch.port';

/**
 * GET /health/worker — queue liveness with the kill switch overlaid
 * (a paused/cancelling worker reports not-ok even when redis is fine).
 */
@Injectable()
export class GetWorkerHealthUseCase {
  constructor(
    @Inject(JOB_QUEUE) private readonly jobQueue: JobQueuePort,
    @Inject(KILL_SWITCH) private readonly killSwitch: KillSwitchPort,
  ) {}

  async execute(): Promise<WorkerHealth> {
    const nowIso = new Date().toISOString();
    // Queue first: in disabled mode this is the honest worker_unavailable
    // report; the kill switch only overlays an otherwise-healthy queue.
    const queueHealth = await this.jobQueue.health(nowIso);
    if (!queueHealth.ok) {
      return queueHealth;
    }
    const killState = await this.killSwitch.getState();
    if (killState.mode !== 'off') {
      return {
        component: 'order-worker',
        ok: false,
        detail: `kill_switch_active:${killState.mode}`,
        checkedAt: nowIso,
      };
    }
    return queueHealth;
  }
}
