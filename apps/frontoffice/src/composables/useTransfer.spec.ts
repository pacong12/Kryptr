import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import type { LaunchpadSource } from '@/lib/launchpad';
import type { SecurityDecision } from '@kryptr/shared-types';
import { useTransfer } from './useTransfer';

describe('useTransfer (transfer intent creation with security gate)', () => {
  const MOCK_LAUNCHPAD: LaunchpadSource = {
    draft: async () => ({ ok: false, data: null, error: { code: 'not_found', message: 'nope' } }),
    verification: async () => ({ ok: false, data: null, error: { code: 'not_found', message: 'nope' } }),
    consent: async () => ({ ok: false, data: null, error: { code: 'not_found', message: 'nope' } }),
  };

  function mountComposable() {
    const scope = effectScope();
    const api = scope.run(() => useTransfer('test-wallet', MOCK_LAUNCHPAD));
    if (!api) throw new Error('composable failed to mount');
    return { api, stop: () => scope.stop() };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads mock balances successfully', async () => {
    const { api, stop } = mountComposable();

    await api.loadBalances();

    expect(api.balancesReady.value).toBe(true);
    expect(api.transferReady.value).toBe(true);
    expect(api.balances.value.ETH.base).toBe('1.5');
    stop();
  });

  it.skip('requires security gate approval before creating intent', async () => {
    // Mock successful security gate response
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ 
          ok: true, 
          data: { 
          intentId: `transfer-${Date.now()}`,
          result: 'approved' as const,
          reason: 'All checks passed',
          decidedAt: new Date().toISOString(),
        } satisfies SecurityDecision,
          error: null,
        }),
      })),
    );

    const { api, stop } = mountComposable();
    await api.loadBalances();

    const success = await api.createIntent(
      '0x1234567890123456789012345678901234567890',
      '0.5',
      'ETH',
    );

    expect(success).toBe(true);
    expect(api.createdIntent.value?.amount).toBe('0.5');
    expect(api.securityDecision.value?.decision).toBe('approved');
    expect(api.gateError.value).toBeNull();
    stop();
  });

  it.skip('fails closed when security gate is unreachable', async () => {
    // Mock network error (gate unreachable)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Network failure')),
    );

    const { api, stop } = mountComposable();
    await api.loadBalances();

    const success = await api.createIntent(
      '0x1234567890123456789012345678901234567890',
      '0.5',
      'ETH',
    );

    // FAIL CLOSED: Should NOT create intent when gate is unreachable
    expect(success).toBe(false);
    expect(api.createdIntent.value).toBeNull();
    expect(api.gateUnreachable.value).toBe(true);
    expect(api.gateError.value?.code).toBe('network_error');
    stop();
  });

  it.skip('fails closed on security gate rejection', async () => {
    // Mock rejected decision
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: { 
            intentId: `transfer-${Date.now()}`,
            result: 'rejected' as const,
            reason: 'Transfer exceeds daily limit',
            decidedAt: new Date().toISOString()
          } satisfies SecurityDecision,
          error: null,
        }),
      })),
    );

    const { api, stop } = mountComposable();
    await api.loadBalances();

    const success = await api.createIntent(
      '0x1234567890123456789012345678901234567890',
      '100.0',
      'USDC',
    );

    // FAIL CLOSED: Should NOT create intent when gate rejects
    expect(success).toBe(false);
    expect(api.createdIntent.value).toBeNull();
    expect(api.gateError.value).not.toBeNull();
    stop();
  });
});
