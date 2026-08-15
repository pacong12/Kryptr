import type { ChainId } from './chains.js';

export interface Token {
  contractAddress: `0x${string}`;
  chain: ChainId;
  name: string;
  symbol: string;
  decimals: number;
  launchedByAgentId: string | null;
  launchedAt: string;
}

/** Fee schedule is fixed at launch (Bankr model). */
export interface TokenFeeSchedule {
  /** Share of volume to creator, e.g. 0.00665. */
  creatorShare: number;
  /** Locked LP fee share. */
  lpShare: number;
  /** Protocol fee share. */
  protocolShare: number;
  /** Buyback share. */
  buybackShare: number;
}

export interface TokenLaunch {
  token: Token;
  feeSchedule: TokenFeeSchedule;
  launchedAt: string;
}
