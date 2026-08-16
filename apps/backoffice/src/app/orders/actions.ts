'use server';

import type { KillSwitchMode, KillSwitchState } from '@kryptr/shared-types';

import { requestKillSwitchMode } from '@/lib/api';
import { humanize } from '@/lib/format';
import { describeWorkerError } from '@/lib/order-errors';

/**
 * Wave-4 kill switch (freeze §3): every mode change is an audited server
 * action. The mutation itself lives in api.ts (requestKillSwitchMode); this
 * wrapper validates operator input and maps the outcome to a human message.
 * An unreachable worker API yields an HONEST failure — a kill switch must
 * never report success it did not achieve.
 */

export interface KillSwitchActionResult {
  ok: boolean;
  /** New state, present only on success. */
  state?: KillSwitchState;
  /** Worker envelope error code, or 'worker_unavailable' when unreachable. */
  code?: string;
  message: string;
}

/** Allowed target modes from the panel ('off' is never set from the dialog). */
const TARGET_MODES: readonly KillSwitchMode[] = ['pause_new', 'cancel_active'];

export async function setKillSwitchMode(
  mode: KillSwitchMode,
  reason: string,
): Promise<KillSwitchActionResult> {
  const trimmed = reason.trim();
  if (!TARGET_MODES.includes(mode)) {
    return { ok: false, message: 'Pick pause_new or cancel_active.' };
  }
  if (trimmed.length === 0) {
    return {
      ok: false,
      message: 'A reason is required — kill-switch changes are audited.',
    };
  }

  const outcome = await requestKillSwitchMode(mode, trimmed);
  if (outcome.applied && outcome.state !== null) {
    return {
      ok: true,
      state: outcome.state,
      message: `Kill switch set to ${humanize(mode)}.`,
    };
  }

  const code = outcome.code ?? 'worker_unavailable';
  return {
    ok: false,
    code,
    message: `${describeWorkerError(code)} The kill switch was NOT changed.`,
  };
}
