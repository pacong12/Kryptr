# Wave 4 Worker Design — BullMQ Order Automation (Research)

Status: **proposal** (VaultAPI research deliverable). Bindings:
`docs/research/wave1-3-evaluation.md` rulings 1–8. No packages added,
no `shared-types` changes — contract shapes below are PROPOSALS to
freeze before parallel build.

## 1. Scope

Design the automation worker (DCA, limit orders, kill switch) on top of
the existing clean architecture: `domain → application →
infrastructure`, ports for everything external, fail-closed defaults.
Everything below assumes the wave-3 surface stays untouched; the worker
is a NEW module (`apps/api/src/automation/`) that consumes existing
ports (`EvaluateIntentUseCase`, `DexAggregatorPort`, `QuoteStore`,
`IntentStore`, `DecisionAudit`, `SignerPort`) and adds its own.

## 2. Ground rules (from the ruling, non-negotiable)

1. Every scheduled execution = a NEW `TransactionIntent` through the
   full gate. No pre-authorization of sequences (Bankr RC-4 lesson).
2. Trigger prices come from an oracle port with freshness + deviation
   bounds; unknown price → `needs_human_approval`. A single print never
   executes alone.
3. Deterministic job ids per order + SpendLedger-style idempotency:
   worker restarts never double-fill.
4. All time logic uses an injectable clock (`now`) — DCA slots,
   expiries, TTLs.
5. Order lifecycle frozen in `shared-types` BEFORE parallel build.
6. Kill switch checked at the execution point, not only at evaluation;
   contract-first (pause-new vs cancel-active).
7. Redis service container in CI; env-gate + `test:live` conventions
   extended to worker suites.
8. MEV: re-quote at execution, `minAmountOut` recomputed (already in
   `ZeroExDexAdapter`), private RPC considered later.

## 3. Queue topology — two STAGE queues, not per-order-type

| Queue                | Purpose                                                         | Urgency                 | Concurrency |
| -------------------- | --------------------------------------------------------------- | ----------------------- | ----------- |
| `automation.trigger` | per-order trigger evaluation (DCA slot due / limit price check) | low, batchable          | high        |
| `automation.execute` | claim → kill switch → re-quote → gate → unsigned tx             | high, serial per wallet | bounded     |

**Why stage-based, not per-order-type (dca/limit queues):** the
type-specific logic is the trigger predicate and the payload shape —
both live in job data + processor strategy, not in transport. Two
queues give the properties we actually need:

- Execution can never starve behind a burst of trigger checks (limit
  cascade on a volatile day), and vice versa.
- Kill switch `cancel-active` = drain/pause ONE queue
  (`automation.execute`), deterministic.
- Independent scaling and rate limiting per stage (trigger checks are
  cheap reads; executions hit the aggregator + gate).

Per-type queues would double wiring (two rate limiters, two health
surfaces, two drain paths) for zero security benefit. Order type is a
job-name prefix (`dca:` / `limit:`) inside `automation.trigger`.

**Scheduler shape:** no per-order repeatable jobs. One lightweight
repeatable `automation:scheduler` job (e.g. `every: 10_000`,
deterministic `repeatJobKey`) queries the `OrderStore` for orders whose
`nextTriggerCheckAt <= now()` and enqueues one trigger job each, with a
deterministic per-order job id (below). Thousands of BullMQ
repeatables scale poorly (reaper + delayed-set churn); one scheduler +
plain jobs keeps Redis state O(active orders per tick).

## 4. Deterministic job ids + idempotency (no double-fill)

### Job ids

Every job id is derivable from `(orderId, slot)` with no clock input at
dequeue time:

- DCA: `dca:<orderId>:slot-<n>` where `n = floor((now - anchorMs) /
intervalMs)` from the order's immutable anchor — the same slot always
  produces the same id, whenever the scheduler happens to enqueue it.
- Limit: `limit:<orderId>:poll-<yyyymmddhhmm-bucket>` (bucket =
  poll window the check belongs to).
- Execution: `exec:<orderId>:slot-<n>` (DCA) /
  `exec:<orderId>:trig-<triggerPrintId>` (limit — one execution per
  confirmed trigger event).

BullMQ rejects adding a job whose `jobId` already exists in the queue
(waiting/delayed/active). That dedupes SCHEDULING but is NOT the
fill-guard: once a completed job leaves retention, the id is reusable.
The fill-guard is the claim ledger below.

### ExecutionClaimStore — the SpendLedger pattern

