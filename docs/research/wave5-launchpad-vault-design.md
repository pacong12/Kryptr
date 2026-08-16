# Wave 5 Launchpad — Vault Research: Automation Firewall, Deploy Gate Branch, DeployContext

> Author: VaultAPI · Status: **research / design sketch — NO code, NO contract
> changes yet** (read-only phase granted by conductor 2026-08-16; build starts
> at official wave-5 kickoff). Grounding: `launchpad-decision.md` (GO, 5/5),
> `launchpad-discussion.md` (memo + rulings), wave-4 freeze discipline.
>
> Deliverables mapped to the conductor's three focus items:
>
> 1. §1 — gate #3 STRUCTURAL firewall: automation can never produce
>    `kind='deploy'` (decision condition 3, first clause).
> 2. §2 — vault deploy-gate branch that lands BEFORE the factory (decision
>    condition 5 + memo §3 ruling 3), incl. the factory allowlist
>    (condition 3, second clause).
> 3. §3 — `DeployContext` sketch for DeckUI's contract-first prep PR
>    (decision condition 4).

---

## 0. Current state (aeadca9, verified in source)

- `TransactionIntent.kind` already includes `'deploy'`
  (`packages/shared-types/src/lib/transactions.ts`).
- **Deploy→HITL is ALREADY merged** (wave 3): `EvaluateIntentUseCase`
  unconditionally returns `needs_human_approval` /
  `deploy_requires_human_approval` for `kind==='deploy'`, BEFORE pricing —
  closing the `amount='0'` auto-approval hole (T19). Memo §2.1.1 and decision
  condition 5's "deploy-HITL branch" core is DONE; what remains is §2 below.
- Gate sequence today: save → policy lookup → payload inspection → origin
  allowlist (exact match, default `['user']`) → chain allowlist → deploy HITL
  → swap-context checks → USD pricing → caps.
- Automation exists: `AUTOMATION_ORIGIN = 'automation:order-worker'`; the
  order worker builds ONLY swap intents (inline literal `kind: 'swap'` in
  `execute-order-slot.usecase.ts`). Origin convention on `TransactionIntent`:
  `'user' | 'agent:<id>' | 'automation:<id>'`.
- Worker executions go through the FULL gate (no bypass), keyless, dry-run
  boundary — wave-4 invariant carries over unchanged.
- `TokenFeeSchedule` exists (float shares). No `DeployContext`, no fee
  recipients type, no deploy allowlist yet.

---

## 1. Gate #3 — structural firewall: automation never deploys

**Requirement (binding):** STRUCTURAL prohibition — no configuration flag may
ever permit an automation origin to produce a `kind='deploy'` intent.
Deploys stay interactive-only + HITL forever.

Design principle: a property is "structural" when violating it requires
changing reviewed code that CI tests fail on — never when it can be achieved
by flipping config. We therefore stack four layers; the firewall is layers
0+1+3, while layer 2 is config BY DESIGN (it restricts interactive deploys,
it does not enable automation deploys).

### Layer 0 — construction narrowing (type level)

Automation intents have exactly ONE construction site. Formalize it:

- Extract the worker's inline intent literal into a single builder
  `buildAutomationSwapIntent(...)` inside order-worker whose return type is
  `TransactionIntent & { kind: 'swap' }`. The `kind` field is a literal
  type — the compiler rejects `kind: 'deploy'` at that site.
- Order-worker source never imports `DeployContext` or any deploy-facing
  type. This import boundary is enforced by the layer-3 source scan, not by
  convention.

Layer 0 makes the CURRENT code unable to express an automation deploy; layers
1/3 make every FUTURE edit unable to smuggle one through.

### Layer 1 — unconditional gate rejection (code, below policy)

In `EvaluateIntentUseCase.execute`, BEFORE the policy lookup and origin
allowlist:

```text
if intent.kind === 'deploy' && intent.origin.startsWith('automation:')
    → finish(rejected, 'automation_deploy_forbidden')
```

Placement rationale (the crux): for the worker to swap at all, a wallet
policy MUST explicitly allowlist `'automation:order-worker'` — the origin
grant necessarily exists in config. If deploy-authorization were derived from
that grant, a policy edit would authorize automation deploys. The rejection
therefore sits upstream of every policy read: no policy, allowlist entry,
HITL approval, or future flag can waive it. It is reviewed, tested code — the
only way past it is a diff to the gate itself, which layer 3's tests make
red.

Semantics distinction (must stay in copy and audit strings):

| Origin class                               | kind='deploy' outcome                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| interactive (`user`, future `agent:` HITL) | `needs_human_approval` (wave-3 behavior, unchanged)                              |
| `automation:*`                             | hard `rejected: automation_deploy_forbidden` — never escalates, never approvable |

