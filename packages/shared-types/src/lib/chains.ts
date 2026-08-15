/** Supported chains (phase 1 focus: Base + Robinhood Chain). */
export const CHAINS = [
  'base',
  'robinhood-chain',
  'ethereum',
  'arbitrum',
  'polygon',
  'solana',
] as const;

export type ChainId = (typeof CHAINS)[number];

export interface ChainConfig {
  id: ChainId;
  chainId: number;
  rpcUrl: string;
  explorerUrl?: string;
  gasSponsored: boolean;
}
