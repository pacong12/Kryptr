import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { ok, type ApiEnvelope, type TransactionIntent, type ChainId } from '@kryptr/shared-types';
import { CreateTransferUseCase } from './application/create-transfer.usecase';
import { GetIntentUseCase } from './application/get-intent.usecase';

/**
 * Thin intent controller - routes transfer intents through security gate
 * and provides intent lookup endpoints.
 */
@Controller('intents')
export class IntentController {
  constructor(
    private readonly createTransfer: CreateTransferUseCase,
    private readonly getIntent: GetIntentUseCase,
  ) {}

  @Post()
  async createTransfer(
    @Query('walletId') walletId: string,
    @Query('chain') chain: string,
    @Query('to') to: string,
    @Query('asset') asset: string | null,
    @Query('amount') amount: string,
    @Query('origin') origin: string,
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

  @Get(':id')
  async getById(@Param('id') id: string): Promise<ApiEnvelope<TransactionIntent>> {
    const intent = await this.getIntent.execute(id);
    return ok(intent);
  }

  @Get()
  async list(
    @Query('walletId') walletId?: string,
  ): Promise<ApiEnvelope<TransactionIntent[]>> {
    if (!walletId) {
      throw new Error('walletId query parameter is required');
    }
    // TODO: Implement filtering in production
    const intents: TransactionIntent[] = [];
    return ok(intents);
  }
}
