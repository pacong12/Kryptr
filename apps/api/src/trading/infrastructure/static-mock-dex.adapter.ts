import { createHash } from 'node:crypto';
import type {
  ChainId,
  FeedHealth,
  QuoteRequest,
  SwapQuote,
} from '@kryptr/shared-types';
import { DomainError } from '../../common/domain-error';
import type {
  DexAggregatorPort,
  UnsignedSwapTx,
} from '../domain/dex-aggregator.port';

/**
 * Wave-2 aggregator implementation: deterministic static prices, TTL'd
 * quotes, stable ids. The real 0x/1inch adapters implement the same
 * DexAggregatorPort and must pass the shared contract suite.
 *
 * Quotes ANY pair on phase-1 chains: known table first, deterministic
 * $1 fallback for unknown tokens. buildSwapTx returns UNSIGNED calldata
 * only — nothing here signs, ever.
 */

export const QUOTE_TTL_MS = 60_000;

/** Micro-USD per WHOLE unit + decimals, keyed chain:asset. */
const ASSET_PRICES: Record<string, { usdMicro: bigint; decimals: number }> = {
  'base:native': { usdMicro: 3_000_000_000n, decimals: 18 },
  'base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
    usdMicro: 1_000_000n,
    decimals: 6,
  },
  'robinhood-chain:native': { usdMicro: 1_000_000n, decimals: 18 },
};

const FALLBACK_PRICE = { usdMicro: 1_000_000n, decimals: 18 };

const PHASE_ONE_CHAINS: ReadonlySet<ChainId> = new Set([
  'base',
  'robinhood-chain',
]);

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export class StaticMockDexAdapter implements DexAggregatorPort {
  private readonly startedAtMs = Date.now();
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  async getQuote(request: QuoteRequest): Promise<SwapQuote> {
    if (!PHASE_ONE_CHAINS.has(request.chain)) {
      throw new DomainError(
        'chain_not_supported',
        `chain "${request.chain}" is not supported by the dex adapter`,
        422,
      );
    }
    const assetIn = this.assetPrice(request.chain, request.assetIn);
    const assetOut = this.assetPrice(request.chain, request.assetOut);
    // QuoteRequest.slippageBps is optional; a deterministic mock applies
    // no slippage buffer unless the caller asks for one.
    const slippageBps = request.slippageBps ?? 0;

    const amountIn = BigInt(request.amount);
    const valueUsdMicro =
      (amountIn * assetIn.usdMicro) / 10n ** BigInt(assetIn.decimals);
    const amountOut =
      (valueUsdMicro * 10n ** BigInt(assetOut.decimals)) / assetOut.usdMicro;
    const minAmountOut = (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;

    const fetchedAtMs = this.now();
    const id = sha256Hex(
      [
        request.chain,
        request.assetIn ?? 'native',
        request.assetOut ?? 'native',
        request.amount,
        slippageBps,
      ].join('|'),
    ).slice(0, 32);

    return {
      id,
      source: 'static-mock',
      chain: request.chain,
      assetIn: request.assetIn,
      assetOut: request.assetOut,
      amountIn: request.amount,
      amountOut: amountOut.toString(),
      price: Number(assetIn.usdMicro) / Number(assetOut.usdMicro),
      minAmountOut: minAmountOut.toString(),
      slippageBps,
      route: [
        {
          venue: 'static-mock',
          assetIn: request.assetIn,
          assetOut: request.assetOut,
        },
      ],
      fetchedAt: new Date(fetchedAtMs).toISOString(),
      expiresAt: new Date(fetchedAtMs + QUOTE_TTL_MS).toISOString(),
    };
  }

  async buildSwapTx(quote: SwapQuote): Promise<UnsignedSwapTx> {
    return {
      to: `0x${sha256Hex(`router:${quote.chain}`).slice(0, 40)}` as `0x${string}`,
      data: `0x${sha256Hex(`swap:${quote.id}`)}` as `0x${string}`,
      value: quote.assetIn === null ? quote.amountIn : '0',
    };
  }

  health(): FeedHealth {
    return {
      feedId: 'dex:static-mock',
      source: 'static-mock',
      status: 'healthy',
      lastUpdateAt: new Date(this.startedAtMs).toISOString(),
      priceAgeSec: Math.floor((Date.now() - this.startedAtMs) / 1000),
    };
  }

  private assetPrice(
    chain: ChainId,
    asset: `0x${string}` | null,
  ): { usdMicro: bigint; decimals: number } {
    return ASSET_PRICES[`${chain}:${asset ?? 'native'}`] ?? FALLBACK_PRICE;
  }
}
