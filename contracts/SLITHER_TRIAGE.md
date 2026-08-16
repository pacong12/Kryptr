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

## Never-triage set (binding — T21 gate #1)

Root: T21 in `docs/research/launchpad-discussion.md` §4 — per-token clone
bugs are UNFIXABLE; mitigation = Slither gate + fork tests + audited
implementation before first launch. The concrete detector set is defined in
`docs/research/wave5-t21-verification-design.md` §5.3 (Web3Intel, gate #1)
and is copied here VERBATIM per the scaffolding PR (#61) commitment:

> For factory + template these detectors must have **zero** findings,
> triaged or not — any hit is a NO-GO: `suicidal`, `unprotected-upgrade`,
> `arbitrary-send-eth`, `arbitrary-send-erc20`,
> `arbitrary-send-erc20-permit`, `controlled-delegatecall`,
> `uninitialized-storage`, `reentrancy-eth`.

Any finding from this set blocks unconditionally — it can never be logged
under "Accepted findings" below, and no config change may filter these
detectors. Additionally, every **high-severity** detector outside this set
blocks unconditionally as well.

Rationale (§5.3 inference): the set matches our structural promises — no
self-destruct, no upgrade path, no unauthorized value extraction, no
delegatecall/storage hazards — the exact ways an "immutable" design secretly
stops being immutable. An immutable clone cannot be patched after launch, so
any finding class that could hide a clone bug is non-triageable by policy.

## Accepted findings

_None yet._ (Factory + template scan clean: zero never-triage findings;
slither.db.json is empty by construction — PR #76 evidence.)
