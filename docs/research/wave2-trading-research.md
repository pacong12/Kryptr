# Wave 2 Trading Research — DEX aggregation, price feeds, swap threats, signing boundary

> **Author:** `web3` (Kryptr crew) · **Date:** 2026-08-16 · **Status:** citation backbone for the
> Wave 2 trading plan. Conductor rulings recorded in §1.
>
> Companion docs (now on `main`): `bankrbot-analysis.md`, `web3-agent-landscape.md`,
> `kryptr-threat-model.md`. Source tags `[W#]` resolve in the registry (§6); `[S#]`/`[L#]` tags
> resolve in the Wave 1 registries. Facts are labelled **[fact]**, reconstructions and analyst
> judgement **[inference]**, Kryptr requirements **[design]**. §4 follows the conventions of
> `kryptr-threat-model.md` (threat IDs continue from T10).

---

## 1. Decisions recorded by conductor (2026-08-16)

| Area             | Ruling                                                                                                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aggregation      | Reference adapter: **0x (Base)** behind `DexAggregatorPort`; **1inch** as backup; Robinhood Chain = **direct Uniswap adapter later**. Wave 2 ships `StaticMockDex` + contract suite only (no API keys yet).                                                      |
| Pricing          | Dev-default **CoinGecko** behind `PriceFeedPort` (adapter later, needs key); **prod path Chainlink**. Wave 2 ships `StaticPriceFeed`.                                                                                                                            |
| Gate mitigations | Server-side max slippage (`minBuyAmount`), quote TTL + one-time binding (`quoteId` on intent), expiry margin at evaluate. Router allowlist + approval revocation scheduled for the persistence/execution wave. MEV-protected RPC noted for when execution lands. |
| Signing boundary | Privy-style embedded wallet + our gate (policy **default-ON**) for Phase 1; ERC-4337 session keys as later migration; WalletConnect optional self-custody.                                                                                                       |

---

## 2. DEX aggregator APIs

### 2.1 Comparison **[fact, accessed 2026-08-16]**

| Property               | 0x Swap API                                                                                                                       | 1inch Swap API v6                                                                                     | OKX DEX API (v6)                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Auth                   | API key required (`0x-api-key` + `0x-version` headers) `[W1]`                                                                     | API key required (`Authorization: Bearer`) `[W4][W5]`                                                 | HMAC-SHA256 signed headers (`OK-ACCESS-KEY/SIGN/PASSPHRASE/TIMESTAMP`) `[W6]`      |
| Keyless access         | None — all requests require a key `[W1]`; AI-agent exception: x402 micropayment $0.01 USDC/request instead of registration `[W3]` | None — Developer (Free) plan auto-assigned on signup `[W4]`                                           | Some public data endpoints may be open; swap endpoints require HMAC auth `[W6]`    |
| Quote-only endpoint    | `GET /swap/v1/price` (price/quote without calldata execution) `[W1]`                                                              | `GET /swap/v6.0/{chain}/quote` `[W5]`                                                                 | `GET /api/v6/dex/aggregator/quote` (`chainIndex`, `slippagePercent` params) `[W8]` |
| Free-tier limits       | Tiered RPS envelopes (1 / 5 / 100 RPS by tier) `[W1]`                                                                             | 1 RPS, 100k calls/month (Startup: 10 RPS/1M; Professional: 20 RPS/3M; Business: 40 RPS/7M) `[W4][W5]` | Rate limits documented per project in developer portal `[W6]`                      |
| Base support           | Yes (all endpoints via `https://api.0x.org`) `[W1]`                                                                               | Yes (multi-chain) `[W5]`                                                                              | Yes, chainIndex `8453` `[W7][W8]`                                                  |
| Robinhood Chain (4663) | **Not listed** as of 2026-08-16 `[W1]`                                                                                            | **Not found** as of 2026-08-16 `[W5]`                                                                 | **Not found** as of 2026-08-16 `[W7]`                                              |
| SDK                    | TS SDK + dashboard-managed keys `[W1][W2]`                                                                                        | Developer portal `[W4]`                                                                               | `@okxweb3/okx-api` SDK simplifies HMAC signing `[W8]`                              |

