# Wave-6 incident runbook — CI billing outage (docs-only)

Status: RUNBOOK + INCIDENT RECORD. Compiled by Review54 under the conductor's
outage rulings (C4: the outage window and merge-during-outage status are part
of the release record). All facts below are from the conductor's broadcast
record. Timestamps were supplied by the conductor (2026-08-17 state update)
and are marked `(conductor-supplied)` — no times are invented here.

## 1. Incident summary

GitHub Actions stopped TOTAL: every job failed to START with the annotation
"recent account payments have failed or spending limit needs to be increased".
This is a GitHub account payment issue, NOT a code defect. Our gates are CI
jobs; without CI there is no merge, no tag, and no ceremony.

## 2. Timeline (facts only)

| Event | Evidence |
| --- | --- |
| Outage begins — all dispatched/queued jobs fail to start with the billing annotation | 2026-08-17 ~09:41 UTC `(conductor-supplied)` — first billing annotation observed on PR #107's gate run |
| PR #106 (feat/ceremony-verify-g4) merges as `bc7273c` BEFORE the billing error | main history; `bc7273c` is the outage head |
| PR #107 (backoffice Vercel build fix) opened; local build green; CI verification impossible during outage | PR #107 discussion record |
| Nightly fork-tests dead for the outage duration | nightly runs show billing annotation, no executions |
| Deploy retry loop paused to protect the 100/day quota | conductor ruling (FACT 3) |
| Outage ends — account billing resolved (repo published by user); CI alive again | 2026-08-17 ~10:05 UTC `(conductor-supplied)` — repo published by user; first post-restore CI green confirmed on main (incl. #107 merge) |

## 3. Merge-during-outage record (release-record entry, C4)

**EMPTY.** No PR merged while CI was down. Main head throughout the outage was
`bc7273c` (#106), which landed before the billing error; the only open PR
during the window was #107. An outage window with zero merges is the cleanest
evidence position: every shipped change has full CI gate evidence.

## 4. Official outage rules (adopted by the conductor)

1. **Local green is supporting evidence, never a gate.** Reviews may proceed
   and record local reproductions, labeled as such; merge waits for CI.
   (Applied: #107 and #108 reviewed as GO-pending-CI-verification.)
2. **S3 payloads ONLY from the CI workflow tag** — no manual production,
   ever (hard rule, A2).
3. **No new tag for tooling-only changes** — decision unchanged; the #102
   byte-identity proof (4/4 sha256 + identical calldata) stands.
4. **Soak clock honesty (A4):** the S5 soak window counts ONLY periods with
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
5. **S3 execution** only after explicit user approval (status §4.5).

## 6. Standing checks after any future CI gap

- Re-run the nightly/fork-test battery once before merging anything.
- Record the gap window and merge status in the release record (this
  runbook's §3 pattern).
- Re-verify signer funding per the pre-S3 checklist (#103) before any
  ceremony dispatch — balances can drift during a gap.
- Re-state the soak-clock exclusion for the gap.
