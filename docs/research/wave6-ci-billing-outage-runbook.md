# Wave-6 incident runbook — CI billing outage (docs-only)

Status: RUNBOOK + INCIDENT RECORD. Compiled by Review54 under the conductor's
outage rulings (C4: the outage window and merge-during-outage status are part
of the release record). All facts below are from the conductor's broadcast
record. Timestamps were supplied by the conductor (2026-08-17 state update)
and are marked `(conductor-supplied)`; the window definition below is the
conductor's official reconciliation (2026-08-17), cross-checked against
observed CI run records (`gh run list`, Web3Intel cross-review) — no times
are invented here.

## 1. Incident summary

GitHub Actions stopped TOTAL: every job failed to START with the annotation
"recent account payments have failed or spending limit needs to be increased".
This is a GitHub account payment issue, NOT a code defect. Our gates are CI
jobs; without CI there is no merge, no tag, and no ceremony.

## 2. Timeline (facts only)

**Outage window (official, conductor reconciliation): 2026-08-17 ~09:41 UTC
(first billing annotation) → ~10:03 UTC (user published the repo).**

| Event                                                                                                           | Evidence                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outage begins — first billing annotation                                                                        | 2026-08-17 ~09:41 UTC `(conductor-supplied)`. Note: the #107 gate run created 09:41:06Z (run 32016465227) still STARTED and passed — the annotation preceded total job-start blockage |
| Job-start blockage observed                                                                                     | run 32017425116 created 09:52:53Z; its jobs only started 10:01:41–44Z (~9 min queue)                                                                                                  |
| PR #106 (feat/ceremony-verify-g4) merges as `bc7273c` BEFORE the billing error                                  | main history; `bc7273c` is the outage head                                                                                                                                            |
| PR #107 (backoffice Vercel build fix) opened; local build green; CI verification impossible during the blockage | PR #107 discussion record                                                                                                                                                             |
| No nightly fired inside the outage window                                                                       | previous nightlies 06:07Z/06:39Z ran green pre-outage; the next nightly fired post-restore (row below)                                                                                |
| Deploy retry loop paused to protect the 100/day quota                                                           | conductor ruling (FACT 3)                                                                                                                                                             |
| User approval for S3 execution ("setuju")                                                                       | ~10:00 UTC `(conductor log)`                                                                                                                                                          |
| Jobs start and pass again                                                                                       | green runs 32018018524, 32018036378 from 10:00:12Z                                                                                                                                    |
| First post-restore nightly = fork-tests re-baseline, green                                                      | 2026-08-17 10:00:41Z, run 32018062734 (3 legs, SUCCESS)                                                                                                                               |
| S3 attempt=1 execution dispatched by conductor (post-approval) — NOT a sanity test                              | 2026-08-17 10:02:26Z, run 32018207598 — failed in `prepare` on missing solc 0.8.24 (fixed by #111); no payload published, nothing signed, nothing broadcast — zero impact             |
| Outage ends — user published the repo (billing resolved); CI alive again                                        | 2026-08-17 ~10:03 UTC `(conductor-supplied)`                                                                                                                                          |

## 3. Merge-during-outage record (release-record entry, C4)

**EMPTY.** Zero merges inside the outage window (~09:41 UTC → ~10:03 UTC).
Main head throughout the window was `bc7273c` (#106), which landed before the
billing error; the only open PR during the window was #107.

Boundary note (official reconciliation): the #107 merge (10:04:53Z) happened
AFTER recovery (~10:03 UTC); its gate run had already passed pre-blockage (run
32016465227, green 09:41:06Z) — so the claim "zero merges during the outage"
stands with this window definition, and every shipped change still carries CI
gate evidence. An outage window with zero merges is the cleanest evidence
position: every shipped change has full CI gate evidence.

## 4. Official outage rules (adopted by the conductor)

1. **Local green is supporting evidence, never a gate.** Reviews may proceed
   and record local reproductions, labeled as such; merge waits for CI.
   (Applied: #107 and #108 reviewed as GO-pending-CI-verification.)
2. **S3 payloads ONLY from the CI workflow tag** — no manual production,
   ever (hard rule, A2).
3. **No new tag for tooling-only changes** (standing pre-outage decision,
   unchanged) — the #102 byte-identity proof (4/4 sha256 + identical
   calldata) stands.
4. **Soak clock honesty** (conductor outage ruling): the S5 soak window counts ONLY periods with
   CI + tests actually running. The outage window is EXCLUDED from any soak
   claim; the exclusion is recorded in the release record.
5. **Frozen claim surface:** no new capability claims during the outage;
   S3 official status = "ready, execution blocked-external (CI billing)" —
   no ETA, no schedule claims (A1). Waitlist stays W0.

## 5. Post-restore sequence (official order)

1. **CI sanity** — confirm jobs start and pass on a trivial change.
2. **In parallel (independent CI jobs):**
   a. fork-tests re-baseline — both chains (Base Sepolia 84532, Robinhood
   testnet 46630); treat the FIRST post-outage run as a re-baseline:
   failures must be triaged as environment drift (RPC changes during the
   blackout) vs regression BEFORE any claim is made;
   b. battery re-run at the frozen tag;
   c. #107 CI verification (including its version-pin fix commit).
3. **Merge #107** once its CI is green → redeploy backoffice (verify the
   production build that motivated the fix).
4. Merge remaining queue in order (incl. this runbook and the #108 design).
5. **S3 execution** — user approval granted ~10:00 UTC `(conductor log)`;
   attempt 1 failed at the runner (solc offline gap, fixed by #111) with zero
   chain impact; re-dispatch via the CI workflow only, after #111 merges.
   Payloads ONLY from CI (rule §4.2).

## 6. Standing checks after any future CI gap

- Re-run the nightly/fork-test battery once before merging anything.
- Record the gap window and merge status in the release record (this
  runbook's §3 pattern).
- Re-verify signer funding per the pre-S3 checklist (#103) before any
  ceremony dispatch — balances can drift during a gap.
- Re-state the soak-clock exclusion for the gap.
