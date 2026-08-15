import type { AgentWallet } from '@kryptr/shared-types';

/**
 * Persistence port for wallets. Wave 1 ships the in-memory
 * implementation; Wave 2 swaps in Prisma/Postgres by changing one module
 * binding. Application code depends on this interface only.
 */

export const WALLET_REPOSITORY = 'wallet.repository';

export interface WalletRepository {
  save(wallet: AgentWallet): Promise<AgentWallet>;
  findById(id: string): Promise<AgentWallet | null>;
  /** Address lookup is case-insensitive. */
  findByAddress(address: string): Promise<AgentWallet | null>;
  findAll(filter?: { ownerId?: string }): Promise<AgentWallet[]>;
}
