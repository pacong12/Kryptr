# BankrBot Analysis — product, custody, economics, architecture, and the May 2026 incidents

> **Author:** `web3` (Kryptr crew) · **Date:** 2026-08-15 · **Status:** merged-quality research input
> for `vault`'s security gate design and the whole crew's Phase 1–4 planning.
>
> **Method:** web research over primary sources (Bankr docs, Privy case study) and dated incident
> reporting. Every claim carries a source tag `[S#]`; the full registry with URLs and dates is at
> the bottom. Facts are labelled **[fact]**, reconstructions and analyst judgement are labelled
> **[inference]**. Internal references point at `docs/ORCHESTRA.md`, `docs/ROADMAP.md`, and
> `packages/shared-types`.

---

## 1. Executive summary

Bankr (bankr.bot, `@bankrbot`) is the reference implementation of the "wallet agent" Kryptr is
building: a chat-first crypto agent that auto-creates a wallet per user, executes swaps/bridges/
transfers/token launches from natural language, and funds itself through launch fees. It is also
the cautionary tale: in May 2026 two incidents — the Grok "Morse code" prompt-injection drain
(May 4) and a 14-wallet compromise wave (May 19) — showed that the dominant failure mode is not
key theft but **language treated as authorization**.

The five lessons Kryptr must encode (detailed in §7):

1. Agents may only produce structured `TransactionIntent`s; signing is a separate gated step
   (ORCHESTRA Security Commandment #1).
2. Never grant permissions via on-chain asset ownership (the Bankr Club NFT escalation).
3. Reject/flag encoded instructions at the ingestion boundary; decoded content is untrusted input.
4. Default-deny agency: spend caps, recipient allowlists, human-in-the-loop above thresholds.
5. No implicit trust between agents; every intent carries an `origin` that the gate verifies.

---

## 2. Product surface

### 2.1 What Bankr is **[fact]**

Bankr describes itself as "the financial rails for self-sustaining AI agents" and as "a web-native
agent runtime with first-class crypto support" `[S1][S2]`. It started (late 2024) as a social
token-launcher on X/Farcaster and grew into a general DeFi agent `[S20][S5]`. Development is led
by the pseudonymous `@0xDeployer` `[S20]`.

### 2.2 Surfaces (where users talk to it) **[fact]**

| Surface      | Handle / URL                  |
| ------------ | ----------------------------- |
| Web terminal | `bankr.bot`                   |
| X (Twitter)  | `@bankrbot`                   |
| Telegram     | `@bankr_ai_bot`               |
| CLI          | `bankr "…"`                   |
| Farcaster    | supported (earlier interface) |

State syncs across surfaces because "state lives on your wallet, not the client" `[S2]`.

### 2.3 Wallet creation **[fact]**

A wallet is created **automatically on first interaction**: "As soon as a user interacts with the
`@bankrbot` handle, Privy enables instant creation of a secure server wallet, tied to the user's X
account" `[S5]` (2025-03-27). Sign-in options: email, X, Farcaster, Telegram `[S3]`. No seed
phrase is shown to the user: "Privy embedded wallets are non-exportable by design — there is no
seed phrase to share" `[S4]`.

### 2.4 Commands / capabilities **[fact]**

- **Swap / bridge / send:** "swap $50 of ETH to USDC on base", transfers to ENS names or X
  handles (agent resolves them) `[S1][S2]`.
- **Scheduled trading:** limit orders, stop orders, DCA, TWAP, "any agent prompt on an interval"
  `[S2]`.
- **Launch:** fair-launch a token "on Robinhood Chain (default) or Base" via natural language,
  CLI, or Deploy API; claim & transfer trading fees `[S1][S2]`.
- **Leverage & prediction markets:** Hyperliquid/Avantis perps, Polymarket betting `[S2]`.
- **Arbitrary contracts:** "the agent finds the ABI, verifies the address, and calls it" `[S2]`.
- **Runtime extras:** per-user web filesystem, durable memory (`/.memory/`), x402 pay-per-request
  endpoints, sandboxed `execute_cli`, installable skills and MCP servers `[S2]`.
- **LLM Gateway:** OpenAI-compatible proxy (OpenAI/Anthropic/Google) paid from agent wallet fees
  `[S1]`.

### 2.5 Chains **[fact]**

Nine networks: Base (primary), Ethereum, Polygon, Unichain, World Chain, Arbitrum, BNB Chain,
Solana, Hyperliquid; gas sponsored by Bankr on Base, Polygon, Unichain, World Chain, BNB Chain
`[S1]`. Token launches default to Robinhood Chain, an Arbitrum-Orbit L2 that went to public
mainnet on 2026-07-01 `[S1][S42][S43]`.

### 2.6 Access tiers / pricing **[fact]**

Free: 5 terminal messages/day. **Bankr Club** ($20/mo or $198/yr): unlimited messages, top-tier
models, 20 concurrent automations, browser sessions, 10 gas-sponsored launches/day (vs 3);
Agent API capped at 1,000 req/day for Club vs 100/day otherwise. **Max Mode**: pay-per-token from
LLM credit balance. Club requires an **embedded** Bankr wallet — "Club payments are signed by
Privy on your behalf, and Bankr doesn't have signing keys for external wallets" `[S3]`.

---

## 3. Custody model

**[fact]** Bankr uses **Privy server wallets**: "Behind BankrBot's effortlessness is Privy's
server wallets. These server wallets are embedded, secure, and managed on behalf of the user,"
with "delegation of wallet activity to AI agents, allowing BankrBot to execute transactions or
manage onchain logic on behalf of the user" `[S5]` (Privy's own case study, 2025-03-27). Privy
keys are MPC-sharded and non-exportable `[S4]`.

**[inference]** The practical custody picture, reconstructed from `[S3][S4][S5]`:

- Keys never touch the user's device; the **application backend (Bankr + Privy)** can sign at any
  time for any session it considers authenticated. Bankr markets this as "non-custodial" (user
  owns the account), but from a threat-model perspective it is **server-side signing authority**:
  whoever compromises the account/session (or tricks the agent) moves funds without further user
  interaction.
- This is exactly why the May 2026 incidents (§5) cost money even though **no private key was
  ever stolen** `[S11]`.
- External wallets (MetaMask etc.) are second-class: they cannot subscribe because Bankr cannot
  sign for them `[S3]` — confirming that all automated flows depend on embedded wallets.

**Kryptr takeaway:** ORCHESTRA's non-goal "custodial key storage inside the API" and ROADMAP's
"non-custodial signing boundary (WalletConnect / Privy / ERC-4337 — decide before implementation;
app itself never stores seed phrases)" are the right instincts. If a Privy-style provider is used,
its **policy engine** (spend caps, allowlists, approval workflows — see
`web3-agent-landscape.md` §7) must be switched **on by default**, unlike Bankr's 2025–26 posture.

