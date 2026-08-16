import { afterEach, describe, expect, it } from 'vitest';

import { setKillSwitchMode } from './actions';

/**
 * Wave-4 acceptance: the kill switch is confirm-gated, reason-mandatory and
 * HONEST — an unreachable worker API must produce an envelope-style failure,
 * never a fake success.
 */

const ORIGINAL_API_URL = process.env.NEXT_PUBLIC_API_URL;

afterEach(() => {
  if (ORIGINAL_API_URL === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = ORIGINAL_API_URL;
  }
});

describe('setKillSwitchMode (server action)', () => {
  it('rejects modes outside pause_new/cancel_active', async () => {
    const result = await setKillSwitchMode('off', 'resume automation');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('pause_new or cancel_active');
    expect(result.state).toBeUndefined();
  });

  it('requires a non-empty reason (audit discipline)', async () => {
    const result = await setKillSwitchMode('pause_new', '   ');
    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toContain('reason is required');
  });

  it('fails honestly when the worker API is unreachable', async () => {
    // Point at a port nothing listens on — fetch must refuse, and the action
    // must report failure with the worker_unavailable code.
    process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:59999';
    const result = await setKillSwitchMode(
      'cancel_active',
      'stale oracle feed',
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe('worker_unavailable');
    expect(result.message).toContain('NOT changed');
    expect(result.state).toBeUndefined();
  });
});
