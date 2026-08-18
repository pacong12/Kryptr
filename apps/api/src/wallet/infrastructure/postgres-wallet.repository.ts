import type { AgentWallet, ChainId } from '@kryptr/shared-types';
import type { WalletRepository } from '../domain/wallet-repository.port';
import { getPrismaClient } from '../../persistence/prisma-client';
import type { PrismaClient } from '../../generated/prisma/client';

/**
 * Postgres-backed Wallet repository (Wave-6 S1 persistence fase 3).
 * Note: `id` and `address` are identical in current AgentWallet model (`address` PK).
 * Case-insensitive address lookup.
 */
export class PostgresWalletRepository implements WalletRepository {
  constructor(private readonly db: PrismaClient = getPrismaClient()) {}

  async save(wallet: AgentWallet): Promise<AgentWallet> {
    const address = wallet.address.toLowerCase();
    const created = await this.db.wallet.upsert({
      where: { address },
      create: {
        address,
        ownerId: wallet.ownerId,
        chains: wallet.chains,
        createdAt: new Date(wallet.createdAt),
        lastKeyRotationAt: wallet.lastKeyRotationAt
          ? new Date(wallet.lastKeyRotationAt)
          : null,
      },
      update: {
        ownerId: wallet.ownerId,
        chains: wallet.chains,
        lastKeyRotationAt: wallet.lastKeyRotationAt
          ? new Date(wallet.lastKeyRotationAt)
          : null,
      },
    });

    return this.mapEntity(created);
  }

  async findById(id: string): Promise<AgentWallet | null> {
    return this.findByAddress(id);
  }

  async findByAddress(address: string): Promise<AgentWallet | null> {
    const row = await this.db.wallet.findUnique({
      where: { address: address.toLowerCase() },
    });
    if (!row) return null;
    return this.mapEntity(row);
  }

  async findAll(filter?: { ownerId?: string }): Promise<AgentWallet[]> {
    const rows = await this.db.wallet.findMany({
      where: filter?.ownerId ? { ownerId: filter.ownerId } : undefined,
    });
    return rows.map((r) => this.mapEntity(r));
  }

  private mapEntity(row: {
    address: string;
    ownerId: string;
    chains: string[];
    createdAt: Date;
    lastKeyRotationAt: Date | null;
  }): AgentWallet {
    return {
      id: row.address,
      address: row.address as `0x${string}`,
      ownerId: row.ownerId,
      chains: row.chains as ChainId[],
      createdAt: row.createdAt.toISOString(),
      lastKeyRotationAt: row.lastKeyRotationAt
        ? row.lastKeyRotationAt.toISOString()
        : null,
    };
  }
}
