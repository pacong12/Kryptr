# Wave 5 — Token Factory & Template Design (contracts phase)

Status: **DESIGN SKETCH** (VaultAPI, per kickoff mandate; leads contracts work).
Builds on: decision doc (GO conditions 1–5), discussion memo §3 rulings,
T21 verification design (#60), deploy-gate merge (#68, main `be7a629`),
scaffolding (#61, same-PR probe-replacement condition).

Sequencing reminder: this PR builds and PROVES the factory + template. The
factory RELEASE (manifest entry → launchpad live) waits for the full T21
battery to PASS on the release tag (decision gate #1). No manifest entries
until then — the allowlist stays dark by construction.

## 1. Architecture

```
TokenFactory (deployed once per chain)
  ├─ constructor-immutable: template, totalFeeBps, bondAmount, bondSink
  ├─ deployToken(params) payable → CREATE2 EIP-1167 clone → initialize (same tx)
  └─ bond ledger: totals + per-deployer accounting, event log

TokenTemplate (implementation; never used directly)
  ├─ minimal ERC-20 (hand-rolled; no OZ production dependency)
  ├─ frozen launch params: name, symbol, totalSupply
  ├─ frozen fee schedule: 4 × bps + 4 recipients (written exactly once)
  └─ initialize() — exactly-once guard (INV-INIT-1); NO setters, ever
```

- **Standard EIP-1167 clones** (45-byte runtime, template address at bytes
  10–29) — keeps G4 P-1's expected hex exactly as documented (T21 §9.5:
  adopting `cloneWithImmutableArgs` would change P-1; we deliberately do not).
  Args flow through `initialize()` called by the factory in the SAME
  transaction as creation — no uninitialized-clone window, no front-run.
- **Deterministic CREATE2** (ops memo §2.2 pt 3): salt derived from
  `keccak256(abi.encode(deployer, name, symbol, totalSupply, deployNonce,
FACTORY_VERSION))` — never random. Salt collision reverts, which makes
  INV-BOND-1's "a salt cannot pay twice" structural: a consumed salt can
  never deploy (and thus never pay) again. `deployNonce` is a
  consent-frozen deployer-chosen value (deterministic, not random) so a
  deployer can relaunch identical params deliberately; default 0.
- **Hand-rolled EIP-1167 creation** (10 lines of standard assembly) +
  hand-rolled minimal ERC-20: zero production dependencies. forge-std is
  test-only (see §7).

## 2. Fee model (ruling 5 + T21 §4.2 spaces)

- **RATE space**: the launch TOTAL fee is a factory constructor-immutable
  `totalFeeBps` (reference **175** — matches the gate's frozen
  `LAUNCH_TOTAL_FEE_BPS` in #68). Per-launch total flexibility, if ever
  wanted, is a NEW factory release + allowlist migration — the expensive
  path, by design (decision condition 1).
- **DISTRIBUTION space**: four integer-bps shares (creator/lp/protocol/
  buyback) are per-launch params. The factory validates at deploy
  (INV-FEE-1): each share fits uint16, `Σ shares == totalFeeBps`, all four
  recipients non-zero — malformed schedules revert at deploy, both ways
  asserted in tests.
- **Immutability (INV-FEE-3)**: the schedule + recipients are written once
  in `initialize()`; the template exposes NO selector that can change them
  (asserted by a selector-surface test mirroring G4 P-3, plus Slither's
  never-triage set).
- **Collection (INV-FEE-2/INV-FEE-4)**: venue-side accrual is OUT OF SCOPE
  for this PR — the token stores the frozen schedule as the source of truth
  and transfers are fee-free. Fee collection lands with the venue phase
  (FK-2 ghost asserts venue accrual; §9.1 rounding/dust policy must be
  decided before that suite is written — flagged below).

## 3. Bond mechanics (ruling 2 split; T21 INV-BOND-1..3)

Parameter lives on-chain in the factory (gate-side `bondPaid` validation is
already merged in #68):

- `bondAmount` — factory constructor-immutable (INV-BOND-3: never changes;
  any change = build defect, asserted by test).
- `deployToken` is payable and requires `msg.value == bondAmount` EXACTLY —
  each successful deploy increases the bond ledger by exactly the bond
  amount; failed/reverted deploys change nothing (INV-BOND-1).
- **Sink — decision needed (T21 §9.2 open item).** Recommendation:
  **constructor-immutable `bondSink` with immediate forwarding** on each
  deploy. Consequences: the factory holds 0 ETH between deploys ⇒
  INV-BOND-2 solvency is trivially true and the authorized-sink set is
  exactly `{bondSink}` — no withdrawal function, no admin discretion, no
  runtime control surface. Alternatives: (a) lock forever (no sink; dead
  ETH, INV-BOND-2 holds vacuously), (b) conditional refund to payer (adds a
  claim path — permissionless but extra state machine; defer). Awaiting
  Main/user ruling; the rest of the design is sink-agnostic.
- Ledger: `totalBondsCollected` + `bondsByDeployer[deployer]` accounting +
  `TokenDeployed` event (deployer, clone, salt, bond, schedule hash) — the
  audit trail DeckUI's launch feed renders comes from gate intents; the
  on-chain event is the ground truth.

## 4. Admin surface — NONE (T21 G4 provability)

The factory + template expose no: ownership/admin roles, setters over fees/
recipients/bond params, upgrade hooks (`upgradeTo*`, EIP-1967 slots),
selfdestruct, or delegatecall outside the clone's own EIP-1167 forwarding.
G4 proofs P-1..P-6 are then mechanical: 45-byte clone runtime check, zero
EIP-1967 slots, empty forbidden-selector set, pinned bytecode hashes.
A selector-surface unit test records the FULL selector list of both
contracts and asserts the forbidden set empty — P-3 runnable offline from
the first PR.

## 5. Test plan (same PR as probe removal, #61 condition)

Unit (forge test, local, deterministic):

| Area                                                                | Covers                   |
| ------------------------------------------------------------------- | ------------------------ |
| ERC-20 basics (transfer/approve/balanceOf/totalSupply)              | INV-SUP-1 base           |
| initialize exactly-once; second call reverts                        | INV-INIT-1               |
| EIP-1167 runtime: 45 bytes, template at bytes 10–29                 | G4 P-1                   |
| CREATE2 prediction matches deployed address; salt collision reverts | determinism + INV-BOND-1 |
| schedule validation (sum, zero recipients, bounds) both ways        | INV-FEE-1                |
| schedule/recipients immutable after deploy (no selector exists)     | INV-FEE-3 + P-3          |
| bond exactness, revert-leaves-nothing, ledger accounting            | INV-BOND-1               |
| solvency + sink-only value flow                                     | INV-BOND-2               |
| bond param immutability                                             | INV-BOND-3               |
| supply conservation: Σ balances == totalSupply, no mint/burn path   | INV-SUP-1                |
| clone isolation: actions on A never touch B or template             | INV-CLONE-1              |

Invariant (forge `invariant_*`, handler-bound): bond ledger accounting
(INV-BOND-1/2), supply conservation (INV-SUP-1), schedule immutability
ghost (INV-FEE-3), exactly-once init (INV-INIT-1). Campaign params per T21
§4.4 (runs ≥ 256, depth ≥ 100, fail_on_revert=false). INV-FEE-2/4
invariants wait for the venue phase (they assert venue accrual).

Slither: clean against the never-triage set (zero findings, triaged or
not) + zero high outside it (SLITHER_TRIAGE.md baseline).

## 6. Gate wiring (already merged — no changes)

#68's gate validates the consent-frozen DeployContext; the factory makes the
on-chain side match: `factory === intent.to` is the factory address,
`bondPaid` mirrors `msg.value == bondAmount` (the signing flow sends the
bond with the deploy tx), schedule validation mirrors INV-FEE-1 byte-for-
byte (integer bps, sum == 175, four recipients). Parity tests assert the
gate's fixtures are ACCEPTED by the factory's validation and the factory's
reject reasons map to the gate's reject codes.

## 7. Dependencies / coordination

- **forge-std** (test-only): needed for assert/Test harness. OpsCI: how do
  we vendor it — git submodule at `contracts/lib/forge-std` + `.gitmodules`
  vs CI-side install? foundry.toml already has `libs = ["lib"]`.
- **No production deps** (hand-rolled ERC-20 + EIP-1167) — consistent with
  "no new deps without approval".
- Web3Intel: review §5 mapping against doc #60 criteria; finalize the
  forbidden-selector set (T21 §9.3) before the selector-surface test is
  frozen.
- OpsCI: slither.db.json committed from this PR (G2 criterion 1); fork-test
  block-pinning strategy (T21 §9.4) can wait for the venue/fork phase.

## 8. Open questions (need rulings before/during build)

1. **Bond sink** (T21 §9.2): recommend constructor-immutable immediate
   forwarding (§3). Alternatives listed. RULE NEEDED.
2. **Rate total**: factory-frozen 175 (recommended, §2) vs per-launch total
   param. Gate constant currently assumes frozen 175 — changing this later
   also moves the gate constant, so freeze it now either way. RULE NEEDED.
3. **deployNonce** in the salt (§1): recommended yes (consent-frozen,
   deterministic relaunch). Objections?
4. **Token transfer semantics**: fee-free transfers, schedule stored but
   collected at venue (recommended, §2) — Web3Intel to confirm this still
   satisfies INV-FEE-3/4 scoping for this PR.

## 9. Rulings + build outcomes (recorded post-build)

**Conductor rulings (Main, §8 closed):**

1. **Bond sink** — constructor-immutable `bondSink` + immediate forwarding
   ACCEPTED. Mandatory note: `bondSink` is a factory deploy param → recorded
   in the deploy manifest (schema + validator landed via OpsCI PR #73) and in
   the G5 verification artifact; changing the sink = new factory release =
   full T21 re-verification. Lock-forever rejected (economically wasteful);
   refund-to-payer rejected (state machine + reentrancy surface not worth it).
2. **Rate total** — factory-frozen 175 ACCEPTED. RATE frozen in the factory;
   DISTRIBUTION (four recipients, integer bps, Σ==175) stays per-launch —
   exactly the two bps spaces of doc #60 §4.2. Changing RATE = new factory
   release with full T21 re-verification. The factory constant is parity-
   asserted against the gate's `LAUNCH_TOTAL_FEE_BPS` (single numeric source
   of truth).
3. **deployNonce** — accepted (salt includes deployer; consent freezes ALL
   salt inputs incl. nonce; gate/UI re-derives the exact deterministic
   address via `predictTokenAddress`).
4. **Venue carve-out (Web3Intel)** — INV-FEE-2/4 deferral CONFIRMED with
   conditions: carve-out explicit in the PR; deferred NOT waived (the
   venue-phase PR must add INV-FEE-2/4 + FK-2 venue-accrual ghost + the §9.1
   rounding/dust decision BEFORE any factory release goes live); the fee
   properties violable now stay covered (INV-FEE-1 validity, INV-FEE-3
   immutability ghost + selector test, and fee-free conservation asserted
   explicitly — `transfer(x)` moves exactly x).

**Implementation refinements adopted during build:**

- **RATE anchor split (Web3Intel):** the template stores ONLY the four
  DISTRIBUTION shares + four recipients. RATE is validated in `initialize()`
  against the factory-supplied anchor but never stored — the RATE anchor
  lives solely in the factory's constructor-immutable `totalFeeBps`.
- **Exactly-once init** is constructor-guarded: the template's own
  constructor marks the implementation initialized (so the template's storage
  can never be initialized); clones copy only runtime bytecode, start fresh,
  initialize exactly once (INV-INIT-1).
- **Forbidden-selector set (T21 §9.3, finalized in Web3Intel PR #72 §7.1):**
  fixture stores SIGNATURE STRINGS, tests derive 4-bytes via keccak (no
  hardcoded hex for the reviewed vocabulary). Enforcement is allowlist-primary
  (exact accounting of every PUSH4 in deployed bytecode) plus a behavioral
  probe proving no non-function PUSH4 answers a call.

**Empirical Slither result (slither-analyzer 0.11.6, matching CI pin):**
zero findings across all eight never-triage detectors — including
`arbitrary-send-eth` on the constructor-immutable sink forwarding and
`unprotected-upgrade` on the constructor-guarded initializer. The
`slither.db.json` baseline is committed EMPTY (`[]`): nothing triaged, so the
never-triage set has zero entries by construction. Remaining findings are
low/informational only (`reentrancy-events`, `assembly`, `low-level-calls`,
`too-many-digits`) and do not block `--fail-medium`.

**Test outcomes:** 52 tests green (unit 48 + invariant 4 campaigns at 256
runs × 128 depth). Probe removed in this PR per the #61 condition; the
contracts forge gates (forge-build/forge-test/fmt/slither/manifests) exercise
the real sources.
