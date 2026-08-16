import type { ChainId, FeedHealth, TriggerPricePrint } from '@kryptr/shared-types';
import type { TriggerPricePort } from '../domain/trigger-price.port';

/**
 * Dev-only trigger source (source 'static', hermetic tests). The print
 * is injectable; null simulates an unknown price so fail-closed paths
 * are testable without any network.
 */
export class StaticTriggerPrice implements TriggerPricePort {
  private readonly print: TriggerPricePrint | null;
  private readonly now: () => Date;

  constructor(options: {
    print?: TriggerPricePrint | null;
    priceUsd?: string;
    now?: () => Date;
  } = {}) {
    this.now = options.now ?? (() => new Date());
    this.print =
      options.print !== undefined
        ? options.print
        : {
            source: 'static',
            priceUsd: options.priceUsd ?? '3000',
            observedAt: this.now().toISOString(),
          };
  }

  async getPrint(_input: {
    chain: ChainId;
    baseAsset: `0x${string}` | null;
    quoteAsset: `0x${string}` | null;
  }): Promise<TriggerPricePrint | null> {
    return this.print ? { ...this.print } : null;
  }

  health(): FeedHealth {
    return {
      feedId: 'trigger-price:static',
      source: 'static',
      status: this.print ? 'healthy' : 'unconfigured',
      lastUpdateAt: this.print?.observedAt ?? null,
      priceAgeSec: this.print
        ? Math.max(
            0,
            Math.round((this.now().getTime() - Date.parse(this.print.observedAt)) / 1000),
          )
        : null,
    };
  }
}
