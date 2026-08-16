# Launchpad Discussion Memo — token factory round (synthesis for conductor)

> **Author:** `web3` (Kryptr crew) · **Date:** 2026-08-16 · **Status:** discussion synthesis —
> **no build decisions made**. Inputs: `bankrbot-analysis.md` §4 (Bankr fee economics),
> `web3-agent-landscape.md` §3 (Clanker narrow surface), `kryptr-threat-model.md` (T-series),
> and IRC positions collected 2026-08-16 from `vault`, `ops`, `face`, `deck`.

---

## 1. Framing

Kryptr's launchpad should combine the two proven patterns from the research:

- **Bankr economics:** 1.75% all-in fee on launched-token trades, split creator 0.665% /
  LP 0.285% / protocol 0.475% / buyback 0.2375% / venue ~0.0875%, with the trust rule
  **"fee schedule fixed at launch"** `[bankrbot-analysis.md §4]`.
- **Clanker surface:** factory contract deploys tokens and never holds user funds at rest;
  revenue flows from pool-trade fees, not custody `[web3-agent-landscape.md §3]`.

`TokenFeeSchedule` in `packages/shared-types` already models the split. The design space:

| Option | Shape                                                            | Upside                                                              | Risk                                                                        |
| ------ | ---------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A      | EIP-1167 immutable clones from a factory (Clanker-style)         | Smallest surface, no upgrade authority                              | Per-token bugs unfixable                                                    |
| B      | Upgradeable shared implementation (UUPS)                         | Post-launch fixes                                                   | Upgrade authority = centralized control over ALL tokens (Bankr RC-3 lesson) |
| C      | Immutable token + Uniswap v4 fee hook, constructor-frozen splits | Matches Base + Robinhood Chain venue reality (v4 is the launch DEX) | Hook surface is the newest attack class `[wave2 §4 T14]`                    |

---

## 2. Positions received (2026-08-16, IRC)

### 2.1 `vault` (gate/security)

1. **Deploy intents:** no new kind needed — `TransactionIntent.kind='deploy'` already exists in
   shared-types. Current gate semantics are wrong for deploys: `amount='0'` values at $0 and
   auto-approves. Position: `kind==='deploy'` → **unconditional `needs_human_approval`**,
   audit reason "deploy intents always require human approval"; later a policy-level deploy
   allowlist (approved factory addresses only). Offered to land the deploy-escalation gate
   branch in wave 3 if conductor scopes it.
2. **Fee splits:** constructor-frozen on-chain, no server-side redistribution — strongly agreed.
   Any API-side fee flow becomes custody + a mutable-control vector. Gate's only job: validate
   the `TokenFeeSchedule` (bps bounds, shares sum) **before** signing; afterwards immutable.
3. **Upgrades:** immutable EIP-1167 clones by default (Option A). Per-token blast radius beats
   centralized upgrade authority. If anything is ever upgradeable: gate HITL + timelock +
   append-only audit, all non-negotiable; upgrade authority never derived from token ownership
   (Bankr RC-3). Phase 1: **no upgrade path at all**.
4. **Rate limiting:** both layers — API-side per-origin daily cap inside `EvaluateIntentUseCase`
   (SpendLedger pattern; cheap fail-fast, evadable via fresh origins) **plus** on-chain
   deposit/bond in the factory (the real, economic spam control). API cap is a gate branch
   before approval; bond is a factory concern. Never present the API cap as the security
   boundary.

### 2.2 `ops` (contract CI)

1. **Yes** to `contracts/` as an Nx project wrapping Foundry (`nx:run-commands` → forge
   build/test/fmt) so `nx affected`, CI gates, and the pre-commit hook extend naturally; pin
   the Foundry version (foundry-toolchain action).
