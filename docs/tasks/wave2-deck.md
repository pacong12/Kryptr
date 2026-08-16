# 📊 DECK — Wave 2 mission: trading visibility

Branch: `feat/backoffice-trading` (fresh worktree from latest `main`, AFTER
the conductor prep PR is merged). Read `docs/ORCHESTRA.md` before starting.
Ownership: `apps/backoffice` only.

## Contracts (on main — consume verbatim)

From `@kryptr/shared-types`: `SwapQuote`, `SwapRouteHop`, `SwapContext`,
`IntentTimelineStep`, `FeedHealth`. Endpoints (all `/api`-prefixed,
envelope-wrapped): `GET /api/quotes/:quoteId`,
`GET /api/security/intents/:id/timeline`, `GET /api/health/feeds`.

## Mission

Extend the existing dashboard for swap visibility — extend, don't fork.

### Deliverables

1. **Quote context card** on the intent detail page, rendered only when
   `intent.kind === 'swap'`: fetches `GET /api/quotes/:intent.swap.quoteId`
   and shows asset pair in/out, amounts, rate, slippage tolerance +
   worst-case price (`minAmountOut`), fees, expiry countdown/expired badge,
   and the route as a hop list with venue badges (use `Collapsible` from
   `@kryptr/shared-ui/react/collapsible` for the route detail; `Progress`
   from `@kryptr/shared-ui/react/progress` for slippage/cap gauges).
2. **Decision timeline** on the same detail page:
   `GET /api/security/intents/:id/timeline` → vertical step list composed
   from primitives (step, actor, detail, timestamp). Graceful empty state
   ("no timeline yet") when the endpoint 404s/envelope-errors.
3. **Data feeds card** in the dashboard health section, beside API health:
   `GET /api/health/feeds` → per-feed badge (healthy/stale/down) with
   source + price age. Reuse existing badge variants.
4. Approve/reject wiring stays in `decision-panel` unchanged; swap context
   is additive only. Polling cadence unchanged (10–15s + manual refresh);
   no websockets.
5. Mock mode: fixture quotes/timeline/feeds so the dashboard renders
   without the API, with the existing "mock data" badge convention.

## Acceptance

- `nx affected -t lint typecheck test build` green for backoffice
  (Next TS check included in build).
- Detail page renders quote + timeline for a swap intent fixture; feeds
  card renders all three statuses from fixtures.
