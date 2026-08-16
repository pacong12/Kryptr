# Kryptr

Agent-native crypto finance platform — a phased, security-first rebuild of the
BankrBot concept. Every agent gets a wallet; every transaction passes a
security gate before anything is signed.

## Architecture

Nx monorepo (npm workspaces + TypeScript project references):

| Project                | Path                    | Stack                 | Role                                     |
| ---------------------- | ----------------------- | --------------------- | ---------------------------------------- |
| `@kryptr/backoffice`   | `apps/backoffice`       | Next.js 16 / React 19 | Admin & monitoring dashboard             |
| `@kryptr/frontoffice`  | `apps/frontoffice`      | Vue 3 / Vite          | User-facing app                          |
| `@kryptr/api`          | `apps/api`              | NestJS 11             | Core API: wallets, orders, security gate |
| `@kryptr/shared-types` | `packages/shared-types` | TypeScript            | Shared domain models & API envelope      |

## Prerequisites

- Node.js 22+
- npm 10+
- Docker (Postgres 16 + Redis 7 via compose)

## Getting started

```bash
npm install
cp .env.example .env          # fill in values
docker compose up -d          # postgres + redis

npx nx serve api              # http://localhost:3333
npx nx serve frontoffice      # http://localhost:4200
npx nx serve backoffice       # http://localhost:4200+1 (Next dev port)
```

The `postgres` service in `docker-compose.yml` is the same instance Wave 2
will point Prisma/Postgres migrations at — no new infrastructure needed.

## Common commands

```bash
npx nx run-many -t build          # build everything
npx nx run-many -t lint           # eslint all projects
npx nx run-many -t test           # all unit tests
npx nx affected -t build test     # CI-style: only what changed
npx nx graph                      # dependency graph
npx nx format:write               # prettier
```

## Pre-commit hooks

`npm install` wires a pre-commit hook (config block in `package.json`) via
`scripts/install-hooks.mjs` — a worktree-aware installer that writes into the
shared git hooks dir, so linked worktrees get the hook too (plain
`simple-git-hooks` cannot install there). Every commit first runs:

- `nx format:check` — prettier formatting gate (staged files)
- `nx affected -t lint --base=HEAD~1` — lint what the commit touches

If the hook ever goes missing (fresh clone, git upgrade), re-install it with
`node scripts/install-hooks.mjs`. Bypass in emergencies:
`SKIP_SIMPLE_GIT_HOOKS=1 git commit ...` or `git commit --no-verify` (never
on `main`).

## Security model

Hard lessons from the Bankr/Grok incident (May 2026) are built into the
domain model (`packages/shared-types/src/lib/security.ts`):

- **Structured intents only** — AI output is never mapped directly to a
  signed transaction. Agents produce `TransactionIntent`s; execution is a
  separate, gated step.
- **Security gate** — every intent is checked against a per-wallet
  `SecurityPolicy`: origin allowlist, approval thresholds, daily caps,
  chain allowlist, encoded-payload rejection.
- **No hot custody in the app** — signing stays in an isolated service;
  the API never holds private keys.

## Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the phased plan:
wallets → trading → launchpad → agent runtime.
