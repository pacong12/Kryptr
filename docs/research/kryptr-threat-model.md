# Kryptr Phase 1 Threat Model — wallet connect, balances, gated transfer

> **Author:** `web3` (Kryptr crew) · **Date:** 2026-08-15 · **Audience:** `vault` (security gate
> design), `face`/`deck` (UX of consent), conductor (merge gates).
>
> Inputs: `docs/ORCHESTRA.md` (Security commandments), `docs/ROADMAP.md` (Phase 1),
> `packages/shared-types` (`security.ts`, `transactions.ts`, `wallet.ts`, `chains.ts`), and the
> evidence base in `bankrbot-analysis.md` / `web3-agent-landscape.md`. External sources `[S#]` /
> `[L#]` resolve in those documents' registries. `[fact]` = sourced; **[design]** = Kryptr
> requirement proposed here.
>
> **Revised 2026-08-16:** added T22–T24 (trigger-price threats for wave-4 order automation)
> from `wave4-oracle-research.md` §3; external tags `[O#]` resolve in that document's registry.

---

## 1. Scope

**In scope (Phase 1, per ROADMAP):** user connects a wallet, sees balances on **Base** and
**Robinhood Chain**, submits a **transfer that passes the security gate before anything is
signed**; backoffice shows wallets, intents, and health live. Entry points: API, agent
endpoints (minimal in Phase 1), UI.

**Out of scope now (but pre-empted in §6):** scheduled orders (Phase 2), token launches
(Phase 3), full NL→intent LLM gateway and social connectors (Phase 4). Threats T2/T9 model the
agent surface early because the May 2026 Bankr incidents prove it is the eventual attack surface
`[S10][S11][S14]`.

**Assumptions:**

