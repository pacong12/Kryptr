# Wave 6 Tier D Battery Design

> **Author:** `web3` (Web3Intel) · **Wave:** 6. Research only.
> Sources: `wave5-release-tag-battery-runbook.md`, `wave6-s2-signing-ceremony.md`,
> `wave6-s4-venue-design.md`, `wave6-planning.md`, `wave5-t21-verification-design.md`,
> `.github/workflows/battery-tierd.yml`.

---

## 1. What is Tier D?

**Tier D is the deploy-time soak verification gate** — the second of three battery
tiers defined in the Wave 6 release runbook:

| Tier | Name | When | Gate condition |
|---|---|---|---|
| **F** | Factory-release battery | At release tag, no deploy | Keyless; wave-5 closure evidence |
| **D** | Deploy-time battery | After real testnet deploy, before factory goes live | Tier F PASS + real deploy + G4 P-1..P-6 + Blockscout source verification |
| **V** | Launch battery | After venue contracts land | Tier D evidence + INV-FEE-2/4 + FK-2 live accrual |

**Tier D purpose:** confirm that what was deployed on-chain matches the release-tag
source exactly, that the deploy ceremony (S2 signing) executed correctly, that the
contract is admin-key-free and non-upgradeable, and that the factory stays dark
until all checks are green and a human HITL decision records the allowlist entry.

**Factory dark rule:** the launchpad factory cannot accept `launch()` calls until a
Tier D PASS artifact exists and is referenced in the ops deploy manifest. No artifact →
no allowlist entry → factory dark by construction. This is a hard invariant, not a
convention.

---

## 2. Tier D battery checklist (12 items)

Items below map to the G4 P-1..P-6 checks in `wave5-release-tag-battery-runbook.md`
and the S2 ceremony requirements (P1..P7 in `wave6-s2-signing-ceremony.md`).

### Deployment prerequisites (run before battery)

**D-0 — Tier F PASS at release tag.**
Tier F (keyless factory battery: unit suite, DEEP invariant campaign ≥2000/depth≥512,
Slither G2, fork scenarios FK-1/3/4/5, Appendix A carve-out assertions C-1..C-7) must
be GREEN at the same `contracts-vX.Y.Z` tag being deployed. No Tier F PASS → Tier D
cannot start. This is the dependency edge, not a checklist item that runs in the battery job.

---

### Contract deployment verification (P-1..P-6, G4 readback)

**D-1 — P-3: Calldata hash compare (the true gate).**

```solidity
eth_getTransactionByHash(deployTxHash) → tx.input
keccak256(tx.input) MUST EQUAL payload.calldataKeccak
```

What actually hit the chain is hash-compared against the ceremony payload published
before signing. REJECT if mismatch. Severs chain to all subsequent steps —
fail-closed, never retried silently. Source: S2 ceremony §0.1 + §8 step 1.

**D-2 — P-4: Sender pin.**

```solidity
receipt.from MUST EQUAL payload.pinnedSender (checksum-normalized)
```

Ensures the pinned signing EOA broadcast the transaction, not an arbitrary address.
REJECT if mismatch. Source: S2 ceremony §8 step 2.

**D-3 — P-6: Nonce match.**

```solidity
tx.nonce MUST EQUAL payload.expectedNonce
deployedAddress MUST EQUAL receipt.contractAddress
```

Nonce match + CREATE address are both verified. A mismatch means structural error
(competing tx between publish and broadcast). REJECT if either fails. Source: §8 step 3.

**D-4 — Receipt status + contract presence.**

```solidity
receipt.status MUST EQUAL success (0x1)
receipt.contractAddress MUST be non-null
```

Guards against a transaction that was broadcast but reverted on-chain.

**D-5 — P-5: Code identity (Blockscout source verification).**

```solidity
keccak256(eth_getCode(deployedAddr)) MUST EQUAL keccak256(locally-recompiled runtime)
Blockscout API: GET /api?module=contract&action=getsourcecode&address={addr}
  → is_verified === true   (polled with backoff; NOT merely "submitted")
```

Bytecode on-chain must equal bytecode at the release tag. Blockscout source
verification provides public re-derivability (third-party verifiability).
REJECT if hash mismatch or `is_verified !== true`. Source: §8 step 5.

**D-6 — P-2/Immutable readbacks (factory stage only).**

