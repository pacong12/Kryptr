# Web3 AI-Agent Landscape — competitor scan for Kryptr

> **Author:** `web3` (Kryptr crew) · **Date:** 2026-08-15 · Companion docs:
> `bankrbot-analysis.md` (deep dive + incidents) and `kryptr-threat-model.md` (what we do with
> the lessons). Source tags `[S#]` resolve in each document's registry; landscape-only sources
> are registered in §9 below. Facts are labelled **[fact]**, analyst judgement **[inference]**.

---

## 1. Scope and method

Scanned: Bankr, Clanker, Virtuals Protocol, ElizaOS, Coinbase AgentKit, Privy agentic wallets,
plus notable others (aixbt, Griffain-class DeFAI, Robinhood Chain context). For each: custody
model, chain coverage, revenue model, known incidents. All claims carry URLs + dates (see §9 and
the registry in `bankrbot-analysis.md`).

**[inference]** The market splits into four layers, and incidents cluster by layer:

| Layer                       | Players                             | Typical incident class                                |
| --------------------------- | ----------------------------------- | ----------------------------------------------------- |
| Consumer wallet/trade agent | Bankr                               | Prompt injection, agent-trust abuse (May 2026)        |
| Token launch infra          | Clanker, Bankr launches, Virtuals   | Economic/design abuse; peripheral hacks               |
| Agent frameworks            | ElizaOS, Coinbase AgentKit          | Token/legal collapse (ElizaOS); none major (AgentKit) |
| Wallet infrastructure       | Privy (+Stripe), CDP server wallets | None major found in this scan                         |

---

## 2. Bankr (bankr.bot)

- **What:** chat-first DeFi agent + token launches + LLM gateway; full profile in
  `bankrbot-analysis.md` §2–4.
- **Custody:** Privy **server wallets**, auto-created per social account, server-side signing
  authority **[fact]** `[S5][bankrbot-analysis §3]`.
- **Chains:** Base (primary) + 8 others incl. Solana and Hyperliquid; launches on Robinhood
  Chain/Base **[fact]** `[S1][S42]`.
- **Revenue:** subscriptions ($20/mo Club), 0.475% protocol fee + 0.2375% BNKR-buyback share of
  launch volume, Max Mode LLM credits **[fact]** `[S1][S3]`.
- **Incidents:** May 4 2026 Grok/Morse drain (~$150–200K); May 19–20 2026 14-wallet wave,
  reimbursements **[fact]** `[S7][S10][S11][S14]`.

## 3. Clanker

- **What:** the original "tokenbot": tag `@clanker` on Farcaster and it deploys an ERC-20 with
  liquidity on Base (and Arbitrum) **[fact]** `[L1][L2]`. Launched Nov 2024 `[L3]`. Bankr's
  early launches rode Clanker rails, and $BNKR itself was deployed via Clanker **[fact]**
  `[S5][S6]`.
- **Custody:** Clanker is **not a wallet custodian** — it deploys tokens via factory contracts;
  users act through their own wallets/Farcaster identity **[inference from L1][L2]**. This is why
  Clanker has no "user wallet drain" incident class.
- **Chains:** Base primarily, Arbitrum **[fact]** `[L1]`. V4 uses Uniswap v4 hooks (fee lockers,
  vaults, sniper auctions) **[fact]** `[L1]`.
- **Revenue:** 1% fee on pool trades, split protocol/interface/creator **[fact]** `[L2][L4]`.
  Scale: ~$27M fees and $13M team revenue in first five months (Apr 2025) `[L4]`; $34M+ by
  mid-2025 `[L5]`; >$50M cumulative by early 2026 `[L6]`. Two-thirds of protocol fees buy back
  $CLANKER `[L6]`. Acquired by Neynar/Farcaster (Oct 2025); creators gained fee control
  (Nov 2025); Clanker Ecosystem Fund recycles fees `[L6]`.
- **Incidents:** no exploit of the Clanker contracts found in this scan **[fact, absence]**.
  **[inference]** Its narrow surface (deploy + fee contracts, no user funds at rest) is the
  reason.

## 4. Virtuals Protocol

- **What:** agent-token launchpad + agent economy on Base (and Solana); every agent gets a
  token paired with $VIRTUAL; Agent Commerce Protocol (ACP) standardizes agent-to-agent work
  (reference implementation of ERC-8183) **[fact]** `[L7][L8]`.
- **Custody:** evolved. Early ACP iterations were custodial ("private key at runtime"); ACP
  v2.0+ pushes **non-custodial** patterns — OS keychains or Privy-managed signing keys
  **[fact]** `[L7][L9]`.
