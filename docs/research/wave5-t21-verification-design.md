# Wave 5 T21 Verification Suite Design — the pre-live gate for the token factory

> **Author:** `web3` (Kryptr crew) · **Date:** 2026-08-16 · **Status:** design, normative for the
> wave-5 build once accepted; **revised 2026-08-16** per Review54 (artifact `id` + `claims`,
> fee-bps space pin, canonical JSON); **§7.1 forbidden-selector set finalized** with the
> contracts lead. Implements **entry gate #1** of `launchpad-decision.md`
> (Web3Intel and FaceUI): the factory + master template MUST pass this full battery BEFORE the
> factory address goes live on Base mainnet. `[fact]` = sourced; **[inference]** = derived here;
> **[design]** = proposed requirement. External tags `[F#]` resolve in §10; `[V#]`/`[O#]` in the
> wave-3/wave-4 registries.

---

## 1. Purpose

`kryptr-threat-model.md` T21: **per-token clone bugs are unfixable** — the price of Option A
(immutable EIP-1167 clones, no upgrade path in Phase 1). Immutability converts every shipped
bug into a permanent state: there is no patch surface after launch, only "new factory address +
allowlist migration", which `launchpad-decision.md` gate #1 declares deliberately expensive.

Therefore verification moves entirely **left of deployment**. This document defines:

1. **G1** — invariant tests for fee-split math and bond accounting (§4),
2. **G2** — Slither-clean criteria and the triage baseline (§5),
3. **G3** — fork-test scenarios against real Base state (§6),
4. **G4** — on-chain proof that deploys are admin-key-free / non-upgradeable (§7) — this closes
   FaceUI's open ask (`launchpad-discussion.md` §2.2 pt 2: "confirm the deploy is truly
   admin-key-free/non-upgradeable so warning copy matches contract reality"),
5. **G5** — the **verification artifact**: what gets recorded, and what the consent UI may render
   (§8).

**Go/no-go semantics [design]:** all five batteries pass **at the same release tag** (same
commit, same bytecode hashes) or the factory does NOT go live — fail-closed, exactly like the
gate's unknown-price posture (`wave4-contract-freeze.md` §4). Any change to factory or template
after a PASS invalidates the artifact and requires a full re-run.

## 2. System under verification

**[design]** Scope, per `launchpad-discussion.md` §3 rulings:

- **Master template contract** (the token implementation all clones delegate to).
- **Factory contract** (deploys EIP-1167 clones; owns the bond parameter; CREATE2 salts derived
  from token params + version, never random — ops position §2.2 pt 3).
- **The clone relationship itself** (EIP-1167 bytecode shape, storage isolation).

