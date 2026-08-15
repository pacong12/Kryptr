import { ref } from 'vue';
import type { AgentWallet, ApiError } from '@kryptr/shared-types';
import { apiGet, apiPost, isNetworkError } from '@/lib/api';
import { MOCK_WALLETS, createMockWallet, randomAddress } from '@/lib/fixtures';

/**
 * Owns the wallet list data flow: components never fetch directly.
 * Falls back to fixture wallets (mock mode) when the API is unreachable.
 */
export function useWallets() {
  const wallets = ref<AgentWallet[]>([]);
  // Starts loading: data is unavailable until the first refresh resolves,
  // which prevents empty-state flashes before onMounted fetches kick in.
  const loading = ref(true);
  const connected = ref(false);
  const mockMode = ref(false);
  const error = ref<ApiError | null>(null);

  async function refresh(): Promise<void> {
    loading.value = true;
    error.value = null;
    const result = await apiGet<AgentWallet[]>('/wallets');
    if (result.ok && result.data) {
      wallets.value = result.data;
      mockMode.value = false;
    } else if (isNetworkError(result.error)) {
      wallets.value = MOCK_WALLETS;
      mockMode.value = true;
    } else {
      wallets.value = [];
      error.value = result.error ?? {
        code: 'unknown',
        message: 'Unable to load wallets.',
      };
    }
    loading.value = false;
  }

  /** Wave 1 mock connect: flips the session flag and ensures data is loaded. */
  async function connect(): Promise<void> {
    connected.value = true;
    if (wallets.value.length === 0) {
      await refresh();
    }
  }

  async function createWallet(): Promise<void> {
    error.value = null;
    if (mockMode.value) {
      wallets.value = [...wallets.value, createMockWallet()];
      return;
    }
    // Matches apps/api CreateWalletDto: ownerId + client-generated address +
    // at least one supported chain. Wave 1 has no auth, so ownerId is demo.
    const result = await apiPost<AgentWallet>('/wallets', {
      ownerId: 'demo-user',
      address: randomAddress(),
      chains: ['base'],
    });
    if (result.ok && result.data) {
      wallets.value = [...wallets.value, result.data];
    } else if (isNetworkError(result.error)) {
      mockMode.value = true;
      wallets.value = [...wallets.value, createMockWallet()];
    } else {
      error.value = result.error;
    }
  }

  return {
    wallets,
    loading,
    connected,
    mockMode,
    error,
    refresh,
    connect,
    createWallet,
  };
}
