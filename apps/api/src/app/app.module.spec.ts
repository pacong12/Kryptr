import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { CHAIN_READER } from '../chain/chain-reader.port';
import { StaticMockChainReader } from '../chain/static-mock-chain.reader';
import { WALLET_REPOSITORY } from '../wallet/domain/wallet-repository.port';
import { InMemoryWalletRepository } from '../wallet/infrastructure/in-memory-wallet.repository';
import {
  DECISION_AUDIT,
  INTENT_STORE,
  POLICY_PROVIDER,
  PRICE_FEED,
  SPEND_LEDGER,
} from '../security/application/ports';
import { StaticPriceFeed } from '../security/infrastructure/static-price-feed';
import { InMemorySpendLedger } from '../security/infrastructure/in-memory-spend-ledger';
import { InMemorySecurityPolicyProvider } from '../security/infrastructure/in-memory-policy-provider';
import { InMemoryIntentStore } from '../security/infrastructure/in-memory-intent-store';
import { InMemoryDecisionAudit } from '../security/infrastructure/in-memory-decision-audit';
import { DEX_AGGREGATOR } from '../trading/domain/dex-aggregator.port';
import { QUOTE_STORE } from '../trading/domain/quote-store.port';
import { StaticMockDexAdapter } from '../trading/infrastructure/static-mock-dex.adapter';
import { InMemoryQuoteStore } from '../trading/infrastructure/in-memory-quote-store';

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

  it('binds every port to its in-memory implementation (zero overrides needed)', () => {
    expect(app.get(CHAIN_READER)).toBeInstanceOf(StaticMockChainReader);
    expect(app.get(WALLET_REPOSITORY)).toBeInstanceOf(InMemoryWalletRepository);
    expect(app.get(PRICE_FEED)).toBeInstanceOf(StaticPriceFeed);
    expect(app.get(SPEND_LEDGER)).toBeInstanceOf(InMemorySpendLedger);
    expect(app.get(POLICY_PROVIDER)).toBeInstanceOf(
      InMemorySecurityPolicyProvider,
    );
    expect(app.get(INTENT_STORE)).toBeInstanceOf(InMemoryIntentStore);
    expect(app.get(DECISION_AUDIT)).toBeInstanceOf(InMemoryDecisionAudit);
    expect(app.get(DEX_AGGREGATOR)).toBeInstanceOf(StaticMockDexAdapter);
    expect(app.get(QUOTE_STORE)).toBeInstanceOf(InMemoryQuoteStore);
  });
});