---

## 4. $BNKR economics & fee model

### 4.1 Token **[fact]**

- $BNKR on Base, fixed max supply **100 billion** `[S22][S21]`.
- Launched in **February 2025** per Gate `[S20]`; deployed through the Clanker infrastructure
  (contract listed on clanker.world at `0x22aF…6F3b`) `[S6]`. **[inference]** Sources vary
  slightly on the exact month; treat "early 2025, via Clanker, fair launch" as solid and the
  precise date as soft.
- Utility: pays for Bankr Club subscriptions and platform fees; central to revenue-sharing /
  buyback mechanics `[S20][S21][S3]`.

### 4.2 Launch fee schedule **[fact]**

Every trade of a Bankr-launched token pays a **0.7% pool swap fee** plus hook fees — **1.75%
all-in**, split as follows (table from Bankr docs `[S1]`):

| Recipient                                  | Share of volume |
| ------------------------------------------ | --------------- |
| Creator — 95% of the 0.7% pool fee         | 0.665%          |
| LP fee (hook) — locked in the token's pool | 0.285%          |
| Bankr protocol fee (hook)                  | 0.475%          |
| **BNKR buyback** (hook)                    | 0.2375%         |
| Protocol (Doppler)                         | ~0.0875%        |

"Fee schedules are fixed at launch — tokens launched earlier keep the schedule they launched
with" `[S1]`. This "fixed at launch" rule is mirrored in Kryptr's `TokenFeeSchedule` shared type
(`packages/shared-types/src/lib/token.ts`).

### 4.3 Self-funding flywheel **[fact]**

Agent wallet → launch token → trading fees accrue to wallet → fees pay LLM compute via the LLM
Gateway → repeat `[S1]`. Bankr calls this the "self-sustaining agent" model `[S1][S20]`.

