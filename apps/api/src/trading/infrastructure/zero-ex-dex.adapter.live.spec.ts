import { describeKeyed } from '../../test/env-gate';
import {
  baseQuoteRequest,
  dexAggregatorContractSuite,
} from '../domain/dex-aggregator.contract.spec';
import { ZeroExDexAdapter } from './zero-ex-dex.adapter';

/**
 * Live 0x contract run — ONLY when ZEROX_API_KEY is set. Keyless CI logs
 * the skip reason (env-gate) and runs the mocked unit suite instead.
 * Live mode relaxes market-dependent assertions; every security invariant
 * (recomputed slippage floor, unsigned calldata only, chain allowlist)
 * still holds.
 */
describeKeyed('ZEROX_API_KEY', 'ZeroExDexAdapter (live 0x API)', () => {
  dexAggregatorContractSuite(
    'ZeroExDexAdapter(live)',
    () => new ZeroExDexAdapter({ apiKey: process.env.ZEROX_API_KEY }),
    { live: true },
  );

  it('quotes 1 ETH -> USDC on Base and returns executable unsigned calldata', async () => {
    const dex = new ZeroExDexAdapter({ apiKey: process.env.ZEROX_API_KEY });
    const quote = await dex.getQuote(baseQuoteRequest());
    expect(BigInt(quote.amountOut)).toBeGreaterThan(0n);
    expect(BigInt(quote.minAmountOut)).toBeLessThanOrEqual(
      BigInt(quote.amountOut),
    );
    const tx = await dex.buildSwapTx(quote);
    expect(tx.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(tx.data).toMatch(/^0x[0-9a-fA-F]+$/);
    // native sell: value is the sell amount; never a signed field
    expect(tx.value).toBe(quote.amountIn);
  }, 30_000);
});
