import { createHash } from 'node:crypto';
import type {
  ChainId,
  FeedHealth,
  QuoteFee,
  QuoteRequest,
  SwapQuote,
  SwapRouteHop,
} from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import type {
  DexAggregatorPort,
  UnsignedSwapTx,
} from '../domain/dex-aggregator.port';
import { QUOTE_TTL_MS } from './static-mock-dex.adapter';

/**
 * 0x Swap API v2 adapter (https://api.0x.org/swap/v2/quote), Base only
 * this wave (chainId=8453). Selected via DEX_SOURCE=zero-ex; without
 * ZEROX_API_KEY it fails closed (aggregator_unconfigured/503 + health
 * 'unconfigured') and never fabricates a quote.
 *
 * GATE SECURITY: 0x embeds a min-buy floor inside its calldata — we do
 * NOT trust it. minAmountOut is always recomputed from the returned
 * amountOut and the requested slippageBps.
 */

const ZERO_EX_VERSION = '1.0.0';
const BASE_URL = 'https://api.0x.org';

/** Phase-1 0x coverage: Base only. Robinhood Chain has no 0x support. */
const ZERO_EX_CHAIN_IDS: Partial<Record<ChainId, number>> = {
  base: 8453,
};

const KNOWN_DECIMALS: Record<string, number> = {
  native: 18,
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6, // USDC on Base
};

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export interface ZeroExDexAdapterOptions {
  /** 0x API key; without one the adapter is unconfigured and fails closed. */
  apiKey?: string | null;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  quoteTtlMs?: number;
}

interface ZeroExFeeEntry {
  amount?: unknown;
  token?: unknown;
}

interface ZeroExQuoteBody {
  quoteId?: unknown;
  buyAmount?: unknown;
  sellAmount?: unknown;
  fees?: {
    integratorFee?: ZeroExFeeEntry;
    zeroExFee?: ZeroExFeeEntry;
    gasFee?: ZeroExFeeEntry;
  };
  route?: {
    fills?: Array<{
      source?: unknown;
      from?: unknown;
      to?: unknown;
    }>;
    tokens?: Array<{ address?: unknown; decimals?: unknown }>;
  };
  transaction?: { to?: unknown; data?: unknown; value?: unknown };
}

export class ZeroExDexAdapter implements DexAggregatorPort {
  private readonly apiKey: string | null;
  private readonly now: () => number;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly quoteTtlMs: number;
  /** Executable tx objects exist only at quote time; keyed by quote id. */
  private readonly txCache = new Map<string, UnsignedSwapTx>();
  private lastQuoteAtMs: number | null = null;

  constructor(options: ZeroExDexAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? null;
    this.now = options.now ?? (() => Date.now());
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.baseUrl = options.baseUrl ?? BASE_URL;
    this.quoteTtlMs = options.quoteTtlMs ?? QUOTE_TTL_MS;
  }

  async getQuote(request: QuoteRequest): Promise<SwapQuote> {
    if (!this.apiKey) {
      throw new DomainError(
        'aggregator_unconfigured',
        '0x adapter has no ZEROX_API_KEY; quotes unavailable',
        503,
      );
    }
    const chainId = ZERO_EX_CHAIN_IDS[request.chain];
    if (chainId === undefined) {
      throw new DomainError(
        'chain_not_supported',
        `chain "${request.chain}" is not supported by the 0x adapter`,
        422,
      );
    }
    const slippageBps = request.slippageBps ?? 0;
    const url = new URL(`${this.baseUrl}/swap/v2/quote`);
    url.searchParams.set('chainId', String(chainId));
    url.searchParams.set('sellToken', this.tokenParam(request.assetIn));
    url.searchParams.set('buyToken', this.tokenParam(request.assetOut));
    url.searchParams.set('sellAmount', request.amount);
    url.searchParams.set('slippageBps', String(slippageBps));

    let body: ZeroExQuoteBody;
    try {
      const res = await this.fetchImpl(url.toString(), {
        headers: {
          accept: 'application/json',
          '0x-api-key': this.apiKey,
          '0x-version': ZERO_EX_VERSION,
        },
      });
      if (!res.ok) {
        throw this.httpError(res.status);
      }
      body = (await res.json()) as ZeroExQuoteBody;
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      throw new DomainError(
        'aggregator_unavailable',
        '0x API request failed',
        502,
      );
    }
    return this.normalize(request, body, slippageBps);
  }

  async buildSwapTx(quote: SwapQuote): Promise<UnsignedSwapTx> {
    const tx = this.txCache.get(quote.id);
    if (!tx) {
      throw new DomainError(
        'quote_unknown',
        'no executable transaction cached for this quote; request a fresh quote',
        404,
      );
    }
    return { ...tx };
  }

  health(): FeedHealth {
    if (!this.apiKey) {
      return {
        feedId: 'dex:zero-ex',
        source: '0x',
        status: 'unconfigured',
        lastUpdateAt: null,
        priceAgeSec: null,
      };
    }
    const ageMs =
      this.lastQuoteAtMs === null ? null : this.now() - this.lastQuoteAtMs;
    const fresh = ageMs !== null && ageMs <= this.quoteTtlMs;
    return {
      feedId: 'dex:zero-ex',
      source: '0x',
      status: fresh ? 'healthy' : 'stale',
      lastUpdateAt:
        this.lastQuoteAtMs === null
          ? null
          : new Date(this.lastQuoteAtMs).toISOString(),
      priceAgeSec: ageMs === null ? null : Math.floor(ageMs / 1000),
    };
  }

