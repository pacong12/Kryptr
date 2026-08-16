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

## Retro

- Done: trading module (`DexAggregatorPort` + `StaticMockDexAdapter`,
  `QuoteStore` with single-use binding, `RequestQuote`/`GetQuote`/
  `PreviewSwapExecution` use cases, `POST /api/quotes`,
  `GET /api/quotes/:id`); gate extensions (swap-context checks: quote
  exists/unused/bound-to-self, expiry + 5s margin, slippage ceiling,
  minBuyAmount floor, sell-side match); wave-2 ports + in-memory impls
  (`PriceFeedPort`/`StaticPriceFeed` with TTL fail-closed, `SpendLedger`
  idempotent per intentId, `IntentStore`, append-only `DecisionAudit`
  with decision-time USD); `GET /api/security/intents/:id/timeline`,
  `GET /api/security/intents/:id/execution-preview` (unsigned only,
  latest-decision-wins), `GET /api/health/feeds` (stale/degraded →
  `feeds_degraded` err envelope, never silent).
- Contract suite (`dex-aggregator.contract.spec.ts`) asserts quote shape
  vs shared-types, determinism, slippage floor math, TTL ordering,
  unsupported-chain domain errors, unsigned-calldata rules, FeedHealth —
  runs against StaticMockDex now; future 0x/1inch adapters run the same
  suite before wiring.
- Tests: 30 suites / 158 tests, incl. a zero-override AppModule
  integration spec covering wallet → quote → approved decision →
  timeline → unsigned preview and quote single-use replay rejection.
- Decisions: one `TransactionIntent` with optional `swap?: SwapContext`
  (no separate SwapIntent); quote binding happens at decision finalization
  for every non-rejected outcome (pending approvals hold the quote until
  TTL); re-saving a deterministic quote id never clears a binding;
  execution preview lives under `/security/intents/:id` because only the
  gate can grant it; `feeds_degraded` uses the err envelope (FeedHealth
  has no 'degraded' status — staleness is per-feed 'stale'/'down').
- Follow-ups (wave 3+): server-side origin stamping from auth (origin is
  still client-supplied), Postgres/Prisma swap behind the new ports,
  SpendLedger recording on execution confirmation, CoinGecko price adapter
  - real aggregator adapters (both must pass the contract suite),
    recipient allowlist + cooldown (HITL-3), MFA-gated policy changes
    (HITL-4).