- **Chains:** Base + Solana **[fact]** `[L7]`.
- **Revenue:** 100 $VIRTUAL creation fee per agent; 1% tax on agent-token trades; ACP service
  fees; revenue funds $VIRTUAL buyback-and-burn; veVIRTUALS staking for governance/airdrops
  **[fact]** `[L10]`.
- **Incidents:**
  - Jan 2025: Discord compromised via a moderator key breach + fake-site Google-ads phishing
    (social engineering, not protocol) **[fact]** `[L11][L12]`.
  - Jan 2025: researcher "Jinu" flagged a migration-blocking vulnerability; patched; bug bounty
    program announced **[fact]** `[L13]`.
  - Nov 2025: BasisOS "Agentic FoF" compromise (~$531K) via a buffer wallet adjacent to Virtuals
    treasury; Virtuals compensated users from treasury **[fact]** `[L14]`.
  - Immunefi bug bounty active **[fact]** `[L15]`.

## 5. ElizaOS

- **What:** the dominant **open-source** TypeScript framework for building autonomous agents
  (formerly ai16z) **[fact]** `[L16]`. Plugins give agents wallets on Solana/EVM — custody
  depends entirely on the deployer's plugin configuration **[inference]**.
- **Chains:** framework-agnostic (Solana, EVM via plugins) **[fact]** `[L16]`.
- **Revenue model:** framework is free/OSS; the economics lived in the **token**, not the
  software **[fact]** `[L17][L18]`.
- **Incidents / history:** AI16Z launched Oct 2024 (~$2.4–2.5B market cap peak Jan 2, 2025);
  rebranded to ElizaOS Jan 2025; migrated AI16Z→ELIZAOS 1:6 Nov 2025; class action
  _Pikabea v. Walters_ (S.D.N.Y., case 1:26-cv-03238) filed Apr 2026 alleging the "autonomous
  AI" fund was human-operated; treasury spent on settlement; founder declared the token "dead"
  Aug 4, 2026 while the OSS framework continues **[fact]** `[L17][L18][L19]`.
- **[inference]** Lesson: coupling a framework's credibility to a token's price ends in legal
  risk; Kryptr should keep product revenue (fees/subscriptions) cleanly separable from any
  future token.

## 6. Coinbase AgentKit

- **What:** open-source, framework-agnostic toolkit giving agents wallets + onchain actions
  (transfers, swaps, NFTs, contract deploy), with LangChain/Vercel AI SDK/OpenAI Agents SDK/MCP
  integrations **[fact]** `[L20]`.
- **Custody:** CDP **server wallets** — MPC keys in secure enclaves within Coinbase
  infrastructure; "never exposed to the agent or the LLM"; EIP-1193 API; programmable spend
  limits and gasless transactions **[fact]** `[L21]`.
- **Chains:** chain-agnostic EVM (Base first-class) + Solana **[fact]** `[L21]`.
- **Revenue:** OSS framework free; Coinbase monetizes via CDP platform usage and Base ecosystem
  growth; x402 (HTTP-402 stablecoin payments, now an independent foundation) is natively
  supported **[fact]** `[L20][L22]`.
- **Incidents:** none found involving AgentKit itself in this scan **[fact, absence]**.

## 7. Privy agentic wallets

- **What:** embedded-wallet/auth infrastructure; the rails under Bankr and many agent products;
  **acquired by Stripe on 2025-06-11** to power "agentic commerce" **[fact]** `[L23][L24]`.
- **Custody:** MPC-sharded embedded/server wallets; agent-oriented features: programmatic wallet
  creation, **policy engine** (spending limits, contract/chain allowlists, approval workflows)
  **[fact]** `[L24][L25]`.
- **Chains:** EVM + Solana (provider-level) **[fact]** `[L25]`.
- **Revenue:** B2B SaaS (wallet infra fees), now inside Stripe's payments stack incl. x402
  merchant flows **[fact]** `[L23][L24]`.
- **Incidents:** none found in this scan **[fact, absence]**.

## 8. Others (brief)

- **aixbt** (Base market-analyst agent): breached **2025-03-18** via its **admin dashboard**,
  not the model — attacker queued two malicious prompts; 55.5 ETH (~$106K) stolen from the
  Simulacrum wallet; token fell 15–20% **[fact]** `[L26][L27]`. **[inference]** Control planes
  (dashboards/API keys) are as attractive as wallets — Kryptr's backoffice must be threat-modeled
  as a vault surface.
