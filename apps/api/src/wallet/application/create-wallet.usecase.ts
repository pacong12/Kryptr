import { Inject, Injectable } from '@nestjs/common';
import type { AgentWallet, ChainId } from '@kryptr/shared-types';
import { buildWallet } from '../domain/wallet.entity';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../domain/wallet-repository.port';
import { WalletExistsError } from '../domain/wallet.errors';
import { defaultPolicyFor } from '../../security/domain/default-policy';
import {
  POLICY_PROVIDER,
  type SecurityPolicyProvider,
} from '../../security/application/ports';

export interface CreateWalletCommand {
  ownerId: string;
  address: `0x${string}`;
  chains: ChainId[];
}

/**
 * Creates a wallet and provisions its security policy in one step, so a
 * wallet can never exist without the gate knowing about it (fail-closed).
 */
@Injectable()
export class CreateWalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly wallets: WalletRepository,
    @Inject(POLICY_PROVIDER)
    private readonly policies: SecurityPolicyProvider,
  ) {}

  async execute(command: CreateWalletCommand): Promise<AgentWallet> {
    const wallet = buildWallet(command);
    const existing = await this.wallets.findByAddress(wallet.address);
    if (existing) {
      throw new WalletExistsError(wallet.address);
    }
    await this.wallets.save(wallet);
    await this.policies.upsert(defaultPolicyFor(wallet));
    return wallet;
  }
}
