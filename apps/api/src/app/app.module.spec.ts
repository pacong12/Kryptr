import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { CHAIN_READER } from '../chain/chain-reader.port';
import { StaticMockChainReader } from '../chain/static-mock-chain.reader';
import { WALLET_REPOSITORY } from '../wallet/domain/wallet-repository.port';
import { InMemoryWalletRepository } from '../wallet/infrastructure/in-memory-wallet.repository';
import {
  DAILY_SPEND,
  POLICY_PROVIDER,
  PRICE_LOOKUP,
} from '../security/application/ports';
import { StaticPriceLookup } from '../security/infrastructure/static-price-lookup';
import { InMemoryDailySpend } from '../security/infrastructure/in-memory-daily-spend';
import { InMemorySecurityPolicyProvider } from '../security/infrastructure/in-memory-policy-provider';

describe('AppModule composition (wiring smoke)', () => {
  let app: TestingModule;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterAll(async () => {
    await app.close();
  });

  it('binds the Wave-1 stub implementations to their ports', () => {
    expect(app.get(CHAIN_READER)).toBeInstanceOf(StaticMockChainReader);
    expect(app.get(WALLET_REPOSITORY)).toBeInstanceOf(InMemoryWalletRepository);
    expect(app.get(PRICE_LOOKUP)).toBeInstanceOf(StaticPriceLookup);
    expect(app.get(DAILY_SPEND)).toBeInstanceOf(InMemoryDailySpend);
    expect(app.get(POLICY_PROVIDER)).toBeInstanceOf(
      InMemorySecurityPolicyProvider,
    );
  });
});
