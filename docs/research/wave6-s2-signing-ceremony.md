# Wave 6 S2 — signing ceremony proposal **[design]**

> Status: **PROPOSAL — S3 execution is BLOCKED until this design is
> approved by the user** (Main ruling, wave-6 opening). Authors: OpsCI
> (CI machinery) + Web3Intel (operator-side security criteria, folded in
> below). Builds on: deploy kit #85 (simulate-only, offline, zero
> signing code), custody option 1 from memo #90 (EOA manual signing),
> Review54's seven pre-answered requirements.

## 0. Frozen constraints (inherited, unchanged)

- NO private key in any env/CI/agent — ever. Keyless by construction:
  the kit contains no signing code and no `vm.broadcast`.
- Deterministic calldata from the release tag (pinned solc 0.8.24,
  pinned Foundry v1.7.1 — calldata is a pure function of tag + inputs).
  Determinism is a tested fact since #85.
- Signing is the ONLY manual step (human, own device, own wallet).
- G4 readback + Tier D battery are the ONLY path to an artifact.
- Factory stays DARK until Tier D PASS.
- Rehearsal signer + bondSink: `0x00e7bE21b70DD57bA2AAC3C32657304dDA6863C2`
  (checksum-verified, funded 0.01 ETH on Base Sepolia + 0.01 ETH on
  Robinhood 46630 — balances checked on-chain). **This address is PUBLIC
  data (display/pinning), not a secret.**
- Robinhood RPC: `https://rpc.testnet.chain.robinhood.com` (chainId
  46630 verified live); Base Sepolia: `https://sepolia.base.org` (84532).

## 0.1. Core security posture (Web3Intel)

**The true enforcement point is the POST-BROADCAST comparison (P3), not
the pre-sign checks.** Every pre-sign mitigation (hash publication,
decode rendering, verifier tooling) reduces operator error and raises
the cost of an attack; but whatever actually hits the chain is
re-fetched and hash-compared against the published value before any
artifact is even considered. Blast radius of any pre-sign swap that
survives to broadcast is bounded: `value=0`, factory stays dark, worst
case = wasted gas + redeploy. Pre-sign checks are UX + deterrence; P3 is
the gate.

## 1. Review54 requirements — explicit per-point responses

| #   | Requirement                                                                                     | Response — mechanism and enforcement point                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | CI publishes `keccak256(calldata)` via official channel BEFORE signing; human cross-checks wallet preview (to, value=0, calldata hash) against it | Ceremony payload committed to the repo (`contracts/deployments/ceremony/{chain}-{tag}-{stage}.ceremony.json`) BEFORE any signing can happen; carries `calldataKeccak` over the raw bytes plus `to: null`, `value: "0x0"`. ONE hash, ONE enforcement compare (chain-native keccak256, matches the `tx.input` comparison exactly) — deliberately no secondary hash envelope: one source of truth, one compare. Operator re-hashes offline (bundled verifier, §6). Payload integrity is enforced by REVIEW, not a second hash: reviewer re-runs the kit locally at the tag and byte-diffs against the committed payload (mandatory review checklist item, §6). |
| P2  | Kit renders human-readable decode of the EXACT calldata (constructor args, BOND_SINK, fee/bond echo) — not a separate summary | Decode is produced inside the kit by `abi.decode`-ing the kit's OWN emitted creation bytes (round-trip). The rendered values are, by construction, decoded from the bytes being sent — drift between summary and calldata is impossible. Additionally the kit/renderer ASSERTS fail-closed that decoded constructor args equal the frozen constants (`totalFeeBps == 175`, `bondAmount == 0.01 ETH`, `bondSink == 0x00e7bE…63C2`) — not merely displays them. |
| P3  | Post-broadcast: CI re-fetches `tx.input` FROM CHAIN and hash-compares with the published hash before any artifact consideration | G4 readback job (§8) step 1: `eth_getTransactionByHash` → `keccak256(tx.input) == published calldataKeccak`, else REJECT. Runs before every other check. A REJECT also severs the chain to the Tier D battery (fail-closed wiring) and is RECORDED in the release record — never a silent retry (§0.1: this compare is the true gate). |
| P4  | Sender pin fail-closed: broadcaster ≠ pinned address → REJECT                                   | G4 step 2: `receipt.from == 0x00e7bE21b70DD57bA2AAC3C32657304dDA6863C2` (checksum-normalized compare), else REJECT (+ Tier D sever + recorded, as P3). Address pinned as a public constant in the ceremony payload and the readback config. |
| P5  | No re-render/re-encode/edit of calldata between hash publication and wallet submit without re-hash | Single-source-of-truth rule: ONE kit run at the tag → ONE committed payload file. The operator copies the `data` field **only from the committed payload file in the repo** — never from IRC/chat or artifact copies. No intermediate tool re-encodes the bytes. Any edit to the file invalidates the published hash and is caught by the review byte-diff (P1) and/or P3. Re-issue after an abort = a NEW file (no overwrite), so abort trails stay auditable. |
| P6  | Nonce: stale calldata post-competitive-tx must be detected                                       | Two layers + abort rule: (a) payload records `expectedNonce` = keyless `eth_getTransactionCount(pinned sender)` at publish time; G4 checks `tx.nonce == expectedNonce`, else REJECT; (b) operator-side ABORT rule: if the wallet's nonce at submit time ≠ `expectedNonce` → STOP the ceremony; the signer EOA must not be used for any other transaction for the whole ceremony. (c) Deployed address is NEVER used from prediction alone: plain CREATE makes the address nonce-dependent (NOT CREATE2-predictable); the nonce-based prediction is marked ADVISORY, receipt = truth, G4 readback = evidence. Template-address drift self-heals: the factory stage takes the template address from the stage-1 RECEIPT, never from a prediction. |
| P7  | Claim discipline: testnet PASS ≠ mainnet PASS explicit in all S3 outputs                         | Every S3 log line, job summary, and artifact claim is stamped `TESTNET` and keyed by chainId (frozen four-string vocabulary per chain). No aggregate "PASS" exists without a chain qualifier. G5 evidence metadata MUST carry chainId so the consent UI can never be cross-chain. Mainnet gate re-evaluates near S6 under a separate consent. |

