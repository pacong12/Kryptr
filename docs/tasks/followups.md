# Follow-ups

Small conductor-filed tasks between waves.

## Done

- ~~Backoffice polling~~ — shipped in wave 3 (PR #26, commit 73e3f0b):
  12s router.refresh() paused when tab hidden + manual Refresh button.

## Open

### Wave 4 gate hardening (from independent code + security review of PR #42)

Owner: VaultAPI. Entry criteria for enabling worker execution (contract §5):

- **F1 [high] cap TOCTOU** — check-then-record across await points lets N
  concurrent intents on one wallet bypass `dailyCapUsd` (CWE-362/367).
  Fix: per-wallet serialization of the cap path (single-instance mutex now;
  atomic compare-and-reserve with the Postgres ledger later) + concurrency test.
- **F2 [medium] quote bind race** — `QuoteStore.bind()` result ignored and
  sign/preview paths never verify `boundIntentId`, so one quote can serve two
  approved intents under concurrency. Fix: honor `bind() === false`
  (reject the loser) + verify binding in `RequestSignatureUseCase` and
  `PreviewSwapExecutionUseCase`.
- **F5 [low→mandatory with persistence]** — `finish()` appends the audit entry
  before `record()`; a failing record leaves a signable, unrecorded approval.
  Fix ordering (record before audit) or make record failure unusable.
  Becomes live the moment a fallible ledger (Postgres) lands.

Accepted risks (recorded, do not fix now):

- **cap-exhaustion DoS** — decision-time recording + unauthenticated
  `POST /security/evaluate` lets a caller burn any wallet's daily cap without
  signing. Inherent to ruling A; mitigation = rate limiting + auth in a later
  hardening phase.
- **per-UTC-day idempotency** — re-approving the same intentId across midnight
  over-counts (fail-safe direction); contract wording must stay explicit.

Source: independent one-shot `reviewer` + `security-reviewer` audits of PR #42
(wave-4 prep A), both verdicts GO / safe-to-merge-with-conditions.

### Wave 4 stage-B worker review (independent code + security review of PR #54)

Review54 verdict: **GO-WITH-FIXES**. SecReview54 verdict: **SAFE-WITH-CONDITIONS**.
Fix batch assigned to VaultAPI on branch `feat/order-worker` (pre-merge):

- **H1 [high]** DCA one-shot: first approved slot terminated the order.
  Fix: DCA returns to `open` after a successful slot; only the final slot
  sets `filled`. Freeze amendment adds `triggered -> open` for DCA mid-cycle.
- **M1 [medium]** retry-exhaustion zombie: no BullMQ `failed` finalizer left
  orders `triggered` forever. Fix: failed-event listener marks execution +
  order `failed` with audit (freeze §1).
- **OW-1 [medium]** cancel_active in-flight window: an execution claimed
  before the kill-switch flip could finalize `submitted` on a cancelled
  order. Fix: re-read kill state + order liveness after gate approval,
  before marking `submitted`. Mandatory before any real signer.
- **OW-2 [medium]** claim-continuation race: two processors could work one
  slot concurrently (in-memory transport has no dedupe; overlapping
  scheduler ticks). Fix: ownership on continuation (dedupe + tick guard or
  CAS claim); exactly one approved decision per slot. Mandatory before any
  real signer (double-signing vector).
- **M2 [medium]** ruling: `minBuyAmount` stays the quote slippage floor
  (gate-consistent, wave-3 checkSwapContext); worker must re-verify the
  re-quoted price against `limitPrice` before building the intent —
  violated bound = fail-closed rejection, order stays open. Freeze §4
  wording amended accordingly.
- **M3 [medium]** cancel_active fan-out covers `open` + `paused`
  (`findLive()`), per freeze §3.
- **L4/L6** quick wins: `logger.error` on fan-out catch; clear REDIS_URL
  config-validation error instead of bootstrap crash.

Deferred (documented, not fixed now): L1 `expired` TTL unreachable (defer
explicitly), L5 in-memory retry driver (dev/demo only), L2/L3 error-code
usage notes for the FaceUI/DeckUI i18n maps.

Operational conditions after merge:

- **C1** run the API single-replica until spend ledger / claim store / kill
  switch are persisted (in-memory mutex + stores do not survive scale-out).
- **C2** automation origins stay default-denied; enabling requires an
  authenticated HITL policy grant.
- **C3** OW-1 + OW-2 fixes are mandatory before any real signer replaces
  DryRunSigner (design §9 execution-authorization ruling still pending).

Source: one-shot `reviewer` (Review54) + `security-reviewer` (SecReview54)
audits of PR #54 (wave-4 stage B), read-only.

### Wave 4 worker — Review54 delta follow-up (PR #54)

Owner: VaultAPI, before multi-replica/Postgres goes live:

- **D3/R2 — `ExecutionStore.update()` has no CAS on terminal statuses.**
  Today this is safe: single replica (condition C1), per-slot KeyedMutex,
  and BullMQ single-delivery. In the Postgres/multi-replica era, terminal
  writes must become conditional (`UPDATE ... WHERE status NOT IN
('submitted','failed','gate_rejected')`) so two executors can never
  finalize one slot twice. Same hardening family as F1/F5.

Source: Review54 delta ruling (D3/R2 = follow-up only), PR #54.