### Layer 2 — factory allowlist for INTERACTIVE deploys (config by design)

Second clause of condition 3: factory allowlist pinned from the ops deploy
manifest, single source of truth, CI-schema-validated.

- Port: `DeployAllowlistPort { isAllowed(chain, factory): boolean }`;
  infra `ManifestDeployAllowlist` reads `contracts/deployments/{chain}.json`
  (ops artifact: address, salt, commit sha, verification tx) ONCE at wiring
  time. Manifest schema validation lives in CI (ops-owned per memo §2.5);
  vault only consumes.
- Gate rule for `kind='deploy'` (interactive path, before HITL escalation):
  `intent.to` (the factory) must be allowlisted on `intent.chain`, else
  `rejected: factory_not_allowlisted`. Fail-closed: missing manifest or
  missing chain entry → all deploys on that chain reject.
- Pre-factory posture falls out for free: empty manifest ⇒ every deploy
  rejects ⇒ launchpad stays dark until T21-verified factory lands in the
  manifest. No launch flag anywhere.

### Layer 3 — verification: the structure is testable

- **Gate spec**: a deploy intent from `automation:order-worker` (and a
  synthetic `automation:anything`) is REJECTED even when (a) the wallet
  policy explicitly allowlists that origin and (b) the factory allowlist
  contains `intent.to`. This test is the executable statement "policy cannot
  override the firewall".
- **Boundary spec** (api suite, no new deps): read
  `apps/api/src/order-worker/**/*.ts` at test time and assert no file
  contains a `kind: 'deploy'` construction or a `DeployContext` import.
  Turns "order-worker never produces deploys" into a red/green property that
  survives refactors.
- **Regression spec**: interactive deploy still escalates to
  `needs_human_approval` (wave-3 behavior preserved).

### Impossibility argument

For an automation-origin deploy to reach signing it must pass
`EvaluateIntentUseCase`; layer 1 rejects that pair unconditionally in code
that runs before any config is read; layer 0 makes the current automation
source unable to construct one; layer 3 fails CI if either invariant breaks.
Residual path = a reviewed gate diff, i.e. the human process itself. Config
surface added by this design (origin grants, factory allowlist) can only ever
RESTRICT further, never enable automation deploys.

---

## 2. Vault deploy-gate branch — scope and ordering (before factory work)

Core HITL escalation is merged (wave 3). The pre-factory branch adds, in one
PR, TDD red-green:

1. **Firewall** (§1 layer 1): `automation_deploy_forbidden` rejection +
   layer-3 specs. Zero config introduced.
2. **Factory allowlist** (§1 layer 2): `DeployAllowlistPort` +
   manifest-backed infra + `factory_not_allowlisted` rejection + specs
   (empty manifest fail-closed; allowlisted factory escalates to HITL).
3. **DeployContext preconditions** (§3): when `intent.deploy` is present —
   - `intent.deploy.factory === intent.to` and allowlisted;
   - `bondPaid === true` required (memo ruling 2 split: bond PARAMETER is
     factory/on-chain; bond-paid VALIDATION is gate-side) →
     `deploy_bond_unpaid` rejection otherwise;
   - `TokenFeeSchedule` validation: shares non-negative, sum equals the
     launch total (see open question Q1) → `fee_schedule_invalid`;
   - recipients: four valid EVM addresses → `fee_recipients_invalid`.
     All pre-sign, all `rejected` (fail-closed), all audited with stable
     reason strings for the DeckUI timeline.
4. **Audit strings**: deploy decisions get DeckUI-consumable reasons
   (`automation_deploy_forbidden`, `factory_not_allowlisted`,
   `deploy_bond_unpaid`, existing `deploy_requires_human_approval`).