## 2. Ceremony sequence (two stages, per kit ordering)

Template MUST land before factory (factory constructor requires the
live template address):

```
stage=template                              stage=factory
──────────────                              ──────────────
1. CI @ tag: kit → payload tx1              1. operator/reviewer RE-DERIVES the
   (+ keccak, decode, expectedNonce)           factory payload LOCALLY from the kit
2. commit payload (official channel)           at the tag + the stage-1 template
3. operator: verify offline                    address from the RECEIPT (never
4. operator: sign+broadcast via own            trusted from a mid-ceremony commit)
   wallet (sole manual step)                2. same verify/sign/broadcast flow
5. operator: reports tx hash                3. operator: reports tx hash
6. CI G4 readback → stage PASS/REJECT       4. CI G4 readback → stage PASS/REJECT
7. payload factory committed AFTER tx2 as   5. factory payload committed AFTER tx2
   the audited record                          as the audited record
```

Both chains (Base Sepolia first, then Robinhood 46630) run the same
sequence independently; claims stay per-chain (P7).

## 3. Ceremony payload format (committed, official channel)

`contracts/deployments/ceremony/base-sepolia-contracts-v0.2.0-template.ceremony.json`:

```jsonc
{
  "ceremonyId": "s2:base-sepolia:<releaseTag>:template",
  "claim": "TESTNET",                    // P7 — never omitted
  "releaseTag": "<tag>",                 // tag↔payload drift guard
  "chain": { "chainId": 84532, "name": "base-sepolia",
             "rpc": "https://sepolia.base.org" },
  "pinnedSender": "0x00e7bE21b70DD57bA2AAC3C32657304dDA6863C2", // P4, public
  "expectedNonce": "0x12",               // P6 — staleness check + abort rule
  "predictedAddress": {                  // P6 — ADVISORY only (plain CREATE)
    "address": "0x...", "basis": "rlp(sender, expectedNonce)",
    "advisory": true
  },
  "tx": {                                // verbatim kit output (P5 source)
    "kind": "template-deploy",
    "to": null, "value": "0x0",
    "data": "0x..."
  },
  "calldataKeccak": "0x...",             // P1 — keccak256(tx.data), the ONLY hash
  "decoded": {                           // P2 — kit round-trip decode + asserts
    "kind": "template-deploy",
    "bytecodeSha256": "0x...",
    "constructorArgs": []
  },
  // factory stage adds:
  // "decoded.constructorArgs": { "template": "0x...(from stage-1 RECEIPT)",
  //   "totalFeeBps": 175, "bondAmountWei": "10000000000000000",
  //   "bondSink": "0x00e7bE21b70DD57bA2AAC3C32657304dDA6863C2" }
  "provenance": {
    "releaseTag": "<tag>", "commitSha": "<tag sha>",
    "foundry": "v1.7.1", "solc": "0.8.24",
    "generatedAt": "<iso8601>"
  }
}
```

