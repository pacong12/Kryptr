import { createHash } from 'node:crypto';
import type { AgentWallet, ChainId } from '@kryptr/shared-types';
import { ChainNotAllowedError, InvalidAddressError } from './wallet.errors';

/**
 * Wallet entity rules. Pure domain logic: no NestJS, no I/O.
 * The AgentWallet shape itself is the shared contract
 * (@kryptr/shared-types) — this module guards it.
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Phase-1 wallet chain allowlist (docs/ORCHESTRA.md goal: Base +
 * Robinhood Chain). Extending it is a deliberate domain decision, not a
 * client choice — the DTO may accept every known ChainId, the entity does
 * not.
 */
export const WALLET_ALLOWED_CHAINS: readonly ChainId[] = [
  'base',
  'robinhood-chain',
];

export function isValidAddress(value: string): boolean {
  return ADDRESS_RE.test(value);
}

/**
 * Deterministic wallet id derived from owner + address. Never the raw
 * address itself (shared-types contract: "never expose raw address as
 * id"), and stable across restarts of the in-memory store.
 */
export function walletIdFor(ownerId: string, address: string): string {
  return createHash('sha256')
    .update(`${ownerId}:${address.toLowerCase()}`)
    .digest('hex')
    .slice(0, 24);
}

export interface BuildWalletInput {
  ownerId: string;
  address: `0x${string}`;
  chains: ChainId[];
  now?: Date;
}

export function buildWallet(input: BuildWalletInput): AgentWallet {
  if (!isValidAddress(input.address)) {
    throw new InvalidAddressError(input.address);
  }
  if (input.chains.length === 0) {
    throw new ChainNotAllowedError('(none provided)');
  }
  for (const chain of input.chains) {
    if (!WALLET_ALLOWED_CHAINS.includes(chain)) {
      throw new ChainNotAllowedError(chain);
    }
  }
  return {
    id: walletIdFor(input.ownerId, input.address),
    address: input.address,
    ownerId: input.ownerId,
    chains: [...new Set(input.chains)],
    createdAt: (input.now ?? new Date()).toISOString(),
    lastKeyRotationAt: null,
  };
}
