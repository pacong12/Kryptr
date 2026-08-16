import { Module } from '@nestjs/common';
import { ChainModule } from '../chain/chain.module';
import { SecurityModule } from '../security/security.module';
import { WalletController } from './wallet.controller';
import { CreateWalletUseCase } from './application/create-wallet.usecase';
import { ListWalletsUseCase } from './application/list-wallets.usecase';
import { GetBalancesUseCase } from './application/get-balances.usecase';
import { WALLET_REPOSITORY } from './domain/wallet-repository.port';
import { InMemoryWalletRepository } from './infrastructure/in-memory-wallet.repository';

/**
 * Composition root: infrastructure binds to ports here, application and
 * domain stay framework-agnostic. Wave 2 swaps WALLET_REPOSITORY to the
 * Prisma implementation in this file only.
 */
@Module({
  imports: [ChainModule, SecurityModule],
  controllers: [WalletController],
  providers: [
    { provide: WALLET_REPOSITORY, useClass: InMemoryWalletRepository },
    CreateWalletUseCase,
    ListWalletsUseCase,
    GetBalancesUseCase,
  ],
  exports: [WALLET_REPOSITORY],
})
export class WalletModule {}
