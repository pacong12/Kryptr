import { WORKER_ERROR_CODES } from '@kryptr/shared-types';
import { describe, expect, it } from 'vitest';

import { describeWorkerError, WORKER_ERROR_MESSAGES } from './order-errors';

/**
 * Wave-4 acceptance: the frozen worker error codes map to human messages.
 * The UI never shows a stack trace, and every code in the freeze gets an
 * explicit entry (exhaustiveness).
 */
describe('worker error-code mapping', () => {
  it('covers every frozen WORKER_ERROR_CODES member exactly', () => {
    for (const code of WORKER_ERROR_CODES) {
      const message = WORKER_ERROR_MESSAGES[code];
      expect(message, `missing message for ${code}`).toBeTruthy();
      // Human sentence, never the raw identifier alone.
      expect(message).not.toBe(code);
      expect(message.length).toBeGreaterThan(10);
    }
    expect(Object.keys(WORKER_ERROR_MESSAGES).sort()).toEqual(
      [...WORKER_ERROR_CODES].sort(),
    );
  });

  it('describeWorkerError returns the mapped message for known codes', () => {
    expect(describeWorkerError('kill_switch_active')).toBe(
      WORKER_ERROR_MESSAGES.kill_switch_active,
    );
    expect(describeWorkerError('trigger_price_stale')).toBe(
      WORKER_ERROR_MESSAGES.trigger_price_stale,
    );
  });

  it('keeps trigger_price_unknown/stale non-fatal in the copy', () => {
    // Freeze §2: unknown/stale trigger prices must not imply the order failed.
    expect(WORKER_ERROR_MESSAGES.trigger_price_unknown.toLowerCase()).toContain(
      'stays open',
    );
    expect(WORKER_ERROR_MESSAGES.trigger_price_stale.toLowerCase()).toContain(
      'stays open',
    );
  });

  it('falls back to a humanized message for unknown codes', () => {
    expect(describeWorkerError('brand_new_code')).toBe(
      'Worker error: brand new code.',
    );
  });

  it('never exposes stack traces in any message', () => {
    for (const code of WORKER_ERROR_CODES) {
      expect(WORKER_ERROR_MESSAGES[code]).not.toMatch(
        /stack|traceback|at\s+\S+\s+\(/i,
      );
    }
  });
});