**[fact]** Robinhood Chain context: mainnet 2026-07-01, Arbitrum-Orbit L2, EVM, ETH gas
`[S42][W10]`. Its native liquidity is Uniswap (v2/v3/v4 + UniswapX) plus venues such as Rialto;
no third-party aggregator API documents chain 4663 support yet `[W9][W10]`. **[inference]**
Aggregator coverage of a new chain typically lags mainnet by quarters; the direct-Uniswap adapter
is therefore the only realistic Wave 2–3 path for Robinhood Chain.

### 2.2 Recommendation **[design]**

1. **Reference adapter: 0x (Base).** Cleanest quote/swap split (`/price` vs `/quote`), Base is a
   first-class chain, tiered limits are documented, and the x402 pay-per-request mode
   (`$0.01 USDC`) matches Kryptr's agent-native future `[W1][W3]`.
2. **Backup adapter: 1inch.** Overlapping Base coverage; free 1 RPS is adequate for Phase 1
   volume; different failure domain (independent infra) `[W4][W5]`.
3. **Robinhood Chain: direct Uniswap adapter** (router calls via viem) behind the same port,
   added when Robinhood swaps enter scope `[W9][W10]`.
4. **Port shape [design]:** `DexAggregatorPort.quote(intent) → SwapQuote { quoteId, to, data,
minBuyAmount, expiresAt, source, observedAt }` and `.swap(...)`. Wave 2 ships
   `StaticMockDex` implementing the port with fixed quotes so the gate contract suite runs with
   zero external keys (per conductor ruling §1).