Payload lifecycle rules (Web3Intel):

- One file per chain per stage under `contracts/deployments/ceremony/`.
- Template payload: committed BEFORE signing (official channel, P1).
- Factory payload: re-derived locally from kit + receipt address
  (stage factory can't be committed pre-tx1 — it needs the live template
  address); committed AFTER tx2 as the audited record.
- Re-issue after an abort = a NEW file (never overwrite) so every abort
  is auditable.
- G5 evidence metadata points at the payload path → full lineage
  `tag → payload → tx → readback → artifact`.

## 4. Kit changes (P2 mechanism)

Additions to the kit — ACCEPTED by VaultAPI (kit-side emitters only; no
new inputs, no broadcast, no chain reads):

1. **Round-trip decode**: after building the creation bytes, the kit
   `abi.decode`s the constructor-args segment back and emits it as
   `decoded.constructorArgs`. For the template stage (no args) it emits
   `bytecodeSha256` of the creation code. Rendering from decoded-own-
   bytes makes "summary drift" impossible — the human-readable block is
   literally the bytes that will be sent, parsed back.
2. **Fail-closed asserts**: the decoded args are ASSERTED against the
   frozen constants (`totalFeeBps == 175`, `bondAmount == 0.01 ETH`,
   `bondSink == pinned sink`) — display alone is not enough (Web3Intel
   criterion c.2).
3. **keccak emission**: the kit prints/emits `keccak256(data)` into the
   payload (computed over the same in-memory bytes it writes).
4. **Stage + constants echo** (VaultAPI): the kit also emits which
   STAGE produced the bytes and echoes the frozen constants back
   (`totalFeeBps=175`, `bondAmount`, `bondSink` for the factory stage)
   so the human signer can match constants → payload → decoded args on
   one screen without re-deriving anything.
5. Kit stays offline, broadcast-free, key-free. No new chain reads:
   `expectedNonce`/`predictedAddress` are added by the CI ceremony job
   (keyless RPC read), not by the kit.

## 5. CI ceremony job (per tag, per stage, per chain)

Dispatch-only (same philosophy as release-tag.yml):

```
inputs: tag, chain (base-sepolia|robinhood-testnet), stage (template|factory),
        [factory only] template_address (from stage-1 receipt)
steps:
  checkout @ tag (submodules) → node + foundry pins → kit run (stage)
  → keyless reads: eth_getTransactionCount(pinnedSender) → expectedNonce;
    rlp prediction → predictedAddress (advisory)
  → assemble payload (kit bytes + keccak + nonce + provenance)
  → commit payload (dedicated commit, message carries ceremonyId)
  → upload artifact
```

Fail-closed throughout: any kit require()/assert failure (e.g. BOND_SINK
unset, decoded args ≠ frozen constants) aborts payload publication.
Payload-file integrity is enforced at REVIEW (mandatory byte-diff, §6),
not by a second hash (one-hash ruling, P1).

## 6. Operator signing flow (blind-signing mitigation)

**Trust surface note (Web3Intel):** MetaMask cannot paste raw initcode
from its own UI for a contract deployment — the operator needs an
intermediary that calls `eth_sendTransaction {to: undefined, data}`.
That intermediary is a NEW trust surface and must be: committed in the
repo at the tag, zero-dependency, make NO network calls, and display
`keccak256` of the EXACT transaction object being sent for pre-sign
comparison. A malicious page could lie on both sides — which is why P3
(post-broadcast chain compare) remains the backstop (§0.1).

Flow:

1. Pull the committed ceremony payload from the repo (official channel).
2. Run the bundled offline verifier (`contracts/tools/ceremony-verify.mjs`,
   zero-dep, ships in-repo, reviewed at the tag): re-derives
   `calldataKeccak` from `tx.data`, re-asserts decoded args against the
   frozen constants, prints `to`/`value`/decoded args for human
   comparison. Exit non-zero on ANY mismatch.
3. Reviewer checklist item (MANDATORY, not optional): re-run the kit
   locally at the tag and byte-diff its output against the committed
   payload — closes the payload-file-swap vector (same trust model as
   swapping source in the tag itself).
4. In the signing intermediary (own device, own RPC): load `tx.data`
   VERBATIM from the committed payload file only (never from IRC/chat/
   artifact copies, P5) → preview must show contract creation, `value`
   0 → compare the intermediary's displayed keccak against published
   `calldataKeccak` → confirm.
