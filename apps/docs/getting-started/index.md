---
status: live
title: What is Kryptr
---

# What is Kryptr

<StatusBanner />

Kryptr is a security-gated finance layer for autonomous agents on Base and
Robinhood Chain. Agents and automation can _propose_ actions — transfers,
swaps, orders — but every proposal becomes a structured **TransactionIntent**
that must pass a **security gate** before anything else happens. Kryptr is
built around one rule: **gate before sign.**

## The current phase

Kryptr ships in phases, and each phase ships with its security requirements —
never bolted on afterwards.

| Phase   | Scope                                                                  | State                                           |
| ------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| Phase 1 | Wallet connect, balances, gated transfers and swaps, monitoring        | **Current phase**                               |
| Phase 2 | Order automation (limit, DCA) with operator-controlled execution       | Built — preview (worker ships disabled)         |
| Phase 3 | Token launchpad with consent-frozen fees                               | Planned — factory dark (testnet rehearsal only) |
| Phase 4 | Natural-language requests become gated intents, with injection defense | Planned                                         |

**The honest one-liner for today:** you can connect, watch, plan, and approve —
but signing is dry-run only, so nothing is broadcast on-chain yet.

## What you can do right now

- **Connect a wallet and see balances** on Base and Robinhood Chain. Balance
  reads are read-only; zeros are never fabricated. See
  [Balances & history](/features/balances-and-history).
- **Request transfers and swaps.** Each request is quoted, bound to one
  intent, and evaluated by the security gate. See
  [Swaps & quotes](/features/swaps-and-quotes).
- **Create limit and DCA orders (preview).** The order worker ships disabled by default
  and every execution still passes the full gate. See
  [Orders & kill switch](/features/orders-and-kill-switch).
- **See every decision.** The gate answers `approved`, `needs_human_approval`,
  or `rejected` — with a reason — and each decision is recorded.

## What you cannot do yet

- Nothing executes on-chain: there is **no live signer** in this phase.
- The token launchpad is dark (planned; the factory exists only as testnet
  rehearsal deploys).
- There is no conversational interface yet — Kryptr is dashboard + approve.

The full list, per phase, lives in
[Limitations by phase](/honest-edges/limitations).

## How the security model feels in practice

1. You (or an agent on your behalf) submit an intent — never a raw
   transaction.
2. The security gate checks it against your wallet's policy: allowed origins,
   allowed chains, daily spend cap, approval threshold, encoded-payload
   rejection.
3. Anything above your approval threshold returns `needs_human_approval` —
   a human decides, through an authenticated flow. That is
   human-in-the-loop (HITL).
4. Only an approved intent may proceed toward execution. In the current
   phase, "proceed" ends at an **unsigned preview** — the gate ships first,
   signing ships later.

Read the full model in [Wallet & security model](/core-concepts/wallet-and-security).

::: tip Sources
Phase definitions: `docs/ROADMAP.md`. Security posture:
`docs/research/kryptr-threat-model.md` (§1 scope, §6 HITL requirements).
:::
