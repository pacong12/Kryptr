import { computed } from 'vue';
import { useWallets } from './useWallets';

/**
 * Composable to detect current network (chain) and determine if mainnet or testnet
 * Used for UI warnings and production vs testnet mode detection
 */
export function useChainId() {
  const wallets = useWallets();
  
  return computed(() => {
    const currentWallet = wallets.wallets.value.find(w => w.isActive);
    // Default to testnet detection for safety - override this based on your wallet connection logic
    // This should read actual chain ID from connected wallet/rpc provider
    return currentWallet?.chainId || 'base-sepolia'; // Default to testnet
  });
}
