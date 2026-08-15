import { Injectable } from '@nestjs/common';
import type { TransactionIntent } from '@kryptr/shared-types';
import type { PriceLookup } from '../application/ports';

/**
 * Static price table stub (Wave 1). Wave 2 replaces this with a real
 * market-data adapter; the security gate only depends on the PriceLookup
 * port, so the swap is a module-wiring change.
 *
 * Values are fixed on purpose: deterministic decisions in dev/tests, and
 * no external calls from the security path.
 */

interface StaticPrice {
  unitPriceUsd: number;
  decimals: number;
}

const STATIC_PRICES: Record<string, StaticPrice> = {
  'base:native': { unitPriceUsd: 3000, decimals: 18 },
  'robinhood-chain:native': { unitPriceUsd: 1, decimals: 18 },
  // USDC on Base
  'base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
    unitPriceUsd: 1,
    decimals: 6,
  },
};

const DECIMAL_AMOUNT_RE = /^(0|[1-9][0-9]*)$/;

@Injectable()
export class StaticPriceLookup implements PriceLookup {
  async getUsdValue(intent: TransactionIntent): Promise<number | null> {
    const key = `${intent.chain}:${intent.asset ?? 'native'}`;
    const price = STATIC_PRICES[key];
    if (!price) return null;
    if (!DECIMAL_AMOUNT_RE.test(intent.amount)) return null;
    const units = Number(BigInt(intent.amount));
    return (units / 10 ** price.decimals) * price.unitPriceUsd;
  }
}