```solidity
factory.template()      MUST EQUAL stage-1 receipt.contractAddress
factory.totalFeeBps()   MUST EQUAL 175   (frozen constant)
factory.bondAmount()    MUST EQUAL 10000000000000000   (0.01 ETH, wei)
factory.bondSink()      MUST EQUAL payload.pinnedSender  (bondSink is the rehearsal address)
```

Immutable constructor args verified from on-chain state. Must equal the decoded values
in the ceremony payload. Template stage: code identity only (no readback surface).
Source: §8 step 6.

---

### Fee split / INV-FEE-2 verification

**D-7 — T21 fee-split invariant, fork at B_pin.**

Run the G1 invariant campaign (Forge fuzz) forked at the factory deploy block (`B_pin`):

```bash
forge test --match-path test/battery-tierd/BatteryTiered.t.sol \
  --fork $RPC_URL --fork-block-number $B_PIN
```

Asserts INV-FEE-2 (conservation: `Σ recipient accruals == floor(amount × 175 / 10_000)`)
and INV-FEE-4 (rate identity) against the deployed contracts at the pin block.
Rounding policy (§4.5 C1): conservation asserted as **exact integer equality, zero tolerance**.
FAIL = battery FAIL, no artifact.

---

### T21 verification / HITL approval

**D-8 — G5 evidence artifact production.**

Battery job writes a structured JSON artifact (RFC 8785 canonical form):

```jsonc
{
  "id": "<uuid>",
  "releaseTag": "<tag>",
  "chainId": <84532|46630>,
  "verdict": "PASS" | "FAIL",
  "claims": [<frozen four-string vocabulary>],   // never extended here
  "evidence": {
    "calldataKeccak": "0x...",
    "deployTxHash": "0x...",
    "deployedAddress": "0x...",
    "blockNumber": <B_pin>,
    "blockscoutVerified": true,
    "totalFeeBps": 175,
    "bondAmount": "10000000000000000",
    "bondSink": "0x...",
    "registryCommitSha": "<sha>",
    "generatedAt": "<iso8601>"
  }
}
```