```ts
export const EXECUTION_CLAIMS = 'automation.execution-claims';

export interface ExecutionClaimStore {
  /**
   * Atomically claim the right to execute (orderId, slotKey).
   * Returns true exactly ONCE per (orderId, slotKey), ever —
   * across restarts, redeliveries, and concurrent workers.
   * Idempotent by identity, exactly like SpendLedger.record.
   */
  claim(entry: {
    orderId: string;
    slotKey: string; // 'slot-123' | 'trig-<printId>'
    intentId: string; // deterministic, see §5
    at: string; // ISO-8601, injected clock
  }): Promise<boolean>;
  findByOrderId(orderId: string): Promise<ExecutionClaim[]>;
}
```

In-memory impl now (Map keyed `${orderId}:${slotKey}`); Postgres-ready
(unique constraint on `(order_id, slot_key)`; claim = `INSERT ... ON
CONFLICT DO NOTHING` returning the insert flag). The worker performs
`claim()` BEFORE any side effect (before gate, before quote-binding).
Claim lost → the job is a redelivery/duplicate → ack and stop. This is
the single mechanism that makes at-least-once delivery safe.

### Deterministic intent ids

Gate intents for automation are derived, never random:
`intent:<orderId>:<slotKey>` (e.g. `intent:ord-1:slot-12`). Consequences:

- Re-running a claimed-but-crashed execution hits the SAME intent id →
  `IntentStore.save` is an overwrite, `DecisionAudit` forensics group
  cleanly per execution.
- The timeline shows automation executions with stable anchors the UI
  can link to.

## 5. Execution flow (per triggered order)

```
trigger job (automation.trigger)
  ├─ order status must be 'live'            else drop (audit)
  ├─ trigger predicate (DCA: slot due; limit: oracle print, §6)
  │    └─ not triggered → update nextTriggerCheckAt, done
  └─ enqueue exec:<orderId>:<slotKey> on automation.execute

execution job (automation.execute)
  ├─ 1. ExecutionClaimStore.claim(orderId, slotKey)
  │      └─ false → ack, stop (redelivery/duplicate)
  ├─ 2. KillSwitchPort.assertExecutable(walletId)      ← §8
  │      └─ paused → order stays live (pause-new) or cancelled
  │         (cancel-active); audit 'kill_switch_blocked'; done
  ├─ 3. re-quote: DexAggregatorPort.getQuote({..., taker:
  │      wallet.address})  — taker resolved server-side (PR #32)
  ├─ 4. QuoteStore.save(quote)
  ├─ 5. build NEW TransactionIntent {id: intent:<orderId>:<slotKey>,
  │      origin: 'automation', swap: {quoteId, ...}}
  ├─ 6. EvaluateIntentUseCase.execute(intent)  — FULL gate chain:
  │      payload → origin allowlist → chain allowlist → swap-context
  │      (quote unused/bound/expiry+margin/slippage/floor) →
  │      valuation → threshold → daily cap
  │      ├─ rejected / needs_human_approval → order audit; NO retry;
  │      │   human may act via the existing approval flow
  │      └─ approved → quote now single-use bound (existing gate
  │          behavior), continue
  ├─ 7. unsigned execution preview (existing preview semantics)
  │      → order status 'filled-pending' + execution record
  │      (quoteId, intentId, decision id, tx preview)
  └─ 8. SignerPort stays OUT OF SCOPE for the worker (§9)
```

Timing note: quote TTL is `QUOTE_TTL_MS = 60_000` and the gate demands
≥ `QUOTE_EXPIRY_MARGIN_MS = 5_000` remaining. Steps 3–6 must run
promptly; if the quote expires mid-flight (slow aggregator), the gate
rejects with `quote_expired` and the retry matrix (§7) re-quotes within
the SAME claimed slot — the claim survives re-quoting.

## 6. Trigger evaluation

**DCA** is time-only: slot due per the injectable clock. No price
involvement → no oracle dependency; valuation still happens at the gate
(step 6), so a pump-and-dump day is caught by threshold/cap, not by
skipping the order.

