---
status: live
title: Fee transparency
---

# Fee transparency

<StatusBanner />

Rule of thumb: **you see every fee before you approve anything, and fee
authority never lives in Kryptr's servers.** What that means differs by
feature, so this page is split into what is live today (swaps) and what is
frozen for the launchpad (planned).

## Today: swap quotes show their fees

A swap starts as a **read-only quote** — no signature, no commitment. Each
quote carries, before you approve anything:

- the quote's **source** (which adapter produced it),
- the **fees** attached to the route, as asset + amount,
- the **slippage tolerance** in basis points (`slippageBps`),
- the **worst-case buy amount** (`minAmountOut`) — the on-chain floor derived
  from that tolerance.

The intent you approve is **bound to exactly one quote** via its quote id, so
a decision can never be replayed against a re-priced quote. Expired quotes are
rejected by the gate, not refreshed silently. If no aggregator is configured,
quotes pause — they are never invented.

Order executions follow the same discipline: a trigger is only a proposal; the
execution re-quotes at execution time, and the bound `minBuyAmount` stays the
slippage floor. If the re-quoted price violates your limit, the execution is
rejected fail-closed and your order stays open.

## Planned: launchpad fee schedules freeze at launch

The token launchpad is **planned** (the factory exists only as TESTNET
rehearsal deploys — see
[Launchpad consent](/features/launchpad-consent)), but its fee rules are
already frozen by design:

- The total fee on trades of a launched token is set **per launch**, in
  integer basis points, with **175 bps (1.75%) as the reference default**.
  Once the token launches, the schedule is **immutable** — there is no setter,
  on-chain or anywhere else.
- The fee splits across exactly four recipients frozen at deploy: `creator`,
  `lp`, `protocol`, `buyback`. The split shares are integer basis points that
  sum exactly to the launch total.
- Fee splits are **frozen on-chain at deploy time**. The API is never in the
  fee path — it validates the schedule before signing and never touches fee
  funds afterwards.
- Fee and recipient values are never runtime-tunable via environment
  configuration; they exist only as on-chain/manifest/code facts.

In short: for swaps, transparency means _displayed before approval_. For the
launchpad, it means _frozen before launch_.

::: tip Sources
Quote shape and binding: `packages/shared-types/src/lib/trading.ts` (frozen
wave-2 contract). Quote→gate→preview flow:
`docs/research/wave2-trading-research.md`. Launchpad fee freeze (175 bps
reference, four recipients, integer-bps rule):
`docs/research/wave5-t21-verification-design.md` §4.2 and
`docs/research/launchpad-discussion.md` §1/§3 ruling 5. Env cannot carry fee
authority: `docs/research/wave5-env-policy.md`. Re-quote + slippage floor at
execution: `docs/research/wave4-contract-freeze.md` §4.
:::