5. **API keys are config, never code** — when real adapters land (Wave 3+), keys live in secret
   storage with per-environment scoping (ORCHESTRA Security commandment #2).

---

## 3. Price feeds

### 3.1 Comparison **[fact, accessed 2026-08-16]**

| Property               | Chainlink                                                                                              | Pyth                                                                                                                                | CoinGecko                                                                                     | CMC                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Nature                 | On-chain Data Feeds + off-chain Data Streams (push/pull oracles) `[W9]`                                | First-party pull oracle; sub-second updates via Hermes `[W12][W13]`                                                                 | Off-chain market-data aggregator (simple price endpoints) `[W14]`                             | Off-chain market-data aggregator `[W28]`           |
| Key requirement        | On-chain feeds: no API key (read contract); Data Streams requires subscription/credentials `[W9]`      | **Key mandatory from 2026-08-18** (Pyth Core upgrade; register at Pyth Terminal, Bearer header; anonymous access ends) `[W12][W13]` | Keyless possible but IP-throttled; **Demo key recommended**: 100 calls/min, 10k/month `[W14]` | Key required; Basic tier ≈ 10k calls/month `[W28]` |
| Latency                | Heartbeat + deviation triggers; Data Streams low-latency `[W9]`                                        | Lowest (sub-second, pull) `[W12]`                                                                                                   | Highest (aggregated snapshots) `[W14]`                                                        | High (aggregated snapshots) `[W28]`                |
| Cost                   | Reads free; Streams paid `[W9]`                                                                        | Data plans (Starter/Pro) post-upgrade `[W13]`                                                                                       | Free demo tier; paid from $35/mo `[W15]`                                                      | Free Basic tier; paid above `[W28]`                |
| Robinhood Chain (4663) | **Official oracle of Robinhood Chain** — Data Feeds + Data Streams, incl. tokenized stocks `[W9][S42]` | **Not documented for Robinhood Chain** `[W9]`                                                                                       | Token metadata only (no chain concept) `[W14]`                                                | Same `[W28]`                                       |

### 3.2 Recommendation **[design]**

1. **Dev-default: CoinGecko** simple-price via `PriceFeedPort` — one demo key, broad token
   coverage, adequate for USD thresholds at dev time; treat values as indicative, not execution
   grade (higher latency, aggregated) `[W14][W15]`.
2. **Prod path: Chainlink** — the only oracle native to Robinhood Chain and mature on Base;
   Data Streams when low latency is needed `[W9][S42]`.
3. **Optional secondary (Base only): Pyth** for low-latency cross-checks; note the key mandate
   (2026-08-18) and that it is absent on Robinhood Chain `[W12][W13][W9]`.
4. **Port shape [design]:** `PriceFeedPort.getSpotUsd(token, chain) → { priceUsd, source,
observedAt }`; every consumer must honor `observedAt` staleness bounds (feeds T16, threat
   model T6). Wave 2 ships `StaticPriceFeed` per conductor ruling §1.

---

## 4. Swap-threat addendum (kryptr-threat-model.md conventions)

Continues `kryptr-threat-model.md` T1–T10. Severity judged for Phase 1/Wave 2 scope. Incident
basis cited per threat.

### T11 — Slippage manipulation / quote-execution divergence (HIGH)

The quote shows price P, but execution accepts worse fills (wide slippage tolerance, thin pools),
or a malicious parameter makes `minBuyAmount` ineffective. Sandwich extraction still costs retail
~$60M/yr even while declining `[W22]`.
**Mitigations [design]:** server-side max-slippage policy → quote carries `minBuyAmount`
(computed server-side, enforced on-chain); slippage ceiling per token-pair class in
`SecurityPolicy`; HITL consent screen displays worst-case output (HITL-2); reject pairs below a
liquidity threshold for agent-initiated swaps.

### T12 — MEV: sandwiching / front-running of the swap tx (MEDIUM on L2, HIGH if sent to public mempool)

Public-mempool swaps are sandwichable; rollups with private mempools are significantly safer
`[W22][W27]`. Base transactions are visible unless sent via protected channels `[W23]`.
**Mitigations [design]:** MEV-protected/private RPC on Base when execution lands (conductor
ruling §1); strict `minBuyAmount` (defense-in-depth, makes sandwich unprofitable); avoid
whale-sized single fills (split above threshold); Robinhood Chain's sequencer model reduces but
does not eliminate ordering risk **[inference]**.

### T13 — Stale-quote replay (HIGH)

An old quote (better rate, or expired approval context) is re-submitted or re-signed later;
quotes with no expiry are replayable artifacts.
**Mitigations [design] (adopted by conductor §1):** every quote carries `quoteId` + `expiresAt`;
the intent binds exactly one `quoteId` (one-time use); gate applies an **expiry margin at
evaluate time** (reject if `expiresAt - margin` already passed); signed calldata hash is bound to
the intent so quote/tx cannot be swapped after approval.

### T14 — Aggregator router compromise / composability abuse (HIGH impact, low likelihood)

Incident basis: **1inch Fusion v1** calldata-corruption exploit, ~$5M via deprecated resolver
contracts (2025-03) `[W16][W17]`; **0x Settler** composability attack, $128K — permissionless
arbitrary-call router used as intended to redirect funds, no contract bug (2025-04) `[W18][W19]`.
**Mitigations [design]:** router/`to` address **allowlist** (only pinned aggregator router
versions) — scheduled for the persistence/execution wave (ruling §1); **no arbitrary contract
calls** by agents (Bankr lesson, `[S4]`, threat model RC-4 row); pin router versions and require
gate policy change + review to add one; monitor router upgrade announcements (deprecated
contracts are the exploit surface `[W16]`).

### T15 — Lingering approvals to deprecated swap contracts (MEDIUM)

Incident basis: ParaSwap/Velora **AugustusV6** vulnerability (disclosed 2024-03) kept draining
wallets in 2025 that never revoked approvals `[W20][W21]`.
**Mitigations [design]:** prefer permit2/one-time approvals over unlimited approvals; **scheduled
approval revocation** (ruling §1); backoffice surfaces open approvals per wallet; alert when an
allowlisted router is deprecated upstream.

### T16 — Price-feed manipulation of USD thresholds (MEDIUM)

A poisoned/stale feed under- or over-values a swap so `approvalThresholdUsd`/`dailyCapUsd`
decisions are wrong (specialization of threat model T6 for swaps).
**Mitigations [design]:** `PriceFeedPort` values carry `source` + `observedAt`; gate rejects
valuations older than a freshness bound (vault's "unknown price → needs_human_approval" posture,
ack recorded in `docs/tasks/web3.md`); cross-check CoinGecko vs on-chain Chainlink read when
both available before large swaps **[inference: dual-source check is cheap on Base]**.

---

## 5. Signing boundary decision record

**[fact]** Options compared (details + custody mechanics in Wave 1 docs §3/§7):

- **Privy-style embedded/server wallets:** MPC + TEE key handling, policy engine (spend limits,
  allowlists, approval workflows) enforced off-chain/in-platform; fastest to ship; Bankr runs on
  Privy — its incidents stemmed from **policy being effectively off by default**, not from Privy
  key custody `[S5][S4][L24][L25]`.
- **ERC-4337 smart accounts + session keys:** spend limits/allowlists encoded in on-chain
  validation logic (ERC-7579 modular session-key modules), enforceable regardless of agent state;
  survives prompt injection and agent compromise by construction `[W24][W25]`. Heavier build:
  bundlers, entrypoint, account factories, module audits.
- **WalletConnect:** connects a user's existing self-custody wallet; requires the wallet to be
  online and interactively approving; unsuitable for autonomous server-side agents **[inference]**.

**[design] Recommendation (adopted by conductor §1):**

1. **Phase 1:** Privy-style embedded wallet **plus** Kryptr's own gate as the second,
   authoritative policy layer — policy engine default-ON (caps, allowlists, HITL thresholds).
   The Bankr lesson (`bankrbot-analysis.md` RC-1/RC-4) is that the gate must never be optional.
2. **Later migration:** ERC-4337 session keys so policy is enforced **on-chain** (trust-minimized
   even if our backend is compromised). The industry pattern is hybrid: platform signer (Privy/
   CDP-class) driving a 4337 smart account `[W24][W25][L25]`.
3. **WalletConnect** remains an optional connect mode for self-custody users (Phase 1 "connect
   wallet" requirement is satisfied by it), never the automation path.

---

## 6. Source registry

Wave 1 tags `[S#]`/`[L#]` resolve in `bankrbot-analysis.md` §9 / `web3-agent-landscape.md` §10.

| ID  | Source (URL)                                                                                                                                                                                                                 | Date / accessed     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| W1  | 0x — API overview (auth, tiers, rate limits) — https://docs.0x.org/api-reference/api-overview                                                                                                                                | accessed 2026-08-16 |
| W2  | 0x — developer docs home — https://docs.0x.org/                                                                                                                                                                              | accessed 2026-08-16 |
| W3  | KuCoin News — "0x Protocol opens swap API to AI agents for $0.01 per request in USDC" — https://www.kucoin.com/news/flash/0x-protocol-opens-swap-api-to-ai-agents-for-0-01-per-request-in-usdc                               | 2026                |
| W4  | 1inch — API rate limits help article — https://help.1inch.com/en/articles/8703748-how-to-increase-your-1inch-api-rate-limits                                                                                                 | accessed 2026-08-16 |
| W5  | 1inch — pricing & plans — https://business.1inch.com/pricing                                                                                                                                                                 | accessed 2026-08-16 |
| W6  | OKX — DEX API access & usage (HMAC headers) — https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage                                                                                                              | accessed 2026-08-16 |
| W7  | OKX — DEX supported chains — https://web3.okx.com/onchainos/dev-docs/home/supported-chain                                                                                                                                    | accessed 2026-08-16 |
| W8  | OKX — DEX quote endpoint — https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote                                                                                                                                       | accessed 2026-08-16 |
| W9  | Robinhood Chain docs — Oracles and price feeds — https://docs.robinhood.com/chain/oracles-and-price-feeds/                                                                                                                   | accessed 2026-08-16 |
| W10 | Robinhood Chain docs — chain home — https://docs.robinhood.com/chain/                                                                                                                                                        | accessed 2026-08-16 |
| W12 | Pyth — Core upgrade preparation (Hermes key mandate) — https://docs.pyth.network/price-feeds/core/upgrade/preparing                                                                                                          | accessed 2026-08-16 |
| W13 | Pyth — "The Pyth Core Upgrade" blog — https://www.pyth.network/blog/the-pyth-core-upgrade                                                                                                                                    | accessed 2026-08-16 |
| W14 | CoinGecko — errors & rate limits — https://docs.coingecko.com/docs/errors-and-rate-limits                                                                                                                                    | accessed 2026-08-16 |
| W15 | CoinGecko — API pricing — https://www.coingecko.com/en/api/pricing                                                                                                                                                           | accessed 2026-08-16 |
| W16 | Halborn — "Explained: The 1inch Hack (March 2025)" — https://www.halborn.com/blog/post/explained-the-1inch-hack-march-2025                                                                                                   | 2025-03             |
| W17 | Olympix AI — "The 1inch Fusion v1 Exploit: calldata corruption drained $5M" — https://olympixai.medium.com/the-1inch-fusion-v1-exploit-how-a-calldata-corruption-vulnerability-drained-5-million-d5667c83fc2a                | 2025-03             |
| W18 | Blockaid — "Composability attack deep dive: how an attacker stole $128K without an exploit" (0x Settler) — https://www.blockaid.io/blog/composability-attack-deep-dive-how-an-attacker-stole-128k-without-an-exploit         | 2025-04             |
| W19 | Nominis — April 2025 monthly report — https://www.nominis.io/post/april-2025-monthly-report                                                                                                                                  | 2025                |
| W20 | Velora (ParaSwap) — "Post-mortem: Augustus v6 vulnerability of March 20th 2024" — https://veloradex.medium.com/post-mortem-augustus-v6-vulnerability-of-march-20th-2024-5df663a4bf01                                         | 2024-03             |
| W21 | Velora governance — refund request, AugustusV6 drains (October 2025) — https://gov.velora.xyz/t/refund-request-funds-stolen-due-to-augustusv6-vulnerability-october-2025/2247                                                | 2025-10             |
| W22 | Cointelegraph (via TradingView) — EigenPhi data: sandwich attacks waning — https://www.tradingview.com/news/cointelegraph:fa12ba092094b:0-exclusive-data-from-eigenphi-reveals-that-sandwich-attacks-on-ethereum-have-waned/ | 2025                |
| W23 | CoW Protocol — sandwich attack protection guide — https://cow.fi/learn/what-is-a-sandwich-attack-and-how-can-you-protect-yourself                                                                                            | accessed 2026-08-16 |
| W24 | ERC-4337 account abstraction (eth-infinitism) — https://github.com/eth-infinitism/account-abstraction ; spec https://eips.ethereum.org/EIPS/eip-4337                                                                         | accessed 2026-08-16 |
| W25 | EIP-7579 — minimal modular smart accounts — https://eips.ethereum.org/EIPS/eip-7579                                                                                                                                          | accessed 2026-08-16 |
| W27 | MEV on rollups with private mempools (research note) — https://arxiv.org/pdf/2601.19570                                                                                                                                      | 2026                |
| W28 | CoinMarketCap API docs (Basic tier) — https://docs.coinmarketcap.com/                                                                                                                                                        | accessed 2026-08-16 |
