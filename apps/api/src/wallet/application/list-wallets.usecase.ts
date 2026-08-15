import { Inject, Injectable } from '@nestjs/common';
import type { AgentWallet } from '@kryptr/shared-types';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../domain/wallet-repository.port';

@Injectable()
export class ListWalletsUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly wallets: WalletRepository,
  ) {}

  async execute(filter?: { ownerId?: string }): Promise<AgentWallet[]> {
    return this.wallets.findAll(filter);
  }
}
