import { RealViemClient } from './real-viem.client';

interface FakeClient {
  getBalance: jest.Mock;
  multicall: jest.Mock;
  getBlockNumber: jest.Mock;
}

function makeClient(overrides: Partial<FakeClient> = {}): FakeClient {
  return {
    getBalance: jest.fn().mockResolvedValue(2_000_000_000_000_000_000n),
    multicall: jest.fn().mockResolvedValue([
      { status: 'success', result: 123n },
      { status: 'failure', error: new Error('reverted') },
    ]),
    getBlockNumber: jest.fn().mockResolvedValue(99n),
    ...overrides,
  };
}

const OWNER = '0x1111111111111111111111111111111111111111';
const TOKENS = [
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
] as `0x${string}`[];

describe('RealViemClient (viem seam)', () => {
  it('maps native balance to a decimal wei string', async () => {
    const client = new RealViemClient({ client: makeClient() });
    await expect(client.getNativeBalance(OWNER)).resolves.toBe(
      '2000000000000000000',
    );
  });

  it('multicalls balanceOf and omits reverted calls', async () => {
    const fake = makeClient();
    const client = new RealViemClient({ client: fake });
    await expect(client.getTokenBalances(OWNER, TOKENS)).resolves.toEqual([
      { token: TOKENS[0], balance: '123' },
    ]);
    const call = fake.multicall.mock.calls[0][0];
    expect(call.contracts).toHaveLength(2);
    expect(call.contracts[0].functionName).toBe('balanceOf');
    expect(call.contracts[0].args).toEqual([OWNER]);
  });

  it('propagates RPC failures from balance reads (reader maps to 502)', async () => {
    const fake = makeClient({
      getBalance: jest.fn().mockRejectedValue(new Error('rpc down')),
    });
    const client = new RealViemClient({ client: fake });
    await expect(client.getNativeBalance(OWNER)).rejects.toThrow('rpc down');
  });

  it('lastBlockNumber resolves the block and records a healthy probe', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));
      const client = new RealViemClient({ client: makeClient() });
      await expect(client.lastBlockNumber()).resolves.toBe(99n);
      expect(client.health()).toMatchObject({
        feedId: 'chain:base',
        source: 'viem',
        status: 'healthy',
        lastUpdateAt: '2026-05-01T00:00:00.000Z',
        priceAgeSec: 0,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('lastBlockNumber never throws; failed probe turns health down', async () => {
    const fake = makeClient({
      getBlockNumber: jest.fn().mockRejectedValue(new Error('timeout')),
    });
    const client = new RealViemClient({ client: fake });
    await expect(client.lastBlockNumber()).resolves.toBeNull();
    expect(client.health().status).toBe('down');
  });

  it('health is stale once the last probe outlives the freshness window', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));
      const client = new RealViemClient({ client: makeClient() });
      await client.lastBlockNumber();
      jest.setSystemTime(new Date('2026-05-01T00:01:00.000Z'));
      expect(client.health().status).toBe('stale');
    } finally {
      jest.useRealTimers();
    }
  });

  it('chainHealth probes reachability with latency and block height', async () => {
    let t = 0;
    const fake = makeClient({
      getBlockNumber: jest.fn().mockImplementation(async () => {
        t += 7;
        return 99n;
      }),
    });
    const client = new RealViemClient({ client: fake, now: () => t });
    await expect(client.chainHealth()).resolves.toMatchObject({
      chainId: 'base',
      reachable: true,
      blockHeight: 99,
      latencyMs: 7,
      provider: 'viem',
    });
  });

  it('chainHealth reports unreachable without throwing when RPC fails', async () => {
    const fake = makeClient({
      getBlockNumber: jest.fn().mockRejectedValue(new Error('nope')),
    });
    const client = new RealViemClient({ client: fake });
    await expect(client.chainHealth()).resolves.toMatchObject({
      reachable: false,
      blockHeight: null,
      latencyMs: null,
      lastBlockAt: null,
    });
  });

  it('provider label is the RPC host only — never path or credentials', async () => {
    const client = RealViemClient.fromRpc({
      rpcUrl: 'https://user:pass@mainnet.base.org/secret/path',
      fetchImpl: jest.fn(),
    });
    const health = await client.chainHealth();
    expect(health.provider).toBe('viem:mainnet.base.org');
    expect(JSON.stringify(health)).not.toContain('secret');
    expect(JSON.stringify(health)).not.toContain('pass');
  });
});

describe('RealViemClient.fromRpc transport fallback', () => {
  // viem matches responses to requests by JSON-RPC id — echo it back.
  function rpcAnswer(init: RequestInit, result: unknown): Response {
    const req = JSON.parse(init.body as string) as { id: number };
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', id: req.id, result }),
    } as unknown as Response;
  }

  it('uses the primary RPC when it answers', async () => {
    const fetchImpl = jest
      .fn()
      .mockImplementation(async (url: string, init: RequestInit) => {
        expect(String(url)).toBe('https://mainnet.base.org');
        return rpcAnswer(init, '0x63');
      });
    const client = RealViemClient.fromRpc({
      rpcUrl: 'https://mainnet.base.org',
      fallbackRpcUrl: 'https://base-rpc.publicnode.com',
      fetchImpl,
    });
    await expect(client.lastBlockNumber()).resolves.toBe(99n);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falls back to the secondary RPC when the primary fails', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new Error('primary down'))
      .mockImplementation(async (url: string, init: RequestInit) => {
        expect(String(url)).toBe('https://base-rpc.publicnode.com');
        return rpcAnswer(init, '0x63');
      });
    const client = RealViemClient.fromRpc({
      rpcUrl: 'https://mainnet.base.org',
      fallbackRpcUrl: 'https://base-rpc.publicnode.com',
      fetchImpl,
    });
    await expect(client.lastBlockNumber()).resolves.toBe(99n);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
