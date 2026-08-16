# Slither triage baseline — @kryptr/contracts

Wave-5 entry gate #2: this baseline exists from the FIRST contracts PR,
never retrofitted. Discipline:

- **New findings block.** CI fails on any high/medium finding
  (`slither ... --fail-medium`, config: `slither.config.json`).
- **Accepted findings don't block**, but every acceptance is recorded HERE
  before (or in the same PR as) the config change that filters it:
  detector, file:line, justification, accepted-by, date, and the PR that
  accepted it. No silent filtering via config edits.
- Informational/low findings are reported in CI logs but do not fail the
  gate; promote to blocking by tightening the `--fail-*` flag in
  `project.json`.

## Never-triage set (cross-ref: T21)

Per T21 (`docs/research/launchpad-discussion.md` §4 — per-token clone bugs
are UNFIXABLE; mitigation = Slither gate + fork tests + audited
implementation before first launch), the following can NEVER be accepted
into this baseline — findings always block, no exceptions:

- Every **high-severity** detector, unconditionally.
- The detector set Web3Intel's T21 verification suite design (wave-5 entry
  gate #1) designates as never-triage; when that document lands, its set is
  copied here verbatim and becomes binding. Until then: no medium-severity
  acceptance either without Main's explicit ruling.

Rationale: an immutable clone cannot be patched after launch, so any
finding class that could hide a clone bug is non-triageable by policy.

## Accepted findings

_None yet._ (The scaffolding probe is the only source; it must scan clean.)
