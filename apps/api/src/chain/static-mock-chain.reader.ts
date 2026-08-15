import { Injectable } from '@nestjs/common';
import type { ChainId, TokenHolding } from '@kryptr/shared-types';
import type { ChainReader } from './chain-reader.port';

/**
 * Static mock chain data for Wave 1: deterministic, address-independent,
 * zero network calls. Real viem/Blockscout client lands in Wave 2 behind
 * the same ChainReader port.
 */

const NATIVE_BALANCES: Record<ChainId, string> = {
  base: '1500000000000000000', // 1.5 ETH
  'robinhood-chain': '100000000000000000000', // 100 native
  ethereum: '0',
  arbitrum: '0',
  polygon: '0',
  solana: '0',
};

const TOKEN_BALANCES: Record<ChainId, TokenHolding[]> = {
  base: [
    {
      contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      symbol: 'USDC',
      decimals: 6,
      amount: '2500000000', // 2500 USDC
    },
  ],
  'robinhood-chain': [
    {
      contractAddress: '0x3333333333333333333333333333333333333333',
      symbol: 'RHC',
      decimals: 18,
      amount: '75000000000000000000', // 75 RHC
    },
  ],
  ethereum: [],
  arbitrum: [],
  polygon: [],
  solana: [],
};

@Injectable()
export class StaticMockChainReader implements ChainReader {
  async getNativeBalance(
    chain: ChainId,
    _address: `0x${string}`,
  ): Promise<string> {
    return NATIVE_BALANCES[chain] ?? '0';
  }

  async getTokenBalances(
    chain: ChainId,
    _address: `0x${string}`,
  ): Promise<TokenHolding[]> {
    return [...(TOKEN_BALANCES[chain] ?? [])];
  }
}
