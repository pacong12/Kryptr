# Wave 6 Planning — Signer, Venue, Persistence

**Status:** planning memo (conductor synthesis of team discussion). No code in this PR.
**Predecessors:** wave-5 launchpad decision (`launchpad-decision.md`), wave-5 vault design, wave-5 T21 verification design, wave-5 env policy (`wave5-env-policy.md`), threat model, review followups.

## 1. Why this wave exists

Waves 1-5 built the trust layer: keyless reads, quotes with fee transparency, order automation with kill switch, and a launchpad deploy path protected by a structural firewall + T21 verification. Two existential gaps remain against the reference product:

1. **Nothing executes.** Every flow terminates in unsigned calldata behind `DryRunSigner`. The product plans; it never acts.
2. **Launched tokens have no market.** The factory deploys and freezes fee splits, but there is no venue where a launched token can be bought/sold and graduate (INV-FEE-2/4 are deferred, not waived).

Wave 6 closes both, on the rails the earlier waves already built.

## 2. Team consensus (all six voices, unanimous on ordering)

- **Wave 6 = Signer + Venue**, with persistence as its foundation stage.
- **Wave 7 = conversational layer**, deliberately last: it is the largest attack surface with the lowest audit value. Hard rule carried from the discussion: **language is not authorization** — an NLP layer may only emit intents through the existing gate, with zero privileged paths.
- Additional gaps the team surfaced beyond the conductor's initial list:
  - **Key custody is its own decision**, not a signer implementation detail (where keys live, session-key scoping, kill-switch interaction; reference-product lesson RC-4/RC-6: _how the signer is constrained matters more than that it signs_).
  - **End-to-end deploy-intent execution** (consent → approve → sign → submit) is the natural Signer↔Venue bridge; approved deploys today are never executed.
  - **Unified audit feed** + backoffice surfaces for signer receipts and venue state; live-vs-dry-run provenance badges.
  - **Kill-switch runbook + incident procedure for live funds** (deploys are non-rollbackable by design; response is halt + communicate, never patch-forward).
  - **Dry-run→real-sign UX**: the sign-request UI must render exact intent fields and track tx status to confirmation; signer material never touches the frontoffice.

## 3. Proposed internal ordering

| Stage | Content                                 | Notes                                                                                                                    |
| ----- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| S0    | Custody design doc + ruling             | before ONE line of signer code                                                                                           |
| S1    | Persistence + idempotent execution      | compare-and-reserve (Postgres) replaces per-instance KeyedMutex caps; nonce uniqueness across replicas; audit durability |
| S2    | Signer infra behind existing SignerPort | separate service; never evaluates policy itself; decision-binding; testnet-only execution                                |
| S3    | First deploy execution on TESTNET       | validates gate + factory + signer together before any venue funds move                                                   |
| S4    | Venue contracts + T21 battery extension | bonding curve / graduation; own manifest + artifact; INV-FEE-2/4 move on-chain; §9.1 rounding/dust decisions             |
| S5    | Testnet soak with mini policy limits    | one full launch→graduate cycle monitored before any larger exposure                                                      |
| S6    | Mainnet readiness review                | separate release gate; staged exposure (small bond first)                                                                |

S2/S4 may progress in parallel once S0/S1 land; live venue funds only flow after the extended T21 battery is green AND the signer has passed S3/S5.

## 4. Entry gates (all must hold before their stage, fail-closed)

- **G-A (custody):** design doc reviewed and ruled. Keys never in env (extension of the env-policy ruling); MPC/KMS non-exportable; signer is a separate service that never evaluates policy; caps per-intent. Signer keys create NO on-chain admin surface: the T21 `admin_key_free` claim stays intact because the signer executes via the gate, never via an on-chain role.
- **G-B (decision-binding):** the signer may only execute intents whose decision-chain outcome authorizes execution, per path: `approved` (policy-authorized swap), or `needs_human_approval` plus a recorded HITL confirmation bound to the same anti-replay intent-id (deploy is HITL-only — the chain never yields `approved` for it). The intent-id is bound to the transaction; no decision, no signature.
- **G-C (persistence before money):** idempotent execution + atomic compare-and-reserve live before any multi-replica or real-value path; worker in-memory stores never hold real orders.
- **G-D (venue verification):** T21 battery extended to the venue contracts (manifest + artifact of their own) and green on the release tag before consent/deploy may target venue.
- **G-E (halt proven):** kill switch proven to stop the real signing path (today it gates the worker only); kill-switch + drain procedure tested on forks; incident runbook reviewed.
- **G-F (observability floor):** structured logs + alerts on order/deploy failures before the first live action.
- **G-G (testnet-first):** real-key execution never in CI; signer soak on testnet with mini limits; mainnet is a separate release gate with staged exposure.
- **G-H (UX honesty):** sign-request UI renders exact intent fields; tx status visible to confirmation; all real-sign paths default HITL; automation stays dry-run.

Relation to wave-4 conditions: G-C closes C1 (single-replica until persistence); G-H is a strict superset of C2 (automation origins stay dry-run entirely, not just default-deny); C3 (OW-1/OW-2 before any real signer) is already satisfied in wave 4 and is a met S2 precondition.

## 5. Open decisions (need rulings before S2/S4 build)

1. **Custody architecture** — Privy MPC embedded wallet (per the wave-2 ruling) vs operator KMS/HSM vs hybrid. This is the largest remaining trust decision.
2. **Venue intent shape** — pool-creation as deploy-phase-2 vs a new intent kind (affects the firewall's kind surface; decide before build).
3. **Graduation parameters** — thresholds/curve constants: freeze in template/constructor (preferred, matches fee philosophy) vs factory param.
4. **Notification surface** (gap #5 from the conductor's list) — deferred to Wave 7 candidate list unless team argues for Wave 6 inclusion.

## 6. Explicit non-goals for Wave 6

- Conversational/NLP layer (Wave 7).
- Mobile/PWA, market-analytics depth, social features.
- Any mainnet action before S6's separate release gate.

## 7. Relationship to in-flight Wave 5

Wave 5 continues to completion first: factory build (VaultAPI), T21 battery on the factory release tag (gate #1 still binding), user docs site (DocsUI). This memo changes nothing in flight; it is the map for what comes after.
