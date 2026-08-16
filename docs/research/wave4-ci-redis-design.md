# Wave 4 CI research — Redis for worker tests + nightly live-runs

Status: RESEARCH ONLY (no workflow changes, no package installs). Contract
round freezes the decisions before execution. Rulings source: PR #33
(deterministic idempotency, injectable clocks, Redis CI service binding,
kill switch contract-first, fail-closed triggers). Mission source: Main,
wave-4 research round.

Local parity already exists: `docker-compose.yml` ships `redis:7-alpine`
with a `redis-cli ping` healthcheck. CI design mirrors it. BullMQ/ioredis
are not installed yet — this document assumes BullMQ per the wave-4 scope
ruling.

## A. Redis in CI — deterministic worker tests

### Decision: GitHub Actions service container on the existing `main` job

```yaml
jobs:
  main:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine # parity with docker-compose.yml
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    # ... existing steps unchanged; worker tests get:
    # env: REDIS_URL=redis://localhost:6379
```

The job runs directly on the runner (not containerized), so the service is
reachable at `localhost:6379`. The healthcheck gates the job: steps start
only after `redis-cli ping` succeeds — no readiness sleeps.

### Rejected alternatives

| Option                                       | Verdict              | Why                                                                                                                                                               |
| -------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Container job (whole job inside a container) | No                   | Then Redis is addressed as `redis:6379` not `localhost`, every existing step re-validates, zero benefit.                                                          |
| `apt-get install redis-server` on the runner | No                   | Undocumented runner image churn, manual daemonization, no healthcheck gating.                                                                                     |
| In-memory redis mock (ioredis-mock)          | Not for worker tests | Wave-4 ruling demands REAL queue+process behavior (idempotency, restart semantics); mocks re-introduce the exact blind spot. Keep mocks for pure unit tests only. |
| Separate CI job for worker tests             | Not by default       | Extra npm-ci cost; only worth it if worker suites grow slow — revisit with data.                                                                                  |

### Determinism recipe (contract candidates)

1. **Connection rule** — BullMQ `Worker` requires
   `connection: { maxRetriesPerRequest: null }` (classic footgun); shared
   test helper owns the connection factory so every suite gets it right.
2. **Isolation under parallel jest workers** — unique queue `prefix` per
   suite (e.g. `prefix: \`wrk-${expect.getState().testPath-hash}\``) or a
   dedicated Redis DB index per suite; never share the default namespace.
3. **Clean slate** — `beforeEach` flush (targeted `queue.obliterate({force})`
   or per-DB `flushdb`) so test order never matters.
