---
status: live
title: Orders & kill switch
---

# Orders & kill switch

<StatusBanner />

Orders let you pre-define trades — **limit** orders and **DCA** (dollar-cost
averaging) schedules — that the order worker evaluates on a timer. Every
execution attempt still goes through the full security gate: an order is a
standing instruction, never a pre-authorization.

## Supported order types

| Type    | State                                                                |
| ------- | -------------------------------------------------------------------- |
| `limit` | Supported — triggers once when the price condition is met.           |
| `dca`   | Supported — recurring; each slot is a separate, gated execution.     |
| `stop`  | **Not supported yet** — rejected at creation with an explicit error. |
| `twap`  | **Not supported yet** — rejected at creation with an explicit error. |

Unsupported types are rejected loudly (`order_type_unsupported`), never
accepted silently.

## Order lifecycle (frozen vocabulary)

An order moves through these statuses:
`pending_approval`, `open`, `paused`, `triggered`, `filled`,
`partially_filled`, `cancelled`, `rejected`, `expired`, `failed`.

Notes that matter in practice:

- A successful DCA slot returns the order to `open` for the next slot; only
  the final slot reaches `filled`.
- `failed`, `cancelled`, `expired`, and `filled` are terminal — automation
  never touches a terminal order.
- An order whose TTL runs out without triggering becomes `expired` (limit
  orders).

## Trigger prices: two sources, fail-closed

Trigger evaluation uses an on-chain Chainlink Data Feed as the primary source
and a keyless market-price source as the sanity check. The rules:

- **Freshness bound** — a feed reading older than the max-age window (default
  45 minutes) is treated as stale: `trigger_price_stale`, no trigger, order
  stays `open`.
- **Deviation bound** — if primary and sanity sources disagree beyond the
  deviation limit (default 0.5%), there is no trigger.
- **Unknown price** — if both sources fail, the outcome is
  `needs_human_approval` posture: the order stays `open` and waits. A stale
  or unknown price never fires an order.

## A trigger is a proposal, not an authorization

When a condition triggers, the worker mints a **fresh TransactionIntent** for
that slot — deterministic id, origin `automation:order-worker` — and runs it
through the full gate: caps, allowlists, kill switch, HITL thresholds. The
execution re-quotes at execution time and re-checks your limit bound; a
violated bound rejects fail-closed and the order stays open. Gate decisions
are never auto-retried.

## Kill switch

Three frozen modes, checked at execution time (not only at evaluation):

- `off` — normal operation.
- `pause_new` — the worker stops creating new executions; registered orders
  stay in place.
- `cancel_active` — all `open` and `paused` orders are cancelled (each with
  an audit entry) and new executions are refused.

Every mode change is a confirmed action with an audit entry recording actor,
time, from→to, and reason.

## Phase status: preview — two honest boundaries {#phase-status-preview}

1. **The worker ships disabled by default.** Until automation is explicitly
   switched on, order pages degrade fail-closed ("unavailable" — never guessed
   healthy).
2. **Executions are dry-run only.** Executed slots stop at the unsigned
   boundary — nothing is broadcast on-chain yet, because there is no live
   signer.

Worker problems surface as human-readable messages mapped from frozen error
codes (`worker_unavailable`, `kill_switch_active`, `quote_unavailable`, …) —
never raw stack traces.

::: tip Sources
Frozen order lifecycle, kill-switch modes, oracle rules, and intent
automation contract: `docs/research/wave4-contract-freeze.md` §1–§5 (incl.
revisions). Trigger threats T22–T24: `docs/research/kryptr-threat-model.md`.
Worker error vocabulary: `packages/shared-types/src/lib/orders.ts`.
:::
