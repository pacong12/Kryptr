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
  `{chain, factoryAddress, verificationId, commitSha, deployedAt}`
  (schema: `deployments.schema.json`). Missing `verificationId` is invalid
  (fail-closed: no artifact → no vault allowlist entry → factory stays
  dark). CI target: `manifests`.

## Targets

| Target                           | Command                               | Notes                                  |
| -------------------------------- | ------------------------------------- | -------------------------------------- |
| `nx build @kryptr/contracts`     | `forge build`                         | pinned solc 0.8.24, optimizer runs=200 |
| `nx test @kryptr/contracts`      | `forge test`                          | local, deterministic, no network       |
| `nx fmt @kryptr/contracts`       | `forge fmt --check`                   | formatting gate                        |
| `nx slither @kryptr/contracts`   | `slither . --fail-medium`             | triage baseline applies                |
| `nx fork-test @kryptr/contracts` | `forge test --fork-url $RPC_URL_BASE` | label/nightly only, cache off          |
| `nx manifests @kryptr/contracts` | `node tools/validate-manifests.mjs`   | fail-closed manifest schema check      |

## Layout

```
contracts/
├── foundry.toml             # pinned solc + optimizer (wave-5 kickoff contract)
├── project.json             # Nx targets above
├── slither.config.json      # Slither gate config
├── SLITHER_TRIAGE.md        # triage baseline log (acceptances recorded here)
├── deployments.schema.json  # deploy manifest schema (Q3 baseline)
├── deployments/             # {chain}.json manifests (empty pre-launch)
├── src/                     # implementation (factory phase fills this)
├── test/                    # *.t.sol (forge-std arrives with factory phase)
├── script/                  # deploy scripts (later)
└── tools/                   # validate-manifests.mjs
```

## Probe removal condition

`src/ScaffoldingProbe.sol` exists only so the gates exercise real source
from this first PR. When the factory phase removes it, the factory/template
test suite must take over the gate-exercise role **in the same PR** — never
a gap where slither/fmt run on empty src again (vault condition, wave-5
kickoff).