**Limit orders** consult an oracle port (Web3Intel is picking the
source — Chainlink on Base is the ruling's baseline):

```ts
export const PRICE_TRIGGER = 'automation.price-trigger';

export interface PriceTriggerPort {
  /** Latest print with freshness; null = unknown → fail-closed. */
  getLatestPrint(
    chain: ChainId,
    asset: `0x${string}` | null,
  ): Promise<PricePrint | null>; // {priceUsd, observedAt, source}
  health(): FeedHealth;
}
```

- Freshness bound: print older than `TRIGGER_MAX_AGE_MS` (propose
  60_000) → treated as unknown.
- Deviation bound: two independent sources when cheap; a single print
  may only ARM execution; the execution step's re-quote (§5 step 3) is
  the second, market-real price — execution proceeds only if the quoted
  price does not deviate from the trigger print by more than
  `TRIGGER_DEVIATION_BPS` (propose 100). Any unknown → gate path
  (`needs_human_approval` via a synthetic intent, or order parked with
  status `trigger_check_failed` + audit — decide at contract freeze).
- `PriceTriggerPort.health()` joins `/health/feeds` (status
  `unconfigured` when no oracle is wired — same semantics as
  `aggregator_unconfigured`).

## 7. Retry / backoff matrix

| Failure class (DomainError / decision)        | Stage   | Policy                                                              |
| --------------------------------------------- | ------- | ------------------------------------------------------------------- |
| `needs_human_approval`, `rejected` (gate)     | execute | **no retry**; audit; human acts via approval flow                   |
| `quote_expired`, `no_liquidity`               | execute | re-quote, bounded (propose 3, exponential 2s base), same slot claim |
| `aggregator_rate_limited` (429)               | execute | exponential backoff honoring Retry-After, bounded                   |
| `aggregator_auth_failed`                      | execute | **no retry** (config error); order park + audit + feeds health      |
| `aggregator_unavailable`, `chain_unavailable` | execute | bounded retry (3), then audit + park until next slot                |
| oracle unknown / stale (`PriceTriggerPort`)   | trigger | skip the tick, re-check next tick; NEVER execute on stale print     |
| claim lost                                    | either  | ack, stop — by definition already handled                           |

BullMQ knobs: `attempts` + `backoff: {type:'exponential', delay}` per
queue; `removeOnFail` generous (24h) for forensics, but the AUDIT
TRUTH is `DecisionAudit` + order audit, never BullMQ retention.
Poison jobs (repeated non-retryable failure) move to failed with the
DomainError code preserved in job data for dashboards.

A failed DCA slot does NOT cascade: the next slot is a new job id, new
claim, new intent. A failed limit trigger re-arms on the next poll
bucket.

## 8. Kill switch (ruling 6) — contract-first

```ts
export const KILL_SWITCH = 'automation.kill-switch';

export type KillSwitchMode = 'pause_new' | 'cancel_active';

export interface KillSwitchPort {
  /** Effective state for a wallet (or global). */
  getState(walletId: string): Promise<{
    active: boolean;
    mode: KillSwitchMode;
    since: string;
  }>;
  /** Execution-point guard: throws/returns blocked when active. */
  assertExecutable(walletId: string): Promise<void>;
}
```

Semantics (freeze in `shared-types` with DeckUI):

- `pause_new`: reject new order creation AND block new executions
  (step 2 above); live orders stay `live` and resume when lifted.
- `cancel_active`: additionally transition all live orders to
  `cancelling → cancelled` and drain `automation.execute`.
- Every flip is a server action requiring confirmation + an audit
  timeline entry (DecisionAudit gains a step or a parallel order-audit
  — decide at freeze).
- Checked at BOTH the execution point (step 2) and at order
  creation/scheduler enqueue — because evaluation-time-only checking is
  exactly the RC-4 failure mode.

## 9. Signing boundary — worker is keyless by construction

The worker NEVER calls `SignerPort` with different semantics than the
interactive flow: execution ends at the approved decision + unsigned
preview, exactly where wave 3 ends for a human. `DryRunSigner` remains
the only `SignerPort` implementation (digest only, never a signature).
When a `HARD_SIGNER` exists in a future wave, automation broadcasting
requires its OWN ruling (the gate approving an intent must remain a
necessary-but-not-sufficient condition; a separate execution-authorization
decision is needed). Nothing in this design weakens that boundary.

## 10. Persistence semantics on Redis restart

**Source of truth is the OrderStore (DB), never Redis.** BullMQ state
in Redis is transport-only.

- Redis restart loses queued/delayed jobs and repeatables. On worker
  boot a reconciler scans `OrderStore` for `live` orders and
  re-derives: the scheduler repeatable, plus any trigger/exec jobs
  whose slot is already due (deterministic ids make re-enqueue exact).
- At-least-once redelivery mid-processing is safe ONLY via the claim
  ledger (§4) — never via "the job completed" reasoning.
- Crash between claim and gate: claim exists, no decision → reconciler
  re-enqueues the exec job; gate evaluation is pure w.r.t. the intent
  id, so the outcome is consistent; a second decision entry under the
  same deterministic intent id is acceptable forensics (or gate
  dedupes by intent id — decide at freeze).
- Redis durability (AOF/RDB policy, replicas) is an OpsCI decision;
  the API-side guarantee above holds for ANY Redis loss scenario.

`OrderStore` sketch (Postgres-ready, in-memory first):

```ts
export const ORDER_STORE = 'automation.order-store';

export interface AutomationOrder {
  id: string;
  walletId: string;
  kind: 'dca' | 'limit';
  status:
    'live' | 'triggered' | 'cancelling' | 'cancelled' | 'expired' | 'filled';
  params: DcaParams | LimitParams; // amount, asset pair, interval / trigger price
  anchorMs: number; // immutable, for slot math
  nextTriggerCheckAt: string; // ISO-8601
  createdAt: string;
  updatedAt: string;
}
```

## 11. Gate interaction — prerequisites found in the audit

Two findings from reading the current gate code:

1. **`SpendLedger.record()` has ZERO production call sites today.**
   The daily cap READS the ledger but nothing WRITES it (wave-2
   follow-up). Under automation this is a cap-bypass: infinite DCA
   ticks, cap never consumed. **Prerequisite for wave 4: spend
   recording at decision time (approved decisions) inside the gate,
   idempotent per intent id** — matches the ledger's documented
   contract ("Idempotent per intentId"). **RESOLVED-by-ruling**:
   accepted as a wave-4 prerequisite; separate prep PR before worker
   execution begins.
2. Gate `origin` is client-supplied; automation intents use
   `origin: 'automation'` and MUST be allowlisted explicitly in
   policies — a wallet whose policy only allows `'user'` correctly
   refuses its own automation, fail-closed. **RESOLVED-by-ruling**:
   explicit allowlist in the contract freeze; default deny asserted in
   tests.

## 12. Env semantics (wave-3 pattern)

`AUTOMATION_MODE=disabled|in-memory|bullmq`, default `disabled` →
order endpoints answer 503 `automation_unconfigured` + feeds health
`unconfigured` (mirrors `aggregator_unconfigured`; never silently off).
`REDIS_URL` read only in `bullmq` mode. Dev opt-in is explicit; tests
pin the mode in-module (JEST hermeticity per PR #32's
`resolveEnvFilePaths` + `JEST_WORKER_ID` guard).

## 13. Proposed lifecycle + error codes (to freeze in shared-types)

- Statuses: `live → triggered → filled | failed`; `cancelling →
cancelled`; time-based `expired` (order-level TTL, e.g. limit orders
  with `goodTill`).
- Worker error codes (envelope `err.code`):
  `automation_unconfigured` (503), `order_unknown` (404),
  `order_not_cancellable` (409), `trigger_check_failed` (502, oracle),
  `kill_switch_active` (403), plus reuse of existing gate/aggregator
  codes untouched.
- Worker health for `/health/feeds`: `feedId: 'worker'`, status
  `healthy|down|unconfigured`, `lastUpdateAt` = last scheduler tick
  (injectable clock).

## 14. Testing strategy (ruling 7)

1. **Unit**: every use case against port mocks; queue replaced by an
   in-memory fake (`InMemoryJobQueue` recording enqueues) — zero Redis,
   zero network, clocks injected everywhere (#22 lesson).
2. **Contract**: a `dexAggregatorContractSuite`-style suite for the
   claim store (exactly-once claim under simulated redelivery) and for
   trigger predicates (slot math is pure + clock-pinned).
3. **Integration with Redis service container** (OpsCI): real BullMQ,
   worker restart scenario = kill processor mid-job → assert no
   double-fill via claim ledger; env-gate convention applies.
4. **Live** (`test:live`, keyed): real oracle print + real 0x quote,
   `{live:true}` relaxation as in wave 3; nightly scheduled run
   (OpsCI ruling) so upstream drift is caught in CI, not by the user.

## 15. Risks & open questions

| Owner     | Question                                                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Conductor | Freeze order lifecycle + worker error codes in shared-types before parallel build (ruling 5).                                                                                                                                        |
| Conductor | ~~Approve `SpendLedger.record()` at gate decision time (prerequisite §11.1).~~ **RESOLVED-by-ruling**: record() at decision time (approve), idempotent per intentId; scheduled as a separate prep PR BEFORE worker execution begins. |
| Conductor | ~~Allowlist `origin: 'automation'` explicitly (§11.2).~~ **RESOLVED-by-ruling**: explicit allowlist in the contract freeze; default deny stays fail-closed and asserted in tests (automation intent without allowlist → rejected).   |
| Web3Intel | Oracle source choice on Base (Chainlink feeds vs data streams), pricing, dual-source feasibility.                                                                                                                                    |
| OpsCI     | Redis persistence policy (AOF/replicas), service-container sizing, nightly live-run schedule.                                                                                                                                        |
| DeckUI    | Kill switch confirmation UX + pause-new vs cancel-active display; order timeline steps.                                                                                                                                              |
| VaultAPI  | Gate decision dedupe by intent id vs duplicate-entry forensics (§10).                                                                                                                                                                |
| VaultAPI  | `TRIGGER_DEVIATION_BPS` / `TRIGGER_MAX_AGE_MS` defaults pending oracle choice.                                                                                                                                                       |
