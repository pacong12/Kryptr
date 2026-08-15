---
name: kryptr-ci-pipeline
description: 'Kryptr quality gates: lint, typecheck, test, build via Nx. USE WHEN: before opening a PR, after refactors, when CI fails, or deciding whether a change is mergeable.'
---

# Kryptr CI Pipeline

All gates run through Nx. Never bypass a gate to merge.

## The gates (in order)

```bash
npx nx format:check                     # prettier formatting
npx nx affected -t lint                 # eslint (base origin/main)
npx nx affected -t typecheck            # tsc --noEmit per project
npx nx affected -t test                 # jest (api) / vitest (vue)
npx nx affected -t build                # production builds
```

Full-repo variant (conductor only): `npx nx run-many -t lint typecheck test build`.

## Before every PR

1. `npx nx affected -t lint typecheck test build --base=origin/main` green.
2. `npx nx format:write` if format:check fails, then re-commit.
3. No `any` escapes, no skipped tests (`it.skip`/`xit`) without a linked issue.

## CI behavior (.github/workflows/ci.yml)

- Triggers: push to `main`, every PR.
- Runs `nx affected` vs `origin/main` with `--parallel=3`.
- No Nx Cloud — local caching only (`.nx/cache`, gitignored).

## Failure triage

- Build fails only in a package you didn't touch → check `npx nx graph`
  for a new dependency edge; coordinate with that project's owner agent.
- `nodenext` import errors in packages → missing `.js` extension on
  relative imports.
- Test env: api tests use jest `node` env; frontoffice uses vitest + jsdom.

## Conductor merge checklist

- CI green on the PR.
- Branch is up to date with `main` (rebase, not merge-commit).
- Reviewer approved OR change is docs-only.