Artifact committed to repo under `contracts/deployments/artifacts/`. Path referenced
in the ops deploy manifest (gate #3 allowlist source). No artifact → no manifest entry.
Source: runbook §8 + wave6-s4-venue-design.md §4.4.

**D-9 — HITL approval (two-human gate).**

Artifact is the **input** to the HITL decision, not the decision itself.
Two humans (proposer + approver, distinct identities) must:
1. Review the artifact and verify all fields match the ceremony payload.
2. Record explicit `addedBy` + `approvedBy` in the manifest entry.
3. Commit the manifest entry (append-only, never in-place edit).

Automation may not write the manifest entry. This is the `NEVER` row in
`wave6-s4-venue-design.md` §3 permission table. Source: wave6-planning.md G-B.

---

### Security gate / replay protection

**D-10 — Anti-replay: ceremony abort trail.**

Before HITL approval, verify that no aborted ceremony payload was silently overwritten.
Each abort must produce a NEW file (never overwrite). CI checks:

```
contracts/deployments/ceremony/ contains exactly one file per chain+stage
  with status != aborted, OR any abort file has a successor with a different
  ceremonyId and the original is preserved
```

Source: S2 ceremony §3 payload lifecycle rules + §6 step rule.

**D-11 — G3 fork scenario replay at B_clone.**

Run FK-6 source verification and the clone-shape fork scenarios at `B_clone`
(the block of the first clone deploy, distinct from `B_pin`):

```bash
forge test --match-path test/battery-tierd/BatteryTiered.t.sol \
  --fork $RPC_URL --fork-block-number $B_CLONE
```

Verifies: EIP-1167 bytecode shape intact, storage isolation, fee split on a real clone
deploy. Source: runbook §6 FK-6.

**D-12 — Soak clock: post-PASS monitoring window.**

After Tier D PASS artifact is written and HITL approval recorded, factory remains dark
for a **minimum 24-hour soak window** on testnet before the manifest `status` transitions
from `pending` to `active`. During soak:

- Automated probe: one synthetic `launch()` call per hour via keyless fork (no real key).
- Metric: zero unexpected reverts, INV-FEE-2 assertion green on every probe.
- Kill-switch test: one `pause()` + `unpause()` cycle executed and verified mid-soak.
- Monitoring: structured logs for every probe result (`ops` agent scope).

Soak **failure** definition: any INV-FEE-2 violation, any unexpected revert on `launch()`,
any kill-switch failure, or any CI alarm firing during the window.
Soak **success** criteria: 24 hours elapsed with zero failures and kill-switch round-trip
confirmed. Source: wave6-planning.md §3 S5 + G-E + G-G.

---

## 3. CI job: which job, what label/condition gates it

**Job file:** `.github/workflows/battery-tierd.yml`

**Trigger:** `workflow_dispatch` only — **manually dispatched, never on PR push, never on
`main` push.** The job has no `on: push` or `on: pull_request` trigger.

```yaml
on:
  workflow_dispatch:
    inputs:
      chainId:       # 84532 (Base Sepolia) or 46630 (Robinhood testnet)
      rpcUrl:        # live RPC URL for the target chain
      blockscoutBase:
      bPin:          # factory deploy block
      bClone:        # clone deploy block
      cloneTx:       # clone tx hash
      factoryAddr:
      templateAddr:
```

**Why dispatch-only (non-negotiable):**  
Tier D requires a real deploy to have occurred — there is no deployed address on
every PR. Running it on PRs would require real chain state that doesn't exist.
Running it on `main` push would bind a human-signing ceremony to an automated trigger,
violating the S2 ceremony's keyless-CI / human-signs posture.

**Condition that gates it:** the operator dispatches the job ONLY AFTER:
1. S2 ceremony is complete (tx hash recorded, G4 readback not yet run).
2. Tier F PASS artifact exists at the release tag.
3. Both `chainId` dispatch inputs represent chains where the deploy actually occurred.

**Sub-jobs in current wiring:**

| Job | What it runs |
|---|---|
| `forge-fork-tests` | D-1..D-7: forge fork tests at `B_pin` (P-1/P-2 code identity + clone shape) |
| `p5-poller` | D-5 partial: Blockscout `is_verified === true` poller with backoff |
| `aggregate-verdict` | Combines results; writes `PASS`/`FAIL` JSON to `$RUNNER_TEMP` |
| `report` | Uploads evidence artifact, 90-day retention |

**Current wiring gaps (flagged for ops):**

- D-2 (sender pin), D-3 (nonce match), D-6 (immutable readbacks) are not yet
  implemented in `BatteryTiered.t.sol` — the test file does not exist at
  `contracts/test/battery-tierd/` (path referenced in workflow but file absent).
- `aggregate-verdict` writes to `$RUNNER_TEMP` which is not committed to the repo —
  artifact is upload-only, not the committed evidence artifact described in D-8.
  G5 artifact commit step is missing from the workflow.
- The `p5-poller` script (`scripts/battery-tierd/p5-blockscout-poller.ts`) does not
  exist on disk; the step has `|| echo "Battery Tier D ready for wiring"` fallback,
  meaning it silently passes today.
- No soak clock (D-12) is wired; that stage belongs to a separate post-PASS job.

---

## 4. Soak clock

**Duration:** minimum **24 hours** continuous on testnet.

**Start condition:** Tier D PASS artifact written + HITL approval committed.

**Success criteria (all must hold):**

1. Zero INV-FEE-2 violations across all probe executions.
2. Zero unexpected reverts on `launch()` synthetic calls.
3. Kill-switch (`pause()` + `unpause()`) round-trip confirmed at least once during window.
4. No CI alarm or structured-log error alert during the 24-hour window.
5. Soak result written as a timestamped entry in the ops deploy manifest (`soak_passed_at`).

**Failure definition:**

Any single violation of the success criteria above terminates the soak.
Termination action: `status` stays `pending`; HITL notified; new Tier D dispatch
required after root-cause is documented. No auto-retry, no auto-resume.
Source: wave6-planning.md §4 G-E; ORCHESTRA.md security commandments.

---

## 5. Summary for conductor

| Item | Status | Blocker for |
|---|---|---|
| `battery-tierd.yml` exists, dispatch-only | ✅ Wired | — |
| `BatteryTiered.t.sol` forge test file | ❌ Missing | D-1..D-7 |
| `p5-blockscout-poller.ts` script | ❌ Missing | D-5 |
| Sender pin / nonce / immutable readback checks | ❌ Not in workflow | D-2, D-3, D-6 |
| G5 artifact commit step in workflow | ❌ Missing | D-8 |
| Soak clock job / probe automation | ❌ Not designed | D-12 |
| HITL two-human manifest entry process | 📋 Design only | D-9 |
| Tier F PASS at `contracts-v0.1.0` | ⚠️ First attempt failed on CI wiring, not source | D-0 prerequisite |
