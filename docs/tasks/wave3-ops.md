# ⚙️ OPS — Wave 3 mission: keyed tests, live target, secret hygiene

Branch: `chore/ci-wave3` (fresh worktree from latest `main`, AFTER
conductor prep PR lands). Ownership: CI, repo tooling, `apps/api` test
harness pieces only (coordinate shapes with VaultAPI).

### Deliverables

1. **env-gate helper**: `apps/api/src/test/env-gate.ts` exporting
   `describeKeyed`/`itKeyed` driven by canonical env names
   (`ZEROX_API_KEY`, `COINGECKO_API_KEY`) — jest has no skipIf; log a
   clear "skipped: missing key" reason. Vault applies it uniformly.
2. **`.env.example`**: add `CHAIN_MODE`, `RPC_URL_BASE`, `DEX_SOURCE`,
   `ZEROX_API_KEY`, `COINGECKO_API_KEY`, `PRICE_FEED_MODE` (commented
   where keyed) with one-line guidance each.
3. **`test:live` opt-in target** (api): own jest config, runInBand, long
   timeouts; real Base RPC reads (native + multicall3 token balance of a
   well-known address). EXCLUDED from default CI; documented in README.
4. **Smoke evolution**: golden path runs with block env
   `PRICE_FEED_MODE=static` (explicit dev opt-in; default is fail-closed —
   see ruling). Add deterministic degradation assertions: unconfigured
   aggregator → `aggregator_unconfigured` envelope; unconfigured price
   feed → valuation escalates. Chain-reader smoke uses vault's stubbed
   viem seam (VIEM_CLIENT token — contract on IRC), zero network.
   Add `smoke` assertions for the deploy→needs_human_approval gate branch.
5. **Gitleaks** job in ci.yml (PRs + pushes) + verify `.env` gitignored.
6. Keep ci.yml changes minimal; document each hunk in the PR body.

## Acceptance

- CI green with zero keys configured; keyed suites skip with logged reason.
- test:live demonstrated green once locally (with public RPC, no keys).
- gitleaks catches a planted dummy secret in a scratch branch test (show
  evidence in PR body, then delete the branch).

## Retro

- Done: env-gate helper (describeKeyed/itKeyed, canonical
  ZEROX_API_KEY/COINGECKO_API_KEY, logged skip reasons); .env.example wave-3
  keys; test:live opt-in target (jest.live.cts, runInBand, 60s timeouts,
  excluded from CI line, README-documented); smoke evolved to 5 blocks
  (static-pricing golden path, zero-ex keyless 503, fail-closed escalation +
  health feeds, deploy escalation, stubbed VIEM_CLIENT chain reads — zero
  network everywhere); gitleaks job on PRs + pushes with job-level
  permissions (pull-requests:read).
- Acceptance evidence: gitleaks caught the planted dummy secret
  (RuleID github-pat, gitleaks-scratch.txt:2, scratch PR #28 closed +
  branch deleted). test:live demo + blocks 2–5 green land after
  feat/api-real-integrations merges (vault-first order, same as wave 2).
- Learned: gitleaks-action v2 PR mode needs pull-requests:read (403
  without); PR workflows run from the HEAD branch — a scratch branch cut
  from main won't exercise new jobs until the feature branch is merged in;
  contract-first IRC locking again meant zero integration drift;
  jest.ProvidesCallback is the right fn type for keyed-test helpers.
