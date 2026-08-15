import type { ChainId } from './chains.js';

export interface AgentWallet {
  /** Deterministic wallet id (never expose raw address as id). */
  id: string;
  address: `0x${string}`;
  /** Owning agent or user account. */
  ownerId: string;
  chains: ChainId[];
  createdAt: string;
  /** ISO timestamp; null = never rotated. */
  lastKeyRotationAt: string | null;
}

export interface WalletBalance {
  walletId: string;
  chain: ChainId;
  /** Wei (string to avoid number precision loss). */
  nativeBalance: string;
  tokens: TokenHolding[];
}

export interface TokenHolding {
  contractAddress: `0x${string}` | null;
  symbol: string;
  decimals: number;
  /** Raw units as string. */
  amount: string;
}
