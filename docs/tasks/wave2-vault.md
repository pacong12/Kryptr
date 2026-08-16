# 🔐 VAULT — Wave 2 mission: trading core

Branch: `feat/api-trading` (fresh worktree from latest `main`, AFTER the
conductor prep PR with shared-types wave-2 contracts is merged). Read
`docs/ORCHESTRA.md` + skills `kryptr-clean-architecture`, `kryptr-git-flow`
before starting. Ownership: `apps/api` only.

## Contracts (already on main — consume verbatim, never redeclare)

From `@kryptr/shared-types`: `SwapQuote`, `QuoteRequest`, `SwapContext`,
`SwapRouteHop`, `QuoteFee`, `IntentTimelineStep`, `FeedHealth`,
`TransactionIntent.swap?`.

## Mission

Add swap/trading to the API behind ports, gate extensions included.

### Deliverables

1. **Trading module** (`src/trading/`)
   - `domain/`: `DexAggregatorPort` — `getQuote(req): Promise<SwapQuote>`,
     `buildSwapTx(quote): Promise<{to, data, value}>` (UNSIGNED calldata
     only; signing never happens in this codebase).
   - `infrastructure/`: `StaticMockDexAdapter` implementing the port
     (deterministic price table, TTL'd quotes, stable ids).
   - `application/`: `RequestQuoteUseCase` (validates wallet + chain +
     assets, returns envelope), `PreviewSwapExecutionUseCase` (ONLY for
     approved intents: returns unsigned calldata labeled as preview).
   - Controller: `POST /quotes` (body = QuoteRequest),
     `GET /quotes/:id` → `ApiEnvelope<SwapQuote>`.
   - Quotes are single-use: once bound to an evaluated intent, re-binding
     must be rejected.
2. **Gate extensions** (`src/security/`)
   - Evaluate gains swap-context checks when `intent.kind === 'swap'`:
     quote exists + unused, `quoteExpiresAt > now + margin`,
     `slippageBps <= maxSlippageBps` policy, `minBuyAmount` consistent
     with the stored quote (`minAmountOut`).
   - `PriceFeedPort` (`getSpotPrice(chain, asset)`, `getUsdValue(intent)`)
     replaces direct StaticPriceLookup usage; wave-2 impl =
     `StaticPriceFeed` with TTL cache; fail-closed (stale/missing →
     `needs_human_approval`, never silent pass).
   - New ports + in-memory impls: `IntentStore`, `DecisionAudit`
     (append-only; decision USD fixed at decision time), `SpendLedger`
     (`getSpentUsdToday`, `record`) for atomic daily-cap checks. Shapes
     Postgres-ready; Postgres itself is a later task — do NOT add Prisma.
   - `GET /security/intents/:id/timeline` → `ApiEnvelope<IntentTimelineStep[]>`
     reading DecisionAudit.
   - `GET /health/feeds` → `ApiEnvelope<FeedHealth[]>` reporting
     PriceFeedPort + DexAggregatorPort freshness (stale = degraded
     envelope, never silent).
3. **Contract tests**: a suite asserting the DexAggregatorPort contract
   (quote shape vs shared-types, envelope errors, determinism, expiry)
   that runs against StaticMockDex in the normal `test` target — future
   real adapters (0x/1inch) will run the same suite.
4. **Unit tests**: every new gate branch (expired quote, used quote,
   slippage breach, minBuyAmount mismatch, stale price feed), timeline
   assembly, feed-health degradation.

## Acceptance

- `nx affected -t lint typecheck test build` green for the api project.
- No dependency additions without conductor approval (ports only).
- Nothing signs; calldata only ever leaves behind an approved decision.