Out of scope: venue/DEX contracts (third-party; integration-tested in G3 but not verified by
this suite), API/UI (covered by gates #3/#4 of the decision doc).

## 3. Why EIP-1167 makes this tractable **[fact + inference]**

- **[fact]** An EIP-1167 clone is a fixed 45-byte runtime program
  `363d3d373d3d3d363d73<20-byte impl>5af43d82803e903d91602b57fd5bf3` that forwards every call
  via `delegatecall` to the implementation address **hard-coded in the clone's own bytecode**;
  the spec's stated rationale: "dependable, locked-down behavior — this is not designed to
  handle upgradability" `[F1]`.
- **[fact]** OpenZeppelin's `Clones` library provides `cloneDeterministic(impl, salt)` and
  `predictDeterministicAddress(impl, salt)`; CREATE2 addressing is
  `keccak256(0xff ++ factory ++ salt ++ keccak256(init_code))[12:]`, and deploying at an
  address that already has code reverts (EIP-684 collision rule) `[F2][F8]`.
- **[inference]** Because the implementation address lives in clone bytecode (not in a mutable
  storage slot), there is **no pointer to flip**: the only "upgrade" is deploying a new factory
  - new template. Verification therefore needs to prove just three things about the live state:
    (a) the clone bytecode is exactly the EIP-1167 shape pointing at the audited template, (b) the
    template and factory contain no control/upgrade surface, and (c) the economic logic (fees,
    bond) is correct under adversarial call sequences — G1–G4 below.
- **[fact]** OZ warns `clone*` does **not** check the implementation has code: a clone pointing
  at a codeless address can appear initialized while remaining hijackable later `[F2]`. G1
  invariant INV-INIT-1 and G3 scenario FK-1 cover this explicitly.

## 4. G1 — Invariant test suite **[design]**

**Tooling [fact]:** Foundry invariant testing runs random call sequences against target
contracts and checks every `invariant_*` function after each call; `afterInvariant()` runs once
per run against the final state; handlers wrap targets to bound inputs and track **ghost
variables** (off-chain mirrors of cumulative state); `targetSelector` restricts the fuzzer to
meaningful calls; `[invariant]` config in `foundry.toml` controls `runs`, `depth`,
`fail_on_revert`, `shrink_run_limit`, and v1.7's `check_interval` for deep campaigns; an
invariant returning `int256` switches Foundry into optimization mode ("maximize this value")
`[F4]`.

### 4.1 Test architecture

- **Handlers [design]:** `FactoryHandler` (deploys with fuzzed — but schema-valid — fee
  schedules, salts, bond payment paths), `TradingHandler` (venue trades through the launched
  pools), `BondHandler` (bond payment/withdrawal attempts incl. adversarial sequences).
- **Actors [design]:** creator, N traders, the four schedule fee recipients, a venue-side
  accrual tracker (separate ghost — §4.2), and an attacker actor with no privileges;
  `useActor`-style pranking per actor `[F4]`.
- **Ghost state [design]:** per-token fee-schedule snapshot at deploy, cumulative fee accrual
  per recipient, bond ledger, per-clone storage fingerprints (for isolation checks).

### 4.2 Fee bps spaces — pinned (Review54 F2) **[design]**

Two distinct bps spaces exist; every invariant and gate validation MUST name which one it
uses, and the relationship is one-directional:

- **Fee RATE space** — the per-launch TOTAL fee charged on trades of the launched token, in
  integer bps of trade amount; parameterized at launch, **immutable after** (memo §3 ruling 5;
  reference default **175 bps = 1.75%**). This is the space the gate validates
  (`wave5-launchpad-vault-design.md` Q1 ruling): `DeployContext.feeBps` mirrors are
  non-negative integers whose **sum equals the launch total fee bps**.
- **Fee DISTRIBUTION space** — how the collected fee splits. Kryptr's schedule covers **four**
  recipients (`creator`, `lp`, `protocol`, `buyback`) as frozen in `DeployContext`; their
  shares are integer bps summing exactly to the RATE total. The **venue** is the fifth economic
  participant but NOT a schedule recipient: its share is set by the venue/pool layer at pool
  creation (factory-era contract parameter), never in `DeployContext` — the gate validates no
  venue bps; G3 FK-2 asserts venue economics end-to-end on the real venue instead.
- **Reference-split caveat [inference]:** the memo's Bankr-derived reference split (creator
  0.665% / LP 0.285% / protocol 0.475% / buyback 0.2375% / venue 0.0875% of 1.75%) contains
  non-integer bps values (e.g. 23.75 bps) and a venue member; it is a historical reference, not
  a valid Kryptr parameterization. The factory-era parameter set MUST re-express the split as
  four integer-bps shares summing to the launch total (open item §9.6).
