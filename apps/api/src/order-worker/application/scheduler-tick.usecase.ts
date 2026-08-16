import { Inject, Injectable } from '@nestjs/common';
import type { Order, TriggerEvaluation } from '@kryptr/shared-types';
import { ORDER_STORE, type OrderStore } from '../domain/order-store.port';
import {
  EXECUTION_STORE,
  type ExecutionStore,
} from '../domain/execution-store.port';
import {
  TRIGGER_HINT,
  TRIGGER_PRICE,
  type TriggerPricePort,
} from '../domain/trigger-price.port';
import { KILL_SWITCH, type KillSwitchPort } from '../domain/kill-switch.port';
import { JOB_QUEUE, type JobQueuePort } from '../domain/job-queue.port';
import { dcaSlotFor, isoDurationToMs } from '../domain/schedule';
import {
  evaluateDcaSlot,
  evaluateLimitTrigger,
  LIMIT_SLOT_KEY,
} from '../domain/trigger-evaluation';
import { isLimitRejection } from '../domain/execution-rules';

/**
 * One scheduler pass over every OPEN order (freeze §4). Runs inside a
 * repeatable trigger job (or manually in in-memory mode).
 *
 * - DCA: time-triggered; the current slot is enqueued unless already
 *   claimed. Missed slots are NOT retro-enqueued (at-least-once
 *   delivery covers redelivery, not catch-up).
 * - Limit: dual-source trigger evaluation; 'triggered' enqueues the
 *   one-shot execution.
 *
 * Kill switch active → the tick is a no-op (fail-closed).
 */
@Injectable()
export class SchedulerTickUseCase {
  private ticking = false;
  constructor(
    @Inject(ORDER_STORE) private readonly orderStore: OrderStore,
    @Inject(EXECUTION_STORE) private readonly executionStore: ExecutionStore,
    @Inject(TRIGGER_PRICE) private readonly primary: TriggerPricePort,
    @Inject(TRIGGER_HINT) private readonly hint: TriggerPricePort,
    @Inject(KILL_SWITCH) private readonly killSwitch: KillSwitchPort,
    @Inject(JOB_QUEUE) private readonly jobQueue: JobQueuePort,
  ) {}

  async execute(): Promise<TriggerEvaluation[]> {
    // OW-2 option (a): a slow tick must never overlap the next one —
    // overlapping ticks double-enqueue the same slots.
    if (this.ticking) {
      return [];
    }
    this.ticking = true;
    try {
      const killState = await this.killSwitch.getState();
      if (killState.mode !== 'off') {
        return [];
      }
      const nowMs = Date.now();
      const open = await this.orderStore.findOpen();
      const evaluations: TriggerEvaluation[] = [];

      for (const order of open) {
        if (order.type === 'dca') {
          const evaluation = await this.tickDca(order, nowMs);
          if (evaluation) {
            evaluations.push(evaluation);
          }
        } else if (order.type === 'limit') {
          const evaluation = await this.tickLimit(order, nowMs);
          evaluations.push(evaluation);
        }
        // stop/twap are rejected at creation; ignore defensively.
      }
      return evaluations;
    } finally {
      this.ticking = false;
    }
  }

  private async tickDca(
    order: Order,
    nowMs: number,
  ): Promise<TriggerEvaluation | null> {
    const intervalMs = order.interval ? isoDurationToMs(order.interval) : null;
    if (intervalMs === null) {
      return null; // invalid data; creation validation is the guard
    }
    const slot = dcaSlotFor({
      createdAtMs: Date.parse(order.createdAt),
      intervalMs,
      nowMs,
    });
    // Slot already claimed (this tick, a prior tick, or a redelivery)?
    if (await this.executionStore.findById(`${order.id}:${slot.slotKey}`)) {
      return null;
    }
    const evaluation = evaluateDcaSlot({
      order,
      slotKey: slot.slotKey,
      primary: await this.primary.getPrint({
        chain: order.chain,
        baseAsset: order.baseAsset,
        quoteAsset: order.quoteAsset,
      }),
      hint: await this.hint.getPrint({
        chain: order.chain,
        baseAsset: order.baseAsset,
        quoteAsset: order.quoteAsset,
      }),
      nowMs,
    });
    await this.jobQueue.enqueueExecution(order.id, slot.slotKey);
    return evaluation;
  }

  private async tickLimit(
    order: Order,
    nowMs: number,
  ): Promise<TriggerEvaluation> {
    const evaluation = evaluateLimitTrigger({
      order,
      primary: await this.primary.getPrint({
        chain: order.chain,
        baseAsset: order.baseAsset,
        quoteAsset: order.quoteAsset,
      }),
      hint: await this.hint.getPrint({
        chain: order.chain,
        baseAsset: order.baseAsset,
        quoteAsset: order.quoteAsset,
      }),
      nowMs,
    });
    // Limit orders fire at most once: any prior execution (claimed or
    // terminal) means the one-shot was already spent.
    if (evaluation.outcome !== 'triggered') {
      return evaluation;
    }
    const prior = await this.executionStore.findByOrderId(order.id);
    // M2 re-arm: an execution-time limit rejection (order left open)
    // did NOT spend the one-shot; every other prior record did.
    if (prior.some((record) => !isLimitRejection(record))) {
      return {
        ...evaluation,
        outcome: 'armed',
        detail: 'one-shot already spent; trigger suppressed',
      };
    }
    await this.jobQueue.enqueueExecution(order.id, LIMIT_SLOT_KEY);
    return evaluation;
  }
}
