# ⚙️ OPS — Wave 2 mission: smoke gate + pipeline fixes

Branch: `chore/ci-wave2` (fresh worktree from latest `main`, AFTER the
conductor prep PR is merged). Read `docs/ORCHESTRA.md` + skill
`kryptr-ci-pipeline` before starting. Ownership: `.github/workflows/ci.yml`,
repo tooling; coordinate harness shape with VaultAPI over IRC.

## Mission

Make the wave-2 trading flow verifiable end-to-end at API level, and fix
the known worktree hook bug.

### Deliverables

1. **API smoke target** (`apps/api`, target name `smoke`): boot the real
   Nest app via `@nestjs/testing` + supertest against in-memory repos and
   the StaticMockDex adapter (no database). Golden path: create wallet →
   `POST /api/quotes` → `POST /api/security/evaluate` (kind='swap') →
   assert approved envelope + timeline entry. Runs in CI; add `smoke` to
   the affected targets line in `ci.yml`.
   - If supertest/@types are missing from api devDeps, flag it to the
     conductor for pre-install (agents never install packages alone).
2. **Hook worktree fix**: simple-git-hooks install currently fails with
   ENOTDIR in linked worktrees. Replace/augment with a small install script
   that writes hooks into `$(git rev-parse --git-common-dir)/hooks`, so
   worktree crews get pre-commit too. Keep `SKIP_SIMPLE_GIT_HOOKS=1`
   bypass documented.
3. **HEAD~1 root-commit guard** in ci.yml's base computation (push event
   with a single commit must not explode).
4. No postgres service container this wave — wave 2 stays in-memory
   (conductor ruling); persistence CI is a later task.

## Acceptance

- `smoke` target runs green locally and is exercised by CI on your PR.
- Hook install works from a linked worktree (demonstrate with a scratch
  worktree, then clean it up).
- ci.yml changes minimal and reviewed in PR body.

## Retro

- Done: `smoke` target on `@kryptr/api` (jest.smoke.cts + supertest golden
  path wallet → quote → evaluate(swap) → timeline, in-memory, no DB;
  contract anchors locked with VaultAPI over IRC before either side built).
  `smoke` added to the ci.yml affected line; base computation gained a
  root-commit guard (single-commit push falls back to the root commit).
  `scripts/install-hooks.mjs`: worktree-aware hook installer wired into
  `prepare` — linked worktrees now get the pre-commit gate (demonstrated
  from a scratch worktree, then cleaned up).
- Sequenced: smoke can only go green after `feat/api-trading` lands (it adds
  /api/quotes + timeline). Merge order vault-first, ops-second held; after
  #20 merged I rebased clean and smoke went green on the first run.
- Learned: contract-first over IRC (exact envelopes, step names, amount
  below the $100 threshold) removed every integration surprise; jest's
  default testMatch keeps `*.smoke.ts` out of unit runs for free; generated
  jest configs carry a blanket eslint-disable → add them to config ignores,
  never edit them.
