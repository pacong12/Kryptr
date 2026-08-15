import { Inject, Injectable } from '@nestjs/common';
import type { WalletBalance } from '@kryptr/shared-types';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../domain/wallet-repository.port';
import { WalletNotFoundError } from '../domain/wallet.errors';
import { CHAIN_READER, type ChainReader } from '../../chain/chain-reader.port';

@Injectable()
export class GetBalancesUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly wallets: WalletRepository,
    @Inject(CHAIN_READER) private readonly chainReader: ChainReader,
  ) {}

  async execute(walletId: string): Promise<WalletBalance[]> {
    const wallet = await this.wallets.findById(walletId);
    if (!wallet) {
      throw new WalletNotFoundError(walletId);
    }
    return Promise.all(
      wallet.chains.map(async (chain) => ({
        walletId: wallet.id,
        chain,
        nativeBalance: await this.chainReader.getNativeBalance(
          chain,
          wallet.address,
        ),
        tokens: await this.chainReader.getTokenBalances(chain, wallet.address),
      })),
    );
  }
}