Ordering (decision condition 5): after wave 4 closes → this branch → DeckUI
`DeployContext` prep PR (gate #4, may overlap) → factory/contracts work
(OpsCI/Web3Intel territory) → T21 battery → manifest entry → first launch.
Explicitly OUT of this branch: signer changes, calldata construction,
bond mechanics, fee accrual — all factory-era.

---

## 3. DeployContext sketch (for DeckUI's prep PR, gate #4)

Mirrors `SwapContext` (bound context, present iff `kind==='deploy'`),
contract-first in `packages/shared-types/src/lib/transactions.ts`:

```ts
/** Fee recipients frozen at deploy (memo deck §2.4: operators scrutinize). */
export interface FeeRecipients {
  creator: `0x${string}`;
  lp: `0x${string}`;
  protocol: `0x${string}`;
  buyback: `0x${string}`;
}

/** Present iff kind === 'deploy'; frozen at consent, validated pre-sign. */
export interface DeployContext {
  tokenName: string;
  tokenSymbol: string;
  /** Raw units, positive integer string (wave-4 amount convention). */
  totalSupply: string;
  /** Factory the deploy goes through; MUST equal intent.to + allowlist. */
  factory: `0x${string}`;
  feeSchedule: TokenFeeSchedule;
  feeRecipients: FeeRecipients;
  /** Ruling 2: gate validates bond-paid; the bond itself is on-chain. */
  bondPaid: boolean;
  /** T21 verification artifact id the consent UI may render (cond. #1). */
  verificationId?: string;
}
```

Field notes:

- **No `deployingWalletId`, no `chain` field**: `intent.walletId` /
  `intent.chain` already carry them (memo's "deploying wallet" is the consent
  screen's wallet picker = intent.walletId). SwapContext parity: the context
  adds only kind-specific bindings.
- **`factory` duplicates `intent.to` by design**: `intent.to` is the generic
  target the allowlist and calldata layers check; `factory` keeps the launch
  context self-describing for UI rendering (FaceUI consent card, DeckUI
  launch detail) and the gate asserts equality — mismatch is a construction
  bug or an attack, reject either way (T17 mitigation: what was consented is
  what gets validated).
- **Freeze discipline**: land as a contract-first prep PR (no consumers),
  then freeze exactly like the wave-4 orders contract — amendments only,
  amendment log in the PR. DeckUI owns the PR; this section is the proposal.

Gate-side validation table (§2.3 consumes this):

| Check                                                       | Failure reason            |
| ----------------------------------------------------------- | ------------------------- |
| `deploy.factory === intent.to`                              | `factory_mismatch`        |
| factory allowlisted on chain                                | `factory_not_allowlisted` |
| `bondPaid === true`                                         | `deploy_bond_unpaid`      |
| name/symbol non-empty (symbol charset/length TBD w/ FaceUI) | `deploy_context_invalid`  |
| totalSupply positive integer string                         | `deploy_context_invalid`  |
| fee shares non-negative + sum (Q1)                          | `fee_schedule_invalid`    |
| recipients ×4 valid addresses                               | `fee_recipients_invalid`  |

---

## 4. Threat mapping (T-series §4 of the memo)

- **T17 fee-recipient manipulation**: constructor args derive from the
  gate-validated `DeployContext`; consent screen displays the SAME context
  (FaceUI); recipients validated pre-sign. Residual: the signing layer must
  build deploy calldata FROM the validated context (not from a separate
  payload) — hard requirement on the factory-era signer work.
- **T18 deploy spam**: automation is firewalled out entirely (§1); API
  per-origin daily caps apply to interactive origins (existing SpendLedger);
  the economic anchor is the on-chain bond (factory era).
- **T19 valueless auto-approval**: closed since wave 3 (unconditional HITL).
- **T20 upgrade authority**: no upgrade path Phase 1 (Option A); nothing for
  the gate to carry yet — policy pre-emption stays in docs.
- **T21 clone bugs**: Web3Intel/OpsCI battery; vault surface = consume the
  `verificationId` artifact id and refuse manifest entries without it (CI
  schema, ops-owned).

## 5. Open questions for kickoff

- **Q1 — fee representation**: `TokenFeeSchedule` uses float shares; float
  equality checks are fragile. Proposal: validate via integer bps mirrors
  (`creatorBps` etc., sum === 175 reference, parameterized per launch) —
  either amend `TokenFeeSchedule` (breaking-ish, clean) or add bps fields
  alongside (additive, redundant). Decision at kickoff; DeckUI freeze must
  match.
- **Q2 — creator === deploying wallet?** Gate-enforcing
  `feeRecipients.creator === wallet address` kills legitimate creator≠payer
  setups; FaceUI consent shows it either way. Recommend: NOT enforced,
  displayed + audited.
- **Q3 — manifest schema** (ops-owned): vault needs at least
  `{ chain, factoryAddress, verificationId, commitSha, deployedAt }`.
- **Q4 — `agent:` origins**: firewall covers `automation:*`; future
  agentic-interactive origins (`agent:<id>` driving HITL) stay on the
  escalation path — confirm at kickoff that no agent origin ever gets
  auto-approval for deploys (currently guaranteed by unconditional HITL).

## 6. Sources

`docs/research/launchpad-decision.md` (GO vote + binding conditions 1–5);
`docs/research/launchpad-discussion.md` (memo §2 positions, §3 rulings, §4
T17–T21); merged source @ aeadca9:
`apps/api/src/security/application/evaluate-intent.usecase.ts` (deploy HITL,
origin allowlist), `apps/api/src/order-worker/application/execute-order-slot.usecase.ts`
(AUTOMATION_ORIGIN, swap-only construction),
`packages/shared-types/src/lib/{transactions,trading,token}.ts`.
