# Wave 6 S4 — venue marketplace + T21 extension (DESIGN)

> Status: **DESIGN — research/design only; no code in this PR.** Every unbuilt component
> statements; today: Tier F defined & runnable — PASS record pending the post-outage
> battery re-baseline at tag `contracts-v0.1.0` (first attempt failed on CI wiring, not
> source; run-id recorded here on green); factory DARK; S3 **COMPLETE** — testnet
> rehearsal done on Base Sepolia (84532) and Robinhood Chain testnet (46630), post-deploy
> readback green (#117); Tier D battery **wired** (`battery-tierd.yml`), not yet run —
> factory dark until Tier D PASS + artifact written + manifest entry (#120)). First pass: Review54. Pattern follows #108. Builds on: T21 criteria doc
> (`wave5-t21-verification-design.md`, `[F#]`), release-tag runbook (Tier V definition),
> wave-2 trading research (`[W#]`), wave-4 oracle research (`[O#]`), launchpad memo +
> decision (T17–T21), S1 persistence (#96/#108), S2 ceremony (#94).
> Constraint honored: **no new release tag for tooling-only changes** — this design
> proposes contract-level (venue adapter) work, which is NOT tooling-only and therefore
> will need its own tag + Tier F re-run when it lands.

---

## 1. Scope and non-goals **[DESIGN]**

**In scope:** the venue marketplace layer that makes launched tokens tradable, its
registry, its permission model, and the extension of the T21 verification battery from
Tier D (factory) to **Tier V** (launch/venue).

**Non-goals:**

- Venue contracts themselves are **third-party** — per T21 §2 (System under verification)
  they are integration-tested in G3 but never verified by the battery. We verify OUR
  adapter code, never Uniswap/0x internals `[F §2]`.
- No new consent claims: the vocabulary stays the **four frozen strings**; venue work
  deepens `fee_split_invariant` EVIDENCE (runbook §1 ruling), never the claim set.
- Launchpad factory/template are frozen by Tier D; nothing here mutates them.

**[inference]** The venue phase is where value actually moves through the system for the
first time (factory era: zero value flow at deploy). Every fail-closed default below is
priced against that fact.

## 2. Venue registry architecture **[DESIGN]**

### 2.1 What a venue is

A venue = a trading surface for launched tokens where the **venue-side share** (the
fifth economic participant) accrues at the venue/pool layer — NOT in the template's
eight fee slots and NOT in the factory's four-field feeBps `[Appendix A A.1][F §4.2]`.
The registry makes that boundary machine-checkable.

### 2.2 Registry shape

Committed in-repo (same audit-trail posture as S2 ceremony payloads and deploy
manifests — commit-to-repo = lineage, per S2 ruling):

```jsonc
// contracts/deployments/venues/{chain}.venues.json  [DESIGN]
{
  "chain": { "chainId": 84532, "name": "base-sepolia" },
  "venues": [
    {
      "venueId": "base-sepolia:uniswap-v4:launchpool",
      "kind": "uniswap-v4-pool", // adapter family selector
      "adapterPort": "DexAggregatorPort", // wave-2 ruling: port behind adapter
      "poolCreationParams": { "venueBps": 8.75 }, // venue share lives HERE, nowhere else
      "feeAccrualLayer": "venue",
      "status": "active", // active | suspended | superseded
      "addedAt": "<iso8601>",
      "addedBy": "<human identity>",
      "approvedBy": "<second human>",
      "supersededBy": null,
    },
  ],
}
```

- One file per chain; entries append-only; a CHANGED venue = a NEW `venueId` with the
  old entry marked `supersededBy` (never an in-place edit — same carve-out discipline
  as Appendix A: changes are new artifacts, never silent mutations).
- A CI schema-validation job (pattern: `validate-manifests.mjs`) enforces shape, unique
  venueIds, and the two-human fields; fail-closed on any violation `[DESIGN]`.
- The deploy manifest (gate #3 allowlist source) references the `venueId` chosen at each
  launch, giving full lineage: tag → deploy record → venue entry → pool params `[DESIGN]`.

### 2.3 Why not on-chain **[inference]**

An on-chain venue registry would be a NEW trusted contract needing its own verification
battery for a wave-6 problem that is fundamentally a POLICY table. In-repo file + CI
validation + human sign-off gives the same guarantees with zero new chain surface.
Revisit only if venues ever need trustless third-party reads.

## 3. Permission / access model **[DESIGN]**

| Action                          | Who                            | Rule                                                                                                              |
| ------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Add venue entry                 | two humans (propose + approve) | HITL, same posture as gate #3 deploy decisions                                                                    |
| Change venue params             | nobody                         | new venueId + supersede (append-only)                                                                             |
| Suspend venue                   | one human + recorded reason    | kill-switch semantics per S1 `kill_switch` pattern                                                                |
| Read registry                   | UI / adapters / agents         | read-only; never a write path from runtime code                                                                   |
| Mutate registry from automation | **NEVER**                      | extension of gate-#1 rule: automation never produces deploy intents ⇒ automation never mutates venue state either |

Access invariants **[DESIGN]**:

- **A-1:** any intent routing through a venue MUST resolve to an `active` entry at
  evaluation time; unknown/suspended/superseded ⇒ reject with a typed error
  (`venue_not_active`), never a silent fallback.
- **A-2:** venue `venueBps` is recorded at entry creation and frozen for that entry;
  pool creation at launch uses exactly the recorded value; drift ⇒ G3 assertion failure.
- **A-3:** suspension is retroactively honest: consent evidence referencing a suspended
  venue is annotated (evidence metadata), never deleted — audit trail over optics.

## 4. T21 battery extension — Tier V **[DESIGN]**

Vocabulary unchanged (four frozen claims). Extension = deeper `fee_split_invariant`
evidence + new gates, per the runbook's Tier V definition:

### 4.1 G1 additions (invariants + units)

- **INV-FEE-2 (conservation):** for every trade, fee collected == Σ accruals to the four
  schedule recipients, EXACT under the rounding/dust policy (§4.5). Venue-side accrual
  is a separate ghost, asserted in FV scenarios, never mixed into this identity `[F §4.3]`.
- **INV-FEE-4 (rate):** trade fee == amount × RATE (175 bps reference) within the
  documented rounding tolerance `[F §4.3]`.
- **INV-VENUE-1 (venue accrual identity):** per-trade venue-layer accrual == `venueBps`
  applied to the documented accrual basis — a named identity with the same exactness
  discipline as INV-FEE-2, asserted by a `TradingHandler` action executing venue trades
  inside the invariant campaign. Together with INV-FEE-2 this makes the two ledgers
  (schedule recipients vs venue layer) independently exact, with no cross-leak.

### 4.2 G2 additions

- Selector surface + Slither extend to the **venue adapter contracts** (our code behind
  `DexAggregatorPort`); third-party venue contracts remain out of scope `[F §2]`.
- Never-triage set applies unchanged to adapter code.
- **Adapter target set = explicit manifest [DESIGN]:** the battery targets an enumerated,
  CI-validated list of adapter files/directories — "adapter code" can never silently
  widen to cover vendored third-party source. Same manifest discipline as the deploy
  allowlist.

### 4.3 G3 additions (fork scenarios, keyless)

| #    | Scenario **[DESIGN]**                                                     | Mitigation proven                         |
| ---- | ------------------------------------------------------------------------- | ----------------------------------------- |
| FV-1 | Pool creation on forked venue state; params == registry entry             | A-2, registry lineage                     |
| FV-2 | Trade splits: four recipients exact (integer bps) + venue accrual at pool | INV-FEE-2/4 + INV-VENUE-1, FK-2 fork half |
| FV-3 | Slippage guard: quote vs execution price ⇒ revert below minBuyAmount      | `[W# T11–T16 mitigations]`                |
| FV-4 | quoteId TTL expiry ⇒ re-quote required, stale quote reverts               | `[W# mitigations]`                        |
| FV-5 | Oracle deviation beyond bounds ⇒ price-dependent venue ops refuse         | T22/T23 `[O#]`                            |
| FV-6 | Wick/flash-print candle ⇒ trade refusal under deviation bounds            | T22 `[O#]`                                |

### 4.4 G4/G5 additions (live, post-venue-deploy)

- G4 readbacks extended: pool params == registry `venueBps`; sample probe trade on
  testnet (FK-2 live half — **blocked on the testnet-signing open question**, runbook
  §9.3; keyless fork half FV-2 runs regardless).
- G5 evidence metadata += `{ venues: [venueId…], registryCommitSha, chainId }`;
  `claims[]` stays the frozen four `[C-7 rule]`.

### 4.5 Rounding/dust policy (Review54 ruling: APPROVED, binding conditions C1–C3; user final co-owner)

Ruled policy, stated so INV-FEE-2 becomes an EXACT identity:

- Per-trade fee `f = floor(amount × 175 / 10_000)` (truncate toward zero — never round
  up, so no trader ever pays more than RATE; the floor direction is fail-safe for the
  overcharge claim).
- Recipient accruals `a_i = floor(f × share_i / 175)` in schedule order; the residual
  `f − Σa_i` (bounded by 3 wei for four recipients) accrues to the **last recipient in
  fixed order** (deterministic sink, no silent socialization; the ≤3 wei/trade privilege
  is bounded, deterministic, disclosed, and carries no strategic space since order is
  fixed by the schedule).
- Dust residual from `f` vs real-amount rounding stays with the trader.

**Binding conditions (Review54, first-pass):**

- **C1:** conservation is asserted EXACT — integer equality, zero tolerance (line §5
  "any other residue = test failure" is hereby binding).
- **C2:** implementation is overflow-safe: `amount × 175` overflows above 2^256/175 and
  so does `f × share_i` — mulDiv-style arithmetic with floor semantics preserved.
- **C3:** the policy (fee formula + split rule + sink order) is frozen as in-code
  constants and echoed into the battery as frozen constants (§4.6 pattern).

### 4.6 Tier V gate semantics **[DESIGN]**

Tier V PASS = Tier D evidence + §4.1–4.4 green at the tag that ships venue (+ §4.5
policy frozen in-code). If venue work changes template/factory ⇒ NEW tag + Tier F
re-run first (runbook trigger rule). Fail-closed throughout: any single failure ⇒ no
Tier V claim, no launch.

## 5. Fail-closed defaults **[DESIGN]**

| Condition                              | Default behavior                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| Unknown / suspended / superseded venue | reject `venue_not_active`; no routing, no accrual accounting, no consent text about it |
| Malformed registry entry               | CI validation fails; release blocked (manifest pattern)                                |
| Oracle stale or unavailable (T23/T24)  | price-dependent venue operations SUSPEND — security over latency `[O# wave-4 ruling]`  |
| Deviation/wick beyond bounds (T22)     | quotes rejected; trades refuse                                                         |
| INV-FEE-2 reconciliation mismatch      | venue suspended pending human review; never auto-retry, never auto-"fix" accruals      |
| quoteId TTL expired                    | forced re-quote; execution on expired quote reverts                                    |
| Rounding residue                       | only where §4.5 policy explicitly places it; any other residue = test failure          |

## 6. Threat → control → assertion map **[DESIGN]**

| Threat (registry)                             | Venue control                                                        | Battery assertion                |
| --------------------------------------------- | -------------------------------------------------------------------- | -------------------------------- |
| T11–T16 swap-class `[W#]`                     | minBuyAmount + quoteId TTL + expiry margin, request-side slippageBps | FV-3, FV-4                       |
| T17–T21 launchpad `[memo]`                    | registry lineage: launch ⇒ venueId ⇒ pool params                     | FV-1, deploy-manifest validation |
| T22 wick/flash-print `[O#]`                   | deviation bounds on venue price inputs                               | FV-5, FV-6                       |
| T23 stale feed `[O#]`                         | TTL on all price-dependent paths                                     | FV-5 + suspend default           |
| T24 oracle outage `[O#]`                      | suspend, never degrade silently                                      | §5 row 3, ops runbook            |
| Fee leakage/skimming (INV-FEE-2 class) `[F#]` | exact conservation identity + two-ledger ghost                       | §4.1, FV-2                       |

## 7. Open questions (owners)

| Item                                                                                                                                                            | Owner                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Rounding/dust policy (§4.5) — Review54 APPROVED with C1–C3                                                                                                      | user (final co-owner)                |
| Testnet signing for FK-2 live half (runbook §9.3)                                                                                                               | Main + user                          |
| Venue availability on Robinhood stage 2 (chainId 46630)                                                                                                         | VaultAPI                             |
| Adapter-first venue kind for wave-6 build (Uniswap v4 pool vs 0x liquidity)                                                                                     | VaultAPI + user                      |
| venueBps economics: additive vs carve-out from the trader-paid fee — MUST be pinned when the adapter-first venue kind is chosen (row above); currently implicit | VaultAPI + user                      |
| On-chain registry trigger conditions (§2.3)                                                                                                                     | deferred — revisit only on real need |
