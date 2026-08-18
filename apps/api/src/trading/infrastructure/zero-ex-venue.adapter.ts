import { Injectable } from '@nestjs/common';
import type { TokenFeeSchedule } from '@kryptr/shared-types';
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
  VirtualPoolResult,
  VenueAccrualSnapshot,
  GraduationStatus,
} from '../domain/zero-ex-venue.adapter.types';
import { ZERO_EX_VENUE_ADAPTER } from '../domain/zero-ex-venue.adapter.types';
import type {
  DexAggregatorPort,
  DexQuoteRequest,
  UnsignedSwapTx,
} from '../domain/dex-aggregator.port';
import { QUOTE_TTL_MS } from './static-mock-dex.adapter';

/**
 * ZeroExVenueAdapter — venue marketplace for launched tokens (S4 Wave 6)
 * Implements DexAggregatorPort for quote/tx build seam (Wave 7 Milestone 3)
 *
 * **Additive Fee Model (User P2 Decision):**
 * - Trader pays: `Base Fee (175 bps)` + `Venue Share` independently
 * - Two-ledger separation: Schedule recipients (§4.5 INV-FEE-2) vs venue partner (§8.1 INV-VENUE-1)
 * - Accrual basis: "trade_amount" per-trade (TC-19/E-17 compliance)
 *
 * **Quote TTL anti-replay (TC-22):** All quotes expire and must be re-requested
 * **Bound intent ID guard (F2):** Quote's boundIntentId must match request intentId
 *
 * **Reference:** PR #134 §4.5.1 INV-FEE-2/4, §8 threat controls TC-15..TC-25, wave6-s2-venue-signing-integration.md
 */

const ZERO_EX_VERSION = 'v2';
const BASE_URL = 'https://api.0x.org';
const ZEROEX_API_KEY = process.env.ZEROX_API_KEY ?? null;

/** Phase-1 0x coverage: Base only (matching ZeroExDexAdapter). */
const ZERO_EX_CHAIN_IDS: Partial<Record<ChainId, number>> = {
  base: 8453,
};

