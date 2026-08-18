import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ok, type AgentWallet, type ApiEnvelope, type TransactionIntent, type WalletBalance, type ChainId } from '@kryptr/shared-types';
import { CreateWalletUseCase } from './application/create-wallet.usecase';
import { ListWalletsUseCase } from './application/list-wallets.usecase';
import { GetBalancesUseCase } from './application/get-balances.usecase';
import { CreateTransferUseCase } from '../security/application/create-transfer.usecase';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { JwtAuthGuard } from '../security/domain/jwt.auth.guard';

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
    private readonly createTransfer: CreateTransferUseCase,
  ) {}

  @Post()
  async create(@Body() body: CreateWalletDto): Promise<ApiEnvelope<AgentWallet>> {
    return ok(await this.createWallet.execute(body));
  }

  @Get()
  async list(@Query('ownerId') ownerId?: string): Promise<ApiEnvelope<AgentWallet[]>> {
    return ok(await this.listWallets.execute(ownerId ? { ownerId } : undefined));
  }

  @Get(':id/balances')
  async balances(@Param('id') id: string): Promise<ApiEnvelope<WalletBalance[]>> {
    return ok(await this.getBalances.execute(id));
  }

  @Post(':id/transfer')
  @UseGuards(JwtAuthGuard)
  async transfer(
    @Param('id') walletId: string,
    @Body('chain') chain: string,
    @Body('to') to: string,
    @Body('asset') asset: string | null,
    @Body('amount') amount: string,
    @Body('origin') origin: string,
  ): Promise<ApiEnvelope<TransactionIntent>> {
    const intent = await this.createTransfer.execute(
      walletId,
      chain as unknown as ChainId,
      to as `0x${string}`,
      (asset && (asset as `0x${string}`)) || null,
      amount,
      origin,
    );
    return ok(intent);
  }
}
