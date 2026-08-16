# 🎨 FACE — Wave 2 mission: swap UX

Branch: `feat/frontoffice-swap` (fresh worktree from latest `main`, AFTER
the conductor prep PR is merged). Read `docs/ORCHESTRA.md` + your designer
skills before starting. Ownership: `apps/frontoffice` only.

## Contracts (on main — consume verbatim)

From `@kryptr/shared-types`: `SwapQuote`, `QuoteRequest`, `SwapContext`,
`IntentTimelineStep`, plus the existing `ApiEnvelope`. Endpoints:
`POST /api/quotes` (QuoteRequest → SwapQuote), swap via
`POST /api/security/evaluate` with `kind:'swap'` and the `swap` context
bound to the quote id.

## Mission

Ship the swap flow on the frontoffice using ONLY `@kryptr/shared-ui/vue/*`.

### Deliverables

1. **Route** `/wallets/:id/swap` (child of wallet detail).
2. **State machine** (owned by composables, not components):
   `idle → quoting → review → submitting → result`.
   - `useQuote(walletId, params)` → `{ state, quote, secondsLeft, refresh }`.
     Live "expires in Ns" Badge from `expiresAt`; at 0 flip to an "expired"
     Badge and block submit.
   - `useSwap()` → `{ evaluate, decision, result }`; builds the swap intent
     (sell side asset/amount + `swap` context with quoteId/minBuyAmount).
   - Components stay presentation-only; no fetch in templates.
3. **Result states** (no signing in wave 2):
   - approved → "Approved — ready to sign" + clearly-labeled UNSIGNED
     calldata preview (if returned).
   - needs_human_approval → say so, with the reason.
   - rejected → `SecurityDecisionCard` reason + "adjust amount" affordance.
4. **Degradation (envelope-driven)**: expired quote → disabled review +
   refresh CTA; aggregator unreachable → inline error Banner, empty quote.
   No mock quotes near money — reads may fixture-fallback, anything that
   moves value fails closed.
5. UI exclusively from `@kryptr/shared-ui/vue/*` (dialog/tabs/tooltip/sonner
   already present). If a component is genuinely missing, STOP and flag the
   exact one to the conductor — do not hand-roll native controls.

## Acceptance

- `nx affected -t lint typecheck test build` green for frontoffice.
- Swap flow reachable from wallet detail; happy path + rejection +
  expiry all render correct states.
