---
status: live
title: Balances & history
---

# Balances & history

<StatusBanner />

## Balances: read-only, honest zeros

Kryptr reads balances on **Base** and **Robinhood Chain** through chain reads
(viem) and explorer reads (Blockscout). The data path is strictly read-only:
viewing balances never produces a signature request.

Honesty rules you can rely on:

- **Zeros are never fabricated.** If an asset cannot be read, the UI shows a
  partial-failure state, not a invented balance.
- **Data source and staleness are surfaced.** Balances come from pinned,
  server-side chain configuration; the client cannot point Kryptr at another
  source.
- **Fail-closed degradation.** When the wallet API is unreachable, the app
  says so (mock fallback is labelled as such) rather than guessing.

## History: every action leaves a gate decision

Kryptr records history as **intents and decisions**, not just transactions:

- Every transfer or swap request becomes a `TransactionIntent`.
- The security gate records a `SecurityDecision` for each intent —
  `approved`, `needs_human_approval`, or `rejected` — with a reason and a
  timestamp.
- Each intent has a **timeline** of lifecycle steps (created, gate decision,
  submission, confirmation/failure) with the actor for every step.

Because signing is dry-run-only in the current phase, the on-chain part of
history (submitted/confirmed transactions) is empty by design: there is
nothing to broadcast yet. The approval side of history — what was requested,
what the gate decided, who approved — is fully live.

::: info Phase note
A consolidated, user-facing transaction history screen is not shipped yet;
today you see per-action decisions in the wallet view and the full intent
timeline in the backoffice. This is listed in
[Limitations by phase](/honest-edges/limitations).
:::

::: tip Sources
Balance-read design and poisoned-data mitigations (T6):
`docs/research/kryptr-threat-model.md` §5. Intent timeline contract:
`packages/shared-types/src/lib/transactions.ts` (`IntentTimelineStep`).
Honest-degradation UX: `apps/frontoffice` landing page status chips.
:::
