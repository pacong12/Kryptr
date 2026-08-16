import type { OrderExecution } from '@kryptr/shared-types';

/**
 * Execution-level rules shared by the scheduler and the slot executor.
 *
 * M2 ruling (Review54): a limit order whose execution-time re-quote no
 * longer satisfies the limit bound is rejected fail-closed with the
 * order left OPEN. Such an execution did NOT spend the one-shot — the
 * scheduler may re-trigger, and the claim slot may re-arm. The marker
 * is the execution detail prefix; the frozen EXECUTION_STATUSES shape
 * is untouched.
 */

export const LIMIT_REJECTION_PREFIX = 'limit_price_violation';

export function isLimitRejection(execution: OrderExecution): boolean {
  return (
    execution.status === 'failed' &&
    (execution.detail?.startsWith(LIMIT_REJECTION_PREFIX) ?? false)
  );
}
