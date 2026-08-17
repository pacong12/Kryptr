# Wave 6 S1 — persistence design proposal **[design]**

**Status:** revision 2 — Review54 GO-WITH-FIXES verdict absorbed (F1/F2 HIGH, F3 MEDIUM, F4 LOW + micro-USD ruling conditions). No code in this PR.
**Predecessors:** `wave6-planning.md` (S1 row + gate G-C), `wave6-s2-signing-ceremony.md` (PR #94 — this design is its declared foundation, §9), `wave6-custody-options.md` (memo #90 → Option 1 EOA manual signing ruling), `wave4-worker-design.md` (conditions C1/C3, OW-1/OW-2), `wave5-t21-verification-design.md`.

## 0. Frozen constraints (inherited, unchanged)

- **No private key, seed, or signing material in any persisted state** — schema, env, CI, or agent. The signer remains a manual human act (custody Option 1); persistence never touches the signing step itself, only its decision-bound inputs and its audited outputs.
- **Decision-binding (gate G-B):** a signature may only exist for an intent whose decision chain authorizes it, bound by intent-id. S1 makes that binding DURABLE and cross-replica (this is the "nonce uniqueness across replicas" item in the planning memo, applied to sign requests).
- **Fail-closed everywhere:** unknown = reject/escalate. The verification store boots empty and stays fail-closed under persistence.
- **Git remains canonical release truth** (manifests + T21 verification JSON per T21 design); the database holds OPERATIONAL state. Persistence never duplicates or competes with release artifacts.

## 1. Mission

From `wave6-planning.md` §3 (S1) and gate G-C: before any multi-replica deployment, any signer (S2), or any real-value path (S3+), the API must have:

1. **Idempotent execution** — exactly-once execution claims that survive restarts, redeliveries, and concurrent replicas (today: in-memory Map, single instance only).
2. **Atomic compare-and-reserve for caps** — the daily-cap read-check-record path must be one atomic operation (today: `KeyedMutex` per wallet per instance — correct on one replica, structurally insufficient across replicas).
3. **Audit durability** — decision audit, sign events, kill-switch audit, and the new deploy/ceremony record survive restarts (today: instance-local Maps lost on bounce).
4. **A persistent home for launch state** — per S2 §9: "repo-committed payloads are the S2 answer; apps/api persistence of launch state is S1's own scope."

Wave 4 condition **C1** (single-replica until persistence lands) is released when phases 1–2 below are green (see §6).

## 2. Port inventory — what gets persisted

Every store already sits behind a port with a documented Postgres-era replacement note. S1 swaps adapters ONLY; no decision logic moves.

| Port (token)                             | In-memory impl               | Class | Persistence rationale                                                                |
| ---------------------------------------- | ---------------------------- | ----- | ------------------------------------------------------------------------------------ |
| `WalletRepository` (`wallet.repository`) | InMemoryWalletRepository     | A     | Source-of-truth entity                                                               |
| `SecurityPolicyProvider`                 | InMemoryPolicyProvider       | A     | Source-of-truth entity; policy is gate input                                         |
| `IntentStore`                            | InMemoryIntentStore          | A     | Timeline/preview reference; G-B binding anchor                                       |
| `VerificationArtifactStore`              | InMemoryVerificationStore    | A     | T21 artifacts; boots empty, fail-closed                                              |
| `OrderStore`                             | InMemoryOrderStore           | A     | SOURCE OF TRUTH for automation (Redis = transport only)                              |
| `QuoteStore`                             | InMemoryQuoteStore           | B     | One quote per evaluated intent — decision can never replay against a re-priced quote |
| `SpendLedger`                            | InMemorySpendLedger          | B     | Daily cap accounting; compare-and-reserve target (§5.1)                              |
| `ExecutionStore`                         | InMemoryExecutionStore       | B     | Exactly-once slot claims (§5.2)                                                      |
| `DecisionAudit`                          | InMemoryDecisionAudit        | B     | Append-only forensics + sign events; durability = G-B evidence                       |
| `KillSwitchPort` (state + audit)         | InMemoryKillSwitch           | B     | Mode changes are audited server actions; state must survive restarts                 |
| `SignerPort` (request/status)            | DryRunSigner (stateless)     | B     | **New in S1:** sign requests gain a persistent store (§3.2)                          |
| `PriceFeedPort` / `TriggerPricePort`     | live/static adapters         | C     | **NOT persisted** — spot reads by design                                             |
| Rate limiter (launchpad)                 | InMemoryFixedWindowRateLimit | C     | **NOT persisted** — ephemeral abuse guard by design                                  |
| Redis/BullMQ                             | (transport)                  | C     | Transport only — already durable as transport; not an S1 store                       |

## 3. New state introduced for Wave 6 (pre-signer, S1-owned)

### 3.1 `deploy_records` — the launch-state home

S2 publishes repo-committed payload files (the bytes to sign); the API needs the operational record around them. One row per ceremony stage attempt:

- identity: `id`, `stage` (`template` | `factory`), `chain`, `releaseTag`, `commitSha`
- payload binding: `payloadFile` (repo path — the committed official channel), `calldataKeccak` (the published hash), `expectedNonce` (advisory, per S2 P6), `decodedConstructorArgs` (JSON — from the kit's round-trip decode), echoed frozen constants (`totalFeeBps`, `bondAmount`, `bondSink` for factory stage)
- lifecycle: `status` (`published` → `signed_offchain` → `broadcast` → `readback_passed` | `readback_rejected`), `txHash`, `deployedAddress` (from receipt — never from prediction), `readbackAt`, `rejectionReason`
- append-only transitions; a readback REJECT is recorded, never silently retried (S2 §8 rule)

This table is the join point between S2 (ceremony), G4 (readback writes), and the backoffice timeline. It stores NO key material — the manual signature happens in the operator's wallet, outside this system by design.

### 3.2 `sign_requests` — persistent, UNIQUE on intent_id

`SignRequest` (shared-types) already carries `id`, `intentId`, `status`, `unsignedTx`, `digest`. Today it lives only in the dry-run flow. Under S1 it gains a store with **`UNIQUE(intent_id)`** — that constraint IS the cross-replica decision-binding guard: the second replica's INSERT fails, there is exactly one sign request per approved intent, and no intent can ever be signed twice across replicas. Status transitions (`dry_run` → `pending` → `signed` | `rejected`) are append-audited via the existing `DecisionAudit` sign-event seam.

### 3.3 `verification_artifacts` — operational store, git-canonical source

The `VerificationArtifactStore` gets a durable backing (id = `verificationId` PK, full artifact JSONB, seeded_at). Seeding remains an explicit ops act (fail-closed boot is unchanged); the git-committed `{chain}.verification.json` files stay canonical per T21, and the DB copy exists so gate + consent chip lookups survive restarts without file access. DB row and git artifact must byte-match on the canonical hash (RFC 8785 per T21) — a mismatch fails closed.

## 4. Schema (Postgres 16 — already in `docker-compose.yml`; `DATABASE_URL` already in `.env.example`)

Tables (named in snake_case; all with ISO-8601 timestamptz time columns):

```
wallets               (id PK, address UNIQUE lower-indexed, owner_id, chains text[], created_at, last_key_rotation_at)
security_policies     (wallet_id PK, allowed_origins text[], approval_threshold_usd, daily_cap_usd,
                       allowed_chains text[], reject_encoded_payloads bool)
intents               (id PK, wallet_id, kind, created_at, payload jsonb)        -- canonical JSONB + indexed scalars
decision_audit        (id bigserial PK, intent_id, result, reason, decided_at, decision_usd_micros)   -- APPEND-ONLY
sign_events           (id bigserial PK, intent_id, step, detail, at)                                    -- APPEND-ONLY
spend_ledger          (wallet_id, utc_day, intent_id, usd_micros CHECK (usd_micros >= 0), recorded_at,
                       PRIMARY KEY (wallet_id, utc_day, intent_id))               -- last-wins upsert per port contract
quotes                (intent_id PK UNIQUE, payload jsonb, stored_at)
orders                (id PK, payload jsonb, status, updated_at)                  -- status column indexed; terminal-guard at app layer
order_executions      (id PK = '<orderId>:<slotKey>', order_id, slot_key, status, intent_id,
                       finished_at, detail, UNIQUE (order_id, slot_key))          -- claim primitive (§5.2)
kill_switch_state     (id = 1 CHECK (id = 1), mode, version, updated_at, updated_by)
kill_switch_audit     (id bigserial PK, mode, at, by, reason)                     -- APPEND-ONLY
sign_requests         (id PK, intent_id UNIQUE, status, unsigned_tx jsonb, digest, note, created_at)
deploy_records        (id PK, stage, chain, release_tag, commit_sha, payload_file, calldata_keccak,
                       expected_nonce, decoded_args jsonb, frozen_constants jsonb, status,
                       tx_hash, deployed_address, readback_at, rejection_reason, created_at, updated_at)
verification_artifacts (verification_id PK, artifact jsonb, seeded_at)
```

**Money representation — micro-USD (AFFIRMED by Review54 ruling, with three binding conditions):** USD values stored as **integer micro-USD** at the adapter boundary; port signatures (`number`) unchanged. (1) **Rounding rule:** conversion is half-away-from-zero computed on the DECIMAL value (string/decimal arithmetic), NOT `Math.round` on a float — `Math.round(usd * 1e6)` is prohibited because the multiplication itself already loses precision. (2) **End-to-end micros:** the cap comparison happens entirely in micros (sum of `usd_micros` vs `cap_micros`); no USD float ever re-enters the accounting path. (3) **Non-negativity:** `CHECK (usd_micros >= 0)` on `spend_ledger` (schema above). Integer sums make cap accounting exact in SQL and immune to float accumulation drift.

**JSONB policy:** union-shaped entities (`TransactionIntent` with optional `DeployContext`, `Order`, `UnsignedTxPreview`) persist as canonical JSONB plus a narrow indexed scalar spine (id, wallet_id, kind, status, created_at). The TypeScript shapes in `@kryptr/shared-types` remain the single source of truth; adapters validate on read/write.

## 5. Atomicity patterns (the G-C substance)

### 5.1 Cap compare-and-reserve (replaces KeyedMutex)

**The seam, honestly (Review54 F1a):** the existing `SpendLedger` port exposes TWO separate methods — `getSpentUsdToday()` then `record()` — and the gate's read-check-record sequence is serialized today only by the per-instance `KeyedMutex`. Fusing those two calls into one SQL statement is NOT achievable behind the unchanged port: S1 therefore introduces an explicit **fused reserve seam** — a new port method:

```ts
/** Atomic reserve-against-cap. Returns the post-reserve day total in
 *  micro-USD when the reservation FITS under the cap; null when it would
 *  breach (nothing is recorded). Replaces read-check-record + KeyedMutex. */
reserveSpend(entry: { intentId: string; walletId: string; usdMicros: bigint; capMicros: bigint }): Promise<bigint | null>;
```

`getSpentUsdToday()` / `record()` remain for timeline/audit reads and are implemented ON TOP of the same table; the gate's cap path moves to `reserveSpend` exclusively. This is the one port-shape change in S1 and it is listed in §8 acceptance criterion 5's diff discipline as the sole authorized exception (domain port gains a method; no use-case DECISION logic changes — the use case swaps a mutex-guarded read-check-record for one call).

**The race, explicitly (Review54 F1b):** under READ COMMITTED, two reservations for DIFFERENT intents of the SAME wallet/day insert DIFFERENT PK rows; each transaction's `SUM` sees only committed rows, so both can observe "under cap" and both commit — a real breach. The naive fused statement alone does NOT arbitrate this. S1 serializes per (wallet, day) with a transaction-scoped advisory lock:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtext($wallet_id || ':' || $utc_day));
-- now the reserve + check is race-free for this wallet/day:
INSERT INTO spend_ledger (wallet_id, utc_day, intent_id, usd_micros, recorded_at)
VALUES ($1, $2, $3, $4, now())
ON CONFLICT (wallet_id, utc_day, intent_id)
DO UPDATE SET usd_micros = EXCLUDED.usd_micros, recorded_at = now();   -- last-wins per port contract
SELECT COALESCE(SUM(usd_micros), 0) FROM spend_ledger
WHERE wallet_id = $1 AND utc_day = $2;                                  -- post-reserve total
-- if total > cap_micros: ROLLBACK (reservation undone), reserveSpend returns null
COMMIT;  -- lock auto-released at transaction end; no manual unlock path to forget
```

Why advisory lock over the alternatives: (a) a `spend_day_totals` anchor row with `FOR UPDATE` works but adds a table whose only purpose is locking, plus an upsert-before-lock dance; (b) SERIALIZABLE + retry loop works but pushes retry policy into every adapter path and can starve under hot wallets. `pg_advisory_xact_lock` adds no schema, cannot leak past the transaction, and different wallets/days never contend. The lock granularity (wallet+day) exactly matches the accounting unit.

**Provability criterion:** the integration harness must demonstrate that N concurrent racers (separate connections, distinct intents, same wallet/day) whose total exceeds the cap admit EXACTLY the largest prefix that fits — survivors' sum ≤ cap_micros < survivors' sum + any loser's amount — with zero double-counting and zero lost reservations for admitted intents.

Re-confirmation semantics preserved: same-day re-approval upserts (no double count), a LATER day inserts a fresh row (over-count fail-safe direction per the port contract).

### 5.2 Execution claim / reclaim (exactly-once across replicas)

```sql
-- claim: unique constraint does the arbitration
INSERT INTO order_executions (id, order_id, slot_key, status, ...)
VALUES ($1, $2, $3, 'claimed', ...)
ON CONFLICT (order_id, slot_key) DO NOTHING
RETURNING *;                                  -- empty result = already claimed → stop, no side effects

-- reclaim (OW-2 continuation): atomic compare-and-set on non-terminal status
UPDATE order_executions SET status = 'claimed', ...
WHERE id = $1 AND status IN ('claimed','quoted')     -- resumable set == RESUMABLE_STATUSES (in-memory-execution.store.ts)
RETURNING *;                                  -- empty = terminal or lost → stop
```

These are the exact in-memory primitives' documented Postgres replacements (see `in-memory-execution.store.ts` notes). The resumable set is EXACTLY `RESUMABLE_STATUSES = {claimed, quoted}` (Review54 F2): `submitted` is deliberately NON-resumable — a record that reached submission may already be on-chain, so reclaiming it would open a double-fire path. Any reclaim attempt on a `submitted` record returns nothing and the caller stops.

### 5.3 Sign-request uniqueness (cross-replica decision-binding)

```sql
INSERT INTO sign_requests (...) VALUES (...)
ON CONFLICT (intent_id) DO NOTHING RETURNING *;   -- loser replica gets nothing → never signs twice
```

**Status transitions:** append-only forensics via `sign_events` is sufficient for the single-operator manual flow (custody Option 1); a CAS `version` column on `sign_requests` is an OPTIONAL follow-up if multi-operator signing ever lands (Review54 F4 — not in phase 1).

### 5.4 Kill switch CAS

Single-row state with a `version` column; mode change = `UPDATE ... WHERE version = $expected RETURNING version` — lost update means concurrent change, caller re-reads and re-audits. Every change appends to `kill_switch_audit`.

## 6. Migration story

**Tooling (ruling requested, §10):** recommend **Prisma** — it is the ORM already anticipated by name in the codebase (`in-memory-policy-provider.ts`), and `prisma migrate` gives versioned, reviewable migration files with typed clients. Alternatives: drizzle (SQL-first, lighter) or raw `pg` (zero ORM, hand-rolled migrations). All three satisfy the port-swap design; the choice changes only the adapter internals + migration tooling. This is a new dependency — explicit approval required before build.

**Greenfield posture:** the database is new; migration `0001_init` creates the full schema above. No backfill — in-memory data is by definition ephemeral and the system is pre-production.

**Phase order (each phase = separate PR, module-binding swap only):**

| Phase | Stores swapped                                                                                                    | Unlocks                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1     | sign_requests, decision_audit, sign_events, spend_ledger, intents, deploy_records, verification_artifacts, quotes | S2 ceremony (the pre-signer critical path) |
| 2     | orders, order_executions, kill_switch (state + audit)                                                             | Durable automation; C1 release assessment  |
| 3     | wallets, security_policies                                                                                        | Full entity persistence; C1 released       |

Each phase swaps the binding in the module composition root (exactly the seam the in-memory adapters' docstrings describe) — decision logic untouched, ports unchanged.

**Hermetic tests stay hermetic:** unit/use-case specs keep the in-memory adapters (they test DECISIONS, not storage). Each phase adds an integration harness against the compose Postgres (`apps/api/src/test/postgres-harness.ts`, mirroring the existing `redis-harness.workers.ts` pattern): `prisma migrate deploy` once, truncate-between-tests, env-gated like the existing live specs so CI without a database service still runs the full hermetic suite. CI Postgres service-container wiring is an OpsCI item (§10).

**C1 release criterion:** phases 1–2 green in CI with the Postgres harness + soak on the testnet environment → multi-replica API becomes permissible (G-F observability floor still gates actual multi-replica operation).

## 7. Security alignment

- **No key material anywhere** in the schema; `deploy_records` stores hashes, addresses, and decoded PUBLIC constructor args only. The manual signature never transits this system.
- **Append-only tables** (`decision_audit`, `sign_events`, `kill_switch_audit`) get no UPDATE/DELETE code paths; optionally enforce with a restricted application DB role (no UPDATE/DELETE grants on those tables) — recommended, cheap, rules out a whole class of forensic-tampering bugs.
- **Verification store fail-closed boot is unchanged** by persistence: empty table, seeded only by the explicit ops path, DB↔git byte-parity check on the canonical hash.
- **G-B durability:** the intent→decision→sign-request chain is now reconstructable after any restart; forensics never depend on a live process.

## 8. Acceptance criteria (S1 "done")

1. All phase-1 stores pass port-contract integration specs against Postgres (same behavioral contracts as the in-memory specs: last-wins ledger, exactly-once claims, append-only audit, fail-closed verification lookups).
2. Cap reserve proven race-free under the concurrent harness of §5.1 (N racers, distinct intents, same wallet/day, total > cap: exactly the fitting prefix survives — provably, per the §5.1 criterion).
3. Sign-request uniqueness proven under racing inserts (one winner, loser observes null).
4. Restart test: kill the API mid-flow; decision audit, deploy records, and kill-switch state survive intact.
5. Zero changes to any use case's decision logic (diff discipline: modules + infrastructure only).

## 9. Sequencing

- S1 phase 1 lands BEFORE S2 build (S2 §9 dependency). S2's repo-committed payloads and S1's `deploy_records` are complementary: the file is the bytes to sign; the record is the operational lifecycle around them.
- S3 deploy execution remains blocked on: user approval of S2 + S1 phase 1 landed + kit decode additions (VaultAPI) reviewed.

## 10. Open items (rulings requested)

| Item                                                                                                                                                                                                                                     | Decider             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| ORM/DB-access choice: Prisma (recommended) vs drizzle vs raw `pg` — new dependency approval — **PENDING-USER; no build starts before explicit approval**                                                                                 | Main + user         |
| USD storage: integer micro-USD — **AFFIRMED** with the three binding conditions of §4 (half-away-from-zero decimal rounding, end-to-end micros, non-negativity CHECK)                                                                    | Review54 (ruled)    |
| Deploy-tag question from S2 §10: tooling-only kit changes (decode/keccak emitters) — recommend NO new tag and NO full Tier F re-run IF the TWO-PART proof of §10.1 holds; a NEW tag + battery re-run only if any contract source changes | Main + VaultAPI     |
| CI Postgres service container for the integration harness                                                                                                                                                                                | OpsCI               |
| Restricted DB role for append-only tables (recommended; can land with phase 1 or as follow-up)                                                                                                                                           | VaultAPI + Review54 |

### 10.1 Two-part tooling-change proof (Review54 F3 — both parts runnable)

A tooling-only kit change (e.g. the S2 §4 emitters) must ship BOTH:

1. **Bytecode identity at the tag:** sha256 of creation AND runtime bytecode for `KryptrTokenFactory` and `KryptrLaunchTokenTemplate`, compiled from `contracts-v0.1.0` vs from the change branch — four identical pairs.
2. **Emitted-calldata byte-diff:** run the TAG's kit and the BRANCH's kit with identical inputs (`KIT_STAGE=template`; `KIT_STAGE=factory TEMPLATE_ADDRESS=<same> BOND_SINK=<same>`) and byte-compare the `data` fields of the emitted JSON — must be byte-identical (new fields may be added; the bytes-to-sign may not change).

Additionally, ceremony payload **provenance must record the tooling commit SEPARATELY from `releaseTag`** (`provenance.toolingCommit` alongside `provenance.releaseTag`) — otherwise the tag↔payload drift guard of #94 is violated the moment tooling moves ahead of the tag.

## 11. Out of scope

- Venue tables (S4 owns them; own manifest + artifact per gate G-D).
- Redis persistence policy (OpsCI-owned per wave-4 worker design).
- Conversational layer (Wave 7), mainnet readiness (S6).
- Anything that stores, derives, or handles signing keys (frozen constraint §0).
