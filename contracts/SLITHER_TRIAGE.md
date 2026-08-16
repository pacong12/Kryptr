# Slither triage baseline — @kryptr/contracts

Wave-5 entry gate #2: this baseline exists from the FIRST contracts PR,
never retrofitted. Discipline:

- **New findings block.** CI fails on any high/medium finding
  (`slither ... --fail-high --fail-medium`, config: `slither.config.json`).
- **Accepted findings don't block**, but every acceptance is recorded HERE
  before (or in the same PR as) the config change that filters it:
  detector, file:line, justification, accepted-by, date, and the PR that
  accepted it. No silent filtering via config edits.
- Informational/low findings are reported in CI logs but do not fail the
  gate; promote to blocking by widening `fail_on` in `slither.config.json`.

## Accepted findings

_None yet._ (The scaffolding probe is the only source; it must scan clean.)
