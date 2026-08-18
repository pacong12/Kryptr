---
name: kryptr-setup
description: 'Kryptr local environment bootstrap. USE WHEN: first clone, missing node_modules, docker services down, .env missing, or "how do I run this" questions.'
---

# Kryptr Setup

Monorepo: Nx 23 + npm workspaces. Node 22+, npm 10+, Docker required.

## First-time bootstrap

```bash
npm install
cp .env.example .env        # then fill values (AUTH_SECRET: openssl rand -hex 32)
docker compose up -d        # postgres:5432 + redis:6379
```

## Run apps

```bash
npx nx serve api            # NestJS   -> http://localhost:3333
npx nx serve frontoffice    # Vue/Vite -> http://localhost:4200
npx nx serve backoffice     # Next.js  -> http://localhost:4300
```

## Project map

| Project | Path | Stack |
|---|---|---|
| `@kryptr/api` | `apps/api` | NestJS 11 |
| `@kryptr/backoffice` | `apps/backoffice` | Next.js 16 |
| `@kryptr/frontoffice` | `apps/frontoffice` | Vue 3 + Vite |
| `@kryptr/shared-types` | `packages/shared-types` | TS domain models |

## Workspace package linking

Apps import shared packages by name (`@kryptr/shared-types`). When adding a
new internal package, link it with the package manager, never tsconfig paths:

```bash
npm install @kryptr/<pkg> --workspace apps/<app>
```

## Troubleshooting

- `TS2835` relative imports: this workspace uses `moduleResolution: nodenext`
  — relative imports inside `packages/*` need explicit `.js` extensions.
- Port busy: `npx nx serve <app> --port=<n>`.
- Docker health failing: `docker compose ps`, then `docker compose logs <svc>`.
- Never put private keys or seed phrases in `.env` — signing stays outside
  the app (see docs/ORCHESTRA.md security rules).
