import { Inject, Injectable } from '@nestjs/common';
import type {
  KillSwitchAuditEntry,
  KillSwitchMode,
  KillSwitchState,
} from '@kryptr/shared-types';
import { ORDER_STORE, type OrderStore } from '../domain/order-store.port';
import { KILL_SWITCH, type KillSwitchPort } from '../domain/kill-switch.port';
import { JOB_QUEUE, type JobQueuePort } from '../domain/job-queue.port';


/**
 * Kill switch transitions (freeze §3) — audited server action.
 *
 * DeckUI backoffice integration note: the switch itself must ack FAST
 * (their client times out at 2.5s), so execute() only flips state and
 * toggles queue pause. The cancel_active order fan-out is a separate
 * method the controller fires without awaiting — order cancellations
 * stay idempotent via the terminal-status guard.
 *
 * Audit shape is the shared contract for Deck + Face
 * (KillSwitchAuditEntry lives in shared-types).
 */
@Injectable()
export class SetKillSwitchUseCase {
  constructor(
    @Inject(KILL_SWITCH) private readonly killSwitch: KillSwitchPort,
    @Inject(ORDER_STORE) private readonly orderStore: OrderStore,
    @Inject(JOB_QUEUE) private readonly jobQueue: JobQueuePort,
  ) {}

  async execute(input: {
    mode: KillSwitchMode;
    actor: string;
    reason: string;
  }): Promise<KillSwitchState> {
    const at = new Date().toISOString();
    const state = await this.killSwitch.setMode(input.mode, {
      actor: input.actor,
      reason: input.reason,
      at,
    });

    if (input.mode === 'off') {
      await this.jobQueue.resumeExecutions();
    } else {
      await this.jobQueue.pauseExecutions();
    }

    return state;
  }

  async getState(): Promise<KillSwitchState> {
    return this.killSwitch.getState();
  }

  /**
   * cancel_active fan-out: cancel every open order. Call WITHOUT
   * awaiting from the HTTP layer (ack-first); safe to await in tests.
   */
  async cancelOpenOrders(): Promise<string[]> {
    const open = await this.orderStore.findOpen();
    const cancelled: string[] = [];
    for (const order of open) {
      try {
        await this.orderStore.setStatus(
          order.id,
          'cancelled',
          new Date().toISOString(),
        );
        cancelled.push(order.id);
      } catch {
        // terminal orders refuse writes — expected, not fatal
      }
    }
    return cancelled;
  }

  async getAudit(): Promise<KillSwitchAuditEntry[]> {
    return this.killSwitch.getAudit();
  }
}
