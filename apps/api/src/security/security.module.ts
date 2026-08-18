import { Module, forwardRef } from '@nestjs/common';
import { ChainModule } from '../chain/chain.module';
import { TradingModule } from '../trading/trading.module';
import { SigningModule } from '../signing/signing.module';
import { LaunchpadModule } from '../launchpad/launchpad.module';
import { SecurityController } from './security.controller';
import { HealthController } from './health.controller';
import { IntentController } from './intent.controller';
import { EvaluateIntentUseCase } from './application/evaluate-intent.usecase';
import { GetIntentTimelineUseCase } from './application/get-intent-timeline.usecase';
import { GetFeedHealthUseCase } from './application/get-feed-health.usecase';
import { RequestSignatureUseCase } from './application/request-sign.usecase';
import { CreateTransferUseCase } from './application/create-transfer.usecase';
import { GetIntentUseCase } from './application/get-intent.usecase';
import {
  DECISION_AUDIT,
  DEPLOY_ALLOWLIST,
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
import { ManifestDeployAllowlist } from './infrastructure/manifest-deploy-allowlist';
import { PostgresSpendLedger } from './infrastructure/postgres-spend-ledger';
import { PostgresIntentStore } from './infrastructure/postgres-intent-store';
import { PostgresDecisionAudit } from './infrastructure/postgres-decision-audit';
import { PostgresSecurityPolicyProvider } from './infrastructure/postgres-security-policy-provider';
import { isPostgresPersistence } from '../persistence/prisma-client';

/**
 * Composition root for the security gate. Wave-2 ports bind in-memory
 * implementations by default; wave-6 S1 swaps SPEND_LEDGER / INTENT_STORE /
 * DECISION_AUDIT to Postgres when PERSISTENCE_MODE=postgres (port-swap
 * only — decision logic untouched). POLICY_PROVIDER stays in-memory until
 * S1 phase 3. forwardRef breaks the cycle with TradingModule (evaluate
 * binds quotes; feed health reads the dex).
 *
 * PRICE_FEED_MODE (wiring-time env): 'static' is the explicit dev
 * opt-in; the default is CoinGecko-configured-or-fail-closed — an
 * unconfigured price feed escalates every valuation to human approval.
 */
@Module({
  imports: [
    forwardRef(() => TradingModule),
    ChainModule,
    SigningModule,
    LaunchpadModule,
  ],
  controllers: [SecurityController, HealthController, IntentController],
  providers: [
    EvaluateIntentUseCase,
    GetIntentTimelineUseCase,
    GetFeedHealthUseCase,
    RequestSignatureUseCase,
    CreateTransferUseCase,
    GetIntentUseCase,
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
    {
      provide: SPEND_LEDGER,
      useFactory: () =>
        isPostgresPersistence()
          ? new PostgresSpendLedger()
          : new InMemorySpendLedger(),
    },
    {
      provide: POLICY_PROVIDER,
      useFactory: () =>
        isPostgresPersistence()
          ? new PostgresSecurityPolicyProvider()
          : new InMemorySecurityPolicyProvider(),
    },
    {
      provide: INTENT_STORE,
      useFactory: () =>
        isPostgresPersistence()
          ? new PostgresIntentStore()
          : new InMemoryIntentStore(),
    },
    {
      provide: DECISION_AUDIT,
      useFactory: () =>
        isPostgresPersistence()
          ? new PostgresDecisionAudit()
          : new InMemoryDecisionAudit(),
    },
    {
      // Wave-5 layer-2 factory allowlist: pinned from the ops deploy
      // manifests at wiring time, fail-closed (empty ⇒ launchpad dark).
      // DEPLOY_MANIFESTS_DIR overrides the repo-relative default.
      provide: DEPLOY_ALLOWLIST,
      useFactory: () =>
        ManifestDeployAllowlist.fromDir(
          process.env.DEPLOY_MANIFESTS_DIR ?? 'contracts/deployments',
        ),
    },
  ],
  exports: [
    POLICY_PROVIDER,
    PRICE_FEED,
    SPEND_LEDGER,
    INTENT_STORE,
    DECISION_AUDIT,
    DEPLOY_ALLOWLIST,
    // Wave 4: the order worker sends every scheduled execution through
    // the FULL gate — it needs the gate use case itself, not a bypass.
    EvaluateIntentUseCase,
    CreateTransferUseCase,
    GetIntentUseCase,
  ],
})
export class SecurityModule {}
