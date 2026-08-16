# Wave 4 Oracle Research — server-side trigger prices for order automation on Base

> **Author:** `web3` (Kryptr crew) · **Date:** 2026-08-16 · **Status:** research input for the
> wave-4 contract freeze (order automation). Companion docs on `main`:
> `kryptr-threat-model.md` (T-series), `wave2-trading-research.md` (ports),
> `wave3-integration-research.md` (RPC/explorer infra). `[O#]` = registry (§7); `[W#]` resolve
> in `wave3-integration-research.md` §6; `[S#]` in `bankrbot-analysis.md` §9. Facts **[fact]**,
> analyst judgement **[inference]**, Kryptr requirements **[design]**.

---

## 1. Bottom line

**[design]** For server-side limit/DCA triggers, Kryptr should optimize for **security over
latency**: a trigger that fires late costs an opportunity; a trigger fired by a manipulated
print costs real money at execution. Recommended stack:

1. **Primary trigger source: Chainlink Data Feeds (on-chain, Base)** — keyless, free to read,
   multi-node aggregated, same oracle family officially used by Robinhood Chain `[O2][O3][W9]`.
2. **Sanity/hint source: CoinGecko (dev) / Chainlink Data Streams (prod, optional)** — only as
   a deviation cross-check behind bounds, never as sole trigger `[O5][W14]`.
3. **Pyth Hermes: excluded from the default** — as of 2026-08-16 key enforcement lands
   2026-08-18 and the entry tier is **$500/month**; borrow its confidence-interval concept
   instead `[O12][O13]`.
4. Execution-side protection is the real backstop: every trigger produces a **fresh
   TransactionIntent through the full gate**, with re-quoted `minBuyAmount` — a false trigger
   can never force a bad fill (see §4 precedents).

---

## 2. The three options

### 2.1 Chainlink Data Feeds (on-chain push oracle) **[fact]**

- **Shape:** Solidity `AggregatorV3Interface.latestRoundData()` on a per-feed **proxy**
  contract → `(roundId, answer, startedAt, updatedAt, answeredInRound)`; Kryptr reads it with
  viem `eth_call` / Multicall3 batch — no HTTP API at all `[O2][O4]`.
- **Auth:** none. Reading is keyless and free (only RPC cost); feed updates are sponsored by
  the ecosystem `[O3]`.
- **Freshness:** update on **deviation threshold OR heartbeat**, whichever first. Base
  ETH/USD **verified on-chain 2026-08-16** (proxy
  `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70`; `latestRoundData()`/`decimals()=8` read via
  public RPC `mainnet.base.org`, keyless): 18 consecutive rounds (26691–26708, 01:09–06:27
  UTC) show a heartbeat of **≈1230 s (~20.5 min)** during a quiet window, with early updates
  exactly when |Δprice| ≥ ~16 bps — consistent with deviation **0.15%** `[O21][O22]`.
  Correction: an earlier draft recorded "heartbeat ≈ 12h24m" from the directory UI; that was
  a misread, superseded by this measurement. Heartbeats vary per feed and must be verified
  per pair at implementation; in volatile markets the deviation trigger dominates `[O1][O2]`.
- **Stale-data hygiene:** check `updatedAt` against your own maxAge; always use proxy
  addresses `[O2][O4]`.
- **Chains:** Base fully covered `[O1][O4]`; same oracle family is Robinhood Chain's official
  oracle (incl. stock tokens) `[W9]`.
- **Trigger suitability:** latency is coarse (minutes-scale worst case between updates), but
  the signal is the hardest to spoof of the three: paid node operators aggregate many venues
  on-chain. **[inference]** For limit orders whose trigger tolerance is typically ≥0.5%, this
  is the right security/latency trade.

### 2.2 Chainlink Data Streams (pull-based low-latency reports) **[fact]**

- **Shape:** REST/WS pull of signed **reports** (mark price, liquidity-weighted bid/ask,
  market status) fetched off-chain when needed and verifiable on-chain via the network's
  Verifier proxy `[O5][O7][O9]`.
- **Auth:** **Client ID + Client Secret**, HMAC-signed requests: `Authorization` (client id) +
  `X-Authorization-Timestamp` (strict 5-second window → NTP-sync required) +
  `X-Authorization-Signature-SHA256`; official Go/Rust/TS SDKs handle signing `[O6][O7][O8]`.
