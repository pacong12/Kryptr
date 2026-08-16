---
status: live
title: Glossary
---

# Glossary

<StatusBanner />

The vocabulary below is **frozen**: these terms and status values are
contracts, and Kryptr's apps use the same strings. If you see one of these
words in the app, this is what it means.

## Approval & gate

- **TransactionIntent** — the only thing a user, agent, or automation can
  submit: a structured request (`transfer`, `swap`, `deploy`, or `approve`).
  Nothing else ever reaches the gate.
- **Origin** — who created an intent: `user`, `agent:<id>`, or
  `automation:<id>`. Assigned server-side; never taken from the request.
- **Security gate** — the policy checkpoint every intent passes before
  anything else happens.
- **SecurityPolicy** — your wallet's rules: allowed origins, allowed chains,
  approval threshold (USD), daily cap (USD), encoded-payload rejection.
- **SecurityDecision** — the gate's recorded answer: `approved`,
  `needs_human_approval`, or `rejected`, always with a reason.
- **HITL (human-in-the-loop)** — decisions reserved for people: values above
  your approval threshold, all token deploys, policy changes.
- **Fail-closed** — on any error or unknown, refuse; never approve by
  default, never fabricate data.
- **Kill switch** — operator control with three modes: `off`, `pause_new`
  (no new executions), `cancel_active` (cancel all open/paused orders and
  refuse executions). Checked at execution time; changes are audited.

## Trading

- **SwapQuote** — a read-only price proposal: amounts, route, fees,
  `slippageBps`, `minAmountOut` (worst-case buy amount), expiry. Signed by
  no one.
- **Quote binding** — a swap intent references exactly one quote id; the
  decision cannot be replayed against another price.
- **`minBuyAmount`** — the slippage floor carried by a swap context; the
  minimum acceptable buy amount at execution.

## Orders

- **Order types** — `limit` (supported), `dca` (supported, recurring),
  `stop` and `twap` (not supported yet — rejected at creation).
- **Order statuses** — `pending_approval`, `open`, `paused`, `triggered`,
  `filled`, `partially_filled`, `cancelled`, `rejected`, `expired`, `failed`.
  The last four are terminal.
- **Trigger** — a price observation from an on-chain feed (primary) checked
  against a sanity source within deviation bounds. A trigger is a proposal:
  it mints a fresh intent through the full gate.

## Signing

- **Dry-run signing boundary** — today's signer port: approved intents yield
  unsigned calldata previews; no signature, no broadcast.
- **Signer boundary** — the future, dedicated signing surface. It accepts
  only gate-approved intents; no other module can reach it.

## Launchpad

- **DeployContext** — the launch parameter set frozen at consent: token
  identity, supply, factory, fee schedule + recipients, bond-paid, and the
  verification reference.
- **Fee schedule** — per-launch total fee in integer basis points (reference
  175 bps), split across four recipients (`creator`, `lp`, `protocol`,
  `buyback`), frozen on-chain at deploy, immutable after.
- **Bond** — the on-chain payment required to launch; the economic anchor
  against launch spam.
- **Deploy manifest** — the ops-maintained, CI-validated list of trusted
  factory addresses per chain. Empty manifest ⇒ launchpad dark.
- **T21 verification battery** — the pre-live gate for the factory: invariant
  tests, static analysis, fork tests, and on-chain proofs of
  admin-key-free/non-upgradeable construction.
- **Verification artifact** — the recorded battery result, addressed by a
  stable id (`t21:<chain>:<releaseTag>`) and integrity-checked by its
  `contentHash`.
- **Verification claims (frozen vocabulary)** — `admin_key_free`,
  `non_upgradeable`, `fee_split_invariant`, `bond_accounting`. The only
  statement they support: _passed the verification battery — this is not a
  warranty._
- **Automation firewall** — automation cannot launch tokens — every deploy
  requires human approval. Structural, not configurable.

## Status vocabulary

- **live** — available in Kryptr today, within stated phase boundaries.
- **preview** — built and visible, not fully enabled; degrades fail-closed.
- **planned** — designed and contract-frozen, not available yet.

::: tip Sources
Frozen contracts: `packages/shared-types/src/lib/*.ts`
(`security.ts`, `transactions.ts`, `trading.ts`, `orders.ts`, `deploy.ts`).
Kill switch and order lifecycle: `docs/research/wave4-contract-freeze.md`.
Launchpad vocabulary: `docs/research/wave5-launchpad-vault-design.md`,
`docs/research/wave5-t21-verification-design.md`.
:::
