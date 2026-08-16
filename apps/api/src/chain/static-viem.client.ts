import type { ChainReaderHealth, FeedHealth } from '@kryptr/shared-types';
import type { ViemClientPort } from './viem-client.port';

/**
 * Zero-network ViemClientPort binding for CHAIN_MODE=static (the default).
 * Deterministic, address-independent, mirrors the StaticMockChainReader
 * tables so static-mode balances stay consistent across ports.
 */

const STATIC_NATIVE_WEI = '1500000000000000000'; // 1.5 ETH
const STATIC_BLOCK_NUMBER = 12_345_678n;
const STATIC_BLOCK_AT = '2026-01-01T00:00:00.000Z';

const STATIC_TOKEN_BALANCES: Record<string, string> = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': '2500000000', // 2500 USDC
};

export class StaticViemClient implements ViemClientPort {
  async getNativeBalance(_address: `0x${string}`): Promise<string> {
    return STATIC_NATIVE_WEI;
  }

  async getTokenBalances(
    _owner: `0x${string}`,
    tokens: `0x${string}`[],
  ): Promise<Array<{ token: `0x${string}`; balance: string }>> {
    return tokens
      .filter((token) => STATIC_TOKEN_BALANCES[token] !== undefined)
      .map((token) => ({ token, balance: STATIC_TOKEN_BALANCES[token] }));
  }

  async lastBlockNumber(): Promise<bigint | null> {
    return STATIC_BLOCK_NUMBER;
  }

  health(): FeedHealth {
    return {
      feedId: 'chain:base',
      source: 'static',
      status: 'healthy',
      lastUpdateAt: STATIC_BLOCK_AT,
      priceAgeSec: null,
    };
  }

  async chainHealth(): Promise<ChainReaderHealth> {
    return {
      chainId: 'base',
      provider: 'static-mock',
      reachable: true,
      blockHeight: Number(STATIC_BLOCK_NUMBER),
      latencyMs: 0,
      lastBlockAt: STATIC_BLOCK_AT,
    };
  }
}
