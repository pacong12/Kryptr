import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { resolveEnvFilePaths } from './env-file-paths';
import { WalletModule } from '../wallet/wallet.module';
import { SecurityModule } from '../security/security.module';
import { TradingModule } from '../trading/trading.module';
import { OrderWorkerModule } from '../order-worker/order-worker.module';
import { LaunchpadModule } from '../launchpad/launchpad.module';
import { RATE_LIMIT_CONFIG } from './rate-limit.config';

/**
 * Core API Application Module
 * Integrates all sub-modules with global configuration
 */
@Module({
  imports: [
    // Configuration module (global, available everywhere)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFilePaths(),
    }),

    // Rate limiting - applied globally for all routes
    ThrottlerModule.forRoot(RATE_LIMIT_CONFIG.read),

    // Domain modules
    WalletModule,
    SecurityModule,
    TradingModule,
    OrderWorkerModule,
    LaunchpadModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