  /** Adapter-normalization step: 0x fields -> SwapQuote, floor recomputed. */
  private normalize(
    request: QuoteRequest,
    body: ZeroExQuoteBody,
    slippageBps: number,
  ): SwapQuote {
    const buyAmount = this.rawAmount(body.buyAmount);
    const sellAmount = this.rawAmount(body.sellAmount);
    const tx = body.transaction;
    if (
      buyAmount === null ||
      sellAmount === null ||
      !tx ||
      typeof tx.to !== 'string' ||
      !HEX_ADDRESS.test(tx.to) ||
      typeof tx.data !== 'string' ||
      !tx.data.startsWith('0x')
    ) {
      throw new DomainError(
        'aggregator_bad_response',
        '0x response is missing quote amounts or an executable transaction',
        502,
      );
    }

    const fetchedAtMs = this.now();
    const id =
      typeof body.quoteId === 'string' && body.quoteId.length > 0
        ? body.quoteId
        : createHash('sha256')
            .update(JSON.stringify(body))
            .digest('hex')
            .slice(0, 32);

    const quote: SwapQuote = {
      id,
      source: '0x',
      chain: request.chain,
      assetIn: request.assetIn,
      assetOut: request.assetOut,
      amountIn: sellAmount,
      amountOut: buyAmount,
      price: this.unitPrice(request, body, buyAmount, sellAmount),
      // SECURITY: recomputed from amountOut + slippageBps. NEVER trust an
      // embedded floor from the aggregator (threat model T11).
      minAmountOut: (
        (BigInt(buyAmount) * BigInt(10_000 - slippageBps)) /
        10_000n
      ).toString(),
      slippageBps,
      fees: this.mapFees(body),
      route: this.mapRoute(request, body),
      fetchedAt: new Date(fetchedAtMs).toISOString(),
      // 0x has no explicit expiry: gate-assigned TTL from observedAt.
      expiresAt: new Date(fetchedAtMs + this.quoteTtlMs).toISOString(),
    };
    this.txCache.set(id, {
      to: tx.to as `0x${string}`,
      data: tx.data as `0x${string}`,
      value: typeof tx.value === 'string' ? tx.value : '0',
    });
    this.lastQuoteAtMs = fetchedAtMs;
    return quote;
  }

  private tokenParam(asset: `0x${string}` | null): string {
    return asset ?? 'NATIVE';
  }

  private rawAmount(value: unknown): string | null {
    if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) {
      return null;
    }
    return value;
  }

  private httpError(status: number): DomainError {
    if (status === 401 || status === 403) {
      return new DomainError(
        'aggregator_auth_failed',
        `0x rejected the API key (http ${status})`,
        502,
      );
    }
    if (status === 429) {
      return new DomainError(
        'aggregator_rate_limited',
        '0x rate limit exceeded',
        429,
      );
    }
    return new DomainError(
      'aggregator_unavailable',
      `0x returned http ${status}`,
      502,
    );
  }

  private mapFees(body: ZeroExQuoteBody): QuoteFee[] {
    const entries: Array<ZeroExFeeEntry | undefined> = [
      body.fees?.integratorFee,
      body.fees?.zeroExFee,
      body.fees?.gasFee,
    ];
    const fees: QuoteFee[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry.amount !== 'string') {
        continue;
      }
      fees.push({
        asset:
          typeof entry.token === 'string' && HEX_ADDRESS.test(entry.token)
            ? (entry.token.toLowerCase() as `0x${string}`)
            : null,
        amount: entry.amount,
      });
    }
    return fees;
  }

  private mapRoute(
    request: QuoteRequest,
    body: ZeroExQuoteBody,
  ): SwapRouteHop[] {
    const fills = body.route?.fills ?? [];
    if (fills.length === 0) {
      return [
        {
          venue: '0x',
          assetIn: request.assetIn,
          assetOut: request.assetOut,
        },
      ];
    }
    return fills.map((fill) => ({
      venue: typeof fill.source === 'string' ? fill.source : '0x',
      assetIn: this.normalizeAsset(fill.from),
      assetOut: this.normalizeAsset(fill.to),
    }));
  }

  /** 0x signals native as null/'NATIVE'/zero address; normalize to null. */
  private normalizeAsset(value: unknown): `0x${string}` | null {
    if (typeof value !== 'string' || !HEX_ADDRESS.test(value)) {
      return null;
    }
    if (value === '0x0000000000000000000000000000000000000000') {
      return null;
    }
    return value.toLowerCase() as `0x${string}`;
  }

  /** Unit price of assetIn in assetOut; 0 when decimals are unknown. */
  private unitPrice(
    request: QuoteRequest,
    body: ZeroExQuoteBody,
    buyAmount: string,
    sellAmount: string,
  ): number {
    const decimalsByAddress = new Map<string, number>();
    for (const token of body.route?.tokens ?? []) {
      if (
        typeof token.address === 'string' &&
        typeof token.decimals === 'number'
      ) {
        decimalsByAddress.set(token.address.toLowerCase(), token.decimals);
      }
    }
    const decimalsOf = (asset: `0x${string}` | null): number | null => {
      if (asset === null) {
        return KNOWN_DECIMALS.native;
      }
      return (
        decimalsByAddress.get(asset.toLowerCase()) ??
        KNOWN_DECIMALS[asset.toLowerCase()] ??
        null
      );
    };
    const inDecimals = decimalsOf(request.assetIn);
    const outDecimals = decimalsOf(request.assetOut);
    if (inDecimals === null || outDecimals === null) {
      return 0;
    }
    const wholeIn = Number(sellAmount) / 10 ** inDecimals;
    const wholeOut = Number(buyAmount) / 10 ** outDecimals;
    if (wholeIn === 0) {
      return 0;
    }
    return wholeOut / wholeIn;
  }
}
