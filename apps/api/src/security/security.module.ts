import { Module } from '@nestjs/common';
import { SecurityController } from './security.controller';
import { EvaluateIntentUseCase } from './application/evaluate-intent.usecase';
import {
  DAILY_SPEND,
  POLICY_PROVIDER,
  PRICE_LOOKUP,
} from './application/ports';
import { StaticPriceLookup } from './infrastructure/static-price-lookup';
import { InMemoryDailySpend } from './infrastructure/in-memory-daily-spend';
import { InMemorySecurityPolicyProvider } from './infrastructure/in-memory-policy-provider';

/**
 * Composition root for the security gate. Price lookup, daily spend and
 * policy storage are Wave-1 stubs bound behind ports; the decision logic
 * in application/ never changes when they are swapped.
 */
@Module({
  controllers: [SecurityController],
  providers: [
    EvaluateIntentUseCase,
    { provide: PRICE_LOOKUP, useClass: StaticPriceLookup },
    { provide: DAILY_SPEND, useClass: InMemoryDailySpend },
    { provide: POLICY_PROVIDER, useClass: InMemorySecurityPolicyProvider },
  ],
  exports: [POLICY_PROVIDER],
})
export class SecurityModule {}
