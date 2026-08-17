# Wave-6 S1 Persistence — Fase 2 Design: orders, order_executions, kill_switch (Postgres)

Status: DESIGN (no code in this PR; implementation lands after CI restores and fase 1 (#105) soaks).
Depends on: fase 1 merged (#105, `0001_init` already contains every fase-2 table), design doc
`wave6-s1-persistence-design.md` (PR #96), Review54 rulings F1–F4.

## 1. Scope

Fase 2 swaps the order-worker's three in-memory stores for Postgres adapters:

| Port (unchanged) | In-memory today | Postgres adapter (fase 2) | Tables (already in `0001_init`) |
| --- | --- | --- | --- |
| `OrderStore` | `InMemoryOrderStore` | `PostgresOrderStore` | `orders` |
| `ExecutionStore` | `InMemoryExecutionStore` | `PostgresExecutionStore` | `order_executions` |
| `KillSwitchPort` | `InMemoryKillSwitch` | `PostgresKillSwitch` | `kill_switch_state`, `kill_switch_audit` |

Binding stays module-level (`isPostgresPersistence()`), exactly the fase-1 seam: hermetic default
in-memory; `PERSISTENCE_MODE=postgres` + `DATABASE_URL` required, fail-closed otherwise. Ports and
decision/worker logic are UNTOUCHED — only infrastructure implementations change.

Why fase 2 matters: durable automation + the C1 release criterion (design §6): phases 1–2 green in
CI with the Postgres harness + testnet soak is what makes multi-replica API permissible. Today the
claim primitive is per-process; after fase 2 the exactly-once guard survives multiple workers.

## 2. `PostgresOrderStore`

Schema (already migrated): `orders (id PK, payload jsonb, status, updated_at)` + `orders_status_idx`.

- `save(order)` — `INSERT ... ON CONFLICT (id) DO UPDATE SET payload=$2, status=$3, updated_at=now()`.
  The `status` column ALWAYS mirrors `payload.status` (scalar spine for the indexed queries); the
  adapter writes both in one statement so they cannot drift.
- `findById` — read by PK, return `payload` as `Order`.
- `findOpen()` — `WHERE status = 'open'`; `findLive()` — `WHERE status IN ('open','paused')`
  (kill-switch `cancel_active` fan-out scope, freeze §3); `findAll()` — no filter. All map `payload`.
- `setStatus(id, status, at)` — the terminal guard becomes a CONDITIONAL UPDATE:

```sql
UPDATE orders
SET payload = jsonb_set(payload, '{status}', to_jsonb($2::text)),
    status = $2, updated_at = now()
WHERE id = $1
  AND status NOT IN ('filled','partially_filled','cancelled','expired','failed','rejected')
RETURNING payload;
```

  Zero rows → distinguish `order_not_found` (404) from `order_not_live` (409) with a follow-up
  existence read — the same fail-closed diagnostics pattern as `PostgresDeployRecordStore.transition`
  (fase 1). The in-memory store's `TERMINAL_STATUSES` set is the single source of truth and moves to
  a shared constant imported by BOTH implementations (no behavior change).

Concurrency: two racers setting a live order's status serialize on the row lock; the first commits,
the second re-evaluates the WHERE against the committed row. A transition INTO a terminal status is
final — the conditional WHERE makes "the worker never touches a terminal order" a storage-layer
guarantee, not just an application convention.

## 3. `PostgresExecutionStore` — the claim primitive (design §5.2)

Schema (already migrated): `order_executions (id PK = '<orderId>:<slotKey>', order_id, slot_key,
status, intent_id, claimed_at, finished_at, detail, UNIQUE (order_id, slot_key))` + FK to `orders`.

- `claim(orderId, slotKey, at)` — set-if-absent, exactly the design's SQL:

```sql
INSERT INTO order_executions (id, order_id, slot_key, status, claimed_at)
VALUES ($1 || ':' || $2, $1, $2, 'claimed', now())
ON CONFLICT (order_id, slot_key) DO NOTHING
RETURNING *;
```

  The UNIQUE constraint IS the exactly-once guard across worker restarts, redeliveries, and
  CONCURRENT WORKERS: the losing replica receives zero rows and must stop without side effects.
  (Same construction as `sign_requests` `UNIQUE(intent_id)` in fase 1.)
- `reclaim(id, at)` — continuation ownership (review OW-2), conditional CAS:

```sql
UPDATE order_executions
SET status = 'claimed', claimed_at = now()
WHERE id = $1 AND status IN ('claimed','quoted')
RETURNING *;
```

  The resumable set is EXACTLY `RESUMABLE_STATUSES = {claimed, quoted}` (Review54 F2): `submitted`
  is deliberately NON-resumable — a record that reached submission may already be on-chain, so
  reclaiming it would open a double-fire path. The set moves to a shared constant imported by both
  implementations (mirrors `DEPLOY_RECORD_TRANSITIONS` in fase 1).
- `update(id, patch)` — conditional `UPDATE ... WHERE id=$1 RETURNING *`; zero rows →
  `DomainError('execution_not_found', …, 404)`. `finishedAt`/`intentId`/`detail` patched only when
  present (undefined ≠ null).
- `findByOrderId` — `WHERE order_id=$1 ORDER BY claimed_at` (slot timeline).

Concurrency: claim races resolve at the unique index (one winner, zero or one rows). Reclaim races
serialize on the row lock; the conditional WHERE admits exactly one winner while the record is
resumable, and admits NOBODY once terminal — a late continuation always stops.

## 4. `PostgresKillSwitch`

Schema (already migrated): `kill_switch_state (id = 1 CHECK (id = 1), mode, activated_at, reason,
version, updated_at, updated_by)` + append-only `kill_switch_audit (id bigserial, from_mode,
to_mode, actor, reason, at)`.

- `getState()` — read row `id = 1`. Missing row = pristine deployment → materialize lazily with
  `INSERT ... ON CONFLICT (id) DO NOTHING` of the default `{ mode: 'off', activatedAt: null,
  reason: null, version: 0 }` and return it. No audit row for bootstrap (it is not a transition).
- `setMode(mode, { actor, reason, at })` — ONE interactive `$transaction`:

```sql
UPDATE kill_switch_state
SET mode=$1, activated_at=$2, reason=$3, version=version+1, updated_at=now(), updated_by=$4
WHERE id=1
RETURNING *;
INSERT INTO kill_switch_audit (from_mode, to_mode, actor, reason, at)
VALUES ($5, $1, $4, $3, $2);
```

  `from_mode` is read inside the same transaction (SELECT before UPDATE, or captured from the
  pre-image). State and audit commit TOGETHER — the audit can never lag or lead the state.
  `activatedAt`/`reason` are nulled when returning to `off`, mirroring `InMemoryKillSwitch`.
  Zero rows on the UPDATE (row vanished) → fail-closed `DomainError('kill_switch_missing', …, 500)`;
  the singleton CHECK makes that state unrecoverable without operator action.
- `getAudit()` — `SELECT … ORDER BY id` (bigserial = causal order), mapped to
  `KillSwitchAuditEntry`.
- Append-only discipline: `kill_switch_audit` has NO update/delete code path (design §7); a
  restricted-role grant hardening is an OpsCI follow-up.

Kill-switch semantics UNCHANGED: the worker checks the mode at CLAIM time (not only scheduling);
fase 2 only persists the state so all replicas see the same switch.

## 5. Concurrency & consistency summary

| Race | Arbiter | Loser behavior |
| --- | --- | --- |
| Two workers claim one slot | `UNIQUE (order_id, slot_key)` | zero rows → stop, no side effects |
| Two continuations reclaim one execution | conditional `UPDATE … status IN ('claimed','quoted')` | zero rows → stop (terminal or taken) |
| Terminal order status write | conditional `UPDATE … status NOT IN (terminal)` | 409 `order_not_live` |
| Concurrent kill-switch flips | row lock + single-tx state+audit | last commit wins; BOTH transitions audited in order |
| Claim vs `cancel_active` fan-out | unchanged worker ordering: kill-switch checked at claim time | fan-out cancels what it can see; a claim already past the check completes its slot (documented wave-4 semantics) |

All arbitration happens in Postgres; no application-level mutex is required, which is precisely
what unlocks multi-replica workers under the C1 criterion.

## 6. Test plan (extends the fase-1 pattern)

- Serial target: same `jest.postgres.cts` (`maxWorkers: 1`, `describePostgres` gate,
  `POSTGRES_TEST_URL` override). New suites: `postgres-order-store.integration.spec.ts`,
  `postgres-execution-store.integration.spec.ts`, `postgres-kill-switch.integration.spec.ts`.
- Provability criteria (the §5.1 analogues):
  1. N concurrent `claim` calls for one slot on separate connections → EXACTLY one non-null result.
  2. `reclaim` on a `submitted`/terminal record → null, every time, across racers; on a resumable
     record → exactly one winner among N racers, record reset to `claimed`.
  3. N concurrent `setStatus` racers on one live order → all but the committed transition observe
     the conditional outcome; a write AFTER terminal always yields `order_not_live`.
  4. Kill-switch flip under concurrency: audit length == number of committed transitions, in
     bigserial order; state always equals the last committed transition.
- Hermetic suites unchanged (decision/worker specs keep in-memory stores — they test DECISIONS,
  not storage).

## 7. OpsCI / environment notes

- Same Postgres 16 service container as fase 1; add `prisma migrate deploy` before the suite (no
  new migration in fase 2 — the tables already exist from `0001_init`).
- `POSTGRES_TEST_URL` override semantics unchanged (session-mode DB; Prisma + pgbouncer
  transaction-mode is incompatible).
- Supabase re-baseline was completed and verified post-fase-1 (15 tables, 76 CHECKs) — fase 2 adds
  nothing to migrate there either.

## 8. Security alignment

- No key material in any fase-2 table (executions store hashes/ids/statuses only; the manual
  signature never transits this system).
- `kill_switch_audit` append-only; `order_executions` rows are patched in place ONLY for the
  documented fields (no silent deletion — forensics stay intact).
- Fail-closed everywhere: missing singleton, unknown ids, and terminal writes all raise
  `DomainError` — never a silent pass.

## 9. Out of scope (fase 3)

`wallets` + `security_policies` adapters (entity persistence, policy provider swap) and the
restricted-role grants hardening. Fase 3 design follows once fase 2 lands and soaks.