### 4.4 Revenue streams **[fact + inference]**

Fact: subscriptions (USDC/BNKR/ETH/Base ERC-20s) `[S3]`, protocol fee share 0.475% `[S1]`,
BNKR buyback share 0.2375% `[S1]`, Max Mode LLM-credit margin `[S3]`, Agent API access `[S3]`.
Inference: secondary-market fee trading and launch volume are the growth engine; BNKR demand is
mechanically tied to launch volume via the buyback hook.

---

## 5. Architecture reconstruction: chat message → signed transaction

**[inference]** — reconstructed from `[S1][S2][S5][S11]`; Bankr has not published internals.

```text
[Surface: X / Telegram / web / CLI]
        │  user post or message (public or private)
        ▼
[Ingestion]  account resolution: social handle ↔ Bankr account ↔ Privy wallet [S5]
        ▼
[LLM runtime]  natural language → tool selection ("the agent picks the right tool") [S2]
        ▼
[Tool layer]  swap / bridge / transfer / deploy / contract-call tools [S2]
        ▼
[Security layer]*  screens for malicious contracts, phishing, unusual patterns,
        │          prompt injection [S1][S2]   (*post-incident hardening, see §6.3)
        ▼
[Signing boundary]  Privy server wallet signs on behalf of the account [S5]
        ▼
[Chain]  broadcast on one of 9 networks; result posted back to the surface [S2]
```

### Trust boundaries (numbered for §7 mapping)

| #   | Boundary                              | What must be true                                                                                  |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| TB1 | Identity: social handle → wallet      | Only the account owner (or their delegated agent) can reach the wallet.                            |
| TB2 | Interpretation: text → tool call      | Tool calls must be validated, structured outputs — never raw model text.                           |
| TB3 | Authorization: who may do what        | Permissions must come from server-side policy, **not** from anything an attacker can send or mint. |
| TB4 | Signing: Privy MPC key                | Signing only after TB1–TB3 checks pass.                                                            |
| TB5 | Cross-agent: agent A output → agent B | One agent's public output must never be an authenticated instruction to another.                   |

The May 2026 incidents (§5 of the timeline below) collapsed TB2/TB3/TB5: BankrBot "scanned
Grok's public output" and "treated Grok's textual output as a certificate of intent" — what the
post-mortem calls **Language-as-Authorization** `[S11]`.

---

## 6. The May 2026 incidents

### 6.0 Background: the DRB token **[fact]**

