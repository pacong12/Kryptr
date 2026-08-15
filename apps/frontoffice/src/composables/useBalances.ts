import { ref, toValue, type MaybeRefOrGetter } from 'vue';
import type { ApiError, WalletBalance } from '@kryptr/shared-types';
import { apiGet, isNetworkError } from '@/lib/api';
import { mockBalancesFor } from '@/lib/fixtures';

/**
 * Owns balance reads for one wallet: components never fetch directly.
 * Falls back to fixture balances (mock mode) when the API is unreachable.
 */
export function useBalances(walletId: MaybeRefOrGetter<string>) {
  const balances = ref<WalletBalance[]>([]);
  // Starts loading: data is unavailable until the first refresh resolves,
  // which prevents empty-state flashes before onMounted fetches kick in.
  const loading = ref(true);
  const mockMode = ref(false);
  const error = ref<ApiError | null>(null);

  async function refresh(): Promise<void> {
    const id = toValue(walletId);
    loading.value = true;
    error.value = null;
    const result = await apiGet<WalletBalance[]>(
      `/wallets/${encodeURIComponent(id)}/balances`,
    );
    if (result.ok && result.data) {
      balances.value = result.data;
      mockMode.value = false;
    } else if (isNetworkError(result.error)) {
      balances.value = mockBalancesFor(id);
      mockMode.value = true;
    } else {
      balances.value = [];
      error.value = result.error ?? {
        code: 'unknown',
        message: 'Unable to load balances.',
      };
    }
    loading.value = false;
  }

  return { balances, loading, mockMode, error, refresh };
}
