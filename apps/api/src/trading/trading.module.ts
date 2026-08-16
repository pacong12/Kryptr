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
import { ZeroExDexAdapter } from './infrastructure/zero-ex-dex.adapter';
import { InMemoryQuoteStore } from './infrastructure/in-memory-quote-store';

/**
 * Composition root for trading. DEX_SOURCE (wiring-time env) selects
 * the aggregator: 'zero-ex' binds the 0x v2 adapter (fails closed with
 * aggregator_unconfigured/503 when ZEROX_API_KEY is absent); anything
 * else binds the deterministic StaticMockDexAdapter. forwardRef breaks
 * the SecurityModule <-> TradingModule cycle (the gate binds quotes;
 * the preview reads gate decisions).
 */
@Module({
  imports: [forwardRef(() => WalletModule), forwardRef(() => SecurityModule)],
  controllers: [TradingController],
  providers: [
    RequestQuoteUseCase,
    GetQuoteUseCase,
    PreviewSwapExecutionUseCase,
    {
      provide: DEX_AGGREGATOR,
      useFactory: () => {
        if (process.env.DEX_SOURCE === 'zero-ex') {
          return new ZeroExDexAdapter({
            apiKey: process.env.ZEROX_API_KEY ?? null,
          });
        }
        return new StaticMockDexAdapter();
      },
    },
    { provide: QUOTE_STORE, useClass: InMemoryQuoteStore },
  ],
  exports: [DEX_AGGREGATOR, QUOTE_STORE, PreviewSwapExecutionUseCase],
})
export class TradingModule {}