- **Griffain** (Solana DeFAI "agent app store"): prominent 2025 DeFAI middleware; no incident
  found in this scan **[fact, absence]** `[L28]`.
- **Olas/Autonolas** (co-owned autonomous services, Safe-based accounts) and **GOAT SDK**
  (agent↔chain toolkit): infrastructure plays, no incidents found here **[fact, absence]**
  `[L28]`.
- **Robinhood Chain** (context for Kryptr Phase 1): Arbitrum-Orbit L2, mainnet **2026-07-01**,
  ETH gas, no native token, RWA/agentic-trading focus, launch partners incl. Uniswap/Chainlink
  **[fact]** `[S42][S43]`. Bankr made it the default launch chain **[fact]** `[S1]`.

---

## 9. One-page verdict — what Kryptr should copy / avoid

**COPY**

1. **Fee schedule fixed at launch** (Bankr `[S1]`; Kryptr's `TokenFeeSchedule` already models
   creator/LP/protocol/buyback shares). Transparent, immutable economics = trust.
2. **Policy at the action layer**: Privy's policy engine and Bankr's _post-incident_ guardrails
   (daily/per-tx USD caps, recipient allowlist **with cooldown**, disable-arbitrary-contracts,
   read-only-default API keys, IP allowlists) `[S4][L24]`. Make them **defaults**, not opt-ins.
3. **Clanker's narrow surface**: separate the launch contracts from anything holding user funds;
   small audited surface = fewer incident classes `[L1][L2]`.
4. **AgentKit's key isolation**: keys in enclaves, "never exposed to the agent or the LLM"
   `[L21]` — the signing service must not be reachable from the LLM/agent process.
5. **Virtuals' non-custodial ACP direction + paid bug bounty** `[L7][L15]`.
6. **Reimbursement posture**: Bankr's "reimbursing any and all lost funds" preserved the product
   `[S14][S17]` — Kryptr should decide its incident-liability policy _before_ incident #1.

**AVOID**

1. **Permission-by-asset** (Bankr Club NFT escalation `[S10]`): never derive capabilities from
   token/NFT ownership.
2. **Public social channels as control planes** (Grok→BankrBot `[S11]`): mentions/replies are
   untrusted data, never authenticated instructions.
3. **Auto-executing another agent's output** without re-authorization at your own gate `[S11]`.
4. **Unbounded default agency**: no caps/allowlists/HITL by default was the enabling condition
   of the May 2026 losses `[S10][S12]`.
5. **Token-first business design** (ElizaOS arc `[L17][L18]`): legal and reputational collapse
   risk; product revenue must stand alone.
6. **Admin dashboards without hard authz** (aixbt `[L26]`).

**[inference]** Strategic read: nobody yet combines (a) Bankr's product breadth with (b)
AgentKit-grade key isolation and (c) default-on policy gates. That combination **is** Kryptr's
opportunity — exactly the phased plan in `docs/ROADMAP.md`.

---

## 10. Source registry (landscape-only)

Bankr/incident sources S1–S17, S42–S45 are registered in `bankrbot-analysis.md` §9.

