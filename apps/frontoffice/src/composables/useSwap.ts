import { computed, ref } from 'vue';
import type {
  ChainId,
  SecurityCheckResult,
  SwapQuote,
  TransactionIntent,
} from '@kryptr/shared-types';
import { useTransfer } from '@/composables/useTransfer';

/**
 * Build the security-gate intent for a swap: the sell side as the intent
 * payload plus a `swap` context binding the intent to exactly one quote
 * (quoteId + slippage floor + expiry), so a decision can never be replayed
 * against a re-priced quote.
 */
export function buildSwapIntent(
  walletId: string,
  chain: ChainId,
  quote: SwapQuote,
): TransactionIntent {
  return {
    id: crypto.randomUUID(),
    walletId,
    chain,
    kind: 'swap',
    to: null,
    asset: quote.assetIn,
    amount: quote.amountIn,
    origin: 'user',
    swap: {
      quoteId: quote.id,
      buyAsset: quote.assetOut,
      minBuyAmount: quote.minAmountOut,
      maxSlippageBps: quote.slippageBps,
      quoteExpiresAt: quote.expiresAt,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Owns the swap leg of the flow: binds a ready quote to a TransactionIntent
 * and runs it through the security gate (delegates to useTransfer, which
 * blocks when the gate is unreachable). Wave 2 ends at the decision — no
 * signing — so an optional unsigned calldata preview is surfaced when the
 * gate returns one, but nothing here ever executes.
 */
export function useSwap() {
  const {
    submitting,
    decision,
    error,
    gateUnreachable,
    evaluate: evaluateIntent,
    reset,
  } = useTransfer();
  const preview = ref<string | null>(null);

  const result = computed<SecurityCheckResult | null>(
    () => decision.value?.result ?? null,
  );

  async function evaluate(
    walletId: string,
    chain: ChainId,
    quote: SwapQuote,
  ): Promise<void> {
    preview.value = null;
    await evaluateIntent(buildSwapIntent(walletId, chain, quote));
    // Wave-2 gate decisions may carry an unsigned calldata preview; widen
    // defensively rather than trusting the field blindly.
    const decided: unknown = decision.value;
    if (
      typeof decided === 'object' &&
      decided !== null &&
      'preview' in decided &&
      typeof decided.preview === 'string'
    ) {
      preview.value = decided.preview;
    }
  }

  return {
    submitting,
    decision,
    result,
    preview,
    error,
    gateUnreachable,
    evaluate,
    reset,
  };
}