- **Latency:** sub-second delivery `[O9]`.
- **Pricing/rate limits:** self-serve signup via Chainlink platform; limits and pricing are
  plan/tier-based through the platform coordinator (no published free tier) `[O6][O11]`.
- **Robinhood relevance:** Streams cover tokenized U.S. equities 24/5 `[O9][O10]` — the only
  low-latency product aligned with Robinhood Chain's stock tokens.
- **Trigger suitability:** excellent latency + signed reports; cost/credentials and plan
  opacity make it a **prod-upgrade**, not the dev default.

### 2.3 Pyth Hermes (pull oracle, first-party publishers) **[fact]**

- **Shape:** REST (`/v2/updates/price/...`) returning price **+ confidence interval** per
  feed; confidence width encodes publisher disagreement/volatility — a usable risk signal
  `[O14]`.
- **Status change (verified):** from **2026-08-18 all Hermes access requires a Pyth API key**
  (Bearer header); existing integrations auto-redirect to the upgraded backend; register at
  Pyth Terminal `[O12]`.
- **Pricing:** **Starter $500/month** (crypto, NAV, indices, 1-second updates); Pro plans
  $2,500–$10,000/month by asset class `[O13]`.
- **Rate limits:** 10 requests / 10 seconds per IP (TradingView endpoint 90/10s); 429 then a
  60-second cooldown `[O12][O14]`.
- **Chains:** not documented for Robinhood Chain `[W9]`.
- **Trigger suitability:** technically strong (sub-second + confidence), but the paywall
  landed exactly as wave 4 starts. **[design]** Exclude from defaults; revisit if Kryptr pays
  for oracle infrastructure.

### 2.4 Comparison

| Property                | Data Feeds (on-chain)             | Data Streams                      | Pyth Hermes                              |
| ----------------------- | --------------------------------- | --------------------------------- | ---------------------------------------- |
| Shape                   | `latestRoundData()` eth_call      | REST/WS signed reports            | REST price updates                       |
| Auth                    | none (keyless) `[O3]`             | client id + HMAC secret `[O7]`    | Bearer key, mandatory 2026-08-18 `[O12]` |
| Free tier               | yes (reads free) `[O3]`           | no published free tier `[O6]`     | no — $500/mo Starter `[O13]`             |
| Latency                 | deviation/heartbeat coarse `[O1]` | sub-second `[O9]`                 | sub-second (1s Starter) `[O13]`          |
| Rate limits             | RPC-bound only                    | plan-based `[O6]`                 | 10 req/10s `[O14]`                       |
| Manipulation resistance | multi-node on-chain aggregate     | signed reports, on-chain verifier | first-party + confidence `[O14]`         |
| Robinhood Chain         | official oracle family `[W9]`     | equities streams relevant `[O10]` | not present `[W9]`                       |

---

## 3. Trigger-price threat surface and mitigations

Threats extend `kryptr-threat-model.md` T16 (price-feed manipulation of thresholds). Proposed
slots for the next revision:

### T22 — Wick / flash-print trigger manipulation (HIGH)

A brief, manipulated print (thin-venue wick, flash-loan-driven spot move) crosses the trigger
and fires an order. Precedent: **Mango Markets (Oct 2022, ~$110–116M)** — collateral valued on
thin-venue spot prices was inflated with flash-loan-funded buys; the protocol executed
"correctly" on false inputs `[O19]`.
**Mitigations [design]:**

1. Trigger source = on-chain Data Feeds, not single-venue spot (§2.1).
2. **Deviation bounds:** if `|trigger price − sanity source| > X%`, treat as manipulation →
   no trigger, alert (circuit breaker).
3. **TWAP window option** for large orders: time-weighted average over N minutes makes
   manipulation require sustaining the distortion for the whole window (Uniswap v3
   cumulative-oracle pattern) `[O18]`. Note the lag trade-off: TWAP is a lagging indicator in
   genuine crashes `[O18]`.
4. **Uncertainty filter:** if a confidence-style signal is available (Pyth conf, Streams
   bid/ask spread width), widen-or-skip when uncertainty spikes `[O14]`.
