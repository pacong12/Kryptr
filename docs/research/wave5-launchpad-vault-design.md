# Wave 5 Launchpad — Vault Research: Automation Firewall, Deploy Gate Branch, DeployContext

> Author: VaultAPI · Status: **research / design sketch — NO code, NO contract
> changes yet** (read-only phase granted by conductor 2026-08-16; build starts
> at official wave-5 kickoff). All four kickoff questions RULED by Main
> 2026-08-16 (§5). Grounding: `launchpad-decision.md` (GO, 5/5),
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

| Origin class         | kind='deploy' outcome                                                              |
| -------------------- | ---------------------------------------------------------------------------------- |
| interactive (`user`) | `needs_human_approval` (wave-3 behavior, unchanged)                                |
| `agent:*`            | `needs_human_approval` — unconditional, PERMANENT, never auto-approved (Q4 ruling) |
| `automation:*`       | hard `rejected: automation_deploy_forbidden` — never escalates, never approvable   |

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
  survives refactors. Caveat (Review54 F3): textual scanning can be evaded by
  non-literal construction (`kind` flowing in from a variable or shared
  const) in future edits — the spec therefore ALSO pins the positive form:
  the extracted builder is the SOLE automation intent construction site. At
  implementation time prefer an AST scan; L1's unconditional runtime
  rejection remains the binding layer regardless — L3 is defense-in-depth.
- **Regression spec**: interactive deploy still escalates to
  `needs_human_approval` (wave-3 behavior preserved).
- **HITL-permanence spec (Q4 ruling)**: deploy intents from EVERY
  non-interactive origin class — `automation:*` AND `agent:*` — never
  produce an `approved` decision: automation is hard-rejected (§L1),
  agents escalate to unconditional HITL. This test is the executable
  statement of the conductor ruling "no `agent:`/automation origin ever
  gets deploy auto-approval — HITL unconditional, permanent".

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
   - fee validation via INTEGER BPS mirrors (Q1 ruling): `feeBps` is the
     SOURCE OF TRUTH for gate arithmetic — per-share bps non-negative, sum
     equals the per-launch total fee bps (parameterized; 175 reference),
     both PURE INTEGER checks. Mirror↔share consistency is
     `Math.round(share * 10_000) === bps` (rounding tolerance pinned by the
     T21 invariant battery) — NEVER literal float equality: Review54 measured
     `bps === share * 10_000` failing for ~11.5% of derived shares, and the
     "last recipient = 1−Σ" remainder pattern fails outright (IEEE754) →
     `fee_schedule_invalid`;
   - recipients: four valid EVM addresses → `fee_recipients_invalid`.
     All pre-sign, all `rejected` (fail-closed), all audited with stable
     reason strings for the DeckUI timeline.
4. **Verification artifact surface** (§3, FaceUI flag): read endpoint
   `GET /launchpad/verification/:id` returning the canonical artifact
   `{ id, hash, claims }` + the `verification_missing` precondition
   (required + non-empty claims for allowlisted factories).
5. **Audit strings**: deploy decisions get DeckUI-consumable reasons
   (`automation_deploy_forbidden`, `factory_not_allowlisted`,
   `deploy_bond_unpaid`, `verification_missing`, existing
   `deploy_requires_human_approval`).

