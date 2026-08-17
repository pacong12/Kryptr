---
status: live
title: Limitations by phase
---

# Limitations by phase

<StatusBanner />

This page lists what Kryptr **cannot** do yet. It exists on purpose: a
security product is only trustworthy when its edges are named. Each item
carries the phase that owns the fix.

## Phase 1 boundary — no on-chain execution yet {#no-on-chain-execution}

**There is no live signer.** Every flow that moves value — transfers, swaps,
order executions — stops at the unsigned dry-run boundary:

- Signature previews are never broadcast.
- Order executions stop at the unsigned dry-run boundary — nothing is
  broadcast on-chain yet.
- Approved intents produce unsigned calldata, nothing more.

This is the single biggest limitation and it is deliberate: the gate shipped
first so that when signing lands, it lands behind a gate-exclusive boundary.
Signing is a dedicated future phase (see
[Wallet & security model](/core-concepts/wallet-and-security)).

## Wallet & connectivity

- **WalletConnect is not integrated** — connect is a Phase 1 session flow.
  Self-custody connect modes are planned with the signing boundary.
- **Robinhood Chain support is partial.** Balances on Robinhood Chain are
  readable and the chain is selectable in forms — but execution is gated
  server-side, and launches stay deferred until chain support is confirmed.

## Orders

- **The order worker ships disabled by default.** Until it is switched on,
  order automation is unavailable and the pages say so (fail-closed, never
  guessed healthy).
- **`stop` and `twap` orders are not supported** — creation is rejected with
  an explicit `order_type_unsupported` error.
- Order automation currently runs single-instance by operational policy;
  multi-replica persistence is a later phase.

## Launchpad

- **The launchpad is dark.** The factory and its token template exist only as
  TESTNET rehearsal deploys (Base Sepolia 84532 and Robinhood Chain testnet
  46630); the deploy manifest is empty, and no T21 verification artifact
  exists — so every deploy intent is rejected. The factory goes live only
  after the Tier D battery passes. See
  [Launchpad consent](/features/launchpad-consent).
- No token pages, fee accrual views, or graduation mechanics exist yet.

## Interface

- **No conversational layer.** Kryptr today is dashboard + approve; natural
  language requests (and their injection defenses) belong to Phase 4.
- **No notifications or price alerts** — order fills and alerts are a later
  phase.
- No social connectors of any kind yet.

## Things Kryptr will never do (non-goals)

- Hold your keys (custodial key storage inside the API).
- Provide a direct "AI output → signed transaction" path.
- Offer leveraged trading.

::: tip Sources
Phase plan and non-goals: `docs/ROADMAP.md`. Dry-run signing boundary:
`docs/research/wave1-3-evaluation.md`; operational conditions (single
replica, automation default-denied): `docs/tasks/followups.md`. Launchpad
dark posture: `docs/research/wave5-launchpad-vault-design.md` §1 layer 2.
:::
