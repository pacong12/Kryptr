---
status: live
title: Wallet & security model
---

# Wallet & security model

<StatusBanner />

Kryptr's security model rests on four properties: **keyless by construction**,
**read-only by default**, **gate before sign**, and **human-in-the-loop**.
This page explains each in plain terms and says exactly where signing stands
today.

## Keyless by construction

Kryptr never stores seed phrases or raw private keys — not in the API, not in
environment files, not in tests. A deployment environment does not even accept
a private-key variable: keyless is a construction property, not a config
choice. If a feature would ever require Kryptr to hold your key, that feature
is rejected by design.

## Read-only by default

Everything Kryptr does with your wallet today is a **read**: balances and
token data come from chain reads (viem) and explorer reads (Blockscout) on
Base and Robinhood Chain. Reads are served through pinned, server-side chain
configuration — the client never chooses the data source. When a read fails,
Kryptr shows the failure honestly instead of inventing a number: zeros are
never fabricated.

## The security gate

Automation and agents can only produce one thing: a structured
**TransactionIntent** (kinds: `transfer`, `swap`, `deploy`, `approve`). Every
intent carries an `origin` — `user`, `agent:<id>`, or `automation:<id>` — and
the origin is assigned **server-side** from your authenticated session. It is
never accepted from the request payload.

The gate evaluates each intent against your wallet's security policy:

| Check                     | Rule                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Origin allowlist          | Only origins explicitly allowed for this wallet pass (default: `user`). Automation origins are denied by default. |
| Chain allowlist           | The intent's chain must be allowed for this wallet.                                                               |
| Encoded-payload rejection | Obfuscated/encoded instructions are rejected at the boundary.                                                     |
| Approval threshold        | Above `approvalThresholdUsd`, the decision becomes `needs_human_approval`.                                        |
| Daily cap                 | `dailyCapUsd` bounds total outbound value per wallet per day; `0` means no outbound at all.                       |

The gate answers with exactly one of three results: `approved`,
`needs_human_approval`, or `rejected` — always with a reason, always recorded.
Errors never approve: any failure keeps the intent unsigned. This is
**fail-closed**.

## Human-in-the-loop (HITL)

Some decisions are reserved for people:

- Intent above your approval threshold → a human approves through an
  authenticated flow, or nothing happens.
- Every transfer shows its full parameters (recipient, asset, amount, chain)
  for explicit confirmation before it may proceed.
- Token deploys (`kind: 'deploy'`) **always** require human approval —
  unconditionally, for every origin class. This is permanent.
- Security-policy changes are human acts, visible in the audit trail.
  Automation may never edit policy.

Every approved action records who approved it; approvals are single-use.

## Signing: a future boundary, dry-run today

Signing is designed as a **separate boundary** that the API can only reach by
requesting a signature for an already-approved intent — no other path exists,
by construction.

**Phase status of signing: planned.** Today the signing boundary is a dry-run
port: approved intents produce **unsigned calldata previews and nothing else**.
No signature is produced, and nothing is broadcast on-chain. When live signing
lands, it lands behind this same gate-exclusive boundary — the gate ships
first, the signer ships later.

## Kill switch and audit trail

Operators hold a kill switch with three frozen modes: `off`, `pause_new`
(stop new executions, keep existing orders registered), and `cancel_active`
(cancel all open and paused orders, refuse new executions). The switch is
checked at execution time, and every mode change is an audited action with a
reason. See [Orders & kill switch](/features/orders-and-kill-switch).

Every gate decision, policy change, and approval is written to an append-only
audit trail — detection and forensics depend on it.

::: tip Anti-phishing
Kryptr documentation lives on one official domain (see this site's footer).
Kryptr never asks you to approve actions via links in messages — consent and
verification always happen inside the app's own screens.
:::

::: tip Sources
Keyless + gate + HITL requirements: `docs/research/kryptr-threat-model.md`
(§1 assumptions A1–A3, §5 threats T1–T10, §6 HITL-1…HITL-5, §7 gate
requirements). Env policy (`PRIVATE_KEY` rejected outright):
`docs/research/wave5-env-policy.md`. Order kill switch:
`docs/research/wave4-contract-freeze.md` §3. Signing-boundary decision:
`docs/research/wave2-trading-research.md`; roadmap non-goal
"custodial key storage inside the API": `docs/ROADMAP.md`.
:::