- **Mirror rule:** integer mirrors vs `TokenFeeSchedule` float shares MUST satisfy the frozen
  check `Math.round(share * 10_000) === bps` (PR #59, merged; deploy.ts freeze). Literal
  float-equality (`bps === share * 10_000`) is **banned** in gates, tests, and docs — rounding
  is part of the check. Where a float share cannot be mirrored exactly in integers, the integer
  mirror is authoritative for the gate and display rounds toward it.

### 4.3 Required invariants

| ID          | Property                                                                                                                                                                                                                                                      | Kills                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| INV-FEE-1   | For every deployed token: the four schedule shares (integer bps, RATE-space) are each ≥ 0, sum exactly to the launch total fee bps (reference 175), and mirror `TokenFeeSchedule` shares per §4.2; malformed schedules revert at deploy (asserted both ways). | T17 (bad schedule at deploy)         |
| INV-FEE-2   | **Conservation:** for every trade, fee collected == Σ accruals to the four schedule recipients, per the chosen rounding/dust policy (open item §9); venue-side accrual is a separate ghost asserted in FK-2, not part of this identity.                       | fee leakage / silent skimming        |
| INV-FEE-3   | Fee schedule and recipients of a deployed token are byte-identical to the deploy-time ghost snapshot after every subsequent call.                                                                                                                             | T17 (post-deploy recipient swap)     |
| INV-FEE-4   | Trade fee == trade amount × launch total fee bps (RATE space; reference 175 bps) within the documented rounding tolerance.                                                                                                                                    | fee-rate drift                       |
| INV-BOND-1  | Each successful deploy increases the bond ledger by exactly the bond amount active at deploy time; failed/reverted deploys change nothing; a salt cannot pay twice.                                                                                           | T18 (bond griefing / double-spend)   |
| INV-BOND-2  | **Solvency + sink control:** factory ETH balance ≥ Σ collected bonds, and no call sequence moves bond funds to any address outside the design's authorized sink set (open item §9).                                                                           | bond theft                           |
| INV-BOND-3  | The bond parameter value never changes during a run (immutable by construction; any change = build defect).                                                                                                                                                   | T20-adjacent control surface         |
| INV-SUP-1   | For every token: Σ balances == totalSupply == launch supply; no hidden mint/burn path exists (cross-checked by G4 selector audit).                                                                                                                            | supply manipulation                  |
| INV-CLONE-1 | Storage isolation: actions on clone A (or on the template directly) never alter clone B's storage fingerprint or the template's own storage.                                                                                                                  | delegatecall storage stomping `[F1]` |
| INV-INIT-1  | Exactly-once initialization: after the factory initializes a clone, any re-initialization attempt reverts; a codeless implementation cannot produce an initialized clone `[F2]`.                                                                              | uninitialized-clone hijack           |

### 4.4 Campaigns **[design]**

- **CI campaign:** `runs ≥ 256`, `depth ≥ 100`, `fail_on_revert = false` (handlers bound
  inputs; unbounded reverts are findings, not noise), shrinking enabled for counterexamples
  `[F4]`. Fixed seed recorded into the G5 artifact for reproducibility.
- **Nightly deep campaign:** `depth ≥ 1000` with `check_interval` tuning, plus time/block-delay
  fuzzing (`max_time_delay`, `max_block_delay`) for any timestamp-sensitive logic `[F4]`.
- **Optimization probes:** maximize `|Σ accruals − fee collected|` and `factory balance − Σ
bonds` to hunt rounding leaks and bond extraction paths `[F4]` **[inference]** — these turn
  "find a violation" into "push the imbalance as high as possible", which surfaces edge dust
  that plain assertions accept.

## 5. G2 — Slither criteria + triage baseline **[design, tooling facts]**

**Tooling [fact]:** Slither runs all detectors by default on a Foundry project (`slither .`),
integrates with CI via the official GitHub action, and emits machine-readable JSON output
(config key `"json"`) `[F6]`. **Triage mode:** `slither --triage-mode` interactively marks
accepted findings; hidden findings persist in `slither.db.json` (config key `triage_database`)
and reappear if the file is deleted `[F7]`. Config lives in `slither.config.json`
(`detectors_to_run`, `exclude_*`, `filter_paths`, `fail_on`, …); inline suppressions
(`// slither-disable-next-line <detector>`) are the per-line alternative `[F7]`.

**Criteria [design]:**

1. **From the first contracts PR** (decision gate #2, ops position memo §2.2 pt 2): pinned
   Slither version runs on every `contracts/` PR; `slither.config.json` + committed
   `slither.db.json` baseline exist from day one — never retrofitted.
2. **Severity policy:** High/Critical findings **block** unless triaged with a written
   justification; Medium requires triage-or-fix; Low/Informational/Optimization are recorded in
   the baseline without blocking. CI fails on any **new, untriaged** finding ≥ Medium (compare
   against `slither.db.json`; `fail_on` semantics available in config `[F7]`).
3. **Never-triage set [design]:** for factory + template these detectors must have **zero**
   findings, triaged or not — any hit is a NO-GO: `suicidal`, `unprotected-upgrade`,
   `arbitrary-send-eth`, `arbitrary-send-erc20`, `arbitrary-send-erc20-permit`,
   `controlled-delegatecall`, `uninitialized-storage`, `reentrancy-eth` `[F6]`.
   **[inference]** this set is chosen to match our three structural promises: no self-destruct,
   no upgrade path, no unauthorized value extraction, no delegatecall/storage hazards — the
   exact ways an "immutable" design secretly stops being immutable.
4. **Suppression hygiene:** inline disables allowed only with an adjacent justification comment
   and reviewer sign-off; counts per detector are recorded in the G5 artifact so the consent
   chain can show how many findings were consciously accepted.
5. **Scope:** `filter_paths` excludes test harnesses and vendored dependencies; the template and
   factory sources themselves are never filtered `[F7]`.

## 6. G3 — Fork test scenarios **[design, tooling facts]**

**Tooling [fact]:** `forge test --fork-url <rpc> --fork-block-number <n>` runs tests against
real chain state; pinning the block makes runs reproducible; `deal()`/`vm.prank` provision
funds and identities; Foundry caches fork data per chain/block; `--fork-retry-backoff` absorbs
RPC rate limits `[F5]`. Per ops ruling (memo §2.2 pt 4): fork tests are **label-gated**
(`fork-tests`) + nightly, not in default CI.

**Scenarios [design] (all on a Base fork, release-tag commit):**

| ID   | Scenario                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FK-1 | **Deterministic deploy:** factory deploys a clone via CREATE2; assert address == `predictDeterministicAddress` `[F2][F8]`; assert clone bytecode == exact EIP-1167 hex with the template address embedded `[F1]`; implementation has code.                                                                                                                    |
| FK-2 | **End-to-end launch:** deploy → pool creation on the real launch venue → first trades → assert the schedule fee lands with all four schedule recipients per the integer bps shares pinned in §4.2 (RATE total 175 bps reference), and venue-side economics accrue at the venue layer per its pool-creation parameter, separate from the schedule `[memo §1]`. |
| FK-3 | **Bond lifecycle:** bond paid at deploy in real (forked) ETH; factory solvency holds; the design's authorized sink receives funds; no other extraction sequence succeeds (mirrors INV-BOND-2 under real gas + call costs).                                                                                                                                    |
| FK-4 | **Adversarial surface:** same-salt redeploy reverts (EIP-684) `[F8]`; direct calls to the template behave as designed; garbage calldata to clone fallbacks; EIP-1967 implementation/beacon/admin slots read zero on factory, template, and a sample clone `[F3]`.                                                                                             |
| FK-5 | **Gas realism:** deploy + init + pool-init gas measured against real Base state (incl. OP-stack L1 data cost) **[inference]**; assert under the agreed cap so HITL cost previews stay honest.                                                                                                                                                                 |
| FK-6 | **Explorer verification:** `forge verify-contract` for factory + template against `base.blockscout.com`; assert verified status via Blockscout API v2 `[V9][V10]`; record verification tx in the artifact.                                                                                                                                                    |

**Cadence [design]:** label-gated on PRs touching `contracts/`; nightly against a fresh pinned
block; the **release gate** re-runs the full suite at the exact tag + block recorded in the G5
artifact.

## 7. G4 — On-chain proof: admin-key-free, non-upgradeable **[design]**

Method discipline: keyless, read-only RPC reads at a **pinned block**, same pattern as the
wave-4 feed verification `[O21][O22]`, against Base public RPC `[V5]`. Every proof is
re-runnable by any third party — that reproducibility is itself part of the trust story `[F5][V9]`.

| Proof | Check                                                                                                                                                                                                                                                                                                                                                          | Establishes                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| P-1   | `eth_getCode(clone)` == exact 45-byte EIP-1167 runtime with the audited template address at bytes 10–29 `[F1]`.                                                                                                                                                                                                                                                | Clone behavior is fixed by construction; no pointer to flip `[F1][F3]`. |
| P-2   | `eth_getStorageAt` on factory, template, and a sample clone for the EIP-1967 implementation (`0x3608…2bbc`), beacon (`0xa3f0…3d50`) and admin (`0xb531…6103`) slots all return zero `[F3]`.                                                                                                                                                                    | No upgradeable-proxy layer anywhere in the call path.                   |
| P-3   | **Selector-surface audit:** enumerate every public/external selector of factory + template from verified source; assert the **forbidden set** is empty — no `upgradeTo*`, no admin/ownership transfer over frozen parameters, no setter touching fee schedule, recipients, or bond parameter post-constructor; record the full selector list for human review. | Nothing exists that could change fees or code after launch (T17/T20).   |
| P-4   | `keccak256(runtime bytecode)` of factory + template at the pinned block == hashes recorded in the artifact; template bytecode op-scan shows no `SELFDESTRUCT` and no `DELEGATECALL` outside the clone's own forwarding `[F1]` (cross-checked by G2's never-triage detectors `[F6]`).                                                                           | Bytecode immutability; no hidden destruct/redirect.                     |
| P-5   | Factory + template verified on Blockscout (FK-6), so P-3/P-4 are re-derivable from public data `[V9]`.                                                                                                                                                                                                                                                         | Public auditability of every claim above.                               |
| P-6   | **Factory impotence:** P-3's enumeration shows the factory exposes no call path writing clone storage; combined with INV-CLONE-1 (fuzz-proven isolation) the factory cannot mutate deployed clones **[inference]**.                                                                                                                                            | Post-deploy clones are beyond anyone's control — ours included.         |

### 7.1 Forbidden-selector set — finalized (with contracts lead, 2026-08-16) **[design]**

Closes §9.3. Applies to BOTH factory and template. **Source of truth = canonical signature
strings**; the 4-byte values are keccak-derived for review — CI/tests derive bytes from the
signatures, so no hex drift. Enforcement is **allowlist-primary**: every selector of both
contracts MUST appear in the reviewed allowlist (§7.1.2); the forbidden set below is
belt-and-braces and the stable vocabulary behind the `admin_key_free`/`non_upgradeable`
claims. Selector-surface test records the full list into `selectorAudit`; any new selector
enters only via a doc revision.

**A — Upgrade/proxy control:** `upgradeTo(address)` `0x3659cfe6` · `upgradeToAndCall(address,bytes)`
`0x4f1ef286` · `upgrade(address)` `0x0900f010` · `changeAdmin(address)` `0x8f283970` · `admin()`
`0xf851a440` · `implementation()` `0x5c60da1b` · `proxiableUUID()` `0x52d1902d`.

**B — Destruction:** `kill()` `0x41c0e1b5` · `destroy()` `0x83197ef0` · `selfdestruct()`
`0x679d38e0` — plus the structural rule: NO function may reach `SELFDESTRUCT` under any name
(Slither `suicidal` never-triage, §5, + P-4 op-scan).

**C — Ownership/authority:** `transferOwnership(address)` `0xf2fde38b` · `renounceOwnership()`
`0x715018a6` · `owner()` `0x8da5cb5b` · `setOwner(address)` `0x13af4035` ·
`setAuthority(address)` `0x7a9e5e4b` · `acceptOwnership()` `0x79ba5097` · `pendingOwner()`
`0xe30c3978` · `grantRole(bytes32,address)` `0x2f2ff15d` · `revokeRole(bytes32,address)`
`0xd547741f` · `renounceRole(bytes32,address)` `0x36568abe` · `setDefaultAdminDelay(uint256)`
`0x72194f46` · `changeDefaultAdminDelay(uint256)` `0x7cb71f3e`. Getters (`owner()`,
`pendingOwner()`) are forbidden too — their presence implies the concept.

**D — Frozen-parameter setters:** anchors `setFee(uint256)` `0x69fe0e2d` · `setFeeBps(uint256)`
`0x72c27b62` · `setTotalFeeBps(uint256)` `0xbf1d14cd` · `setBondAmount(uint256)` `0x28f9f3e6` ·
`setBondSink(address)` `0x00415290` · `setRecipients(address[4])` `0x483e4779` ·
`setSupply(uint256)` `0x3b4c4b25` — plus the family rule: any selector matching
`^(set|update|change)` over fee shares, total fee, recipients, bond parameter/sink, supply, or
token metadata is forbidden (the allowlist rule makes the family airtight).

**E — Flow-control mutators:** `pause()` `0x8456cb59` · `unpause()` `0x3f4ba83a` ·
`setPaused(bool)` `0x16c38b3c` · `blacklist(address)` `0xf9f92be4` · `unBlacklist(address)`
`0x1a895266` · `freeze(address)` `0x8d1fdf2f` · `unfreeze(address)` `0x45c8b1a6` ·
`setMaxTxAmount(uint256)` `0xec28438a` · `setMaxWallet(uint256)` `0x5d0044ca`.

**F — Value extraction:** `withdraw()` `0x3ccfd60b` · `withdraw(address,uint256)` `0xf3fef3a3` ·
`withdrawETH(address)` `0x690d8320` · `rescueTokens(address,address,uint256)` `0xcea9d26f` ·
`sweep(address)` `0x01681a62` · `recoverERC20(address,uint256)` `0x8980f11f` · `claimBond()`
`0xc7cf7484`. Vacuously satisfiable under the constructor-immutable immediate-forwarding bond
sink (factory holds 0 ETH between deploys).

**G — Supply mutators:** `mint(address,uint256)` `0x40c10f19` · `burn(uint256)` `0x42966c68` ·
`burnFrom(address,uint256)` `0x79cc6790` — launch supply is created inside `initialize()`;
assert absence outright (INV-SUP-1 cross-check).

**Structural (non-selector):** no `receive()`/`fallback()` on factory or template; no
`SELFDESTRUCT` opcode; no `DELEGATECALL` outside the clone's EIP-1167 forwarding (P-4);
EIP-1967 slots zero (P-2).

#### 7.1.2 Reviewed allowlist (expected full surface)

- **Factory:** payable entry `deployToken(…)` + views `template()`, `totalFeeBps()`,
  `bondAmount()`, `bondSink()`, `totalBondsCollected()`, `bondsByDeployer(address)`,
  `FACTORY_VERSION()`, `deploySalt(address,(…))`, `predictTokenAddress(address,(…))` (the two
  tuple-signature views pin their exact canonical expansion in the fixture).
- **Template:** ERC-20 standard (`name()`, `symbol()`, `decimals()`, `totalSupply()`,
  `balanceOf(address)`, `transfer(address,uint256)`, `approve(address,uint256)`,
  `allowance(address,address)`, `transferFrom(address,address,uint256)`), exactly-once
  `initialize(…)`, and the eight schedule getters `creatorFeeBps()`, `lpFeeBps()`,
  `protocolFeeBps()`, `buybackFeeBps()`, `creatorRecipient()`, `lpRecipient()`,
  `protocolRecipient()`, `buybackRecipient()` (individual-getter surface approved in #76;
  supersedes the earlier `feeShares()`/`feeRecipients()` sketch).
- **Custom-error selectors** are enumerated and allowlisted in the fixture alongside function
  selectors (errors carry no state-control surface); presence in the PUSH4 scan is NOT required
  — the optimizer may encode reverts without a standalone PUSH4 — error correctness is proven
  at ABI level + exact-selector revert tests (#76 deviation accepted).
- **Compiler-artifact PUSH4s** (panic selector, integer-cleaning masks, optimizer synthesis
  immediates, cross-call targets) may appear in a bytecode PUSH4 scan; they are classified with
  provenance in the fixture and MUST be proven non-dispatchable by the behavioral probe (calling
  them reverts) — the classification alone never carries the safety burden (#76 deviation
  accepted).
- `predictTokenAddress` is the on-chain oracle for consent-address derivation (consent freezes
  all salt inputs incl. nonce); circularity is broken by FK-1, which asserts prediction ==
  actually-deployed address inside the battery.
- Any further addition requires a revision of this doc + consent-vocabulary re-review (§8
  rule 2).

**Residual [inference]:** G4 proves the **absence of control surface**; it cannot prove the
template's economic logic correct — that is G1–G3's job. The consent UI (§8) may state
"no admin, no upgrades, fees frozen" only because P-1…P-5 are mechanical and re-runnable; it
may NOT state "the token logic is bug-free" — the artifact says "passed the verification
battery", nothing more.

## 8. G5 — Verification artifact **[design]**

**Shape:** JSON at `contracts/deployments/{chain}.verification.json`, committed alongside the
ops deploy manifest (memo §2.2 pt 5 — manifest = single source of truth for vault's factory
allowlist, decision gate #3) and schema-validated in CI. The artifact MUST satisfy PR #59's
frozen `VerificationArtifactRef` shape `{ id, hash, claims[] }` so the consent chip can fetch,
hash-compare, and claim-compare it (Review54 F1):

```jsonc
{
  "schemaVersion": 1,
  "id": "t21:base:contracts/v1.0.0", // stable id: t21:<chain>:<releaseTag>; == manifest verificationId
  "chainId": 8453,
  "releaseTag": "contracts/v1.0.0",
  "commitSha": "<git sha>",
  "blockNumber": 12345678, // pinned block for all G4 reads
  "factory": { "address": "0x…", "bytecodeHash": "0x…" },
  "template": {
    "address": "0x…",
    "bytecodeHash": "0x…",
    "blockscoutVerificationTx": "0x…",
  },
  "cloneBytecodeProof": {
    "expectedHex": "363d…bf3",
    "observedHex": "363d…bf3",
    "match": true,
  },
  "slotChecks": {
    "eip1967Implementation": "0x0",
    "eip1967Beacon": "0x0",
    "eip1967Admin": "0x0",
  },
  "selectorAudit": {
    "factorySelectors": ["…"],
    "templateSelectors": ["…"],
    "forbiddenMatches": [],
  },
  "reports": {
    "invariant": {
      "runId": "…",
      "seed": "0x…",
      "runs": 256,
      "depth": 100,
      "passed": true,
    },
    "slither": {
      "version": "…",
      "findingsBySeverity": {},
      "triagedCount": 0,
      "dbHash": "0x…",
    },
    "fork": {
      "blockNumber": 12345678,
      "scenarios": ["FK-1", "…", "FK-6"],
      "passed": true,
    },
  },
  "claims": [
    { "claim": "admin_key_free", "evidence": "G4:P-2,P-3", "verifiedAt": "…" },
    {
      "claim": "non_upgradeable",
      "evidence": "G4:P-1,P-4;G2:never-triage",
      "verifiedAt": "…",
    },
    {
      "claim": "fee_split_invariant",
      "evidence": "G1:INV-FEE-1..4",
      "verifiedAt": "…",
    },
    {
      "claim": "bond_accounting",
      "evidence": "G1:INV-BOND-1..3",
      "verifiedAt": "…",
    },
  ],
  "generatedAt": "…",
  "generatedBy": "ci/verify-release#…",
  "contentHash": "sha256:…", // sha256 of the RFC 8785 (JCS) canonical form, this field excluded [F9]
}
```

**Rules [design]:**

1. One artifact per release tag; the mainnet factory deploy MUST match the artifact's bytecode
   hashes (else the gate re-runs). A changed template/factory = new tag = new artifact = new
   allowlist entry — the deliberately-expensive path (decision gate #1).
2. **Stable id + claims (Review54 F1):** `id` follows `t21:<chain>:<releaseTag>` and MUST equal
   both the manifest entry's `verificationId` and the `DeployContext.verification.id` frozen at
   consent (PR #59 shapes). `claims` are CI-derived from battery results — never hand-written —
   and the vocabulary is frozen at exactly `admin_key_free`, `non_upgradeable`,
   `fee_split_invariant`, `bond_accounting` (aligned with PR #59 `VerificationClaim`); adding a
   claim requires a doc revision. Evidence basis per claim:
   - `admin_key_free` ← G4 P-2 + P-3 (no admin surface; forbidden-selector set empty)
   - `non_upgradeable` ← G4 P-1 + P-4, G2 never-triage set (`unprotected-upgrade`)
   - `fee_split_invariant` ← G1 INV-FEE-1..4 all passed
   - `bond_accounting` ← G1 INV-BOND-1..3 all passed
     INV-SUP-1/INV-CLONE-1/INV-INIT-1 and the full G1–G3 reports remain in `reports` as
     supporting evidence; claim `evidence` pointers may cite them. Chip flow (FaceUI): fetch by
     `id` → sha256(canonical form) == ref.hash → claims ⊇ ref.claims → render; fetch error or
     mismatch → unverified, fail-closed.
3. **Canonicalization (Review54 F3):** `contentHash` = sha256 of the **RFC 8785 (JCS)**
   canonical form of this JSON with the `contentHash` field excluded — lexicographically sorted
   keys, strict number serialization, no whitespace `[F9]`. CI pins ONE canonicalizer
   implementation with test vectors so producer (CI) and consumers (chip, deck, gate) hash
   identically; `DeployContext.verification.hash` MUST equal this `contentHash`.
4. **Consent rendering contract (FaceUI, decision gate #1):** the launch consent screen renders
   only from a frozen claim→copy map keyed by the four claim strings — `admin_key_free` +
   `non_upgradeable` → "No admin, no upgrades"; `fee_split_invariant` → "Fees cannot change
   after launch"; `bond_accounting` + `reports` → "passed N checks at block B". No free-form
   security copy, never "bug-free" (§7); any unrecognized claim renders as unverified. The
   artifact's `contentHash` is displayed on the backoffice launch-detail page (DeckUI Launch
   context card, memo §2.4) so operators can re-verify.
5. **Gate wiring (VaultAPI, decision gate #3):** the deploy-HITL branch approves deploy intents
   only against factory addresses present in the manifest **with a PASS artifact whose `claims`
   are non-empty and vocabulary-compliant** (PR #59 `verification_missing` check); automation
   origins can never produce `kind='deploy'` intents regardless (structural firewall, decision
   gate #3).

## 9. Open items for the implementation wave

1. **Rounding/dust policy** for fee distribution — INV-FEE-2's exact identity depends on it
   (dust stays in pool vs accrues to LP vs burns); decide before the invariant suite is written.
2. **Bond sink semantics** — who may receive bond funds and when (protocol treasury at deploy?
   refundable on some condition?) → fixes INV-BOND-2's authorized-sink set.
3. **Forbidden-selector set** — RESOLVED 2026-08-16: final set recorded in §7.1 (canonical
   signatures as source of truth; CI derives 4-bytes); enforced allowlist-primary by the
   contracts-side selector-surface test.
4. **Fork-block pinning strategy** — release gate pins one block; nightly refreshes it; document
   acceptable drift.
5. **Immutable-args clones** — RESOLVED by design 2026-08-16: the contracts phase adopts
   standard 45-byte EIP-1167 clones (deliberately NOT `cloneWithImmutableArgs`), so P-1's
   expected hex stands unchanged `[F2]`.
6. **Integer split re-parameterization** — the memo's Bankr-derived reference split has
   non-integer bps values and a venue member (§4.2); the factory-era parameter set must choose
   four integer-bps shares summing to the launch total (reference 175) before first launch.

## 10. Source registry

Registry count: 9 external (`F1`–`F9`) plus internal cross-references.

| ID  | Source (URL)                                                                                                                                                                                              | Date / accessed     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| F1  | ERC-1167: Minimal Proxy Contract (clone bytecode spec; "not designed to handle upgradability") — https://eips.ethereum.org/EIPS/eip-1167                                                                  | accessed 2026-08-16 |
| F2  | OpenZeppelin Contracts — proxy API, `Clones` library (cloneDeterministic, predictDeterministicAddress, no-code-check warning, immutable-args variant) — https://docs.openzeppelin.com/contracts/api/proxy | accessed 2026-08-16 |
| F3  | ERC-1967: Proxy Storage Slots (implementation/beacon/admin slots) — https://eips.ethereum.org/EIPS/eip-1967                                                                                               | accessed 2026-08-16 |
| F4  | Foundry Book — Invariant testing (handlers, ghost variables, targetSelector, `[invariant]` config, optimization mode) — https://book.getfoundry.sh/forge/invariant-testing                                | accessed 2026-08-16 |
| F5  | Foundry Book — Fork testing (`--fork-url`, `--fork-block-number`, deal/prank, caching, retry backoff) — https://book.getfoundry.sh/forge/fork-testing                                                     | accessed 2026-08-16 |
| F6  | Slither — README (detector table incl. suicidal/unprotected-upgrade/arbitrary-send-eth/controlled-delegatecall, CI action, JSON output) — https://github.com/crytic/slither                               | accessed 2026-08-16 |
| F7  | Slither — Usage docs (`--triage-mode`, `slither.db.json`, `slither.config.json`, inline suppressions, filter_paths) — https://github.com/crytic/slither/blob/master/docs/src/Usage.md                     | accessed 2026-08-16 |
| F8  | EIP-1014: Skinny CREATE2 (address formula; EIP-684 collision revert) — https://eips.ethereum.org/EIPS/eip-1014                                                                                            | accessed 2026-08-16 |
| F9  | RFC 8785: JSON Canonicalization Scheme (JCS) — sorted keys, strict number serialization, no whitespace — https://www.rfc-editor.org/rfc/rfc8785                                                           | accessed 2026-08-16 |

**Internal cross-references:** `launchpad-discussion.md` §1–§4 (options, crew positions,
rulings, T17–T21); `launchpad-decision.md` (entry gates 1–5); `kryptr-threat-model.md`
(T17–T21, T22–T24); `wave4-contract-freeze.md` §4 (keyless on-chain verification precedent);
PR #59 `wave5-launchpad-vault-design.md` (§2–§3: Q1 integer-bps ruling, `DeployContext.feeBps`
four-recipient mirror, `VerificationArtifactRef`/`VerificationClaim` shapes, deploy-gate
checks incl. `verification_missing`); wave-3 registry `[V5]` (Base public RPC), `[V9]`/`[V10]`
(Blockscout API v2 + limits); wave-4 registry `[O21]`/`[O22]` (read-only on-chain verification
method).
