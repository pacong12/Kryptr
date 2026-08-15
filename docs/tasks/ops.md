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

- Done:
- Blocked:
- Learned:
