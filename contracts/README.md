# contracts — @kryptr/contracts (wave-5 launchpad)

Foundry root wrapped as an Nx project (`nx:run-commands`). Wave-5 entry
gate #2 (binding, from the first contracts PR — never retrofitted):

- **Slither triage baseline from day 1** — `slither.config.json` +
  `SLITHER_TRIAGE.md`. New high/medium findings block CI; accepted findings
  are logged in the triage doc before (or with) the config change.
- **Fork tests are label-gated + nightly only** — real-RPC flakiness never
  enters default CI (`fork-test` target; CI label `fork-tests`, nightly
  schedule).
- **Deploy manifests are the allowlist handoff** — every
  `deployments/{chain}.json` must carry
  `{chain, factoryAddress, bondSink, verificationId, commitSha, deployedAt}`
  (schema: `deployments.schema.json`). Missing `verificationId` is invalid
  (fail-closed: no artifact → no vault allowlist entry → factory stays
  dark). CI target: `manifests`. Note the deliberate asymmetry: the CI
  schema is STRICT (bondSink required, unknown fields rejected), while the
  vault deploy-gate reader requires only the fields the gate itself
  consumes (`chain, factoryAddress, verificationId, commitSha,
deployedAt`) — bondSink is consumed downstream by consent/G5, so it
  never gates deploy availability.

## Targets

| Target                             | Command                               | Notes                                  |
| ---------------------------------- | ------------------------------------- | -------------------------------------- |
| `nx forge-build @kryptr/contracts` | `forge build`                         | pinned solc 0.8.24, optimizer runs=200 |
| `nx forge-test @kryptr/contracts`  | `forge test`                          | local, deterministic, no network       |
| `nx fmt @kryptr/contracts`         | `forge fmt --check`                   | formatting gate                        |
| `nx slither @kryptr/contracts`     | `slither . --fail-medium`             | triage baseline applies                |
| `nx fork-test @kryptr/contracts`   | `forge test --fork-url $RPC_URL_BASE` | label/nightly only, cache off          |
| `nx manifests @kryptr/contracts`   | `node tools/validate-manifests.mjs`   | fail-closed manifest schema check      |

`forge-build`/`forge-test` carry unique names on purpose: the
workspace-wide CI line (`nx affected -t build test ...`) must never run
them on a runner without Foundry — the dedicated `contracts` CI job owns
them.

## Layout

```
contracts/
├── foundry.toml             # pinned solc + optimizer (wave-5 kickoff contract)
├── project.json             # Nx targets above
├── slither.config.json      # Slither gate config
├── SLITHER_TRIAGE.md        # triage baseline log (acceptances recorded here)
├── deployments.schema.json  # deploy manifest schema (Q3 baseline)
├── deployments/             # {chain}.json manifests (empty pre-launch)
├── src/                     # TokenFactory + TokenTemplate (no probe, no deps)
├── test/                    # *.t.sol (forge-std vendored at lib/forge-std)
├── script/                  # deploy scripts (later)
└── tools/                   # validate-manifests.mjs
```

## Probe removal condition (SATISFIED in the factory PR)

`src/ScaffoldingProbe.sol` existed only so the gates exercised real source
from the scaffolding PR. The factory/template test suite removed it **in the
same PR** that added the real sources — never a gap where slither/fmt run on
empty src again (vault condition, wave-5 kickoff).

## CI lessons (PR #61 debug rounds)

Paid for in failed CI runs — keep them paid:

1. **Foundry action org is `foundry-rs`.** `foundry-toolchain/foundry-toolchain`
   does not exist ("repository not found"). Use
   `foundry-rs/foundry-toolchain@v1` with an EXACT `version:` pin
   (currently `v1.7.1`, matches the conductor-proven local toolchain);
   never let the toolchain float.
2. **Nx target names are workspace-global in affected lines.** The
   workspace-wide `nx affected -t build test ...` line runs ANY project
   defining a target with that name — on TS-only runners with no forge.
   Contracts targets therefore use unique names (`forge-build`,
   `forge-test`); the dedicated `contracts` job owns them.
3. **`nx affected --projects=X` forwards `--projects` into run-commands
   commands** (forge choked: "unexpected argument"). Don't narrow
   run-commands targets with `--projects`; rely on target-name uniqueness
   instead (only `@kryptr/contracts` defines the contracts gates).
4. **Multiline `run: |` scripts lose lines silently in review.** The
   `else`/`fi` tail of the nx-base script got dropped once and the runner
   failed with "unexpected end of file". After ANY workflow edit, parse
   the YAML AND `bash -n` every extracted script block.
5. **Slither gate flag:** `--fail-high` and `--fail-medium` are mutually
   exclusive — `--fail-medium` is the gate (it fails on high too);
   `filter_paths` is a comma-separated string, not a JSON array. Verified
   against Slither 0.11.6.
