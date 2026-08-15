import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ok,
  type AgentWallet,
  type ApiEnvelope,
  type WalletBalance,
} from '@kryptr/shared-types';
import { CreateWalletUseCase } from './application/create-wallet.usecase';
import { ListWalletsUseCase } from './application/list-wallets.usecase';
import { GetBalancesUseCase } from './application/get-balances.usecase';
import { CreateWalletDto } from './dto/create-wallet.dto';

/**
 * Thin controller: DTO validation happens in the global ValidationPipe,
 * each route calls exactly one use case, and every response is an
 * ApiEnvelope via ok()/err(). Domain errors are mapped to err() envelopes
 * by the global ApiEnvelopeExceptionFilter.
 */
@Controller('wallets')
export class WalletController {
  constructor(
    private readonly createWallet: CreateWalletUseCase,
    private readonly listWallets: ListWalletsUseCase,
    private readonly getBalances: GetBalancesUseCase,
  ) {}

  @Post()
  async create(
    @Body() body: CreateWalletDto,
  ): Promise<ApiEnvelope<AgentWallet>> {
    return ok(await this.createWallet.execute(body));
  }

  @Get()
  async list(
    @Query('ownerId') ownerId?: string,
  ): Promise<ApiEnvelope<AgentWallet[]>> {
    return ok(
      await this.listWallets.execute(ownerId ? { ownerId } : undefined),
    );
  }

  @Get(':id/balances')
  async balances(
    @Param('id') id: string,
  ): Promise<ApiEnvelope<WalletBalance[]>> {
    return ok(await this.getBalances.execute(id));
  }
}
