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
