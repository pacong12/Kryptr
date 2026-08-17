# Wave 6 S0 Custody Options — keyless signing for deploy (and future operations)

> **Author:** `web3` (Kryptr crew) · **Date:** 2026-08-16 · **Status:** EXPLORATORY —
> research memo, wave-6 preparation (decision memo #74: "S0 custody design — keyless
> signing mechanism"). This document compares options honestly; it is NOT a product
> capability claim and NOT a final recommendation — the user decides at wave-6 kickoff.
> `[fact]` = sourced (registry §9); **[inference]** = derived here; **[design]** =
> proposed requirement. Cross-refs: `wave5-release-tag-battery-runbook.md` (Tier D),
> `wave5-token-factory-design.md` (#76), `wave4-oracle-research.md` `[O21][O22]`.

---

## 1. The frozen constraints (non-negotiable) **[design]**

From the final ruling (2026-08-16) and the merged runbook Tier D definition:

1. **NO private key in env vars, CI, or agent processes** — anywhere. Signing material
   exists only in devices owned by humans.
2. **CI prepares deterministic calldata** — initcode + constructor args for template and
   factory, CREATE2 salt, predicted addresses; everything reproducible from the release
   tag alone `[F2][F3]`.
3. **A human signs from their own wallet** — the signature is the only manual step, and
   it is performed on hardware/software the crew does not operate.
4. **Post-deploy verification BEFORE the artifact is written** — G4 P-1…P-6 readbacks
   (constructor immutables incl. `totalFeeBps`, `bondAmount`, `bondSink`; bytecode
   hashes; slot accounting) must pass at `B_pin` before G5 assembly + manifest entry
   (runbook §6–§7).

Non-goals: unattended signing of any kind; hot wallets held by the crew; any
"custodial" arrangement for users. This memo is about OUR deploy ceremony (and future
crew operations), never about user custody.

## 2. What all options share (the invariant skeleton) **[design]**

Every option below instantiates the same skeleton; they differ only in WHO signs and
through WHAT envelope:

```
CI (automated, keyless):
  1. Render param sheet from release tag (constructor args, salt, predicted addresses,
     fee/bond values in human-readable form)            [design]
  2. Produce signing payloads: raw deployment txs (to = null, data = initcode) for
     template, then factory; chainId, gas hints           [design]
  3. Publish payloads + param sheet + calldata hash into the release record (repo PR)  [design]
HUMAN (the only manual step):
  4. Verify param sheet against the published record, then SIGN from own wallet        [design]
CI (automated, keyless, post-deploy):
  5. Wait for inclusion; capture (address, tx, block) tuples
  6. Run G4 P-1…P-6 readbacks at B_pin; ONLY on full pass → G5 artifact + manifest    [design]
```

**[inference]** A structural safety property worth stating explicitly: ALL fee/bond
parameters are immutable constructor values, and launch (allowlist entry) requires the
Tier D artifact. A wrongly-signed deploy therefore converts to a WASTED DEPLOY (redeploy
at a new deterministic address), never to user funds — the deploy txs themselves carry
no value. This holds only while the Tier D gate stays enforced (runbook §8).

## 3. Option 1 — EOA personal wallet (hardware wallet recommended)

**[fact]** Hardware wallets sign locally; the "clear signing" discipline (human-readable
transaction summary on-device, ERC-7730 metadata) vs "blind signing" (raw hex, a blank
check) is the documented safety axis for contract interactions `[C8]`.

### Flow **[design]**

1. CI renders payload + param sheet (skeleton steps 1–3).
2. Human connects their hardware wallet (Ledger/Trezor class) to a wallet UI of their
   choice (MetaMask-with-hardware or vendor app).
3. Human pastes/loads the deployment tx (template first), cross-checks: destination
   network (Base Sepolia stage 1 / Robinhood stage 2), calldata hash vs published hash,
   value = 0.
4. Signs; CI watches inclusion and runs skeleton steps 5–6. Repeat for factory.

### Failure modes and mitigations

| Failure                                    | Blast radius                                                                                 | Mitigation **[design]**                                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong calldata pasted (truncated/modified) | wrong bytecode/params → wasted deploy                                                        | calldata-hash equality check BEFORE signing (CI prints sha256; human compares) + P-1 bytecode-hash readback after                         |
| Wrong fee params (Σ≠175, wrong recipients) | would break fee schedule forever                                                             | param sheet lists all four shares+recipients; P-3 immutable readback; consent parity test in-tree — wrong value ⇒ no artifact ⇒ no launch |
| Wrong `bondSink`                           | bond flows to wrong sink at FIRST LAUNCH, not at deploy                                      | P-3 readback gates the artifact; launch cannot precede Tier D → caught before any value moves **[inference]**                             |
| Wrong `bondAmount`                         | same class as above                                                                          | P-3 readback; param sheet                                                                                                                 |
| Wrong network (mainnet vs testnet)         | real deploy on wrong chain                                                                   | payload includes chainId in the param sheet; wallet shows network; rehearsal chains are the ONLY chains in the manifest                   |
| Blind-signing a decoded-garbage tx         | signs something unintended                                                                   | require clear-signing-capable display OR calldata-hash check as compensating control; never sign what you cannot hash-compare `[C8]`      |
| Key compromise of the EOA                  | attacker can deploy junk with their own gas; cannot touch users (no custody) **[inference]** | signer EOA holds gas-only funds; rotate = use a different EOA, no state depends on the signer address                                     |

### CI vs manual

- CI automates: everything except the signature — payload rendering, hash publication,
  inclusion watch, readbacks, artifact.
- Manual: signature only (two per chain: template, factory).

## 4. Option 2 — Multisig (Safe) with threshold policy

**[fact]** Safe is natively supported on Base `[C6]`; a Safe enforces M-of-N on-chain
(owners can be EOAs; once the threshold of signatures is collected, any party can
execute) `[C5]`. Same pattern applies on any supported network for Robinhood stage 2
(availability on the Robinhood chain itself is an open question for rehearsal stage 2
— **[inference]** if unsupported there, stage 2 falls back to Option 1).

### Flow **[design]**

1. One-time setup: create M-of-N Safe on Base Sepolia (owners = user's own EOAs, e.g.
   2-of-3 across separate devices). Safe deployment itself is signed via Option 1.
2. CI renders payload + param sheet; proposes the deployment tx to the Safe (propose is
   keyless — a proposal needs no signature until owners sign it).
3. M owners review the decoded transaction (Safe UI decodes calldata + shows params),
   each signs from their own device.
4. After threshold met, anyone (CI can trigger execution keylessly) executes.
5. Skeleton steps 5–6 run as usual.

### Failure modes and mitigations

| Failure                                      | Blast radius                                   | Mitigation **[design]**                                                                                                                                                |
| -------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single-owner device compromise               | below threshold ⇒ no execution **[inference]** | threshold ≥2 across physically separate devices                                                                                                                        |
| Collusion of M owners                        | executes a bad deploy                          | same post-deploy verification gate — artifact still requires readback pass; M-of-N raises the bar for ACTING, the battery remains the bar for SHIPPING **[inference]** |
| Signing undecoded/obfuscated calldata        | signs something unintended                     | Safe UI decoding + param sheet + calldata-hash check; never approve raw hex without hash match                                                                         |
| Wrong Safe / wrong chain                     | deploy from wrong account                      | param sheet includes Safe address + chainId; Safe UI shows both                                                                                                        |
| Safe contract/module risk (third-party code) | extra trusted surface                          | Safe contracts are long-lived, widely audited **[fact]** `[C5][C6]`; keep modules OFF for deploy ops **[design]**                                                      |
| Signer unavailability                        | ceremony stalls                                | M-of-N with N>M absorbs one unavailable owner                                                                                                                          |

### CI vs manual

- CI automates: proposal creation, execution trigger, watch/readbacks/artifact.
- Manual: M signatures per deployment tx.

## 5. Option 3 — Timelock / two-step with escrow period

Two distinct variants — contract-based and process-based:

### 3a. Contract timelock (OZ TimelockController style)

**[fact]** The TimelockController pattern: PROPOSER schedules an operation (Waiting),
after `minDelay` it becomes Ready, EXECUTOR executes; roles are PROPOSER/EXECUTOR/ADMIN
`[C7]`.

- **[inference]** For our one-shot deploy this is a poor fit: deploying THROUGH a
  timelock makes the timelock the deployer (adds a trusted contract we must itself
  deploy and govern — recursion), and our factory has no post-deploy mutable state to
  govern (fee/bond params are constructor-immutable; the only future mutable surface is
  the deploy manifest allowlist, which is vault's gate, not on-chain). Honest read:
  contract timelock buys little here.
- Where it WOULD pay off: future venue-phase or mainnet-era operations that are mutable
  and repeat (if any ever exist). Park it until such an operation is real.

### 3b. Process timelock (escrow period) **[design]** — the cheap version

1. CI publishes payload + param sheet + calldata hash into a release PR; a mandatory
   review window (e.g. 24–48h) starts.
2. During the window: any crew member (Web3Intel verification pass is natural here)
   re-derives calldata from the tag and diffs against the published payload.
3. After the window: signing proceeds via Option 1 or 2.
4. The window and the diff results are recorded into the release record (and can be
   referenced in G5 evidence metadata).

- **[inference]** This is the highest-value-for-effort item in this memo: it costs zero
  contracts, works with every signing option, and converts "trust the payload producer"
  into "two parties derived the same calldata from the same tag". Recommend pairing it
  with whichever signing option the user picks.

### Failure modes (both variants)

| Failure                                | Blast radius       | Mitigation **[design]**                                                                       |
| -------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| Window skipped under deadline pressure | review bypassed    | workflow refuses signing artifacts younger than the window **[design]**                       |
| Diff check rubber-stamped              | bad payload passes | diff is mechanical (re-derive from tag, byte-compare) — no judgment required, only running it |

## 6. Option 4 — EIP-7702 delegation patterns (Base-relevant)

**[fact]** EIP-7702 (Pectra, live on Ethereum mainnet 2025-05-07 `[C1]`) adds a
transaction type that lets an EOA delegate its code to a smart-account implementation
`[C2]`. Base ships dedicated 7702 infrastructure: an ERC-1967-compliant `EIP7702Proxy`
deployed deterministically (CREATE2), plus nonce tracking for replay protection;
delegation can be changed or removed by the EOA owner at any time `[C3][C4]`.

### Possible pattern for our deploy **[design, EXPLORATORY]**

1. Signer EOA signs a 7702 authorization delegating to a "deploy guardian"
   implementation (batch + guard checks).
2. The delegated EOA executes the deployment tx(s) with in-transaction pre-checks (e.g.
   revert unless constructor args match expected constants) — turning part of the
   post-deploy verification into an execution-time guarantee **[design]**.
3. Revoke delegation immediately after the ceremony (delegation is revocable `[C3]`).

### Failure modes

| Failure                               | Blast radius                            | Mitigation **[design]**                                                                                                                                        |
| ------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delegation left active after ceremony | EOA runs third-party code until revoked | mandatory revoke step in the ceremony checklist; post-step verifies code slot cleared **[design]**                                                             |
| Phished delegation signature          | attacker code on the EOA                | 7702 authorizations are a known phishing target **[inference]** — sign authorizations only from the same verified flow that signs the deploy; never standalone |
| Guardian implementation bug           | deploy fails or misfires                | guardian is optional complexity; everything it guarantees is ALREADY re-checked keylessly post-deploy by P-1…P-6 **[inference]**                               |

### Honest assessment **[inference]**

For the ONE-SHOT factory deploy, 7702 adds surface without buying protection the
post-deploy battery doesn't already provide. Its realistic value is LATER: bounded
session-style operations in venue/mainnet eras (batched rehearsal actions with
spend/behavior limits signed once) — revisit if such operations become real. Base's
first-class 7702 support makes it a live option, not science fiction `[C3][C4]`.

## 7. Comparison **[inference + design]**

| Dimension                      | 1. EOA + hardware           | 2. Safe multisig            | 3a. Contract timelock | 3b. Process escrow     | 4. EIP-7702             |
| ------------------------------ | --------------------------- | --------------------------- | --------------------- | ---------------------- | ----------------------- |
| Keys in CI/agents              | none                        | none                        | none                  | none                   | none                    |
| Manual signatures (per chain)  | 2                           | 2×M                         | ≥2 + role mgmt        | 0 (pairs with 1 or 2)  | 2–3 incl. delegation    |
| Extra trusted contracts        | none                        | Safe (audited, long-lived)  | timelock + governance | none                   | proxy/guardian          |
| Wrong-param defense            | post-deploy readback (same) | post-deploy readback (same) | same                  | same + review window   | in-tx guard (redundant) |
| Signer compromise blast radius | gas-only EOA                | below threshold             | role holders          | n/a                    | delegation window       |
| Fit for one-shot deploy        | excellent                   | good (if M owners exist)    | poor (recursion)      | excellent (composable) | poor-to-neutral         |
| Fit for future recurring ops   | weak (no policy)            | strong                      | strong                | medium                 | medium (sessions)       |
| Robinhood stage-2 readiness    | yes (any EOA)               | UNVERIFIED on that chain    | UNVERIFIED            | yes                    | UNVERIFIED              |

## 8. Decision inputs for the user (wave-6 kickoff) **[design]**

1. Signer topology: single user EOA (Option 1) vs M-of-N across devices (Option 2)?
2. Escrow window length for 3b (0 = none; suggested 24–48h)?
3. Rehearsal (Base Sepolia) and mainnet use the SAME option, or rehearsal=1 / mainnet=2?
4. Is 7702 exploration in scope for venue-phase session ops, or parked?
5. Safe availability on Robinhood Chain (stage 2) — vault to confirm; fallback = Option 1.

Whatever is chosen, the skeleton of §2 is unchanged: signing remains the only manual
step, and the battery remains the only path to an artifact.

## 9. Source registry

| ID  | Source (URL)                                                                                                                                                        | Date / accessed     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| C1  | Ethereum Foundation — Pectra mainnet announcement (EIP-7702 live 2025-05-07) — https://blog.ethereum.org/2025/04/23/pectra-mainnet                                  | accessed 2026-08-16 |
| C2  | EIP-7702 — Set EOA account code (specification) — https://eips.ethereum.org/EIPS/eip-7702                                                                           | accessed 2026-08-16 |
| C3  | Base — Securing EIP-7702 upgrades (EIP7702Proxy, ERC-1967, owner-revocable delegation) — https://blog.base.dev/securing-eip-7702-upgrades                           | accessed 2026-08-16 |
| C4  | Base — eip-7702-proxy repo (CREATE2 deployment, NonceTracker; proxy at 0x7702cb554e6bFb442cb743A7dF23154544a7176C) — https://github.com/base/eip-7702-proxy         | accessed 2026-08-16 |
| C5  | Safe — smart account concepts (owners, M-of-N threshold enforced on-chain, anyone executes at threshold) — https://docs.safe.global/advanced/smart-account-concepts | accessed 2026-08-16 |
| C6  | Safe — supported networks (Base natively supported) — https://docs.safe.global/advanced/smart-account-supported-networks                                            | accessed 2026-08-16 |
| C7  | OpenZeppelin — TimelockController (schedule → minDelay → execute; PROPOSER/EXECUTOR/ADMIN) — https://docs.openzeppelin.com/contracts/4.x/api/governance             | accessed 2026-08-16 |
| C8  | Ledger — clear signing overview (clear vs blind signing; ERC-7730) — https://developers.ledger.com/docs/clear-signing/overview                                      | accessed 2026-08-16 |

**Internal cross-references:** `wave5-release-tag-battery-runbook.md` (Tier D skeleton,
settled deploy mechanism); `wave5-token-factory-design.md` (immutable constructor
params); `wave5-t21-verification-design.md` `[F2][F3]` (CREATE2 determinism);
`wave4-oracle-research.md` `[O21][O22]` (keyless read-only verification discipline);
`launchpad-decision.md` (gate #1).