| ID  | Source (URL)                                                                                                                                                                                                                                 | Date / accessed     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| L1  | CoinMarketCap — "What is TokenBot (Clanker)?" — https://coinmarketcap.com/cmc-ai/tokenbot-2/what-is/                                                                                                                                         | accessed 2026-08-15 |
| L2  | BingX Learn — Clanker explainer — https://bingx.com/en/learn/article/what-is-tokenbot-clanker-ai-agent-launchpad-on-base-how-to-buy                                                                                                          | accessed 2026-08-15 |
| L3  | OKX Learn — Clanker background — https://www.okx.com/learn/what-is-tokenbot-clanker-exploring-the-autonomous-meme-coin-launchpad                                                                                                             | accessed 2026-08-15 |
| L4  | The Block — "Clanker team earns $13M in revenue…" — https://www.theblock.co/news/business/2025-04-04-clanker-team-earns-13-million-in-revenue-from-over-200000-tokens-on-base-in-just-five-months-349549                                     | 2025-04-04          |
| L5  | Cointelegraph (via TradingView) — "AI bot Clanker racks up $34M in swap fees" — https://www.tradingview.com/news/cointelegraph:258c043c5094b:0-ai-bot-clanker-racks-up-34m-in-swap-fees-launching-base-memecoins/                            | 2025                |
| L6  | crypto.news — "Clanker launches ecosystem fund…" — https://crypto.news/clanker-launches-ecosystem-fund-to-recycle-fees-into-creators-and-community/                                                                                          | 2025 (Oct/Nov)      |
| L7  | Virtuals — ACP overview — https://os.virtuals.io/acp/overview/                                                                                                                                                                               | accessed 2026-08-15 |
| L8  | Virtuals whitepaper — commerce layer deep dive — https://whitepaper.virtuals.io/about-virtuals/commerce-layer/technical-deep-dive                                                                                                            | accessed 2026-08-15 |
| L9  | Virtuals whitepaper — ACP changelogs — https://whitepaper.virtuals.io/acp/acp-changelogs                                                                                                                                                     | accessed 2026-08-15 |
| L10 | Virtuals fee model synthesis — see L7/L8 plus CoinMarketCap VIRTUAL pages (accessed 2026-08-15)                                                                                                                                              | 2026                |
| L11 | Cointelegraph (via TradingView) — "Virtuals Protocol Discord server hacked…" — https://www.tradingview.com/news/cointelegraph:9633f3ab5094b:0-virtuals-protocol-discord-server-hacked-fake-google-links-posted/                              | 2025-01             |
| L12 | Altcoin Buzz — "Virtuals Protocol suffers hack, team reacts swiftly" — https://www.altcoinbuzz.io/virtuals-protocol-suffers-hack-team-reacts-swiftly                                                                                         | 2025-01             |
| L13 | The Defiant — "Virtuals Protocol patches bug flagged by security researcher" — https://thedefiant.io/news/security/virtuals-protocol-patches-bug-flagged-by-security-researcher                                                              | 2025-01             |
| L14 | Binance Square — "Virtuals addresses Basis security incident with full compensation plan" — https://www.binance.com/en/square/post/11-24-2025-virtuals-protocol-addresses-basis-security-incident-with-full-compensation-plan-32807538619618 | 2025-11-24          |
| L15 | Immunefi — Virtuals bug bounty launch — https://immunefi.com/blog/customers/virtuals-protocol-bbp-launch/                                                                                                                                    | accessed 2026-08-15 |
| L16 | ElizaOS repository — https://github.com/elizaOS/eliza                                                                                                                                                                                        | accessed 2026-08-15 |
| L17 | Bitcoin.com News — "Eliza Labs founder declares ELIZAOS token dead after lawsuit" — https://news.bitcoin.com/crypto-news/eliza-labs-founder-declares-elizaos-ai-agent-token-dead-after-lawsuit/                                              | 2026-08             |
| L18 | CryptoBriefing (via TradingView) — "Eliza Labs founder sells $25M in ELIZAOS tokens…" — https://www.tradingview.com/news/cryptobriefing:5adb25072094b:0-eliza-labs-founder-sells-25m-in-elizaos-tokens-as-project-collapses-after-lawsuit/   | 2026-08             |
| L19 | KuCoin flash — "ElizaOS founder declares token dead" — https://www.kucoin.com/news/flash/elizaos-founder-declares-token-dead-calls-for-crypto-restart                                                                                        | 2026-08             |
| L20 | Coinbase AgentKit repository — https://github.com/coinbase/agentkit                                                                                                                                                                          | accessed 2026-08-15 |
| L21 | Coinbase Developer Platform — AgentKit/server wallets docs — https://docs.cdp.coinbase.com/agentkit/                                                                                                                                         | accessed 2026-08-15 |
| L22 | x402 Foundation — https://www.x402.org/                                                                                                                                                                                                      | accessed 2026-08-15 |
| L23 | Privy — "Announcing our acquisition by Stripe" — https://privy.io/blog/announcing-our-acquisition-by-stripe                                                                                                                                  | 2025-06-11          |
| L24 | SiliconAngle — "Stripe acquires Privy" — https://siliconangle.com/2025/06/11/stripe-acquires-crypto-wallet-infrastructure-provider-privy/                                                                                                    | 2025-06-11          |
| L25 | Privy — Agent wallets — https://www.privy.io/agent-wallets                                                                                                                                                                                   | accessed 2026-08-15 |
| L26 | AI Incident Database — aixbt breach — https://incidentdatabase.ai/cite/1003/                                                                                                                                                                 | 2025-03             |
| L27 | Decrypt — "AI influencer aixbt hacked for $100K in Ethereum" — https://decrypt.co/310510/aixbt-ai-influencer-hacked-100k-ethereum                                                                                                            | 2025-03-19          |
| L28 | DeFAI landscape synthesis (Griffain/Olas/GOAT/aixbt) — see L26/L27 and CoinMarketCap CMC-AI pages (accessed 2026-08-15)                                                                                                                      | 2025–2026           |
