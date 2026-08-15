# 🚦 OPS — Wave 1 mission

Branch: `chore/lint-ci` (from latest `main`). Read `docs/ORCHESTRA.md` +
skills `kryptr-ci-pipeline`, `kryptr-git-flow`.

## Mission

Make the quality gates real: today the apps were generated without linters.

### Deliverables

1. **ESLint flat config for all projects**: `npx nx g @nx/eslint` setup,
   per-project eslint.config (api, backoffice, frontoffice, shared-types).
   Sensible rules: no `any` (warn first, error once codebase is clean),
   unused vars, no console in api domain layer.
2. **Lint targets wired**: `npx nx run-many -t lint` green.
3. **CI update** (`.github/workflows/ci.yml`): add `lint` to the affected
   targets; keep `--parallel=3`; keep format:check on PRs.
4. **Commit hygiene**: add a `pre-commit` hook (via `simple-git-hooks` or
   husky — conductor approves the dep) running `nx format:check` +
   `nx affected -t lint` on staged projects. Document in README.
5. **Docker dev UX**: verify `docker compose up -d` works from clean clone
   (it must — CI will need Postgres later; add a `db` service note for
   Wave 2 Prisma migration).

## Needs (conductor must approve)

- `@nx/eslint`, `eslint`, `eslint-config-prettier`, one hook runner dep.

## Done means

- Gates green on branch INCLUDING the new lint gate; PR opened; retro filled.

## Retro

- Done: ESLint flat configs + inferred `lint` targets for all 5 projects
  (api, backoffice, frontoffice, shared-types, shared-ui) via
  `@nx/eslint/plugin`; warn-first `no-explicit-any`/`no-unused-vars`,
  `no-console` (error) in api domain layer, eslint-config-prettier last.
  CI runs `lint` in the affected gate (`--parallel=3` kept, format:check
  kept). simple-git-hooks pre-commit: staged-scope `nx format:check` +
  `nx affected -t lint --base=HEAD~1` (README documents usage + bypass).
  `docker compose config -q` green; README notes the Wave 2 Prisma/Postgres
  plan. Gates on branch: lint/typecheck/test/build/format:check all green.
- Blocked: none left. Mid-wave escalations (all resolved with conductor):
  (1) `typescript-eslint` was missing from the approved dep batch but is
  required to parse TS at all — approved + installed (commit 2b8ddd9);
  (2) shared-ui landed on main after kickoff — rebased and configured it.
- Learned: `@eslint/js` is not installed, so configs derive
  eslint:recommended from ESLint's builtin rules (swap when approved).
  `eslint-plugin-vue` not installed → `.vue` SFCs are not linted yet
  (frontoffice, shared-ui); their TS is covered. simple-git-hooks cannot
  install into linked git worktrees (`.git` is a file → ENOTDIR); normal
  clones get the hook via the npm `prepare` script. Rule-conflicts with
  generated files (jest/webpack configs): fix the rule/config, never the
  generated file.
