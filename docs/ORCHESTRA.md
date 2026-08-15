# KRYPTR CREW — how this build is run

Kryptr is built by a crew of AI coding agents, each owning one workstream,
coordinated by a **conductor** (the orchestrating session). This file is
the operating agreement. Skills in `.agents/skills/kryptr-*` are required
reading for every agent before the first commit.

## The goal (binding)

**Phase 1 definition of done:** a user can connect a wallet, see balances
on Base and Robinhood Chain, and submit a transfer that passes the security
gate before anything is signed — while the backoffice shows wallets,
intents, and health in real time. If a change does not move this goal,
it waits.

## The crew

| Badge | Agent | Workstream | Owns |
|---|---|---|---|
| 🔐 | `vault` | Wallet & security core | `apps/api/src/wallet/**`, `apps/api/src/security/**`, `apps/api/src/chain/**` |
| 🪟 | `face` | Frontoffice UX | `apps/frontoffice/src/**` |
| 🖥️ | `deck` | Backoffice UX | `apps/backoffice/src/**` |
| 🚦 | `ops` | Quality gates & infra | `.github/**`, `docker-compose.yml`, root configs, lint setup |

**Conductor** (not one of the agents):
- owns `packages/shared-types`, `docs/**`, root `package.json`, merges PRs
- installs dependencies agents request (agents never install packages alone)
- arbitrates disagreements and runs the final gate suite

## Branch law (non-negotiable)

1. **Nobody works on `main`.** Each agent creates one branch per task,
   named per `kryptr-git-flow` skill (`feat/api-vault`, `feat/frontoffice-home`, …).
2. Branch from latest `main`; PR back to `main`; rebase, never merge-commit.
3. Conductor merges after CI green. `packages/shared-types` diffs always
   get conductor review — they are everyone's contract.

## Ownership & conduct

1. Stay in your paths (table above). Read anything; write only your own.
2. Never edit `packages/shared-types`, `docs/**`, root configs. Need a
   change there? Message the conductor with the exact diff proposal.
3. No package installs without conductor approval — record the need in
   your task file's "Needs" section instead.
4. Import shared shapes from `@kryptr/shared-types`; never redeclare.
5. UI controls: shadcn/ui (`deck`) and shadcn-vue (`face`) primitives only.
   No hand-rolled native `<button>`/`<select>` styling.
6. Every PR passes: `lint`, `typecheck`, `test`, `build` (see
   `kryptr-ci-pipeline` skill). No gate-skipping.
7. `apps/api` follows the layering in `kryptr-clean-architecture`
   (domain → application → infrastructure; controllers stay thin).

## Coordination protocol — when confused, talk

- **Stuck > 10 min, or unsure about a contract?** Message the agent whose
  path borders yours. State: what you tried, what you expect, what blocks.
- **Cross-agent contract needed** (e.g. deck needs a new API shape from
  vault): propose the exact types/JSON first, get the other agent's ack,
  then implement both sides. Contract-first, always.
- **Disagreement or blocked > 1 round:** escalate to the conductor with
  both positions; conductor decides, decision is final for this wave.
- **Never resolve confusion by guessing silently.** A wrong silent
  assumption costs more than a question.

## Security commandments

1. Agents/automation produce `TransactionIntent`s only. Signing is a
   separate gated step behind `SecurityPolicy`. No exceptions, no shortcuts.
2. Private keys/seed phrases never enter the repo, env files, logs, or
   tests. If a task seems to require it — stop and escalate.
3. Every new endpoint that moves value must route through the security
   gate module; `vault` owns the gate, nobody bypasses it.

## Wave cadence

1. **Kickoff** — conductor publishes task files in `docs/tasks/`, agents
   branch and acknowledge their mission.
2. **Build** — parallel work on branches; coordination messages as needed.
3. **Gate** — each agent runs the full gate suite on their branch, opens PR.
4. **Integrate** — conductor rebases/merges in dependency order
   (shared-types → api → UI), fixes cross-branch fallout with owners.
5. **Retro** — one note per agent in their task file: done / blocked /
   learned. Conductor plans the next wave.
