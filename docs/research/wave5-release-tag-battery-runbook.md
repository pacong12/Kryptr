# Wave 5 Release-Tag Battery Runbook — executing G2–G5 against the deployed factory

> **Author:** `web3` (Kryptr crew) · **Date:** 2026-08-16 · **Status:** operational runbook;
> operationalizes G2–G5 of `wave5-t21-verification-design.md` (doc #60, merged) at release-tag
> time. G1 full-invariant completion (venue phase: INV-FEE-2/4 + FK-2 + §9.1 rounding) remains
> VaultAPI's domain; the factory-phase G1 subset merged in #76. Rehearsal chain candidate:
> **Base Sepolia**. `[fact]` = sourced; **[inference]** = derived here; **[design]** = proposed
> requirement. Tags `[R#]` resolve in §10; `[F#]`/`[V#]`/`[O#]` in the T21 doc and wave-3/4
> registries.

---

## 1. Purpose and scope **[design]**

Decision gate #1 (`launchpad-decision.md`): the factory + master template MUST pass the full T21
battery at the **same release tag / commit / bytecode hashes** before the factory goes live.
"Live" = an allowlist entry in the ops deploy manifest; without it the launchpad stays dark by
construction (#76 sequencing). This runbook defines, for each of G2–G5: inputs, steps, pass
criteria, and the producing/consuming agent.

**Battery PASS ≠ allowlist entry.** The artifact produced here is the _input_ to vault's gate #3
deploy-HITL decision; entry remains a separate human decision.

**Deploy is an external input.** The factory DEPLOY mechanism is under ruling (keyless policy;
the signer phase does not exist yet). This runbook deliberately does NOT assume any deploy
automation: it consumes `(releaseTag, commitSha, factoryAddress, templateAddress, deployTx,
deployBlock)` as inputs, whatever mechanism produces them.

## 2. Inputs and owners

| Input                                                                                             | Owner     | Blocking?               |
| ------------------------------------------------------------------------------------------------- | --------- | ----------------------- |
| Factory deploy mechanism ruling (keyless policy)                                                  | Main/user | YES — deploy itself     |
| Release tag + commit sha of the exact deployed source                                             | VaultAPI  | YES                     |
| Deployed factory/template addresses + deploy tx + deploy block                                    | VaultAPI  | YES (post-deploy steps) |
| Constructor-param confirmation (`totalFeeBps=175`, `bondAmount`, `bondSink`)                      | VaultAPI  | YES                     |
| Pinned Slither version (0.11.6 per #76 CI pin) + `slither.config.json` + never-triage guard (#78) | OpsCI     | YES (G2)                |
| Fork-test runner with retry/backoff against rehearsal RPC `[F5]` + fork label gates               | OpsCI     | YES (G3)                |
| RFC 8785 canonicalizer, pinned, with test vectors (G5 `contentHash`)                              | OpsCI     | YES (G5)                |
| Artifact commit path + manifest schema-validation job                                             | OpsCI     | YES (G5)                |
| Venue-phase G1 completion timing (INV-FEE-2/4, FK-2, rounding)                                    | VaultAPI  | YES for FULL battery    |
| Testnet faucet ETH for live-exercise scenarios                                                    | OpsCI     | venue phase only        |

## 3. Rehearsal chain **[design + fact]**

**Recommendation: Base Sepolia** — chainId `84532`, public RPC `https://sepolia.base.org`
(rate-limited public endpoint) `[R1]`, Blockscout instance `https://base-sepolia.blockscout.com`
with API base `…/api` `[R2]`, so G4 P-5 (source verification, public re-derivability) is
executable on the rehearsal. Robinhood testnet (chainId 46630 `[R1]`-family) stays deferred until
the vault confirms chain support (memo ruling). Public-RPC pacing lessons from wave 4 apply
(User-Agent, retry/backoff; `updatedAt`-style staleness discipline for any feed reads) `[O21][O22]`.

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

**Block pin (closes T21 §9.4):** `B_pin` = the deploy block (first block where factory code
exists on the rehearsal chain). The release gate runs FK-\* at exactly `B_pin` `[F5]`. Nightly
suites may refresh to newer blocks, but **the artifact is only valid at its recorded block**: a
re-run at any other block = new `contentHash` = new artifact — no silent drift.

Factory-phase scenarios (keyless — fork tests never send real transactions):

| Scenario                                                                   | Status at factory phase                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| FK-1 deterministic deploy, prediction == deployed, 45-byte runtime         | RUN                                                                                   |
| FK-2 end-to-end launch incl. venue economics                               | DEFERRED (venue phase; needs signed testnet txs — keyless question re-surfaces there) |
| FK-3 bond lifecycle on forked ETH (`deal`), sink-only flow                 | RUN                                                                                   |
| FK-4 same-salt revert, template direct calls, garbage calldata, slots zero | RUN                                                                                   |
| FK-5 gas realism incl. OP-stack L1 data cost                               | RUN                                                                                   |
| FK-6 Blockscout source verification                                        | RUN (needs verification submission, §7)                                               |

**Pass:** all non-deferred scenarios green at `B_pin`.

## 6. G4 at the release tag — live proofs, keyless **[design]**

P-1…P-6 run against the rehearsal chain at `B_pin` via read-only RPC (wave-4 method discipline
`[O21][O22]`): clone runtime shape (P-1), EIP-1967 slots zero (P-2), selector audit vs the §7.1
set (P-3), bytecode-hash pinning + op-scan (P-4), Blockscout verification (P-5), factory
impotence (P-6, from P-3 + INV-CLONE-1). Every proof is third-party re-runnable; the pinned block

- recorded hashes make RPC lies detectable offline against the artifact. Cross-check critical
  reads via a second RPC where available (T24 discipline).

**Pass:** all six proofs at `B_pin`; P-5 requires prior source verification (§7 owner).

## 7. G5 at the release tag — artifact assembly **[design]**

CI (producer) assembles `contracts/deployments/{chain}.verification.json` per T21 §8: stable
`id` (`t21:base-sepolia:<releaseTag>` for the rehearsal), `claims` CI-derived from battery
results with the frozen four-string vocabulary, `contentHash` = sha256 of the RFC 8785 canonical
form (field excluded) using the OpsCI-pinned canonicalizer `[F9]`. The artifact is committed
alongside the manifest and schema-validated in CI; `DeployContext.verification.hash` must equal
`contentHash` at consent time.

**Pass:** artifact committed, schema-valid, hash reproducible by an independent re-canonicalization.

## 8. Pass/fail semantics **[design]**

All of G1 (as scoped for the phase), G2, G3, G4, G5 green at the **same tag / commit / `B_pin`**
→ battery PASS → artifact recorded → eligible for the gate #3 allowlist decision. Any single
failure → no artifact, no allowlist entry, factory stays dark; fail-closed throughout.
**Testnet PASS ≠ mainnet PASS:** mainnet requires a fresh run of this runbook (new chain slug
`t21:base:<tag>`, new `B_pin`, own artifact) AND full G1 completion (venue phase).

## 9. Open questions (need rulings/confirmations)

1. **Deploy mechanism** — keyless-policy ruling pending; runbook treats deploy as external input.
2. **Testnet signing for venue-phase live exercises** (FK-2) — the keyless question returns in
   testnet form; needs its own ruling.
3. **Rehearsal chain confirmation** — Base Sepolia recommended (§3).
4. **Fork-block drift policy** — proposed in §5; needs OpsCI sign-off.
5. **Blockscout verification submission owner** for the rehearsal chain (OpsCI or VaultAPI).

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
