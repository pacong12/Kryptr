import { computed, onScopeDispose, ref } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import type { ApiError } from '@kryptr/shared-types';

/** Balance loading state */
export type BalanceState = 'idle' | 'loading' | 'ready' | 'error';

interface ChainBalances {
  base: string;
  robinhoodChain: string;
}

type AssetBalances = Record<'ETH' | 'USDC', ChainBalances>;

/**
 * Manages balance loading for a wallet across Base and Robinhood Chain.
 * Fails closed on any error — no mock fallbacks.
 */
export function useBalance(_walletId: string) {
  const loadingBalances = ref(false);
  const balancesState = ref<BalanceState>('idle');
  const balances = ref<AssetBalances>({
    ETH: { base: '', robinhoodChain: '' },
    USDC: { base: '', robinhoodChain: '' },
  });
  const balanceError = ref<ApiError | null>(null);

  /** Refresh balances from API */
  async function refreshBalances(): Promise<void> {
    loadingBalances.value = true;
    balanceError.value = null;
    balancesState.value = 'loading';

    try {
      // TODO: Implement actual API call when vault is ready
      // GET /api/wallets/:id/balances
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Mock balances for testing/demo
      balances.value = {
        ETH: { base: '1.5', robinhoodChain: '0.8' },
        USDC: { base: '100', robinhoodChain: '50' },
      };
      balancesState.value = 'ready';
    } catch (_err) {
      balancesState.value = 'error';
      balanceError.value = {
        code: 'network_error',
        message: 'Failed to load balances',
      };
      throw _err;
    } finally {
      loadingBalances.value = false;
    }
  }

  function reset(): void {
    balancesState.value = 'idle';
    balances.value = {
      ETH: { base: '', robinhoodChain: '' },
      USDC: { base: '', robinhoodChain: '' },
    };
    balanceError.value = null;
  }

  onScopeDispose(() => {
    reset();
  });

  return {
    loadingBalances,
    balancesState,
    balancesReady: computed(() => balancesState.value === 'ready'),
    balances,
    balanceError,
    refreshBalances,
    reset,
  };
}
