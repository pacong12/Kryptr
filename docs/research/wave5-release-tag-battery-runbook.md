# Wave 5 Release-Tag Battery Runbook — executing G2–G5 against the deployed factory

> **Author:** `web3` (Kryptr crew) · **Date:** 2026-08-16 · **Status:** operational runbook;
> **revised 2026-08-16** per vault/ops review and the FINAL ruling: deploy deferred to wave 6
> (mechanism settled: CI calldata → human signs from own wallet → post-deploy verification),
> three battery tiers (Tier F keyless = wave-5 closure; Tier D deploy-time = wave 6 opener;
> Tier V launch), DEEP invariant campaign runs ≥2000 depth ≥512 for Tier F, dual rehearsal
> confirmed (Base Sepolia → Robinhood), bondAmount 0.01 ETH frozen. Operationalizes G2–G5 of
> `wave5-t21-verification-design.md` (doc #60, merged) at release-tag time. `[fact]` = sourced;
> **[inference]** = derived here; **[design]** = proposed requirement. Tags `[R#]` resolve in
> §10; `[F#]`/`[V#]`/`[O#]` in the T21 doc and wave-3/4 registries.

---

## 1. Purpose and scope **[design]**

Decision gate #1 (`launchpad-decision.md`): the factory + master template MUST pass the full T21
battery at the **same release tag / commit / bytecode hashes** before the factory goes live.
"Live" = an allowlist entry in the ops deploy manifest; without it the launchpad stays dark by
construction (#76 sequencing). This runbook defines, for each of G2–G5: inputs, steps, pass
criteria, and the producing/consuming agent.

**Battery PASS ≠ allowlist entry.** The artifact produced here is the _input_ to vault's gate #3
deploy-HITL decision; entry remains a separate human decision.

**Three battery tiers [design]** (final ruling 2026-08-16: deploy deferred to wave 6; wave-5
closure = keyless battery PASS at the tag; gate #1 stays safe by construction because the
factory cannot go live before wave 6):

- **Tier F — factory-release battery** (keyless; passable now; **wave-5 closure evidence**):
  factory-phase G1 subset (unit suite + DEEP invariant campaign, **runs ≥2000, depth ≥512** —
  conductor ruling; exceeds the T21 §4.4 CI baseline) + G2 + G3 FK-1/3/4/5 on pinned rehearsal
  fork state
  (`B_fork`, §5) + the Appendix A carve-out assertions C-1…C-7. PASS at release tag
  `contracts-v0.1.0` closes wave 5. No deploy, no signing, no external accounts.
- **Tier D — deploy-time battery** (wave 6; first signing-era operation): real deploy via the
  settled mechanism (CI prepares deterministic calldata → human operator signs from their own
  wallet → post-deploy verification BEFORE the artifact is written), then G4 P-1…P-6 live at
  `B_pin` = the factory deploy block, FK-6 source verification, and G5 artifact + manifest
  entry. Tier D PASS writes the verification artifact consent references.
- **Tier V — launch battery:** Tier D evidence + venue-phase G1 (INV-FEE-2/4 + FK-2 live
  accrual + §9 rounding/dust decision), at a NEW tag if venue work changed template/factory
  (Tier F re-runs on that tag first). Tier V PASS is required before any user-facing launch.
- The consent vocabulary is unchanged: the four frozen claims derive at Tier D; Tier V deepens
  `fee_split_invariant` evidence with INV-FEE-2/4.

**Deploy is an external input, deferred to wave 6.** The deploy mechanism is SETTLED (final
ruling): CI prepares deterministic calldata → a human operator signs from their own wallet →
post-deploy verification precedes any artifact write. No signing code exists in CI today, and
this runbook never assumes it. Tier F needs no deploy at all (fork state only); Tier D consumes
`(releaseTag, commitSha)` plus TWO deploy tuples — template `(address, tx, block)` first,
factory `(address, tx, block)` second.

## 2. Inputs and owners

| Input                                                                                                                                                                                                                                                                                       | Owner                         | Blocking?               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------- |
| Factory deploy — DEFERRED to wave 6; mechanism SETTLED: CI deterministic calldata → human operator signs from own wallet → post-deploy verification before artifact write                                                                                                                   | Main/user + VaultAPI          | YES — Tier D (wave 6)   |
| Release tag + commit sha of the exact deployed source — tag MUST include this runbook + T21 criteria doc (battery scopes against in-tree criteria); proposed `contracts-v0.1.0`                                                                                                             | VaultAPI                      | YES                     |
| Deployed **template** tuple `(address, tx, block)` — deployed FIRST                                                                                                                                                                                                                         | VaultAPI                      | YES (post-deploy steps) |
| Deployed **factory** tuple `(address, tx, block)` — deployed SECOND (constructor takes the live template address)                                                                                                                                                                           | VaultAPI                      | YES (post-deploy steps) |
| Constructor params: `totalFeeBps=175` CERTIFIED (in-tree parity test vs gate constant); `bondAmount=0.01 ETH` FROZEN (final ruling); `bondSink` = user-provided address, delivered at wave 6; confirmation = kit output + on-chain immutable readback transcript recorded into the artifact | VaultAPI                      | YES — Tier D (wave 6)   |
| Pinned Slither version (0.11.6 per #76 CI pin) + `slither.config.json` + never-triage guard (#78)                                                                                                                                                                                           | OpsCI                         | YES (G2)                |
| Fork-test runner with retry/backoff against rehearsal RPC `[F5]` + fork label gates                                                                                                                                                                                                         | OpsCI                         | YES (G3)                |
| RFC 8785 canonicalizer, pinned, with test vectors (G5 `contentHash`)                                                                                                                                                                                                                        | OpsCI                         | YES (G5)                |
| Artifact commit path + manifest schema-validation job                                                                                                                                                                                                                                       | OpsCI                         | YES (G5)                |
| Venue-phase G1 completion timing (INV-FEE-2/4, FK-2, rounding)                                                                                                                                                                                                                              | VaultAPI                      | YES for Tier V          |
| Testnet faucet ETH for live-exercise scenarios                                                                                                                                                                                                                                              | OpsCI                         | venue phase only        |
| Release-tag workflow (tag/dispatch trigger → battery → G5 artifact upload); awaits vault naming battery entry points                                                                                                                                                                        | OpsCI                         | YES (G5 automation)     |
| Blockscout source-verification submission (each rehearsal chain) — prerequisite for G4 P-5; owner open (§9.6)                                                                                                                                                                               | OpsCI or VaultAPI (open §9.6) | YES (G4)                |

## 3. Rehearsal chain **[design + fact]**

**Dual rehearsal, CONFIRMED by final ruling.** Stage 1: **Base Sepolia** — chainId `84532`, public RPC
`https://sepolia.base.org` (rate-limited public endpoint) `[R1]`, Blockscout instance
`https://base-sepolia.blockscout.com` `[R2]`, so G4 P-5 (source verification, public
re-derivability) stays executable and keyless; endorsed by ops. Stage 2: the SAME kit against
**Robinhood Chain** (conductor-named; testnet 46630 / production 4663 pending vault
chain-support confirmation; Robinhood Blockscout per wave-3 `[V12]` — P-5 executability to
confirm). The FK/G4 sections below name `84532` explicitly for env wiring
(`RPC_URL_BASE_SEPOLIA`); chain switches happen only by ruling. Public-RPC pacing lessons from
wave 4 apply (User-Agent, retry/backoff; staleness discipline for any feed reads) `[O21][O22]`.

**Known RPC quirk (Robinhood, Review54 F2):** the official Robinhood testnet RPC rejects
JSON-RPC **batch arrays with HTTP 403**. Current pinned Foundry tolerates this, but if a
future Foundry release starts batching fork-instantiation calls, fork legs against this RPC
will fail-closed with `could not instantiate forked environment` — diagnose as the batch-403
quirk first, NOT as key/config drift (a stale pin shows different symptoms).

## 4. G2 at the release tag — static + selector surface **[design]**

1. Slither at the pinned version runs on the tagged source; the never-triage set must show
   **zero findings, triaged or not**; the mechanical guard on `slither.db.json` (#78) enforces
   the empty baseline `[F6][F7]`.
2. The frozen selector-surface suite (#76 `SelectorSurface.t.sol`, against T21 §7.1 as synced in
   #77) runs at the tag: allowlist-primary exact PUSH4 accounting, behavioral probe, forbidden
   set, clone-has-no-selectors, EIP-1967 slots zero.
3. Report fields for the artifact: `slither.{version, findingsBySeverity, triagedCount: 0,
dbHash}`; `selectorAudit.{factorySelectors, templateSelectors, forbiddenMatches: []}` — the
   full recorded selector lists ARE the P-3 human-review record.

**Pass:** never-triage zero + selector suite green at the tag. Any hit = NO-GO, no artifact.

## 5. G3 at the release tag — fork scenarios, pinned block **[design]**

**Two block pins [design].** Tier F (no deploy yet) forks rehearsal-chain state at `B_fork` —
the pinned Base Sepolia block recorded in the release-tag workflow run; FK-\* deploy their own
instances inside the fork environment `[F5]`. Tier D pins `B_pin` = the **factory deploy
block** (template deploys earlier; both contracts readable at `B_pin`). Nightly suites may
refresh to newer blocks, but **any record is only valid at its recorded block**: a re-run at any
other block = new `contentHash` = new `verificationId` = new release pin — no silent drift. The
manifest pin change IS the release event (consent references `verificationId`).

Factory-phase scenarios (keyless — fork tests never send real transactions):

| Scenario                                                                   | Status at factory phase                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| FK-1 deterministic deploy, prediction == deployed, 45-byte runtime         | RUN                                                                                   |
| FK-2 end-to-end launch incl. venue economics                               | DEFERRED (venue phase; needs signed testnet txs — keyless question re-surfaces there) |
| FK-3 bond lifecycle on forked ETH (`deal`), sink-only flow                 | RUN                                                                                   |
| FK-4 same-salt revert, template direct calls, garbage calldata, slots zero | RUN                                                                                   |
| FK-5 gas realism incl. OP-stack L1 data cost                               | RUN                                                                                   |
| FK-6 Blockscout source verification                                        | DEFERRED to Tier D (needs a real deployed contract + submission — owner open, §9.6)   |

**Pass:** all non-deferred scenarios green at `B_fork`.

## 6. G4 at deploy time — live proofs, keyless (Tier D — wave 6) **[design]**

P-1…P-6 run against BOTH deployed contracts (template, then factory, plus a sample clone) on the
rehearsal chain at `B_pin` via read-only RPC (wave-4 method discipline `[O21][O22]`): clone
runtime shape (P-1), EIP-1967 slots zero (P-2), selector audit vs the §7.1 set (P-3),
bytecode-hash pinning + op-scan (P-4), Blockscout verification (P-5), factory impotence (P-6,
from P-3 + INV-CLONE-1). Every proof is third-party re-runnable; the pinned block + recorded
hashes make RPC lies detectable offline against the artifact. Cross-check critical reads via a
second RPC where available (T24 discipline).

**Pass:** all six proofs at `B_pin`; P-5 requires prior source verification (submission owner
open — §9.6). Tier D = wave 6; until then G4/G5/manifest are carry-over, not wave-5 blockers.

## 7. G5 at deploy time — artifact assembly (Tier D — wave 6) **[design]**

CI (producer) assembles `contracts/deployments/{chain}.verification.json` per T21 §8: stable
`id` (`t21:base-sepolia:<releaseTag>` for the stage-1 rehearsal), `claims` CI-derived from
battery results with the frozen four-string vocabulary, `contentHash` = sha256 of the RFC 8785
canonical form (field excluded) using the in-repo pinned canonicalizer `[F9]`. The artifact is
committed alongside the manifest and schema-validated in CI; `DeployContext.verification.hash`
must equal `contentHash` at consent time.

**Artifact identity hardening [design]:** the artifact carries BOTH deploy tuples
(template first, factory second) and per-contract identity = `(codeHash, deployBlock,
constructorArgsHash)`; it embeds `constructorArgsHash` (factory: template, totalFeeBps,
bondAmount, bondSink; template: none) plus the **immutable-readback transcript** (on-chain reads
of `template()`, `totalFeeBps()`, `bondAmount()`, `bondSink()` with provenance), so
"bytecode matches" can never be satisfied by right-code-wrong-params.

**Pass:** artifact committed, schema-valid, hash reproducible by an independent re-canonicalization.

## 8. Pass/fail semantics **[design]**

**Tier F PASS (wave-5 closure):** factory-phase G1 subset (unit suite + DEEP invariant
campaign — runs ≥2000, depth ≥512) + G2 (Slither + selector surface) + G3 FK-1/3/4/5 +
Appendix A C-1…C-7 all green at the
same tag / commit / `B_fork` → recorded as wave-5 closure evidence; factory source frozen and
eligible to proceed to venue-phase work and the wave-6 deploy. No artifact is written at Tier F
(the artifact is tied to a real deploy tuple).
**Tier D PASS:** deploy via settled mechanism → G4 P-1…P-6 + FK-6 green at `B_pin` →
post-deploy verification → artifact assembled, validated, and committed → manifest entry. This
is the wave-6 opener; consent references the resulting `verificationId`.
**Tier V PASS:** Tier D evidence + INV-FEE-2/4 + FK-2 ghost + rounding decision, on the tag
that ships venue (new tag if template/factory changed; Tier F re-runs on it first) → required
before any user-facing launch. Any single failure at any tier → no artifact for that tier, no
entry, fail-closed throughout. **Testnet PASS ≠ mainnet PASS:** mainnet requires a fresh run of
this runbook (new chain slug, new pins, own artifact).

## 9. Open questions and rulings

1. **Deploy mechanism** — CLOSED (final ruling): keyless by construction — CI prepares
   deterministic calldata, human operator signs from their own wallet, post-deploy verification
   precedes any artifact write. Deploy itself deferred to wave 6.
2. **`bondAmount` + `bondSink`** — CLOSED: `bondAmount = 0.01 ETH` frozen for the deploy;
   `bondSink` = user-provided address, delivered at wave 6 (totalFeeBps=175 certified in-tree).
3. **Testnet signing for venue-phase live exercises** (FK-2) — still open; the keyless question
   returns in testnet form and needs its own ruling.
4. **Rehearsal chain** — CLOSED: dual rehearsal confirmed — Base Sepolia stage 1 → Robinhood
   Chain stage 2; stage-2 RPC (testnet chainId 46630) arrives from user.
5. **Fork-block drift policy** — CLOSED: signed off by ops, endorsed by vault (§5).
6. **Blockscout verification submission owner** — still open; gates Tier D (FK-6/P-5).

## 10. Source registry

Registry count: 2 external (`R1`–`R2`) plus cross-references to the T21 doc (`[F#]`) and
wave-3/4 registries (`[V#]`/`[O#]`).

| ID  | Source (URL)                                                                                                                                                                            | Date / accessed     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| R1  | Base Sepolia — chainId 84532, public RPC `https://sepolia.base.org` (rate-limited) — https://chainlist.org/chain/84532 · https://docs.base.org/base-chain/quickstart/connecting-to-base | accessed 2026-08-16 |
| R2  | Base Sepolia Blockscout — `https://base-sepolia.blockscout.com`, API base `…/api` — https://docs.blockscout.com/devs/apis                                                               | accessed 2026-08-16 |

**Internal cross-references:** `wave5-t21-verification-design.md` (G2–G5 criteria, §7.1
selector set as synced in #77, §8 artifact shape); `wave5-token-factory-design.md` (factory
architecture, merged in #76); `launchpad-decision.md` (gate #1); wave-4 registry `[O21]`/`[O22]`
(keyless verification method); wave-3 registry `[V5]`/`[V9]`/`[V10]`.

## Appendix A — Venue carve-out assertion list (Tier F boundary)

**[design]** Authored by VaultAPI (contracts lead) per #80 rev 2. Tier F must not merely OMIT
INV-FEE-2/4 — it must AFFIRM the carve-out boundary, so the deferral is a reviewed, frozen
statement, never an oversight. Tier V closes the deferred items; the carve-out is deferred, not
waived.

Tier split note (post-ruling): C-1…C-4 loci run in the Tier F battery; where C-5/C-6 cite
G4 P-2 slot accounting and C-7 cites G5 assembly, those portions are recorded at **Tier D**
(wave 6) — the static/assertion halves remain Tier F.

### A.1 What the template is, fee-wise, in the factory era

1. **Fee schedule = frozen data, not behavior.** The template stores exactly eight fee fields
   (four bps shares + four recipients). Nothing consumes them in any factory-era code path
   beyond view getters; no path diverts, accrues, or redistributes any fraction of any transfer.
2. **RATE never exists in template storage.** `initialize()` validates Σ(shares) == rateBps
   against the factory-supplied anchor and discards it. RATE lives solely in the factory's
   constructor-immutable `totalFeeBps` — certified 175, parity-tested against the gate constant
   `LAUNCH_TOTAL_FEE_BPS`.

### A.2 Tier F assertions (each MUST be green in the Tier F battery)

| #   | Assertion                                                                                                                                                                                             | Evidence locus                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| C-1 | INV-FEE-1 validity both ways: Σ==rateBps accepted; Σ≠rateBps, zero recipient, or malformed schedule ⇒ revert (fail-closed)                                                                            | `TokenTemplate.t.sol` init-rejection + `TokenFactory.t.sol` schedule-rejection suites  |
| C-2 | INV-FEE-3 full-schedule immutability: keccak(4 shares ‖ 4 recipients) at deploy == live at arbitrary invariant depth; selector surface proves no mutator exists                                       | `FactoryInvariant.t.sol` schedule-hash ghost + `SelectorSurface.t.sol` exact allowlist |
| C-3 | Fee-free conservation, asserted POSITIVELY: `transfer(x)` / `transferFrom(x)` moves exactly x for all fuzzed values; no balance delta beyond sender −x / recipient +x                                 | `TokenTemplate.t.sol` INV-SUP-1 tests + invariant-campaign `shuffle` action            |
| C-4 | Supply conservation: Σ balances == totalSupply at all depths; mint/burn paths absent (exact selector set contains neither)                                                                            | `FactoryInvariant.t.sol` supply invariant + `SelectorSurface.t.sol`                    |
| C-5 | RATE anchor: `factory.totalFeeBps() == 175` == gate constant; template storage holds no RATE word (exactly eight fee slots, no more)                                                                  | `TokenFactory.t.sol` parity test + G4 P-2 slot accounting                              |
| C-6 | No fee-accrual state exists: zero accumulator slots in template storage (slot accounting), so INV-FEE-2/4 are VACUOUSLY satisfied in the factory era — venue must introduce accrual before fee-taking | G4 P-2 slot assertions + storage-layout accounting                                     |
| C-7 | Boundary recorded in the artifact: G5 metadata carries A.3's deferred list + this appendix's commit sha — as EVIDENCE METADATA, not a new consent claim; the vocabulary stays the four frozen claims  | G5 assembly (§7)                                                                       |

### A.3 Deferred to Tier V (deferred, NOT waived)

| Item                                                                       | Must land with                                |
| -------------------------------------------------------------------------- | --------------------------------------------- |
| INV-FEE-2 fee conservation across venue operations                         | Venue-phase PR, before any release            |
| INV-FEE-4 fee accrual accounting reconciliation + FK-2 venue-accrual ghost | Venue-phase PR                                |
| §9.1 rounding/dust decision                                                | Venue-phase PR, before any user-facing launch |
| Venue live-exercise testnet signing (open question 3)                      | Conductor ruling                              |

**Tier V trigger rule:** if venue work changes template/factory ⇒ NEW factory release tag; Tier F
re-runs on that tag FIRST, then Tier V. Consent vocabulary is unchanged; Tier V deepens
`fee_split_invariant` evidence (runbook §1).

### A.4 Provenance

- Scoping confirmation: Web3Intel criteria sign-off on #76 — carve-out explicit, deferred-not-waived,
  fee-free conservation asserted positively.
- Design sources: `wave5-token-factory-design.md` §2/§9; `wave5-t21-verification-design.md`
  INV-FEE-1..4 + §4.3 ghost wording.
- C-1…C-7 tests exist in-tree as of the factory merge (#76 / `4f96df3`); the Tier F battery
  re-runs them at the release tag, not from branch head.