5. **Execution backstop:** trigger fires a fresh intent → gate re-quotes → `minBuyAmount`
   bounds the fill (§4). The trigger is a _proposal_, never an authorization.

### T23 — Stale-feed trigger (MEDIUM)

A heartbeat gap leaves `updatedAt` far behind; triggering on stale data executes at the wrong
level.
**Mitigations [design]:** per-feed `maxAge` policy (fail-closed: stale → no trigger + health
signal, consistent with vault's unknown-price posture); backoffice shows last-update age per
feed (deck health-card pattern).

### T24 — Trigger-oracle outage / dependency (MEDIUM)

Single-source dependency (RPC down, feed deprecated).
**Mitigations [design]:** primary + sanity source are independent systems (on-chain feed vs
off-chain API); RPC fallback chain in `ChainConfig` (wave 3 §2); order state survives oracle
outage (worker persistence semantics are vault's domain, `wave4-worker-design.md`).

---

## 4. Safe DCA / limit-order architecture precedents

**[fact]** How proven systems separate _triggering_ from _authorization_:

- **CoW Protocol:** users sign off-chain intents (EIP-712) with tokens, amounts, and **minimum
  acceptable price**; bonded solvers settle batches at **uniform clearing prices** (ordering
  irrelevant → sandwich-neutral), matching peer-to-peer first; limit orders are persistent
  intents executed by solvers when the market reaches the user's bound `[O15]`.
- **1inch Fusion:** signed off-chain orders; whitelisted, staked **resolvers** compete in a
  Dutch auction starting favorable to the user and decaying; execution is private (no public
  mempool exposure) and constrained by the signed order `[O16]`.
- **Chainlink Automation:** the on-chain alternative — registered upkeeps with `checkUpkeep`
  conditions executed by decentralized nodes, paid per execution in LINK (gas + operator
  premium + overhead); useful as a comparison point for cost/SLA of server-side polling
  `[O17]`.
- **Bankr:** scheduled trading (limit/stop/DCA/TWAP) runs as automations with per-message/per-
  intent caps — and the May 2026 incidents showed automation **amplifies** excessive agency
  when the gate is weak `[S2][bankrbot-analysis.md §6]`.

**[design]** Kryptr synthesis (for vault's worker design):

1. **Order = standing intent template; trigger = proposal; execution = fresh
   `TransactionIntent`** through `EvaluateIntentUseCase` with current quote, caps, allowlists,
   kill switch — exactly the wave-4 ruling already communicated to vault.
2. Limit price is the **worst acceptable bound**, enforced on-chain as `minBuyAmount` at
   execution time (0x pattern, wave 2 §1.4); surplus accrues to the user, never to the worker.
3. No pre-authorization of series: N scheduled fills = N gated intents (Bankr lesson).
4. Worker never sees keys; `SignerPort` stays dry-run until the signing-boundary wave
   (ROADMAP posture).

---

## 5. Recommended trigger pipeline **[design]**

```text
[Scheduler ticks order book]
   → read primary price: Chainlink Data Feed proxy via viem/Multicall3 [O2][O4]
   → freshness check: updatedAt within per-feed maxAge (stale → skip + health flag)   (T23)
   → sanity check: |primary − hint source| ≤ deviation bound (else circuit-break)     (T22)
   → (optional) TWAP window for large orders                                          (T22)
   → trigger condition met? → mint fresh TransactionIntent (origin=worker, order id)
   → gate: EvaluateIntentUseCase (caps, allowlists, kill switch, HITL thresholds)
   → quote via DexAggregatorPort → minBuyAmount from limit bound
   → SignerPort (dry-run in wave 4) → audit log (source, observedAt, decision)
```

Open items for the contract freeze: per-feed `maxAge`/deviation defaults; whether TWAP is a
per-order flag; hint-source selection (CoinGecko dev vs Streams prod); trigger polling
cadence vs RPC rate budgets (wave 3 §2 limits).

---

## 6. Sources

Registry (§7) count: 22 entries (`O1`–`O22`) plus cross-references `[W#]`/`[S#]`.

## 7. Source registry

| ID  | Source (URL)                                                                                                                                                                                                 | Date / accessed     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| O1  | Chainlink — ETH/USD feed directory (Base) — https://data.chain.link/feeds/base/base/eth-usd                                                                                                                  | accessed 2026-08-16 |
| O2  | Chainlink — Data Feeds docs — https://docs.chain.link/data-feeds                                                                                                                                             | accessed 2026-08-16 |
| O3  | Chainlink — Data Feeds getting started (keyless/free reads) — https://docs.chain.link/data-feeds/getting-started                                                                                             | accessed 2026-08-16 |
| O4  | Chainlink — feed contract addresses — https://docs.chain.link/data-feeds/price-feeds/addresses                                                                                                               | accessed 2026-08-16 |
| O5  | Chainlink — Data Streams docs — https://docs.chain.link/data-streams                                                                                                                                         | accessed 2026-08-16 |
| O6  | Chainlink — Data Streams authentication — https://docs.chain.link/data-streams/reference/data-streams-api/authentication                                                                                     | accessed 2026-08-16 |
| O7  | Chainlink — Data Streams interface API (HMAC headers) — https://docs.chain.link/data-streams/reference/data-streams-api/interface-api                                                                        | accessed 2026-08-16 |
| O8  | Chainlink — Data Streams JS auth examples — https://docs.chain.link/data-streams/reference/data-streams-api/authentication/javascript-examples                                                               | accessed 2026-08-16 |
| O9  | Chainlink — Data Streams product page (sub-second, report contents) — https://chain.link/data-streams                                                                                                        | accessed 2026-08-16 |
| O10 | The Block — Chainlink 24/5 onchain Data Streams for tokenized US stocks/ETFs — https://www.theblock.co/news/business/2026-01-20-chainlink-24-5-onchain-data-streams-tokenized-us-stocks-etfs-386387          | 2026-01-20          |
| O11 | smartcontractkit — Data Streams demo (credentials, verification) — https://github.com/smartcontractkit/datastreams-demo                                                                                      | accessed 2026-08-16 |
| O12 | Pyth — Core upgrade preparation (key mandate, rate limits) — https://docs.pyth.network/price-feeds/core/upgrade/preparing                                                                                    | accessed 2026-08-16 |
| O13 | Pyth — "The Pyth Core Upgrade" (Starter $500/mo, Pro tiers) — https://www.pyth.network/blog/the-pyth-core-upgrade                                                                                            | accessed 2026-08-16 |
| O14 | Pyth — Hermes (confidence intervals, API) — https://docs.pyth.network/price-feeds/core/how-pyth-works/hermes                                                                                                 | accessed 2026-08-16 |
| O15 | CoW Protocol — docs (intents, batch auctions, solvers, limit orders) — https://docs.cow.fi/                                                                                                                  | accessed 2026-08-16 |
| O16 | 1inch — developer docs (Fusion/limit order protocol, resolvers) — https://docs.1inch.io/                                                                                                                     | accessed 2026-08-16 |
| O17 | Chainlink — Automation docs (upkeep pricing model) — https://docs.chain.link/chain-automation                                                                                                                | accessed 2026-08-16 |
| O18 | Uniswap — v3 oracle (TWAP cumulative price) — https://docs.uniswap.org/concepts/protocol/oracle                                                                                                              | accessed 2026-08-16 |
| O19 | rekt.news — Mango Markets post-mortem (~$116M oracle manipulation) — https://rekt.news/mango-markets-rekt/                                                                                                   | 2022-10             |
| O20 | Internal — Bankr scheduled-trading surface + May 2026 incident analysis — `bankrbot-analysis.md` §2.4/§6 ([S2] et al.)                                                                                       | 2026-08-15          |
| O21 | On-chain verification — Chainlink ETH/USD Base proxy `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70`: `latestRoundData()`/`decimals()`/`getTimestamp()` reads via public RPC https://mainnet.base.org (keyless) | accessed 2026-08-16 |
| O22 | On-chain round scan — same proxy/RPC, rounds 26691–26708 (2026-08-16 01:09–06:27 UTC): gaps 1228–1232 s (heartbeat ≈1230 s); early updates only at price moves ≥ ~16 bps (deviation ≈0.15%)                  | accessed 2026-08-16 |
