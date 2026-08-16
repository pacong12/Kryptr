import type { ApiError, WorkerErrorCode } from '@kryptr/shared-types';
import { WORKER_ERROR_CODES } from '@kryptr/shared-types';

/** Human copy for one worker envelope-error code. Never a stack trace. */
export interface WorkerErrorMeta {
  title: string;
  message: string;
}

/**
 * Human messages for EVERY frozen `WORKER_ERROR_CODES` member (wave-4 freeze
 * §2). The UI maps envelope codes to this copy for toasts/Alerts; unknown
 * codes fall back to the envelope's own message, never to raw internals.
 */
const WORKER_ERROR_MESSAGES: Record<WorkerErrorCode, WorkerErrorMeta> = {
  worker_unavailable: {
    title: 'Order worker unavailable',
    message:
      "The order worker can't be reached right now. Your existing orders are untouched; creation and scheduling pause until it returns.",
  },
  order_not_found: {
    title: 'Order not found',
    message:
      'This order no longer exists. Refresh the order list to see the current state.',
  },
  order_not_live: {
    title: "Order isn't live",
    message:
      'Only live orders accept this action. This order has already moved to a pending or terminal state.',
  },
  order_type_unsupported: {
    title: 'Order type not supported',
    message:
      'Wave 4 supports limit and DCA orders. Stop and TWAP are rejected explicitly — nothing was created.',
  },
  trigger_price_unknown: {
    title: 'Trigger price unknown',
    message:
      'No oracle price is available, so nothing triggers. The order stays open and the next check retries — Kryptr never triggers on a guessed price.',
  },
  trigger_price_stale: {
    title: 'Trigger price stale',
    message:
      'The newest oracle reading is too old to trust, so the trigger was skipped. The order stays open until a fresh price arrives.',
  },
  kill_switch_active: {
    title: 'Kill switch active',
    message:
      'The kill switch is blocking this action. New executions are refused until an operator changes the mode.',
  },
  duplicate_execution: {
    title: 'Duplicate execution blocked',
    message:
      'This order slot was already claimed; the exactly-once guard blocked the repeat. Nothing was executed twice.',
  },
  execution_gate_rejected: {
    title: 'Security gate rejected the execution',
    message:
      "The security gate blocked this order's execution attempt. Review the intent in the wallet's security timeline.",
  },
  quote_unavailable: {
    title: 'Execution quote unavailable',
    message:
      'No execution quote could be fetched, so the attempt failed closed. Nothing was submitted on-chain.',
  },
};

/**
 * Resolve human copy for an envelope error. Known worker codes map to the
 * frozen messages; anything else surfaces the envelope's own message so the
 * UI still degrades honestly instead of dropping the error.
 */
export function workerErrorMeta(error: ApiError | null): WorkerErrorMeta {
  if (error === null) {
    return {
      title: 'Something went wrong',
      message: 'An unexpected error occurred. No changes were made.',
    };
  }
  const known = (WORKER_ERROR_CODES as readonly string[]).includes(error.code)
    ? WORKER_ERROR_MESSAGES[error.code as WorkerErrorCode]
    : null;
  if (known !== null) return known;
  return { title: 'Order action failed', message: error.message };
}

/**
 * Exhaustiveness guard: fails typecheck if a new code joins
 * `WORKER_ERROR_CODES` without a message here (freeze §2 demands full
 * coverage). Returns the count so tests can assert parity.
 */
export const WORKER_ERROR_MESSAGE_COUNT: number = Object.keys(
  WORKER_ERROR_MESSAGES,
).length;
