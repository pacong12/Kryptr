import { Injectable } from '@nestjs/common';
import type { AgentWallet } from '@kryptr/shared-types';
import type { WalletRepository } from '../domain/wallet-repository.port';

/**
 * Wave-1 persistence: process-local Maps. The shape of the port keeps the
 * Wave-2 swap to Prisma/Postgres a one-line module change.
 */
@Injectable()
export class InMemoryWalletRepository implements WalletRepository {
  private readonly byId = new Map<string, AgentWallet>();
  private readonly idByAddress = new Map<string, string>();

  async save(wallet: AgentWallet): Promise<AgentWallet> {
    this.byId.set(wallet.id, wallet);
    this.idByAddress.set(wallet.address.toLowerCase(), wallet.id);
    return wallet;
  }

  async findById(id: string): Promise<AgentWallet | null> {
    return this.byId.get(id) ?? null;
  }

  async findByAddress(address: string): Promise<AgentWallet | null> {
    const id = this.idByAddress.get(address.toLowerCase());
    return id ? (this.byId.get(id) ?? null) : null;
  }

  async findAll(filter?: { ownerId?: string }): Promise<AgentWallet[]> {
    const wallets = [...this.byId.values()];
    if (!filter?.ownerId) return wallets;
    return wallets.filter((wallet) => wallet.ownerId === filter.ownerId);
  }
}