- A1 **[design]**: Kryptr never stores seed phrases or raw private keys (ORCHESTRA commandment
  #2; ROADMAP non-goal "custodial key storage inside the API").
- A2 **[design]**: signing happens behind a dedicated boundary (external signer / wallet provider
  / ERC-4337 — decision pending per ROADMAP); the API can only _request_ signatures for
  gate-approved intents.
- A3 **[fact]**: Base and Robinhood Chain are both EVM (Robinhood Chain = Arbitrum Orbit, ETH
  gas, mainnet 2026-07-01) `[S42][S43]`; balances read via viem + Blockscout per ROADMAP.

---

## 2. Assets

| ID  | Asset                                                                      | Why it matters                                                                                                            |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A-1 | User funds in connected/agent wallets                                      | Primary theft target (Bankr losses: ~$150–200K single-wallet, up to $150K per wallet in the 14-wallet wave `[S12][S14]`). |
| A-2 | Signing authority (provider sessions, API creds that can reach the signer) | Equivalent to funds: whoever holds it moves A-1 without keys (`[S11]` — May 4 exploit never touched a key).               |
| A-3 | `SecurityPolicy` configuration                                             | Weakening it is the cheapest attack (`[S10]` — NFT privilege escalation changed effective policy).                        |
| A-4 | User identity/session (login, wallet connect)                              | Account takeover preceded drains in the 14-wallet wave `[S14]`.                                                           |
| A-5 | Balance/portfolio data integrity                                           | Wrong balances → wrong user decisions; poisoned RPC/explorer data is a realistic vector (T6).                             |
| A-6 | Audit trail (intents, `SecurityDecision`s, `ExecutedTransaction`s)         | Needed for detection, reimbursement decisions (`[S14]` Bankr reimbursed based on its records), and forensics.             |
| A-7 | Backoffice/dashboard availability & truth                                  | Operators blind during an incident cannot stop it (kill switch lives here).                                               |

## 3. Entry points

| ID  | Entry point                                                               | Notes                                                                                     |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| E-1 | Frontoffice UI (wallet connect, balances, transfer form)                  | shadcn-vue app; wallet-connect flow; the only human consent surface in Phase 1.           |
| E-2 | Public API (wallet list, balances, intent submission, approval endpoints) | NestJS; every value-moving endpoint must route through the gate (commandment #3).         |
| E-3 | Agent endpoints (internal Phase 1; full surface Phase 4)                  | Even Phase 1 automation must emit only `TransactionIntent`s (`transactions.ts` contract). |
| E-4 | Backoffice UI (wallets, intent feed, health, policy admin)                | Admin plane — aixbt was drained via its admin dashboard, not the model `[L26][L27]`.      |
| E-5 | RPC/Blockscout providers (Base, Robinhood Chain)                          | Data plane for balances and tx status; pinnable, allowlistable.                           |
| E-6 | CI/CD, secrets, dependency supply chain                                   | Standard app attack surface; secrets would violate commandment #2 if present.             |

## 4. Threat actors

| Actor                   | Capability / motivation                                           | Relevant history                               |
| ----------------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| External opportunistic  | Scans for open endpoints, phishes users; low effort, high volume. | Crypto phishing is the top loss cause `[S4]`.  |
| Targeted financial      | Funds recon; crafts encoded injections, session attacks; patient. | May 2026 Bankr attacker(s) `[S7][S11][S14]`.   |
| Malicious insider       | Knows internals; can weaken policy or exfiltrate creds.           | Privileged-access abuse class.                 |
| Compromised dependency  | Supply-chain code/CI; can backdoor signer integration.            | Standard; cf. E-6.                             |
| Compromised agent (P2+) | Legit origin, hijacked instructions; the Grok scenario.           | `[S11]` — Grok was the unwitting courier.      |
| Careless user           | Reuses passwords, signs blindly, leaks sessions.                  | Bankr's own guidance targets this `[S4][S14]`. |

## 5. Top-10 threats with mitigations

Severity = Likelihood × Impact judged for Phase 1. "Must" items are Phase 1 gate requirements.

**Numbering note:** T11–T16 (swap surface) are registered in `wave2-trading-research.md` and
T17–T21 (launchpad surface) in `launchpad-discussion.md`; this file carries T1–T10 and, as of
the 2026-08-16 revision, T22–T24 below.

### T1 — Gate bypass: direct path from API/agent to signing (CRITICAL)

An endpoint or internal call signs without a passing `SecurityDecision`. This is the structural
failure behind "Language-as-Authorization" `[S11]`.
**Mitigations [design]:** (a) commandment #1/#3 — signing service accepts ONLY an intent id with
`SecurityDecision.result === 'approved'` (or `needs_human_approval` + recorded human approval);
(b) no other module imports the signer client (module boundary + code review rule); (c) a
contract test fails CI if any value-moving route lacks the gate interceptor.

### T2 — Prompt-injected / encoded instruction becomes an intent (HIGH, grows Phase 4)

Morse/base64/unicode-obfuscated instructions reach an agent endpoint and produce a malicious
intent — the exact May 4 chain `[S7][S10][S11]`.
**Mitigations [design]:** agents can only POST typed `TransactionIntent`s (schema-validated);
`SecurityPolicy.rejectEncodedPayloads` rejects/flags encoded content at ingestion; **decoded
output is never trusted** — gate checks run at the action layer regardless of what a model
decoded `[S11][S18]`; intent `origin` must match an allowlisted origin (T5).

### T3 — Privilege escalation via asset ownership (HIGH)

Capabilities granted by holding an NFT/token (Bankr Club NFT escalation `[S10]`) — including
future Kryptr tokens.
**Mitigations [design]:** permissions exist only in server-side `SecurityPolicy`; no code path
reads token/NFT balances for authorization; policy changes require authenticated admin + MFA and
are audit-logged (T9).

### T4 — Wallet-connect / session attacks on the frontoffice (HIGH)

Phishing site, session fixation/hijack, or malicious "connect" flow yields A-2/A-4 (the 14-wallet
wave involved account-side compromise; users were told seed phrases may be exposed `[S14]`).
**Mitigations [design]:** short-lived sessions; MFA/passkey for sensitive actions (copy Bankr's
post-incident passkey model `[S4]`); explicit per-action consent screens showing full parameters
(T7); domain allowlist + clear branding guidance; logout of unrecognized sessions surfaced in UI.

### T5 — Forged or replayed intent origin (HIGH)

An attacker posts/submits an intent claiming `origin: 'user'` or another agent's id — the
cross-agent trust failure `[S11][S14]`.
**Mitigations [design]:** `origin` is set **server-side** from the authenticated session/API key,
never accepted from the client payload; checked against `SecurityPolicy.allowedOrigins`;
approvals are bound to the specific intent (nonce) and non-replayable; social/agent channels are
data, not control planes.

### T6 — Poisoned balance/tx data (MEDIUM)

Compromised/malicious RPC or explorer returns fabricated balances or confirmations, steering user
decisions or hiding drains.
**Mitigations [design]:** pin RPC/explorer URLs in `ChainConfig` (`chains.ts`) server-side;
validate response shapes with viem; display data-source + staleness in UI/backoffice; alert on
balance deltas inconsistent with observed intents (A-6).

### T7 — Transfer parameter manipulation (HIGH)

Address substitution (clipboard/paste), amount/decimal confusion, asset mismatch in the transfer
flow; Bankr's price-impact protection and recipient allowlist exist precisely for this class
`[S4]`.
**Mitigations [design]:** checksummed `0x${string}` validation; amounts as validated strings
(`wallet.ts` uses strings to avoid precision loss); recipient allowlist **with cooldown** for
new entries; human confirmation screen repeats full parameters (to/asset/amount/chain) before
signing; simulation-before-sign when a provider supports it.

### T8 — Spend-cap bypass (MEDIUM)

Splitting a large transfer into many small intents; stale USD pricing to game
`approvalThresholdUsd`/`dailyCapUsd`.
**Mitigations [design]:** daily cap enforced **atomically per wallet** across all intents at the
gate (single ledger of committed amounts); USD valuation from a server-side pricing source with
freshness bounds; `dailyCapUsd: 0` means no outbound (already in `security.ts`).

### T9 — Policy tampering & audit forgery (HIGH)

Attacker (or insider) weakens `SecurityPolicy`, approves intents, or edits history to hide theft.
**Mitigations [design]:** policy writes require MFA + separate authorization; every
`SecurityDecision` and policy change is append-only (hash-chained or DB-immutable); backoffice
shows policy-change events; anomaly alert when policy loosens during active intents.

### T10 — Fail-open under DoS/error (MEDIUM)

Gate/RPC/provider errors cause the system to sign by default or silently skip checks; or DoS
blinds operators during an ongoing drain.
**Mitigations [design]:** **fail-closed**: any gate/signer error → intent stays `pending_approval`
/`rejected`, never auto-approved; health endpoints (`HealthStatus`, `api.ts`) feed the backoffice
dashboard (Phase 1 deliverable) + operator kill switch ("pause all" like Bankr's `[S4][S14]`).

### T22 — Wick / flash-print trigger manipulation (HIGH)

A brief, manipulated print (thin-venue wick, flash-loan-driven spot move) crosses a limit/DCA
trigger and fires an order. Precedent: **Mango Markets (Oct 2022, ~$110–116M)** — collateral
valued on thin-venue spot prices was inflated with flash-loan-funded buys; the protocol executed
"correctly" on false inputs `[O19]`.
**Mitigations [design]:** (a) trigger source = on-chain Chainlink Data Feeds (multi-venue
aggregation), never single-venue spot `[O1][O2]`; (b) **deviation circuit breaker**: if
`|primary feed − sanity source| > TRIGGER_DEVIATION_BPS`, no trigger + alert
(`wave4-contract-freeze.md` §4); (c) **TWAP window option** for large orders — sustained
manipulation across the window is far costlier (Uniswap v3 cumulative-oracle pattern), accepting
lag in genuine crashes `[O18]`; (d) uncertainty filtering when a confidence/spread signal exists
`[O14]`; (e) **execution backstop**: a trigger is a _proposal_, never an authorization — it mints
a fresh `TransactionIntent` through the full gate with re-quoted `minBuyAmount` (T1 pattern).

### T23 — Stale-feed trigger (MEDIUM)

A heartbeat gap leaves `updatedAt` far behind; triggering on stale data executes at the wrong
level. On-chain observation 2026-08-16: the Base ETH/USD feed (`0x71041ddd…Bb70`, verified via
`mainnet.base.org` reads) updated every ≈1230 s during a quiet window — the frozen default
`TRIGGER_MAX_AGE_MS = 2_700_000` (45 min) carries ~2× headroom over the empirical heartbeat
`[O21][O22]`.
**Mitigations [design]:** per-feed `maxAge` policy, fail-closed (stale → `trigger_price_stale`,
no trigger, no cancellation, health flag — consistent with T10 and freeze §2); backoffice shows
last-update age per feed (deck health-card pattern).

### T24 — Trigger-oracle outage / dependency (MEDIUM)

Single-source dependency: primary RPC down, feed deprecated, or provider outage blinds the
trigger loop.
**Mitigations [design]:** primary (on-chain feed) and sanity (off-chain API) sources are
independent systems; RPC fallback chain in `ChainConfig` (wave 3 §2); order state survives oracle
outage — unknown price → `needs_human_approval` posture, order stays `open` (freeze §4; worker
persistence semantics per `wave4-worker-design.md`).

## 6. Human-in-the-loop (HITL) signing requirements — normative for Phase 1

These are the requirements `vault`'s gate must implement; `face` must render them.

- **HITL-1 (threshold approval).** Any intent whose USD value exceeds
  `SecurityPolicy.approvalThresholdUsd` returns `needs_human_approval`; signing is impossible
  until a human approves through an authenticated, session-bound flow. **[design; basis S10][S11]**
- **HITL-2 (explicit consent screen).** Every Phase 1 transfer — even below threshold — shows
  to/asset/amount/chain/fee estimate and requires an affirmative confirmation action before
  signing. No "remember this choice" in Phase 1. **[design; basis S4][S14]**
- **HITL-3 (new-recipient friction).** First transfer to an address not in the recipient
  allowlist requires confirmation plus a cooldown period before execution (copy Bankr's
  "permitted recipients with cooldown" `[S4]`). **[design]**
- **HITL-4 (policy changes are human acts).** Changes to `SecurityPolicy` (caps, allowlists,
  allowed origins/chains) require MFA and are visible in backoffice; automation may never edit
  policy. **[design; basis S10 — attacker-supplied privilege changes]**
- **HITL-5 (accountability).** Every executed tx records `approvedBy` (human identity or policy
  rule id) in `ExecutedTransaction`; approvals are single-use and non-replayable. **[design; basis
  S14 reimbursement forensics]**

## 7. Five requirements for `vault` (sent via IRC on 2026-08-15)

1. **Gate-exclusive signing:** the signer accepts only intents carrying an approved
   `SecurityDecision`; no other module may reach the signer (T1, commandments #1/#3).
2. **Server-side origin + allowlist enforcement:** `TransactionIntent.origin` is assigned by the
   API from the authenticated session, validated against `SecurityPolicy.allowedOrigins`;
   never client-supplied (T5, RC-5 in `bankrbot-analysis.md`).
3. **Default-deny value caps:** `dailyCapUsd` + `approvalThresholdUsd` enforced atomically per
   wallet with server-side USD pricing; anything above threshold is blocked until HITL approval
   (T8, HITL-1).
4. **Fail-closed + kill switch:** gate/signer/RPC errors keep intents unsigned; backoffice kill
   switch pauses all outbound per wallet and globally (T10; Bankr's pause saved further losses
   `[S14]`).
5. **Immutable decision audit:** every `SecurityDecision`, policy change, and `approvedBy` is
   append-only and visible in backoffice — required for detection and any reimbursement decision
   (T9, HITL-5, `[S14]`).

## 8. Residual risks & open questions

1. **Wallet-provider choice undecided** (WalletConnect / Privy / ERC-4337 per ROADMAP). This
   model assumes an external signing boundary with policy support; the decision should be made
   before gate implementation (message to conductor + `vault`).
2. **Reimbursement policy** is a product decision with security implications (Bankr reimbursed
   `[S14][S17]`; Virtuals treasury-covered Basis losses `[L14]`); Kryptr should define it before
   launch.
3. Phase 1 cannot defend against **user-device compromise** (malware reading screens/clipboards);
   mitigations are education + allowlists + caps (defense in depth).
4. Robinhood Chain tooling maturity (Blockscout instance, RPC reliability) is new (mainnet
   2026-07-01 `[S42]`); T6 mitigations matter more on the newer chain.
5. Threat model review by `vault`: requested 2026-08-15 via IRC; ack to be recorded in
   `docs/tasks/web3.md` per mission contract.

---

## 9. Sources

External evidence tags `[S#]`/`[L#]` resolve in the registries of `bankrbot-analysis.md` §9 and
`web3-agent-landscape.md` §10; `[O#]` tags resolve in the registry of
`wave4-oracle-research.md` §7 (T22–T24 use `O1`, `O2`, `O14`, `O18`, `O19`, plus `O21`/`O22`
added there by the 2026-08-16 revision for the on-chain feed verification). Internal:
`docs/ORCHESTRA.md`, `docs/ROADMAP.md`,
`packages/shared-types/src/lib/{security,transactions,wallet,chains,api}.ts` (all accessed
2026-08-15); `wave4-contract-freeze.md` §2/§4 (accessed 2026-08-16).