Ordering (decision condition 5): after wave 4 closes → this branch → vault
`DeployContext` prep PR (gate #4, may overlap) → factory/contracts work
(OpsCI/Web3Intel territory) → T21 battery → manifest entry → first launch.
Explicitly OUT of this branch: signer changes, calldata construction,
bond mechanics, fee accrual — all factory-era.

---

## 3. DeployContext sketch (for the vault-owned prep PR, gate #4)

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

/**
 * T21 verification artifact reference — CLIENT-ADDRESSABLE (FaceUI flag):
 * the consent chip may only render what it can fetch + verify, so this is
 * a structure, never an opaque id.
 */
export interface VerificationClaim {
  /** e.g. 'admin_key_free' | 'non_upgradeable' | 'fee_split_invariant' | 'bond_accounting'. */
  claim: string;
  /** Evidence pointer inside the artifact (test id / file / section). */
  evidence?: string;
  /** ISO-8601 when the claim was verified. */
  verifiedAt: string;
}

export interface VerificationArtifactRef {
  /** Stable artifact id, e.g. 't21:factory-base:v1'. */
  id: string;
  /** Content hash (sha256) of the canonical artifact for client integrity checks. */
  hash: string;
  /** The verified claims the consent screen may render. */
  claims: VerificationClaim[];
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
  /**
   * Q1 ruling: integer-bps mirrors are the gate's validation basis
   * (deterministic precision, T21 invariant-testable). Additive — the
   * float shares above stay the display/on-chain shape. feeBps is the
   * SOURCE OF TRUTH for gate arithmetic; share↔bps consistency is checked
   * via Math.round(share*10_000)===bps, never literal float equality
   * (IEEE754: ~11.5% of derived shares break literal equality).
   */
  feeBps: { creator: number; lp: number; protocol: number; buyback: number };
  feeRecipients: FeeRecipients;
  /** Ruling 2: gate validates bond-paid; the bond itself is on-chain. */
  bondPaid: boolean;
  /**
   * T21 artifact (cond. #1 + FaceUI flag): claims frozen at consent —
   * what the user saw is what the decision audited. Optional only until
   * the first factory lands; the gate will REQUIRE it for allowlisted
   * factories (see §2.3 table).
   */
  verification?: VerificationArtifactRef;
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
- **`verification` is embedded, not referenced-only (FaceUI flag)**: consent
  freezes the exact claims presented, so the decision record is auditable
  against what the user saw (T17 parity: what was consented is what was
  verified). The paired read endpoint — `GET /launchpad/verification/:id`
  returning the canonical artifact `{ id, hash, claims }` — lands with the
  deploy-gate branch (§2); chip flow: fetch artifact → compare `hash` and
  `claims` against the intent's ref → render. Nothing opaque, nothing
  trust-me. Claim vocabulary is a frozen string union from the T21 battery
  (Web3Intel owns the list; `admin_key_free` and `non_upgradeable` are the
  decision-condition minimum).
- **Freeze discipline**: land as a contract-first prep PR (no consumers),
  then freeze exactly like the wave-4 orders contract — amendments only,
  amendment log in the PR. Vault owns the prep PR per Main's wave-5
  assignment (gate #4); this section is the proposal that gets frozen.

Gate-side validation table (§2.3 consumes this):

| Check                                                                                        | Failure reason            |
| -------------------------------------------------------------------------------------------- | ------------------------- |
| `deploy.factory === intent.to`                                                               | `factory_mismatch`        |
| factory allowlisted on chain                                                                 | `factory_not_allowlisted` |
| `bondPaid === true`                                                                          | `deploy_bond_unpaid`      |
| name 1–64 chars (trimmed, printable, no control chars); symbol 1–12 [A-Z0-9]                 | `deploy_context_invalid`  |
| totalSupply positive integer string                                                          | `deploy_context_invalid`  |
| feeBps (source of truth) non-negative ints, sum = total bps; Math.round(share\*10_000) = bps | `fee_schedule_invalid`    |
| recipients ×4 valid addresses                                                                | `fee_recipients_invalid`  |
| verification present for allowlisted factory; claims non-empty (FaceUI flag)                 | `verification_missing`    |

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
- **T21 clone bugs**: Web3Intel/OpsCI battery; vault surface = embed the
  verification artifact ref in `DeployContext` (§3, client-addressable per
  FaceUI flag), require it for allowlisted factories, and refuse manifest
  entries without `verificationId` (CI schema, ops-owned).

## 5. Kickoff rulings (Main, 2026-08-16 — post-review of this doc)

- **Q1 — fee representation: integer-bps mirrors ACCEPTED.** Deterministic
  precision, T21 invariant-testable. Implemented as additive `feeBps`
  mirrors on `DeployContext` (§3); float `TokenFeeSchedule` shares stay the
  display/on-chain shape; gate validates mirrors + mirror↔share consistency.
  Review54 refinement (F1): `feeBps` is the source of truth, gate checks are
  pure integer arithmetic, consistency uses `Math.round(share * 10_000) ===
bps` — never literal float equality (IEEE754 trap, ~11.5% failure rate
  measured); remainder-style share derivation is prohibited.
- **Q2 — creator ≠ deploying wallet: display + audit, NO enforcement.**
  Accepted. Enforcement, if ever needed, belongs to bond/wallet policy
  later — not the deploy gate.
- **Q3 — manifest schema ACCEPTED as baseline**:
  `{ chain, factoryAddress, verificationId, commitSha, deployedAt }`.
  OpsCI validates the schema in CI when `contracts/` lands.
- **Q4 — CONFIRMED and permanent**: NO `agent:` or `automation:` origin
  ever receives deploy auto-approval; HITL for deploys is unconditional,
  forever. Must be reflected as an L3 test (§1 layer 3: HITL-permanence
  spec) — done, spec listed.
- **FaceUI flag — T21 artifact client-addressability: ACCEPTED as shape
  decision.** `verificationId?: string` superseded by embedded
  `verification?: VerificationArtifactRef { id, hash, claims[] }` (§3);
  paired read endpoint `GET /launchpad/verification/:id` specified with the
  deploy-gate branch; consent chip renders only what it fetches + verifies.

## 6. Sources

`docs/research/launchpad-decision.md` (GO vote + binding conditions 1–5);
`docs/research/launchpad-discussion.md` (memo §2 positions, §3 rulings, §4
T17–T21); merged source @ aeadca9:
`apps/api/src/security/application/evaluate-intent.usecase.ts` (deploy HITL,
origin allowlist), `apps/api/src/order-worker/application/execute-order-slot.usecase.ts`
(AUTOMATION_ORIGIN, swap-only construction),
`packages/shared-types/src/lib/{transactions,trading,token}.ts`.
