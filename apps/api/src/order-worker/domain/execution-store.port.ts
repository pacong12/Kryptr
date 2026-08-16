import type { OrderExecution } from '@kryptr/shared-types';

/**
 * Execution claims (wave 4) — the SpendLedger pattern applied to order
 * slots. The claim happens BEFORE any side effect and is the
 * exactly-once guard across worker restarts, redeliveries, and
 * concurrent workers. Deterministic id: '<orderId>:<slotKey>'.
 */

export const EXECUTION_STORE = 'order-worker.execution-store';

export interface ExecutionStore {
  /**
   * Atomically claim (orderId, slotKey). Returns the new execution, or
   * null when the slot was ALREADY claimed (duplicate/redelivery — the
   * caller must stop without side effects). Idempotent by identity.
   */
  claim(orderId: string, slotKey: string, at: string): Promise<OrderExecution | null>;
  findById(id: string): Promise<OrderExecution | null>;
  findByOrderId(orderId: string): Promise<OrderExecution[]>;
  /** Patch status/intentId/finishedAt/detail; append-only history is NOT required — the audit timeline owns forensics. */
  update(
    id: string,
    patch: Partial<Pick<OrderExecution, 'status' | 'intentId' | 'finishedAt' | 'detail'>>,
  ): Promise<OrderExecution>;
}
