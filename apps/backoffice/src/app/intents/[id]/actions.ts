'use server';

import { decideIntent, type DecisionOutcome } from '@/lib/api';

/**
 * Server actions for the intent review flow. They keep the HTTP call to the
 * security gate on the server (no CORS exposure, api.ts stays out of the
 * client bundle) and return the serializable DecisionOutcome.
 */

export async function approveIntent(
  intentId: string,
): Promise<DecisionOutcome> {
  return decideIntent(intentId, 'approved');
}

export async function rejectIntent(intentId: string): Promise<DecisionOutcome> {
  return decideIntent(intentId, 'rejected');
}
