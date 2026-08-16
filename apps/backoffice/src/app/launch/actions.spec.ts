import { afterEach, describe, expect, it } from 'vitest';

import { decideLaunchReview } from './actions';

/**
 * Wave-5 acceptance: the HITL deploy decision is reason-mandatory and
 * HONEST — an unreachable launchpad API must produce an envelope-style
 * failure, never a fake success (kill-switch precedent).
 */

const ORIGINAL_API_URL = process.env.NEXT_PUBLIC_API_URL;

afterEach(() => {
  if (ORIGINAL_API_URL === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = ORIGINAL_API_URL;
  }
});

describe('decideLaunchReview (server action)', () => {
  it('rejects decisions outside approved/rejected', async () => {
    const result = await decideLaunchReview(
      'lr_pending_memecoin',
      'deployed' as never,
      'attempted shortcut',
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain('approved or rejected');
  });

  it('requires a non-empty reason (audit discipline)', async () => {
    const result = await decideLaunchReview(
      'lr_pending_memecoin',
      'approved',
      '   ',
    );
    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toContain('reason is required');
  });

  it('fails honestly when the launchpad API is unreachable', async () => {
    // Point at a port nothing listens on — fetch must refuse, and the action
    // must report failure with the launchpad_unavailable code.
    process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:59999';
    const result = await decideLaunchReview(
      'lr_pending_memecoin',
      'rejected',
      'verification missing',
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe('launchpad_unavailable');
    expect(result.message).toContain('NOT recorded');
  });
});