2. **Yes** to Slither as a required PR gate for contracts/ changes, with `slither.config.json`
   - triage baseline from day 1 (new findings block; accepted findings don't).
3. **Partial** on deploys: deterministic CREATE2 salts (derived from token params + version,
   never random) + reproducibility checks + `forge verify-contract` against both explorers —
   but real deploys sit behind a **GitHub Environment with required reviewers**; no deploy key
   reachable from default-branch CI.
4. Fork tests **not** in default CI (RPC rate limits/flakes): behind a `fork-tests` PR label +
   nightly; default gates use local mocks.
5. **Strong yes** to tagged contract releases + committed deploy manifests
   (`contracts/deployments/{chain}.json`: address, salt, commit sha, verification tx); vault
   pins router/factory allowlists from that artifact; CI validates manifest schema.

### 2.3 `face` (launch UX)

1. **3-step wizard** (details+supply → fee-lock preview → review/consent which IS the gate
   submission screen). "Immutability demands friction, not efficiency."
2. Consent screen adds: the deploying wallet (multi-wallet frontoffice), a one-sentence
   plain-language summary, and an **explicit acknowledgment toggle** ("fees cannot change after
   launch") gating submit (active consent, HITL-2). Factory address demoted to footnote+link.
   Open verification ask: confirm the deploy is truly admin-key-free/non-upgradeable so warning
   copy matches contract reality.
3. Fee preview: proportional bar **above** exact table; cost-per-$100 line ("Every $100 traded
   pays $1.75 total: $x creator / $y LP / $z protocol / $w buyback").
4. Post-launch: defer live accrual/holders (needs indexer); in scope = minimal result panel
   (token address, deploy tx, Blockscout link, echo of locked fee schedule).
5. **Chain default: Base**; Robinhood visible but disabled with reason text until vault
   confirms keys+RPC there (show-and-disable, never hide). Selector options derive from
   `wallet.chains`; validate wallet exists on selected chain **before** consent (fail-closed).
   Synthesis note: deploy intent first-class on `TransactionIntent` with launch context
   (name/symbol/supply/fee schedule), evaluated via the existing `/security/evaluate` path so
   HITL + decision rendering come free.

### 2.4 `deck` (backoffice)

1. Launch feed ≈ 6 columns (intent id / origin / token name+symbol+short address / chain /
   gate-decision badge / status); fee schedule as **one compact chip** in the list, full split +
   fee recipients on the detail page (recipients are exactly what operators scrutinize — detail
   card, not wide column); deploy tx folded into the status cell.
2. No metrics dashboard pre-volume: **one** "Token factory" health card (launches today vs the
   50/day cap, deploys by chain, failure-rate badge); fee volume per recipient stays in logs.
   API computes, deck renders; no client-side aggregation.
3. Anomalous deploy bursts: yes, but as **derived health status** (healthy/degraded/down +
   reason string) computed by the API, same envelope as `/api/health/feeds`; deck renders badge
   - reason. Deck never computes anomalies.
4. Audit: fee schedule = Launch context card on the launch-intent detail page (analog of the
   swap Quote context card); upgrade events = Decision-timeline steps bound to the intent; no
   third event stream unless upgrade events aren't intent-bound. Reuse shared-ui primitives
   (badges, cards, Collapsible, Progress) and the fixtures/mock-badge degradation convention.

---

## 3. Convergence and open questions

**Converged without disagreement (all four):**

- Option A (immutable EIP-1167 clones) as the baseline; no upgrade path in Phase 1;
  upgradeability, if ever, requires HITL + timelock + audit and never asset-derived authority.
- Fee splits frozen on-chain at deploy; API never in the fee path; gate validates the schedule
  pre-sign only.
- Deploy intents route through the existing gate/evaluate path with unconditional human
  approval (fixes the amount='0' auto-approval hole).
- Two-layer rate limiting: API cap (UX + policy) + on-chain bond (economic anchor).
- Robinhood Chain launches deferred until vault confirms chain support (RPC/keys); Base first.
- Deploy manifests as the single source of truth for vault's allowlists (ops → vault handoff).

**Open questions for the conductor:**

1. **Option A vs C:** is the Uniswap v4 fee hook (Option C) desirable for the fee-collection
   mechanics, or is a simpler factory-internal fee ledger acceptable for Phase 1? (Hook = venue
   alignment on both chains, but newest attack class `[wave2 §4 T14]`.)
2. **Bond mechanics:** on-chain deploy bond — amount, asset (ETH?), and refund conditions are
   a factory-contract decision needing an owner.
3. **Scope:** vault offered the deploy-escalation gate branch for wave 3 — approve/deny.
4. **Naming:** face proposed `kind:'deploy_token'` with launch context; vault notes
   `kind='deploy'` already exists in shared-types — reconcile in the shared-types change
   (extend `TransactionIntent` context vs new kind value).
5. **Fee defaults:** adopt Bankr's 1.75% split as the Kryptr default schedule, or parameterize
   per launch within bounds (gate validates bps bounds either way)?

## 4. Proposed T-series additions (for the next threat-model revision)

- **T17 — Fee-recipient manipulation at deploy** (constructor args swapped before signing):
  mitigated by constructor-frozen splits + gate validation + consent-screen display.
- **T18 — Deploy spam / factory griefing:** API per-origin cap + on-chain bond.
- **T19 — Valueless-intent auto-approval** (`amount='0'` bypassing thresholds): unconditional
  HITL for `kind='deploy'`.
- **T20 — Upgrade-authority abuse** (dormant while immutable; pre-empted by policy).
- **T21 — Per-token clone bugs unfixable** (cost of Option A): mitigated by Slither gate,
  fork tests, audited implementation before first launch.

---

## 5. Sources

Internal: IRC positions from `vault`, `ops`, `face`, `deck` (2026-08-16, recorded above
verbatim-in-substance); `docs/research/bankrbot-analysis.md` §4 & §7; `docs/research/
web3-agent-landscape.md` §3; `docs/research/wave2-trading-research.md` §4;
`packages/shared-types/src/lib/{token,security,transactions}.ts` (all accessed 2026-08-16).
