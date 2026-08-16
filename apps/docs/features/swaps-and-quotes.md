---
status: live
title: Swaps & quotes
---

# Swaps & quotes

<StatusBanner />

A swap in Kryptr never starts as a transaction. It follows a fixed
four-step path:

1. **Quote** — Kryptr fetches a read-only quote from a DEX aggregator. A quote
   is a price proposal signed by no one: amount in, expected amount out,
   route, fees, slippage tolerance (`slippageBps`), and the worst-case buy
   amount (`minAmountOut`) — your on-chain floor. Every quote has an expiry
   time and a named source.
2. **Intent** — if you proceed, Kryptr submits a `TransactionIntent` with
   `kind: 'swap'`, bound to that exact quote (`quoteId`). One quote, one
   intent — the binding can never be replayed against a different price.
3. **Gate** — the security gate evaluates the intent: quote expiry, slippage
   ceiling (`maxSlippageBps`), spend caps, origin and chain allowlists. An
   expired quote or a broken bound means `rejected` — fail-closed.
4. **Preview** — an approved intent may produce **unsigned calldata**. In the
   current phase that is where it stops: signing is dry-run only, so no swap
   is broadcast on-chain yet.

## What you see before approving

- Route and venue names, per the quote.
- Fees attached to the quote (asset + amount).
- The slippage tolerance and the resulting minimum buy amount.
- The gate decision with its reason.

## Degradation you can trust

- **No aggregator configured** → quotes pause with an explicit
  `aggregator_unconfigured`-style envelope error. Quotes are never invented.
- **Quote expired** → the gate rejects the bound intent; fetch a fresh quote.
- **Gate or pricing errors** → the intent stays unapproved. Errors never
  approve.

## Phase status

Everything above the signing boundary is live. Execution on-chain is
**not live**: the preview payload is unsigned and nothing has been executed.
See [Limitations by phase](/honest-edges/limitations).

::: tip Sources
Quote/context contracts (frozen): `packages/shared-types/src/lib/trading.ts`.
Swap research and threat surface T11–T16:
`docs/research/wave2-trading-research.md`. Dry-run boundary:
`docs/research/wave1-3-evaluation.md` (wave-3 results).
:::
