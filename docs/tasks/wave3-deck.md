# 📊 DECK — Wave 3 mission: real-data visibility + polling

Branch: `feat/backoffice-real` (fresh worktree from latest `main`, AFTER
conductor prep PR lands). Ownership: `apps/backoffice` only.

## Contracts (on main — consume verbatim)

`FeedStatus` now includes `'unconfigured'`; `ChainReaderHealth` new.
Endpoints: `GET /api/health/chains` → `ApiEnvelope<ChainReaderHealth[]>`
(never contains raw RPC URLs); existing `GET /api/wallets/:id/balances`
now real in viem mode (shape stable).

### Deliverables

1. **Data feeds card update**: render `'unconfigured'` as outline badge +
   note "no API key configured", price age "—". Distinct from `down`
   (configured but failing). Clients only render status — the API decides.
2. **Chain connections card** beside Data feeds: per-chain
   `{chainId, provider, reachable, blockHeight, latencyMs, lastBlockAt}` —
   reachable badge, block height, latency. Parallel Suspense, existing
   pattern. Mock-mode fixture included.
3. **Wallet detail page** `/wallets/[id]`: native balance + token holdings
   from the existing balances endpoint, formatted with symbol/decimals;
   loading skeletons + error state. Link from the wallets table row.
4. **Polling (closes followups.md item 1)**: 10–15s auto-refresh via
   router.refresh() on dashboard sections (health/feeds/chains/wallets) +
   manual Refresh button; decision-panel untouched. Clean up timers on
   unmount; pause when tab hidden if trivial, else skip.
5. No new shadcn components expected; flag any genuine gap before adding.

## Acceptance

- Gates green (build includes Next TS check); mock + live modes verified;
  unconfigured/down/stale/healthy all render from fixtures.
