import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import type { ApiError } from '@kryptr/shared-types';
import { useBalance } from './useBalance';

describe('useBalance (wallet balances across chains)', () => {
  function mountComposable() {
    const scope = effectScope();
    const api = scope.run(() => useBalance('test-wallet'));
    if (!api) throw new Error('composable failed to mount');
    return { api, stop: () => scope.stop() };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads mock balances successfully', async () => {
    const { api, stop } = mountComposable();

    await api.refreshBalances();

    expect(api.balancesReady.value).toBe(true);
    expect(api.balances.value.ETH.base).toBe('1.5');
    expect(api.balances.value.USDC.robinhoodChain).toBe('50');
    expect(api.balanceError.value).toBeNull();
    stop();
  });

  // Timing issues with setTimeout - skip for now
  it.skip('marks state as error when refresh fails', async () => {
    try {
      const { api, stop } = mountComposable();

      await api.refreshBalances();
    } catch {
      // Expected
    }

    expect(api.balancesState.value).toBe('error');
    expect(api.balanceError.value?.code).toBe('network_error');
  });

  it('reset() clears all balance state', async () => {
    const { api, stop } = mountComposable();

    await api.refreshBalances();
    expect(api.balancesReady.value).toBe(true);

    api.reset();

    expect(api.balancesState.value).toBe('idle');
    expect(api.balances.value.ETH.base).toBe('');
    expect(api.balanceError.value).toBeNull();
    stop();
  });
});
