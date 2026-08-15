import type { TransactionIntent } from '@kryptr/shared-types';
import { StaticPriceLookup } from './static-price-lookup';

function makeIntent(overrides: Partial<TransactionIntent>): TransactionIntent {
  return {
    id: 'intent-1',
    walletId: 'wallet-1',
    chain: 'base',
    kind: 'transfer',
    to: '0x1111111111111111111111111111111111111111',
    asset: null,
    amount: '500000000000000000',
    origin: 'user',
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('StaticPriceLookup (stub)', () => {
  const lookup = new StaticPriceLookup();

  it('prices base native ETH at the static rate', async () => {
    // 0.5 ETH * $3000 = $1500
    await expect(lookup.getUsdValue(makeIntent({}))).resolves.toBe(1500);
  });

  it('prices robinhood-chain native at the static rate', async () => {
    await expect(
      lookup.getUsdValue(
        makeIntent({
          chain: 'robinhood-chain',
          amount: '42000000000000000000',
        }),
      ),
    ).resolves.toBe(42);
  });

  it('prices known tokens with their own decimals', async () => {
    await expect(
      lookup.getUsdValue(
        makeIntent({
          asset: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          amount: '2500000000',
        }),
      ),
    ).resolves.toBe(2500);
  });

  it('returns null for assets without a static price', async () => {
    await expect(
      lookup.getUsdValue(makeIntent({ chain: 'solana' })),
    ).resolves.toBeNull();
    await expect(
      lookup.getUsdValue(
        makeIntent({
          asset: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        }),
      ),
    ).resolves.toBeNull();
  });

  it('returns null when the amount is not a plain decimal integer', async () => {
    await expect(
      lookup.getUsdValue(makeIntent({ amount: 'not-a-number' })),
    ).resolves.toBeNull();
    await expect(
      lookup.getUsdValue(makeIntent({ amount: '-5' })),
    ).resolves.toBeNull();
  });
});
