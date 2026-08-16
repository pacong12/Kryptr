import type { QuoteRequest } from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import { ZeroExDexAdapter } from './zero-ex-dex.adapter';

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

function quoteRequest(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    walletId: 'wallet-1',
    chain: 'base',
    assetIn: null,
    assetOut: USDC,
    amount: '1000000000000000000',
    slippageBps: 50,
    ...overrides,
  };
}

/** 0x /swap/v2/quote response fixture: 1 ETH -> 3000 USDC on Base. */
function zeroExResponse(overrides: Record<string, unknown> = {}) {
  return {
    quoteId: 'qx-123',
    blockNumber: '25000000',
    buyAmount: '3000000000', // 3000 USDC (6 dp)
    sellAmount: '1000000000000000000', // 1 ETH
    fees: {
      zeroExFee: { amount: '1000000', token: USDC },
      gasFee: { amount: '300000000000000', token: null },
    },
    route: {
      fills: [{ source: 'uniswap-v3', from: null, to: USDC }],
      tokens: [
        { address: USDC, symbol: 'USDC', decimals: 6 },
        {
          address: '0x4200000000000000000000000000000000000006',
          symbol: 'WETH',
          decimals: 18,
        },
      ],
    },
    allowanceTarget: '0x0000000000001fF3684f28c67538d4D072C22734',
    transaction: {
      to: '0x0000000000001fF3684f28c67538d4D072C22734',
      data: '0xdeadbeef',
      gas: '300000',
      gasPrice: '1000000',
      value: '1000000000000000000',
    },
    ...overrides,
  };
}

function jsonOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function jsonErr(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as unknown as Response;
}

function makeAdapter(fetchImpl: jest.Mock) {
  return new ZeroExDexAdapter({
    apiKey: 'test-key',
    fetchImpl,
  });
}