In March 2025, Grok (xAI's chatbot) was asked about tokens on Base; the exchange led BankrBot to
provision a wallet for the `@grok` X account and launch **$DRB (DebtReliefBot)** on Base via
Clanker — "96k unique traders in under two weeks" `[S5]`. Per the post-mortem reconstruction:
100B DRB supply; ~97% seeded into the Uniswap pool; ~3% (3B DRB) as creator share to Grok's
wallet (`ilhamrafli.base.eth`); 1% trade fee with 40% streamed to the creator wallet `[S11]`.
**[inference]** xAI never funded or administered the wallet; control followed whoever could
influence the `@grok` account's public output `[S10]`.

### 6.1 Incident A — 2026-05-04: Grok permission-chain abuse + encoded prompt injection

**Timeline (all sources dated):**

| Date (2026) | Event                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| pre-May 4   | Attacker airdrops a **Bankr Club Membership NFT** to Grok's auto-provisioned wallet `[S7][S10][S11]`.     |
| May 4       | `@Ilhamrfliansyh` replies to Grok with a **Morse-code** message asking for a translation `[S7][S11]`.     |
| May 4       | Grok decodes it to a plaintext command — send **3B DRB** to an address, tagged `@bankrbot` `[S11]`.       |
| May 4       | BankrBot executes the transfer; tokens dumped, DRB price crashes ~40% `[S11][S12]`.                       |
| May 4–8     | Reporting wave: AMBCrypto, BeInCrypto, CryptoSlate, OECD AIM record `[S7][S8][S9][S12]`.                  |
| days after  | ~80% (reports say 80–88%) of funds returned in ETH/USDC after community tracked the attacker `[S7][S10]`. |
| May 13      | Detailed architectural post-mortem published `[S11]`.                                                     |

**Mechanics, stage by stage `[S7][S10][S11]`:**

1. **Permission escalation via NFT.** Holding the Bankr Club NFT "unlocked higher-privilege
   capabilities, including large-value transfers and token swaps" — a "permission-granting
   object" / "Executive" level `[S10][S11]`. The attacker simply **gifted** the privilege.
2. **Encoded prompt injection.** Morse code bypassed Grok's plaintext safety filters; the model
   "translated it faithfully, as it is designed to do" `[S11][S10]`. OWASP mapping: LLM01:2025
   Prompt Injection + LLM06:2025 Excessive Agency `[S10]`.
3. **Unwitting courier.** Grok posted the decoded command publicly. "Grok did not execute
   anything. It decoded text and posted a reply" `[S11]`.
4. **Blind execution.** BankrBot saw a well-formed command from a trusted, now-elevated account
   and executed it. "Untrusted input → AI output → external agent execution → asset transfer.
   Every link in that chain was intentional system behavior" `[S11]`.

**Losses:** 3B DRB ≈ **$150K–$200K** depending on source: $155K–$180K `[S7]`, $150K–$174K
`[S10]`, ~$175K `[S11]`, $150K–$200K `[S12]`. ~80% returned; attacker kept $30–40K as a
self-styled "bug bounty" `[S11][S8]`. No smart-contract bug, no key leak `[S7][S11]`.

### 6.2 Incident B — 2026-05-19/20: follow-on drains, 14 wallets

| Date (2026) | Event                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| May 19      | Bankr identifies an attacker with access to **at least 14 Bankr wallets**; disables swaps, transfers and deployments "out of caution" `[S14][S15]`. |
| May 20      | Cointelegraph/Binance Square report losses up to **$150K per wallet**; SlowMist's Yu Xian says three attacker addresses hold **$440K** `[S14]`.     |
| May 20      | Bankr commits: "We will be reimbursing any and all lost funds" `[S14][S15][S17]`.                                                                   |
| May 20      | Bankr guidance: don't sign; stop using compromised wallets; new seed on clean device; revoke approvals; scan devices for malware `[S14][S16]`.      |

SlowMist characterized it as "a social engineering exploit targeting the trust layer between
automated agents — specifically an interaction between Grok and Bankrbot that allowed
unauthorized transaction signing," linking it to the May 4 vector `[S14]`. One affected user
(Austen Allred) said no one had logged into his account — "they must have accessed the keys some
other way" `[S14]`. Bankr told one user their seed phrase "is likely in the hands of an
attacker" `[S14]`.

**[inference]** Open question: Privy embedded wallets are non-exportable `[S4]`, so the "seed
phrase" warning most plausibly refers to affected users who also used external/software wallets,
or to session/account-level compromise rather than Privy key extraction. The exact technical
route of Incident B has not been published by Bankr (no public post-mortem found as of
2026-08-15). Flagged as a source gap in §8.

### 6.3 Bankr's response **[fact]**

- **May 4:** brief pause of the Grok integration, per secondary reports `[S8]`; community-driven
  recovery of ~80% of funds `[S7][S10]`. No formal Bankr post-mortem found.
- **May 19–20:** platform-wide pause of swaps/transfers/deployments; full reimbursement pledge;
  user security guidance `[S14][S15][S16][S17]`.
- **Current security posture (docs as of 2026-08-15):** wallet-level guardrails — pause-all
  switch, daily USD limit, per-transaction USD limit, **permitted recipients with cooldown**,
  price-impact protection, disable arbitrary contract calls, passkey MFA, session review — plus
  per-API-key controls: read-only default, IP allowlist, recipient allowlist, permission flags
  `[S4]`. Bankr states every transaction passes a security layer checking "malicious contracts,
  phishing attempts, unusual transaction patterns, and prompt injection attacks" `[S1][S2]`.
  **[inference]** The breadth of these controls (especially recipient allowlist + cooldown and
  prompt-injection screening) strongly suggests post-incident hardening.
- **NFT-permission decoupling:** current FAQ states Bankr Club NFTs are commemorative and grant
  **no** benefits, whereas May 2026 reporting documented NFT-held privilege escalation
  `[S3]` vs `[S7][S10][S11]`. **[inference]** Bankr appears to have severed the
  asset-ownership → permission link after the incidents.

---

## 7. Root causes → Kryptr controls

Root causes distilled from §6 (RC-#), mapped to the controls that defeat them. "Commandment"
refs are `docs/ORCHESTRA.md` §Security commandments; type refs are `packages/shared-types`.

| Root cause                                                                                                     | Kryptr control that defeats it                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-1 Language-as-Authorization:** model/social text executed directly as a transaction (`[S11]`)             | **Commandment #1:** agents produce `TransactionIntent`s only; signing is a separate gated step behind `SecurityPolicy`. Typed intent schema (`transactions.ts`) rejects free-text execution. ROADMAP non-goal: "direct 'AI output → signed tx' paths, ever."      |
| **RC-2 Encoded-instruction injection** (Morse/base64/etc. bypass input filters) (`[S10][S11]`)                 | `SecurityPolicy.rejectEncodedPayloads` (`security.ts`) at the ingestion boundary; treat all decoded/translated content as untrusted data, never as commands; gate checks run **after** decoding, at the action layer — filters at the text layer are best-effort. |
| **RC-3 Permission-by-asset:** holding an NFT escalated privileges; attacker gifted the NFT (`[S10]`)           | Permissions live only in server-side `SecurityPolicy` per wallet, mutated exclusively through authenticated admin flows with MFA. **No on-chain asset (NFT/token balance) may grant or raise capabilities.**                                                      |
| **RC-4 Excessive agency:** no default spend cap / recipient allowlist / HITL on large transfers (`[S10][S12]`) | `approvalThresholdUsd` + `dailyCapUsd` enforced in the gate (not the prompt); human-in-the-loop above threshold; recipient allowlist with cooldown (see `kryptr-threat-model.md` HITL-1…5). Commandment #3: every value-moving endpoint routes through the gate.  |
| **RC-5 Cross-agent trust:** agent A's public output authenticated as instruction to agent B (`[S11][S14]`)     | `TransactionIntent.origin` recorded and checked against `SecurityPolicy.allowedOrigins`; social/agent channels are **data sources, not control planes**; no surface may impersonate another origin; session-bound, non-replayable approvals.                      |
| **RC-6 Account/session & key-side compromise** (14 wallets, "seed phrase likely in attacker hands") (`[S14]`)  | Commandment #2: no keys/seeds in repo, env, logs, tests; signing via external boundary only; MFA/passkey on sessions; per-key scoping and read-only defaults (copy Bankr's post-incident API-key model `[S4]`); audit trail + kill switch.                        |

**Design principle (from the post-mortems, endorsed here):** move the trust boundary to the
**action layer**, not the interpretation layer — the same structural fix as parameterized queries
for SQL injection `[S11]`. Simon Willison's "lethal trifecta" (private data + untrusted content +
external communication) frames the risk `[S44]`; OWASP's Agentic Top 10 (2026) ranks this class
as "Agent Goal Hijack" `[S45]`.

---

## 8. Open questions / source gaps

1. No official Bankr post-mortem for either May 2026 incident was found as of 2026-08-15;
   technical detail relies on press + independent analyses `[S7][S10][S11][S14]`.
2. Exact technical route of the 14-wallet compromise (session vs key vs device) is unresolved
   (`[S14]`, see §6.2 inference).
3. BNKR launch month: sources say early 2025 (February per `[S20]`); not independently pinned.
4. Whether Bankr's current "prompt injection screening" `[S1]` is input-side, action-side, or
   both, is not documented; Kryptr must not assume input-side screening is sufficient (see RC-2).

---

## 9. Source registry

| ID  | Source (URL)                                                                                                                                                                                                                          | Date / accessed             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| S1  | Bankr docs — Platform Overview — https://docs.bankr.bot/getting-started/overview                                                                                                                                                      | accessed 2026-08-15         |
| S2  | Bankr docs — Agent Overview — https://docs.bankr.bot/agent/overview/                                                                                                                                                                  | accessed 2026-08-15         |
| S3  | Bankr docs — Bankr Club FAQ — https://docs.bankr.bot/faq/bankr-club/                                                                                                                                                                  | accessed 2026-08-15         |
| S4  | Bankr docs — Security Best Practices — https://docs.bankr.bot/security/overview/                                                                                                                                                      | accessed 2026-08-15         |
| S5  | Privy — "From Terminal to Timeline: BankrBot and the Rise of Agentic Wallets" — https://privy.io/blog/bankrbot-case-study                                                                                                             | 2025-03-27                  |
| S6  | Clanker.world — BNKR token page — https://www.clanker.world/clanker/0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b                                                                                                                        | accessed 2026-08-15         |
| S7  | AMBCrypto — "AI-linked wallet drained via prompt injection in Bankr exploit" — https://ambcrypto.com/ai-linked-wallet-drained-via-prompt-injection-in-bankr-exploit/                                                                  | 2026-05-04                  |
| S8  | BeInCrypto — "How AI Was Used to Steal $150K From the Grok Wallet" — https://beincrypto.com/grok-wallet-bankr-drb-prompt-injection/                                                                                                   | 2026-05-04                  |
| S9  | CryptoSlate — "How one trader used morse code to trick Grok…" — https://cryptoslate.com/how-one-trader-exploited-grok-and-morse-code-to-trick-ai-agent-into-sending-billions-of-crypto-tokens-from-a-verified-wallet/                 | 2026-05-04                  |
| S10 | Giskard — "How Grok got prompt-injected…" — https://www.giskard.ai/knowledge/how-grok-got-prompt-injected-an-x-user-drained-150-000-from-an-ai-wallet                                                                                 | 2026-05-07 (upd 2026-07-20) |
| S11 | V. Genin (Medium) — "When Bots Trust Bots: The Grok-Bankrbot Incident" — https://deeprnd.medium.com/when-bots-trust-bots-the-grok-bankrbot-incident-96338d72e1ff                                                                      | 2026-05-13                  |
| S12 | OECD AI Incidents Monitor — incident 2026-05-04-4a73 — https://oecd.ai/en/incidents/2026-05-04-4a73 (links AIID #1556)                                                                                                                | accessed 2026-08-15         |
| S13 | AI Incident Database — cite/1556 — https://incidentdatabase.ai/cite/1556                                                                                                                                                              | accessed 2026-08-15         |
| S14 | Cointelegraph (via TradingView) — "Bankr temporarily disables transactions after 14 wallets hacked" — https://www.tradingview.com/news/cointelegraph:fb3b7fdb2094b:0-bankr-temporarily-disables-transactions-after-14-wallets-hacked/ | 2026-05-20                  |
| S15 | Binance Square — "Bankr disables transactions after crypto wallets compromised" — https://www.binance.com/en/square/post/05-20-2026-bankr-disables-transactions-after-crypto-wallets-compromised-325050470365809                      | 2026-05-20                  |
| S16 | crypto.news — "Bankr hack drains wallets as users warned not to sign" — https://crypto.news/bankr-hack-drains-wallets-as-users-warned-not-to-sign/                                                                                    | 2026-05-20                  |
| S17 | BeInCrypto — "Bankr wallets compromised, attacker reimbursement" — https://beincrypto.com/bankr-wallets-compromised-attacker-reimbursement/                                                                                           | 2026-05-20                  |
| S20 | Gate Learn — "What is Bankr Bot?" — https://www.gate.com/learn/articles/what-is-bankr-bot/9357                                                                                                                                        | accessed 2026-08-15         |
| S21 | KuCoin — "A deep dive into Bankr and BankrCoin (BNKR)" — https://www.kucoin.com/news/articles/a-deep-dive-into-the-ai-agent-bankr-and-its-ecosystem-token-bankrcoin-bnkr                                                              | accessed 2026-08-15         |
| S22 | CoinGecko — Bankercoin (BNKR) — https://www.coingecko.com/en/coins/bankercoin-2                                                                                                                                                       | accessed 2026-08-15         |
| S23 | CoinMarketCap — Bankr Coin — https://coinmarketcap.com/currencies/bankr-coin/                                                                                                                                                         | accessed 2026-08-15         |
| S42 | Robinhood newsroom — chain mainnet, agentic trading — https://robinhood.com/us/en/newsroom/robinhood-accelerates-global-expansion-robinhood-chain-mainnet-stock-tokens-agentic-trading/                                               | 2026                        |
| S43 | Robinhood Chain docs — https://docs.robinhood.com/chain/                                                                                                                                                                              | accessed 2026-08-15         |
| S44 | S. Willison — "The lethal trifecta for AI agents" — https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/                                                                                                                        | 2025-06-16                  |
| S45 | OWASP — Top 10 for Agentic Applications 2026 — https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/                                                                                                       | 2025-12-09                  |