const KNOWN_DECIMALS: Record<string, number> = {
  native: 18,
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6, // USDC on Base
};

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export const NATIVE_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export interface ZeroExVenueAdapterOptions {
  now?: () => number;
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
  liquidityAvailable?: unknown;
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

type TxCache = Map<string, UnsignedSwapTx>;

@Injectable({
  exports: [ZERO_EX_VENUE_ADAPTER],
})
export class ZeroExVenueAdapter implements DexAggregatorPort {
  private readonly chainId: number = 8453; // Base mainnet for production
  private readonly apiKey: string | null = ZEROEX_API_KEY;
  private readonly now: () => number;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly quoteTtlMs: number;

  private lastQuoteAtMs: number | null = null;
  private txCache: TxCache = new Map();

  constructor(options?: ZeroExVenueAdapterOptions) {
    this.now = options?.now ?? (() => Date.now());
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.baseUrl = options?.baseUrl ?? BASE_URL;
    this.quoteTtlMs = options?.quoteTtlMs ?? QUOTE_TTL_MS;
  }

  /**
   * Create pool for launched token at zero-ex venue
   * Returns virtual result until Tier D PASS + soaking complete (S3 rehearsal completed)
   */
  async createPool(
    walletId: string,
    tokenId: string,
    venueBps: number,
    _feeSchedule: TokenFeeSchedule,
  ): Promise<VirtualPoolResult> {
    if (venueBps < 0) {
      throw new Error('venueBps must be non-negative (PR #130 enforcement)');
    }

    const venueId = `${this.chainId}:0x-v2:${tokenId}`;

    return {
      venueId,
      poolAddress: this._generateVirtualAddress(walletId, tokenId),
      isLive: false, // Becomes true after S3 rehearsal + Tier D PASS
      accruedAt: new Date().toISOString(),
    };
  }

  /**
   * Get accrual snapshot for trade executed through venue
   * Per INV-VENUE-1: floor(trade_amount × venueBps / 10_000)
   */
  async getAccrualSnapshot(
    tradeAmount: bigint,
    venueBps: number,
  ): Promise<VenueAccrualSnapshot> {
    return {
      tradeAmount,
      venueShareBps: venueBps,
      venueAccrualWei: this._calculateFloorAccrual(tradeAmount, venueBps),
      baseFeeAccrualsWei: [], // Independent ledger
      calculatedAt: new Date().toISOString(),
    };
  }

  /** Check graduation status for venue (future logic when S4 criteria defined) */
  async checkGraduation(_venueId: string): Promise<GraduationStatus> {
    return GraduationStatus.NOT_APPLICABLE;
  }

  /**
   * DexAggregatorPort.getQuote — 0x v2 AllowanceHolder quote endpoint
   * Implements venue-aware swap quoting (Wave 7 M3 requirement)
   */
  async getQuote(request: DexQuoteRequest): Promise<SwapQuote> {
    if (!this.apiKey) {
      throw new DomainError(
        'aggregator_unconfigured',
        '0x venue adapter has no ZEROX_API_KEY; quotes unavailable',
        503,
      );
    }
    const chainId = ZERO_EX_CHAIN_IDS[request.chain];
    if (chainId === undefined) {
      throw new DomainError(
        'chain_not_supported',
        `chain "${request.chain}" is not supported by the 0x venue adapter`,
        422,
      );
    }
    const slippageBps = request.slippageBps ?? 0;
    if (!HEX_ADDRESS.test(request.taker)) {
      throw new DomainError(
        'invalid_taker',
        'taker must be a 0x-prefixed 40-hex address',
        422,
      );
    }

    const url = new URL(`${this.baseUrl}/swap/allowance-holder/quote`);
    url.searchParams.set('chainId', String(chainId));
    url.searchParams.set('sellToken', this.tokenParam(request.assetIn));
    url.searchParams.set('buyToken', this.tokenParam(request.assetOut));
    url.searchParams.set('sellAmount', request.amount);
    url.searchParams.set('slippageBps', String(slippageBps));
    url.searchParams.set('taker', request.taker);

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
        '0x venue API request failed',
        502,
      );
    }

    const normalized = this.normalize(request, body, slippageBps);
    this.lastQuoteAtMs = this.now();

    // F2 boundIntentId guard — store intent binding on the quote
    normalized.boundIntentId = request.intentId;
    normalized.expiresAt = new Date(Date.now() + this.quoteTtlMs).toISOString();

    // Cache tx for execute path
    if (body.transaction && typeof body.transaction === 'object') {
      const tx = this.normalizeTx(body.transaction);
      this.txCache.set(normalized.id, tx);
    }

    return normalized;
  }

  /**
   * Build unsigned swap transaction from cached quote
   * Returns UnsignedSwapTx ready for sign request (no signing done here)
   */
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

  /** Health check for feed monitoring */
  health(): FeedHealth {
    if (!this.apiKey) {
      return {
        feedId: 'dex:zero-ex-venue',
        source: '0x-venue',
        status: 'unconfigured',
        lastUpdateAt: null,
        priceAgeSec: null,
      };
    }
    const ageMs =
      this.lastQuoteAtMs === null ? null : this.now() - this.lastQuoteAtMs;
    const fresh = ageMs !== null && ageMs <= this.quoteTtlMs;
    return {
      feedId: 'dex:zero-ex-venue',
      source: '0x-venue',
      status: fresh ? 'healthy' : 'stale',
      lastUpdateAt: this.lastQuoteAtMs === null ? null : new Date(this.lastQuoteAtMs).toISOString(),
      priceAgeSec: ageMs === null ? null : Math.floor(ageMs / 1000),
    };
  }

  /** Normalize 0x API response to SwapQuote format */
  private normalize(
    request: QuoteRequest,
    body: ZeroExQuoteBody,
    slippageBps: number,
  ): SwapQuote {
    if (body.liquidityAvailable === false || !body.buyAmount || !body.sellAmount) {
      throw new DomainError(
        'no_liquidity',
        '0x returned insufficient liquidity or no route',
        422,
      );
    }

    const route: SwapRouteHop[] = [];
    if (body.route?.fills && body.route.tokens) {
      for (const fill of body.route.fills) {
        const source = (fill.source as string) ?? 'unknown';
        const from = (fill.from as string) ?? null;
        const to = (fill.to as string) ?? null;

        route.push({
          venue: source,
          assetIn: from ? this.decodeAddress(from) : null,
          assetOut: to ? this.decodeAddress(to) : null,
        });
      }
    }

    const feeList: QuoteFee[] = [];
    const fees = body.fees;
    if (fees?.integratorFee && fees.integratorFee.amount) {
      feeList.push({
        asset: fees.integratorFee.token
          ? this.decodeAddress(fees.integratorFee.token as string)
          : null,
        amount: String(fees.integratorFee.amount),
      });
    }
    if (fees?.gasFee && fees.gasFee.amount) {
      feeList.push({
        asset: fees.gasFee.token
          ? this.decodeAddress(fees.gasFee.token as string)
          : null,
        amount: String(fees.gasFee.amount),
      });
    }

    const amountIn = String(body.sellAmount);
    const amountOut = String(body.buyAmount);
    const price = parseFloat(amountOut) / parseFloat(amountIn);
    const minAmountOut = this.recomputeMinBuy(amountOut, slippageBps);

    return {
      id: typeof body.quoteId === 'string' ? body.quoteId : crypto.randomUUID(),
      source: 'zero-ex-venue',
      chain: request.chain,
      assetIn: request.assetIn,
      assetOut: request.assetOut,
      amountIn,
      amountOut,
      price,
      minAmountOut,
      fees: feeList.length > 0 ? feeList : undefined,
      slippageBps,
      route,
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.quoteTtlMs).toISOString(),
    };
  }

  private recomputeMinBuy(amountOut: string, slippageBps: number): string {
    const amount = BigInt(amountOut);
    const deduction = (amount * BigInt(slippageBps)) / 10_000n;
    return String(amount - deduction);
  }

  private decodeAddress(hex: string): `0x${string}` {
    return hex as `0x${string}`;
  }

  private tokenParam(token: `0x${string}` | null): string {
    if (token === null) return NATIVE_SENTINEL;
    return token;
  }

  private normalizeTx(tx: NonNullable<ZeroExQuoteBody['transaction']>): UnsignedSwapTx {
    const to = tx.to ? (this.decodeAddress(String(tx.to)) as `0x${string}`) : ('0x' as `0x${string}`);
    const data = tx.data ? (String(tx.data).startsWith('0x') ? (tx.data as string) : `0x${tx.data}`) : '0x';
    const value = tx.value ? String(tx.value) : '0';

    return { to, data, value };
  }

  /** Generate deterministic virtual pool address placeholder */
  private _generateVirtualAddress(
    walletId: string,
    tokenId: string,
  ): `0x${string}` {
    return `0x${Buffer.from(`${walletId}:${tokenId}`, 'utf8').toString('hex')}` as `0x${string}`;
  }

  /** Calculate floor accrual using exact integer arithmetic per §4.5.1 INV-FEE-4 */
  private _calculateFloorAccrual(amount: bigint, rateBps: number): bigint {
    return (amount * BigInt(rateBps)) / 10_000n;
  }

  /** HTTP error mapping */
  private httpError(status: number): DomainError {
    switch (status) {
      case 400:
        return new DomainError('invalid_request', 'Invalid 0x quote request', 422);
      case 404:
        return new DomainError('no_route', 'No liquidity route found', 422);
      case 429:
        return new DomainError('rate_limited', '0x API rate limited', 429);
      case 500:
        return new DomainError('aggregator_error', '0x internal error', 500);
      default:
        return new DomainError('aggregator_error', `0x error: ${status}`, status);
    }
  }
}
