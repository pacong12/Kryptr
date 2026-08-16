import type { ChainId, TokenHolding } from '@kryptr/shared-types';
import { DomainError } from '../common/domain-error';
import type { ChainReader } from './chain-reader.port';
import { StaticMockChainReader } from './static-mock-chain.reader';
import type { ViemClientPort } from './viem-client.port';

/**
 * Known Base ERC-20s the reader multicalls. Discovery (Blockscout) lands
 * in a later wave; this wave reads a fixed, audited list only.
 * Robinhood Chain's official RPC (rpc.mainnet.gateway.robinhood.com —
 * NOT the lookalike rpc.robinhood.com) goes real in wave 4; until then
 * robinhood-chain stays on the static mock.
 */
const BASE_KNOWN_TOKENS: ReadonlyArray<{
  address: `0x${string}`;
  symbol: string;
  decimals: number;
}> = [
  {
    address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    symbol: 'USDC',
    decimals: 6,
  },
];

export class ViemChainReader implements ChainReader {
  constructor(
    private readonly viem: ViemClientPort,
    private readonly fallback: ChainReader = new StaticMockChainReader(),
  ) {}

  async getNativeBalance(
    chain: ChainId,
    address: `0x${string}`,
  ): Promise<string> {
    if (chain !== 'base') {
      return this.fallback.getNativeBalance(chain, address);
    }
    try {
      return await this.viem.getNativeBalance(address);
    } catch {
      throw new DomainError(
        'chain_unavailable',
        'Base RPC is unreachable; native balance cannot be read',
        502,
      );
    }
  }

  async getTokenBalances(
    chain: ChainId,
    address: `0x${string}`,
  ): Promise<TokenHolding[]> {
    if (chain !== 'base') {
      return this.fallback.getTokenBalances(chain, address);
    }
    try {
      const balances = await this.viem.getTokenBalances(
        address,
        BASE_KNOWN_TOKENS.map((token) => token.address),
      );
      const byToken = new Map(
        balances.map((entry) => [entry.token.toLowerCase(), entry.balance]),
      );
      return BASE_KNOWN_TOKENS.filter((token) =>
        byToken.has(token.address.toLowerCase()),
      ).map((token) => ({
        contractAddress: token.address,
        symbol: token.symbol,
        decimals: token.decimals,
        amount: byToken.get(token.address.toLowerCase()) as string,
      }));
    } catch {
      throw new DomainError(
        'chain_unavailable',
        'Base RPC is unreachable; token balances cannot be read',
        502,
      );
    }
  }
}