4. **Event-driven waits, zero sleeps** — assert via
   `job.waitUntilFinished(events, timeoutMs)` / `QueueEvents` with bounded
   timeouts. A sleep-based wait is an instant review reject (wave-2 lesson,
   flake #22).
5. **Injectable clocks** — DCA schedules and order expiry never read the
   wall clock in tests (binding ruling #33). Delayed jobs: use BullMQ
   `delay` + event wait, or drive the fake clock and assert state directly.
6. **Restart/idempotency tests** — simulate worker restart by closing the
   Worker mid-job and re-instantiating against the same queue; assert
   exactly-once effects keyed on the job id (deterministic idempotency
   ruling).
7. **Graceful local skip** — extend the env-gate convention: a
   `describeRedis`-style gate keyed on REDIS_URL reachability (ping probe
   or env presence). Dev machines without Redis skip with a logged reason;
   CI always has the service, so the suites always run there. Mirrors
   `describeKeyed` semantics: skip ≠ failure.
8. **Nx target shape** — recommendation: dedicated `test-workers` target
   (DASH, not colon — see gotcha 11), `cache: false` (external state),
   runInBand, own jest config `jest.workers.cts` matching the smoke/live
   precedent. Add it to the ci.yml affected line alongside `smoke`. Open
   for the contract round: fold into `test` instead if isolation proves
   sufficient — but cached `test` + external redis state is a flake risk.

### Failure modes considered

- Service not ready → solved by healthcheck gating.
- Port 6379 clash → runner is clean per job; not a concern on hosted
  runners.
- Redis persistence across suites → solved by prefix/DB isolation + flush.
- Eviction under memory pressure → default `noeviction` on redis:7 is fine
  for CI-sized datasets; document in the gotcha list.

## B. Nightly live-run for keyed suites

### Scheme

New workflow `.github/workflows/nightly-live.yml` (research sketch, not yet
added):

```yaml
name: Nightly live
on:
  schedule:
    - cron: '0 6 * * *' # UTC, advisory — GitHub may delay
  workflow_dispatch: {} # manual trigger for on-demand runs
permissions:
  contents: read
concurrency:
  group: nightly-live
  cancel-in-progress: true
jobs:
  keyed:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 22, cache: 'npm' }
      - run: npm ci
      - name: Keyed adapter suites (skip gracefully without secrets)
        run: npx nx run-many -t test
        env:
          ZEROX_API_KEY: ${{ secrets.ZEROX_API_KEY }}
          COINGECKO_API_KEY: ${{ secrets.COINGECKO_API_KEY }}
      - name: Live Base RPC reads (no keys needed)
        run: npx nx test:live api
```

### Secrets policy

- Keys are USER-OWNED GitHub Actions secrets (repo settings), never in the
  repo, never in this file as values — only `${{ secrets.* }}` references
  (safe for gitleaks: references are not values).
- Canonical names match env-gate exactly: `ZEROX_API_KEY`,
  `COINGECKO_API_KEY`. Optional `RPC_URL_BASE` override if the user wants a
  private RPC instead of the public default.
- **Secrets absent → graceful degradation, not failure.** env-gate already
  skips keyed suites with a logged reason, so a repo without secrets (or a
  fork) runs green with visible skip logs. The nightly job must never be a
  required status check — it is advisory signal, matching the wave-3
  ruling that keyless CI is the contract.
- `test:live` runs regardless of secrets (public RPC), so nightly always
  contributes chain-read regression signal even keyless.

### Scheduling caveats

- Cron runs only from the DEFAULT branch — the file lands with the wave-4
  execution PR, so first run is the night after merge.
- GitHub's scheduler is best-effort: delays under load are normal; missed
  runs happen. `workflow_dispatch` covers on-demand verification.
- Scheduled workflows are auto-disabled after 60 days of repo inactivity —
  document so nobody is surprised; re-enable via the Actions tab.

## C. Gotcha list

Carried from waves 1–3 plus GitHub-Actions/BullMQ specifics:

1. **Service hostname depends on job shape** — `localhost:6379` only while
   the job runs directly on the runner; containerized jobs must use
   `redis:6379`.
2. **Healthcheck is mandatory** — without it, steps can start before Redis
   accepts connections; readiness sleeps are banned (flake policy).
3. **PR workflows run from the HEAD branch** (wave-3 gitleaks lesson) — a
   workflow change only exercises after it's on the branch being tested;
   nightly must live on main to schedule.
4. **Scheduled workflows: default branch only, UTC, delayable, auto-disabled
   after 60 inactive days.**
5. **Secrets are not available to fork PRs** — nightly is schedule/dispatch
   only, never PR-gated.
6. **Skip ≠ failure** — nightly green-ness relies on env-gate semantics;
   never add `--forceExit`-style hacks or fail-on-skip logic.
7. **BullMQ**: `maxRetriesPerRequest: null` for Workers; `QueueEvents`
   needs its own dedicated connection; closing a Worker mid-job is the
   canonical restart simulation.
8. **Parallel jest workers × shared Redis** — prefix/DB isolation or
   cross-suite contamination flakes (see recipe items 2–3).
9. **No wall-clock sleeps anywhere** (#22 lesson); bounded event waits only.
10. **Nx cache vs external state** — live/worker targets set `cache: false`
    (test:live precedent), otherwise cached green hides a dead Redis.
11. **Target names with colons break `nx run project:target` parsing**
    (wave-3 lesson): `nx run api:test:live` silently ran target=test
    config=live. New target uses a DASH: `test-workers`.
12. **gitleaks**: nightly references secrets by name only — safe; keep the
    no-values discipline and the gitleaks job from PR #31 running on the
    new workflow file too (it will, automatically: PRs + pushes).
13. **Image parity** — pin `redis:7-alpine` in BOTH docker-compose.yml and
    ci.yml; drift between local and CI redis majors is a silent compat bug.
14. **Env hermeticity** (#32) — jest never loads `.env` files
    (NODE_ENV=test guard); worker tests get REDIS_URL from the workflow
    env, never from files.

## Open questions for the contract round

1. Target shape: dedicated `test-workers` (recommended) vs folding worker
   suites into `test` — cache semantics decide.
2. Which suites need Redis: BullMQ queue/worker + kill-switch integration
   (ruling: kill switch contract-first) — vault to publish shapes, ops
   wires the CI surface.
3. Postgres service container: still deferred? If order persistence enters
   wave 4 scope, worker tests may want it too — decide before execution.
4. Nightly cron slot (default proposal 06:00 UTC) and whether to include a
   weekly extended sweep.
5. Failure visibility: Actions tab only (default) vs optional notification
   channel — out of scope unless user asks.