5. **Abort rule (P6):** if the wallet's nonce at submit time ≠
   `expectedNonce` → STOP. The signer EOA is reserved exclusively for
   the ceremony — no other transactions on it until both stages land.
6. **Wrong-chain discipline (the one vector P3 does NOT close:**
   signing on a different chainId lives in a separate namespace and
   hash-compares can't see it**):** network badge check in the
   intermediary, chainId displayed next to every claim (P7), and the
   operator visually confirms the wallet network before confirm.
7. Record the resulting tx hash.

Residual-risk summary: a swapped committed payload is caught by the
review byte-diff (P1) and/or P3; a clipboard/intermediary swap is
caught by P3 (blast radius: wasted gas + redeploy, value=0, factory
stays dark); wrong-chain signing is closed by discipline + per-chainId
claims only. The kit's determinism (tested since #85) is what makes the
byte-diff a sound check.

## 7. Broadcast path

The signing intermediary (wallet connector) signs AND broadcasts
directly (wallet → operator's RPC). CI never touches a signed or raw
transaction — there is no broadcast code anywhere in the repo. The
operator then reports the tx hash back (next dispatch input).
Alternative manual broadcast tooling is out of scope.

## 8. G4 readback automation (keyless, fail-closed, per stage)

Dispatch-only job `g4-readback`, inputs: `tag`, `chain`, `stage`,
`deploy_tx_hash`. Ordered checks (any failure = REJECT, no artifact):

1. **P3**: `eth_getTransactionByHash` → `keccak256(tx.input) ==
   payload.calldataKeccak`. (What actually hit the chain IS what was
   published — the true gate, §0.1.)
2. **P4**: `receipt.from == payload.pinnedSender` (checksum-normalized).
3. **P6**: `tx.nonce == payload.expectedNonce`. Deployed address vs
   `predictedAddress`: with nonce matched, a mismatch means something
   is structurally wrong → REJECT.
4. Receipt status == success; `contractAddress` present.
5. **Code identity**: `keccak256(eth_getCode(addr))` vs hash of the
   locally-compiled creation-code runtime segment (recompiled at the
   tag in-job) — bytecode-on-chain == bytecode-at-tag.
6. **Immutable readbacks** (factory stage): `template()`,
   `totalFeeBps()`, `bondAmount()`, `bondSink()` — must equal the
   payload's decoded values (175 / 0.01 ETH / pinned sink / stage-1
   RECEIPT address). Template stage: no readback surface (readback =
   code identity only).
7. **Transcript**: every read recorded with provenance (RPC URL, block
   number, tx hash, timestamp) → written into the Tier D verification
   artifact claims (frozen vocabulary, per-chain, P7 stamp; G5 evidence
   metadata carries chainId + payload path for full lineage).

REJECT semantics: any failed check **severs the chain to the Tier D
battery** (fail-closed wiring — no battery, no artifact) and the
rejection is RECORDED in the release record. No silent retries: a new
attempt = a new ceremony dispatch, explicitly.

Only after 1–7: stage marked `TESTNET PASS` for that chain. Tier D
battery at the deployed instance is the separate next gate (runbook
§6 (G4)) — readback PASS ≠ Tier D PASS ≠ artifact.

## 9. Sequencing and dependencies

- S1 persistence (VaultAPI design, in flight) is the foundation for S2
  state (deploy records + ceremony payloads need a persistent home —
  repo-committed payloads are the S2 answer; apps/api persistence of
  launch state is S1's own scope).
- S3 deploy execution ONLY after: this design approved by user + S1
  landed + kit decode additions reviewed by VaultAPI.
- Stage order per chain: template → factory; chain order: Base Sepolia
  → Robinhood 46630.

## 10. Open items (owners)

| Item                                                                      | Owner                  |
| ------------------------------------------------------------------------- | ---------------------- |
| Deploy tag question: new tag + Tier F re-run vs v0.1.0 deploy with byte-identity proof of tooling-only kit changes (§4) | Main + VaultAPI |
| Kit decode/keccak/assert additions (round-trip, §4)                       | VaultAPI               |
| Signing intermediary + `ceremony-verify.mjs` implementation (post-approval) | OpsCI              |
| Robinhood fork-test wiring (RPC delivered; empirically green, separate PR) | OpsCI                 |
| Mainnet gate re-evaluation near S6                                        | Main + user            |
