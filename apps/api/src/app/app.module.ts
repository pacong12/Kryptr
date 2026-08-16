import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { resolveEnvFilePaths } from './env-file-paths';
import { WalletModule } from '../wallet/wallet.module';
import { SecurityModule } from '../security/security.module';
import { TradingModule } from '../trading/trading.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFilePaths(),
    }),
    WalletModule,
    SecurityModule,
    TradingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
