import { Inject, Injectable } from '@nestjs/common';
import {
  DECISION_AUDIT,
  type DecisionAudit,
} from '../../security/application/ports';
import { ORDER_STORE, type OrderStore } from '../domain/order-store.port';
import {
  EXECUTION_STORE,
  type ExecutionStore,
} from '../domain/execution-store.port';

/**
 * Retry-exhaustion finalizer (review M1, freeze §1: triggered -> failed).
 * Wired to the BullMQ worker's 'failed' event once attempts are used up:
 * the slot's execution record is finalized 'failed', the order is failed
 * (only while still live), and a forensic audit entry is appended under
 * the deterministic intent id. Idempotent — an already-terminal record
 * or terminal order is left untouched.
 *
 * The audit entry uses result 'rejected' with an explicit
 * 'retry_exhausted (worker, not gate)' prefix: the GATE never decided —
 * infrastructure gave up. The prefix keeps backoffice forensics honest.
 */
@Injectable()
export class FinalizeFailedExecutionUseCase {
  constructor(
    @Inject(EXECUTION_STORE) private readonly executionStore: ExecutionStore,
    @Inject(ORDER_STORE) private readonly orderStore: OrderStore,
    @Inject(DECISION_AUDIT) private readonly audit: DecisionAudit,
  ) {}

  async execute(input: {
    orderId: string;
    slotKey: string;
    reason: string;
  }): Promise<void> {
    const at = new Date().toISOString();
    const id = `${input.orderId}:${input.slotKey}`;
    const record = await this.executionStore.findById(id);

    // Patch only NON-TERMINAL records; a terminal record already holds
    // its own forensics and is never overwritten. A missing record
    // means the crash happened before the claim — the order and audit
    // still need the trail below.
    if (
      record &&
      (record.status === 'claimed' ||
        record.status === 'quoted' ||
        record.status === 'cancelled')
    ) {
      await this.executionStore.update(record.id, {
        status: 'failed',
        finishedAt: at,
        detail: `retry_exhausted: ${input.reason}`,
      });
    }

    const order = await this.orderStore.findById(input.orderId);
    if (order && (order.status === 'open' || order.status === 'triggered')) {
      await this.orderStore
        .setStatus(order.id, 'failed', at)
        .catch(() => undefined);
    }

    await this.audit.append({
      intentId: record?.intentId ?? `intent:${id}`,
      result: 'rejected',
      reason: `retry_exhausted (worker, not gate): ${input.reason}`,
      decidedAt: at,
      decisionUsd: null,
    });
  }
}
