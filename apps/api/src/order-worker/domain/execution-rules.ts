import type { OrderExecution } from '@kryptr/shared-types';

/**
 * Execution-level rules shared by the scheduler and the slot executor.
 *
 * M2 ruling (Review54): a limit order whose execution-time re-quote no
 * longer satisfies the limit bound is rejected fail-closed with the
 * order left OPEN. Such an execution did NOT spend the one-shot — the
 * scheduler may re-trigger, and the claim slot may re-arm.
 *
 * D2 ruling (Review54 delta): an execution stopped by the kill switch
 * (detail 'kill_switch_active') also did NOT spend the one-shot —
 * freeze §3 intent: pause means resume when lifted, not permanent
 * dormancy.
 *
 * The marker is the execution detail; the frozen EXECUTION_STATUSES
 * shape is untouched.
 */

export const LIMIT_REJECTION_PREFIX = 'limit_price_violation';

/** Exact detail written by both kill-switch failure paths. */
export const KILL_STOP_DETAIL = 'kill_switch_active';

export function isLimitRejection(execution: OrderExecution): boolean {
  return (
    execution.status === 'failed' &&
    (execution.detail?.startsWith(LIMIT_REJECTION_PREFIX) ?? false)
  );
}

/**
 * True when a failed execution did NOT consume the limit one-shot:
 * limit-bound rejections and kill-switch stops. Such slots re-arm;
 * every other terminal record suppresses re-triggering.
 */
export function oneShotUnspent(execution: OrderExecution): boolean {
  if (execution.status !== 'failed') {
    return false;
  }
  return isLimitRejection(execution) || execution.detail === KILL_STOP_DETAIL;
}
