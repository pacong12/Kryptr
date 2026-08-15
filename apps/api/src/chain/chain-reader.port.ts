import type { ChainId, TokenHolding } from '@kryptr/shared-types';

/**
 * ChainReader port — the only way the api reads chain state.
 * Wave 2 implements it with viem + Blockscout; Wave 1 ships a static mock.
 * No signing lives here or anywhere behind this port.
 */

export const CHAIN_READER = 'chain.reader';

export interface ChainReader {
  /** Native balance in wei (string: no number precision loss). */
  getNativeBalance(chain: ChainId, address: `0x${string}`): Promise<string>;
  /** ERC-20 holdings for the address on the given chain. */
  getTokenBalances(
    chain: ChainId,
    address: `0x${string}`,
  ): Promise<TokenHolding[]>;
}
