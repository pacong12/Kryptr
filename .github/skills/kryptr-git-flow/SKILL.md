---
name: kryptr-git-flow
description: 'Kryptr branch policy and PR flow. USE WHEN: starting any task, before committing, opening PRs, or when unsure which branch to work on.'
---

# Kryptr Git Flow

**Nobody works on `main`.** Every change ships via branch + pull request.

## Branch naming

| Prefix | Use | Example |
|---|---|---|
| `feat/<area>-<slug>` | feature work | `feat/api-vault` |
| `fix/<area>-<slug>` | bug fix | `fix/vue-router-loop` |
| `chore/<slug>` | tooling, CI, deps | `chore/lint-ci` |
| `docs/<slug>` | docs only | `docs/orchestra-goals` |

`<area>` is the owning workstream: `api`, `backoffice`, `frontoffice`,
`shared`, `infra`.

## Agent rules

1. Each sub-agent gets EXACTLY ONE branch per task, created from latest
   `main`: `git checkout main && git pull && git checkout -b <branch>`.
2. Never push to `main`; never force-push shared branches.
3. One logical concern per PR; keep diffs reviewable (< ~600 lines).
4. Rebase onto `main` when behind; resolve conflicts in your own files only
   — if the conflict is in a file you don't own, message the owning agent.
5. PR body must state: goal, gates run (`lint/typecheck/test/build`), and
   links to related task file (`docs/tasks/<agent>.md`).

## Merge authority

- The conductor merges PRs after CI green + review.
- `packages/shared-types` changes require conductor review — they are
  contracts every agent depends on.

## Commit style

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`,
`refactor:` + imperative summary. Scope optional: `feat(api): add vault module`.
