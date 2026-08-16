import type { WorkerErrorCode } from '@kryptr/shared-types';

import { humanize } from './format';

/**
 * Wave 4: human messages for the frozen worker envelope-error codes
 * (docs/research/wave4-contract-freeze.md §2). DeckUI owns this map — the
 * UI never shows a stack trace, only code + message.
 */
export const WORKER_ERROR_MESSAGES: Record<WorkerErrorCode, string> = {
  worker_unavailable:
    'The order worker is unavailable — automation is temporarily down.',
  order_not_found: 'This order does not exist.',
  order_not_live: 'This order is no longer live (terminal state).',
  order_type_unsupported: 'This order type is not supported yet.',
  trigger_price_unknown:
    'Trigger price unknown — the order stays open and the next evaluation retries.',
  trigger_price_stale:
    'Trigger price is stale — this evaluation was skipped and the order stays open.',
  kill_switch_active: 'The kill switch is active — execution is blocked.',
  duplicate_execution: 'This execution slot was already claimed.',
  execution_gate_rejected: 'The security gate rejected this execution.',
  quote_unavailable: 'No quote is available for this execution.',
};

/** Human description for a worker error code (tolerates unknown codes). */
export function describeWorkerError(code: string): string {
  const known = (WORKER_ERROR_MESSAGES as Record<string, string>)[code];
  return known ?? `Worker error: ${humanize(code)}.`;
}
