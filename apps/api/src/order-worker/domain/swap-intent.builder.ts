import type { ChainId, TransactionIntent } from '@kryptr/shared-types';

/** Origin allow-listed by the gate for automation (stage A prep). */
export const AUTOMATION_ORIGIN = 'automation:order-worker';

/** Everything the worker needs to build one swap intent, nothing more. */
export interface AutomationSwapIntentInput {
  orderId: string;
  slotKey: string;
  walletId: string;
  chain: ChainId;
  to: `0x${string}`;
  assetIn: `0x${string}` | null;
  assetOut: `0x${string}` | null;
  amount: string;
  createdAt: string;
  quote: {
    id: string;
    minAmountOut: string;
    slippageBps: number;
    expiresAt: string;
  };
}

/**
 * The SOLE construction site for automation intents (wave-5 firewall
 * layer 0 — launchpad-decision.md condition 3). The return type pins
 * `kind` to the literal 'swap': the compiler rejects `kind: 'deploy'`
 * here, and the deploy-boundary spec asserts this builder stays the
 * only order-worker file that constructs a TransactionIntent.
 */
export function buildAutomationSwapIntent(
  input: AutomationSwapIntentInput,
): TransactionIntent & { kind: 'swap' } {
  return {
    id: `intent:${input.orderId}:${input.slotKey}`,
    walletId: input.walletId,
    chain: input.chain,
    kind: 'swap',
    to: input.to,
    asset: input.assetIn,
    amount: input.amount,
    origin: AUTOMATION_ORIGIN,
    createdAt: input.createdAt,
    swap: {
      quoteId: input.quote.id,
      buyAsset: input.assetOut,
      minBuyAmount: input.quote.minAmountOut,
      maxSlippageBps: input.quote.slippageBps,
      quoteExpiresAt: input.quote.expiresAt,
    },
  };
}
