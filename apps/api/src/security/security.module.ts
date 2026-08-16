import { Module, forwardRef } from '@nestjs/common';
import { ChainModule } from '../chain/chain.module';
import { TradingModule } from '../trading/trading.module';
import { SigningModule } from '../signing/signing.module';
import { SecurityController } from './security.controller';
import { HealthController } from './health.controller';
import { EvaluateIntentUseCase } from './application/evaluate-intent.usecase';
import { GetIntentTimelineUseCase } from './application/get-intent-timeline.usecase';
import { GetFeedHealthUseCase } from './application/get-feed-health.usecase';
import { RequestSignatureUseCase } from './application/request-sign.usecase';
import {
  DECISION_AUDIT,
  INTENT_STORE,
  POLICY_PROVIDER,
  PRICE_FEED,
  SPEND_LEDGER,
} from './application/ports';
import { StaticPriceFeed } from './infrastructure/static-price-feed';
import { CoingeckoPriceFeed } from './infrastructure/coingecko-price-feed';
import { InMemorySpendLedger } from './infrastructure/in-memory-spend-ledger';
import { InMemorySecurityPolicyProvider } from './infrastructure/in-memory-policy-provider';
import { InMemoryIntentStore } from './infrastructure/in-memory-intent-store';
import { InMemoryDecisionAudit } from './infrastructure/in-memory-decision-audit';

/**
 * Composition root for the security gate. Wave-2 ports bind in-memory
 * implementations here; the Postgres persistence task swaps the
 * bindings in this file only. forwardRef breaks the cycle with
 * TradingModule (evaluate binds quotes; feed health reads the dex).
 *
 * PRICE_FEED_MODE (wiring-time env): 'static' is the explicit dev
 * opt-in; the default is CoinGecko-configured-or-fail-closed — an
 * unconfigured price feed escalates every valuation to human approval.
 */
@Module({
  imports: [forwardRef(() => TradingModule), ChainModule, SigningModule],
  controllers: [SecurityController, HealthController],
  providers: [
    EvaluateIntentUseCase,
    GetIntentTimelineUseCase,
    GetFeedHealthUseCase,
    RequestSignatureUseCase,
    {
      provide: PRICE_FEED,
      useFactory: () => {
        if (process.env.PRICE_FEED_MODE === 'static') {
          return new StaticPriceFeed();
        }
        return new CoingeckoPriceFeed({
          apiKey: process.env.COINGECKO_API_KEY ?? null,
        });
      },
    },
    { provide: SPEND_LEDGER, useClass: InMemorySpendLedger },
    { provide: POLICY_PROVIDER, useClass: InMemorySecurityPolicyProvider },
    { provide: INTENT_STORE, useClass: InMemoryIntentStore },
    { provide: DECISION_AUDIT, useClass: InMemoryDecisionAudit },
  ],
  exports: [
    POLICY_PROVIDER,
    PRICE_FEED,
    SPEND_LEDGER,
    INTENT_STORE,
    DECISION_AUDIT,
  ],
})
export class SecurityModule {}