describe('ZeroExDexAdapter (unit, mocked fetch)', () => {
  it('fails closed with aggregator_unconfigured/503 when no key exists', async () => {
    const fetchImpl = jest.fn();
    const dex = new ZeroExDexAdapter({ apiKey: null, fetchImpl });
    await expect(dex.getQuote(quoteRequest())).rejects.toMatchObject({
      code: 'aggregator_unconfigured',
      httpStatus: 503,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(dex.health().status).toBe('unconfigured');
    expect(dex.health().source).toBe('0x');
  });

  it('rejects non-0x chains with chain_not_supported', async () => {
    const fetchImpl = jest.fn();
    const dex = makeAdapter(fetchImpl);
    await expect(
      dex.getQuote(quoteRequest({ chain: 'solana' })),
    ).rejects.toThrow(DomainError);
    await expect(
      dex.getQuote(quoteRequest({ chain: 'robinhood-chain' })),
    ).rejects.toThrow(DomainError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('calls /swap/v2/quote on api.0x.org with auth headers and Base chainId', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonOk(zeroExResponse()));
    const dex = makeAdapter(fetchImpl);
    await dex.getQuote(quoteRequest());
    const [url, init] = fetchImpl.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.origin).toBe('https://api.0x.org');
    expect(parsed.pathname).toBe('/swap/v2/quote');
    expect(parsed.searchParams.get('chainId')).toBe('8453');
    expect(parsed.searchParams.get('sellToken')).toBe('NATIVE');
    expect(parsed.searchParams.get('buyToken')).toBe(USDC);
    expect(parsed.searchParams.get('sellAmount')).toBe('1000000000000000000');
    expect(parsed.searchParams.get('slippageBps')).toBe('50');
    expect((init as RequestInit).headers).toMatchObject({
      '0x-api-key': 'test-key',
      '0x-version': expect.any(String),
    });
  });

  it('maps the 0x response onto SwapQuote', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));
      const fetchImpl = jest.fn().mockResolvedValue(jsonOk(zeroExResponse()));
      const dex = makeAdapter(fetchImpl);
      const quote = await dex.getQuote(quoteRequest());
      expect(quote).toMatchObject({
        id: 'qx-123',
        source: '0x',
        chain: 'base',
        assetIn: null,
        assetOut: USDC,
        amountIn: '1000000000000000000',
        amountOut: '3000000000',
        slippageBps: 50,
        fetchedAt: '2026-05-01T00:00:00.000Z',
      });
      // 1 ETH (18dp) -> 3000 USDC (6dp): unit price 3000.
      expect(quote.price).toBeCloseTo(3000, 6);
      expect(quote.fees).toEqual([
        { asset: USDC, amount: '1000000' },
        { asset: null, amount: '300000000000000' },
      ]);
      expect(quote.route).toEqual([
        { venue: 'uniswap-v3', assetIn: null, assetOut: USDC },
      ]);
      // expiresAt = fetchedAt + 60s TTL (0x has no expiry field).
      expect(Date.parse(quote.expiresAt)).toBe(
        Date.parse('2026-05-01T00:01:00.000Z'),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('RECOMPUTES minAmountOut from slippageBps and ignores any embedded floor', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        jsonOk(zeroExResponse({ minBuyAmount: '1', someFloor: '9' })),
      );
    const dex = makeAdapter(fetchImpl);
    const quote = await dex.getQuote(quoteRequest({ slippageBps: 50 }));
    // 3_000_000_000 * 9950 / 10000 = 2_985_000_000 — NEVER the embedded '1'.
    expect(quote.minAmountOut).toBe('2985000000');
  });

  it('derives a deterministic id when 0x omits quoteId', async () => {
    const body = zeroExResponse({ quoteId: undefined });
    const fetchImpl = jest.fn().mockResolvedValue(jsonOk(body));
    const dex = makeAdapter(fetchImpl);
    const first = await dex.getQuote(quoteRequest());
    const second = await dex.getQuote(quoteRequest());
    expect(first.id).toMatch(/^[0-9a-f]{32}$/);
    expect(second.id).toBe(first.id);
  });

  it('caches the executable tx per quote id for buildSwapTx', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonOk(zeroExResponse()));
    const dex = makeAdapter(fetchImpl);
    const quote = await dex.getQuote(quoteRequest());
    const tx = await dex.buildSwapTx(quote);
    expect(tx).toEqual({
      to: '0x0000000000001fF3684f28c67538d4D072C22734',
      data: '0xdeadbeef',
      value: '1000000000000000000',
    });
    await expect(dex.buildSwapTx(quote)).resolves.toEqual(tx);
  });

  it('buildSwapTx sends no ETH when selling an ERC-20', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonOk(
        zeroExResponse({
          transaction: {
            to: '0x0000000000001fF3684f28c67538d4D072C22734',
            data: '0xcafebabe',
            value: '0',
          },
        }),
      ),
    );
    const dex = makeAdapter(fetchImpl);
    const quote = await dex.getQuote(
      quoteRequest({ assetIn: USDC, assetOut: null }),
    );
    const tx = await dex.buildSwapTx(quote);
    expect(tx.value).toBe('0');
    const [url] = fetchImpl.mock.calls[0];
    expect(new URL(String(url)).searchParams.get('sellToken')).toBe(USDC);
    expect(new URL(String(url)).searchParams.get('buyToken')).toBe('NATIVE');
  });

  it('rejects buildSwapTx for quotes it never produced', async () => {
    const dex = makeAdapter(jest.fn());
    await expect(
      dex.buildSwapTx({
        id: 'never-seen',
        source: '0x',
        chain: 'base',
        assetIn: null,
        assetOut: USDC,
        amountIn: '1',
        amountOut: '1',
        price: 1,
        minAmountOut: '1',
        slippageBps: 0,
        route: [],
        fetchedAt: '2026-05-01T00:00:00.000Z',
        expiresAt: '2026-05-01T00:01:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'quote_unknown' });
  });

  it('maps HTTP statuses to domain errors', async () => {
    for (const [status, code] of [
      [401, 'aggregator_auth_failed'],
      [403, 'aggregator_auth_failed'],
      [429, 'aggregator_rate_limited'],
      [500, 'aggregator_unavailable'],
    ] as const) {
      const dex = makeAdapter(jest.fn().mockResolvedValue(jsonErr(status)));
      await expect(dex.getQuote(quoteRequest())).rejects.toMatchObject({
        code,
      });
    }
  });

  it('rejects malformed responses (missing buyAmount/transaction)', async () => {
    const dex = makeAdapter(
      jest.fn().mockResolvedValue(jsonOk({ sellAmount: '1' })),
    );
    await expect(dex.getQuote(quoteRequest())).rejects.toMatchObject({
      code: 'aggregator_bad_response',
    });
  });

  it('fails closed when the network call throws', async () => {
    const dex = makeAdapter(jest.fn().mockRejectedValue(new Error('net')));
    await expect(dex.getQuote(quoteRequest())).rejects.toMatchObject({
      code: 'aggregator_unavailable',
    });
  });

  it('health: stale before any quote, healthy right after one', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));
      const fetchImpl = jest.fn().mockResolvedValue(jsonOk(zeroExResponse()));
      const dex = makeAdapter(fetchImpl);
      expect(dex.health().status).toBe('stale');
      await dex.getQuote(quoteRequest());
      expect(dex.health()).toMatchObject({
        feedId: 'dex:zero-ex',
        source: '0x',
        status: 'healthy',
        lastUpdateAt: '2026-05-01T00:00:00.000Z',
        priceAgeSec: 0,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
