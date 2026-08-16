import type { ChainReaderHealth, FeedHealth } from '@kryptr/shared-types';

/**
 * Narrow viem seam: everything the API needs from a viem public client.
 * CHAIN_MODE=static binds a zero-network stub; CHAIN_MODE=viem binds the
 * real client. Tests stub THIS port — the viem import is confined to
 * RealViemClient. No signing lives here or anywhere behind this port.
 */
export const VIEM_CLIENT = 'chain.viem-client';

export interface ViemClientPort {
  /** Native balance in wei (decimal string). Throws on RPC failure. */
  getNativeBalance(address: `0x${string}`): Promise<string>;
  /**
   * Raw ERC-20 balances via multicall; reverted calls are omitted.
   * Throws on RPC failure.
   */
  getTokenBalances(
    owner: `0x${string}`,
    tokens: `0x${string}`[],
  ): Promise<Array<{ token: `0x${string}`; balance: string }>>;
  /** Latest block number, or null when the RPC is unreachable. Never throws. */
  lastBlockNumber(): Promise<bigint | null>;
  /** Feed-shaped health (feedId 'chain:base'); view of the last probe. */
  health(): FeedHealth;
  /**
   * Probes the RPC and reports reachability detail. NEVER exposes the raw
   * RPC URL (it may embed credentials). Never throws.
   */
  chainHealth(): Promise<ChainReaderHealth>;
}
