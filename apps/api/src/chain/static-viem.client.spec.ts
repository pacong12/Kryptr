import { StaticViemClient } from './static-viem.client';

describe('StaticViemClient (CHAIN_MODE=static seam binding)', () => {
  const OWNER = '0x1111111111111111111111111111111111111111';
  const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

  it('serves deterministic base balances with zero network', async () => {
    const client = new StaticViemClient();
    await expect(client.getNativeBalance(OWNER)).resolves.toBe(
      '1500000000000000000', // 1.5 ETH, same table as StaticMockChainReader
    );
    await expect(client.getTokenBalances(OWNER, [USDC])).resolves.toEqual([
      { token: USDC, balance: '2500000000' }, // 2500 USDC
    ]);
  });

  it('omits unknown tokens instead of inventing balances', async () => {
    const client = new StaticViemClient();
    await expect(
      client.getTokenBalances(OWNER, [
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      ]),
    ).resolves.toEqual([]);
  });

  it('reports a fixed block number and healthy feed health', async () => {
    const client = new StaticViemClient();
    await expect(client.lastBlockNumber()).resolves.toBe(12_345_678n);
    expect(client.health()).toMatchObject({
      feedId: 'chain:base',
      source: 'static',
      status: 'healthy',
    });
  });

  it('reports static chain health without any RPC URL', async () => {
    const client = new StaticViemClient();
    await expect(client.chainHealth()).resolves.toMatchObject({
      chainId: 'base',
      provider: 'static-mock',
      reachable: true,
      blockHeight: 12_345_678,
      latencyMs: 0,
    });
  });
});
