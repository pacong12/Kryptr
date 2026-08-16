'use server';

import { requestLaunchDecision } from '@/lib/api';

/**
 * Wave-5 HITL deploy decision: every approve/reject is an audited server
 * action. The mutation itself lives in api.ts (requestLaunchDecision); this
 * wrapper validates operator input and maps the outcome to a human message.
 * An unreachable launchpad API yields an HONEST failure — a deploy approval
 * must never report success it did not achieve (kill-switch precedent).
 */

export type LaunchDecision = 'approved' | 'rejected';

export interface LaunchDecisionResult {
  ok: boolean;
  /** Envelope error code, or 'launchpad_unavailable' when unreachable. */
  code?: string;
  message: string;
}

export async function decideLaunchReview(
  launchId: string,
  decision: LaunchDecision,
  reason: string,
): Promise<LaunchDecisionResult> {
  if (decision !== 'approved' && decision !== 'rejected') {
    return { ok: false, message: 'Decision must be approved or rejected.' };
  }
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      message: 'A reason is required — launch decisions are audited.',
    };
  }

  const outcome = await requestLaunchDecision(launchId, decision, trimmed);
  if (outcome.applied && outcome.request !== null) {
    return {
      ok: true,
      message: `Launch ${decision}. The decision was recorded.`,
    };
  }

  const code = outcome.code ?? 'launchpad_unavailable';
  return {
    ok: false,
    code,
    message: `Launchpad review unavailable (${code}) — the decision was NOT recorded.`,
  };
}
