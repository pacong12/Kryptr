import { Module, forwardRef } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { SecurityModule } from '../security/security.module';
import { TradingController } from './trading.controller';
import { RequestQuoteUseCase } from './application/request-quote.usecase';
import { GetQuoteUseCase } from './application/get-quote.usecase';
import { PreviewSwapExecutionUseCase } from './application/preview-swap-execution.usecase';
import { DEX_AGGREGATOR } from './domain/dex-aggregator.port';
import { QUOTE_STORE } from './domain/quote-store.port';
import { StaticMockDexAdapter } from './infrastructure/static-mock-dex.adapter';
import { InMemoryQuoteStore } from './infrastructure/in-memory-quote-store';

/**
 * Composition root for trading. StaticMockDexAdapter + InMemoryQuoteStore
 * bind behind ports; a real 0x/1inch adapter or Postgres quote store
 * swaps in here without touching application code. forwardRef breaks the
 * SecurityModule <-> TradingModule cycle (the gate binds quotes; the
 * preview reads gate decisions).
 */
@Module({
  imports: [forwardRef(() => WalletModule), forwardRef(() => SecurityModule)],
  controllers: [TradingController],
  providers: [
    RequestQuoteUseCase,
    GetQuoteUseCase,
    PreviewSwapExecutionUseCase,
    { provide: DEX_AGGREGATOR, useClass: StaticMockDexAdapter },
    { provide: QUOTE_STORE, useClass: InMemoryQuoteStore },
  ],
  exports: [DEX_AGGREGATOR, QUOTE_STORE, PreviewSwapExecutionUseCase],
})
export class TradingModule {}
