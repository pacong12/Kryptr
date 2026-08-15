import { StaticMockChainReader } from './static-mock-chain.reader';

const ADDRESS = '0x1111111111111111111111111111111111111111' as const;

describe('StaticMockChainReader (stub)', () => {
  const reader = new StaticMockChainReader();

  it('returns static native balances for phase-1 chains', async () => {
    await expect(reader.getNativeBalance('base', ADDRESS)).resolves.toBe(
      '1500000000000000000',
    );
    await expect(
      reader.getNativeBalance('robinhood-chain', ADDRESS),
    ).resolves.toBe('100000000000000000000');
  });

  it('returns zero native balance for chains without mock data', async () => {
    await expect(reader.getNativeBalance('solana', ADDRESS)).resolves.toBe('0');
  });

  it('returns static token holdings for phase-1 chains', async () => {
    const baseTokens = await reader.getTokenBalances('base', ADDRESS);
    expect(baseTokens).toEqual([
      {
        contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        symbol: 'USDC',
        decimals: 6,
        amount: '2500000000',
      },
    ]);
    const rhcTokens = await reader.getTokenBalances('robinhood-chain', ADDRESS);
    expect(rhcTokens).toHaveLength(1);
    expect(rhcTokens[0].symbol).toBe('RHC');
  });

  it('returns no token holdings for chains without mock data', async () => {
    await expect(reader.getTokenBalances('solana', ADDRESS)).resolves.toEqual(
      [],
    );
  });

  it('is static: same values regardless of address', async () => {
    const other = '0x2222222222222222222222222222222222222222' as const;
    await expect(reader.getNativeBalance('base', ADDRESS)).resolves.toBe(
      await reader.getNativeBalance('base', other),
    );
  });
});
