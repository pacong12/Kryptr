# Wave 3 Integration Research — 0x API shapes, RPC/explorer infrastructure, Privy surface, ERC-4337 bundlers

> **Author:** `web3` (Kryptr crew) · **Date:** 2026-08-16 · **Status:** adopted wholesale by
> conductor ruling 2026-08-16 (Mission A); citation backbone for the wave-3 integration plan.
>
> Companion docs (on `main`): `wave2-trading-research.md` (ports & rulings),
> `kryptr-threat-model.md` (gate conventions). `[W#]` tags resolve in
> `wave2-trading-research.md` §6; `[S#]` in `bankrbot-analysis.md` §9. `[V#]` = new registry
> (§6 below). Facts **[fact]**, analyst judgement **[inference]**, Kryptr requirements
> **[design]**.

---

## 1. 0x Swap API — exact shapes (v2, not v1)

### 1.1 Version correction **[fact]**

**0x API v1 was sunset on 2025-04-11.** The live endpoints are `/swap/v2/price` and
`/swap/v2/quote` under `https://api.0x.org`; structure is similar to v1 with updated base URL /
auth patterns `[V1][V3]`. The Wave 2 plan's references to `/swap/v1/*` must be read as v2.

### 1.2 Auth **[fact]**

Every request requires the `0x-api-key` header (keys from the 0x dashboard) and the
`0x-version` header; HTTPS only; Base is addressed via the `chainId=8453` request parameter
`[W1][V1][V4]`. AI-agent alternative: x402 micropayment of $0.01 USDC per request in lieu of a
registered key `[W3]`.

### 1.3 Error behaviour without a key **[fact]**

| Condition                                 | Result                                                |
| ----------------------------------------- | ----------------------------------------------------- |
| Missing/invalid `0x-api-key`              | **401 Unauthorized** `[V2]`                           |
| Valid key, product (Swap API) not enabled | **403 Forbidden** `[V2]`                              |
| Missing `0x-version`                      | request rejected or stricter rate limiting `[W1][V4]` |
| Over tier RPS envelope (1/5/100)          | 429; quotes also carry a freshness window `[W1]`      |

### 1.4 Endpoint semantics & field mapping **[fact, mapped [design]]**

- `/swap/v2/price` — read-only discovery: pricing incl. `buyAmount`/`sellAmount`, **no
  executable transaction object** `[V1][V3]`.
- `/swap/v2/quote` — everything in price **plus** the executable `transaction` object
  (`to`, `data`, `gas`, `gasPrice`, `value`), `allowanceTarget`, and a unique quote id
  `[V1][V3]`.

Mapping to our `SwapQuote` (wave 2 §2.2 port shape):

| 0x field                                  | Kryptr `SwapQuote` field         | Notes                                                                                                              |
| ----------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `buyAmount` / `sellAmount` (atomic)       | `amountOut` / `amountIn`         | Strings, no precision loss (`wallet.ts` convention).                                                               |
| `transaction.to` / `transaction.data`     | `to` / `data`                    | `to` must be validated against the **router allowlist** (threat model T14).                                        |
| `slippageBps` request param               | drives `minBuyAmount`            | 0x embeds min-buy into calldata; **gate must recompute from policy, never trust the response** **[design]** (T11). |
| `allowanceTarget`                         | approval target                  | One-time approvals preferred (T15).                                                                                |
| `fees {integratorFee, zeroExFee, gasFee}` | fee breakdown for consent screen | Display in HITL-2 consent.                                                                                         |
| `route.fills[{source, proportion}]`       | `route`                          | UI transparency; no execution trust.                                                                               |
| quote id / `decodedUniqueId`              | `quoteId`                        | One-time binding + TTL per wave-2 ruling (T13).                                                                    |
| (absent)                                  | `expiresAt`                      | **[design]** 0x has no explicit expiry field → gate assigns TTL from `observedAt` + policy window.                 |

---

## 2. Base public RPCs

**[fact]** `https://mainnet.base.org` is free, explicitly rate-limited, with no SLA and official
guidance that it is **not for production** `[V5]`.

Keyless alternatives for dev: PublicNode `https://base-rpc.publicnode.com`, Ankr public
endpoints `[V6]`. Keyed free tiers: Alchemy ~30M compute units/mo, Infura ~100k requests/day,
dRPC ~210M CU/30d, QuickNode ~10M credits/mo `[V6]`.

**Multicall3 on Base:** `0xcA11bde05977b3631167028862bE2a173976CA11` — verified on Basescan;
deterministic deployment present on virtually all EVM chains, so expect the same address on
Robinhood Chain `[V7][V8]`. **[design]** Use `aggregate3` for batched `balanceOf`/holdings reads
(one RPC call per refresh instead of per token).

**[design]** RPC strategy: dev = `mainnet.base.org` with PublicNode fallback; prod = keyed
provider + automatic fallback chain in `ChainConfig` (`chains.ts`); never a single point of
failure for reads (threat model T6/T10 fail-closed posture).

---

## 3. Blockscout instances & Robinhood Chain explorer

### 3.1 Base **[fact]**

Instance: `https://base.blockscout.com`. API v2 paths: `GET /api/v2/transactions/{hash}`,
`GET /api/v2/addresses/{address_hash}`, `GET /api/v2/addresses/{address_hash}/tokens`,
`GET /api/v2/search?q=` `[V9]`. Rate limits: keyless public access ~**3 req/min** (IP-throttled;
per-instance API being phased out); Blockscout **PRO API** is keyed, credit-based, free plan
5 RPS — recommended for anything recurring `[V10][V11]`.

**[design]** Kryptr usage: dev-time tx/address lookups via the public instance (low volume is
fine); the backoffice's live views must use PRO API (or our own RPC + indexer) once query
frequency exceeds ~3/min.

### 3.2 Robinhood Chain (4663) **[fact]**

- **Explorer: Blockscout at `https://robinhoodchain.blockscout.com`** — official explorer, same
  API v2 family as Base `[V12][V13]`.
- **Official RPC: `https://rpc.mainnet.gateway.robinhood.com`** `[V12][V14]`.
  **Warning:** `rpc.robinhood.com` is **not** official — Robinhood docs flag lookalike
  "Robinhood EVM"/"Axis" branding; always verify chainId 4663 + URL `[V12]`.
- Production RPC providers already serve it (e.g., Alchemy `robinhood-mainnet`) `[V13][V15]`.

**[inference]** Same Blockscout software on both chains means one explorer-client abstraction
covers Base + Robinhood Chain with only base-URL differences — cheap win for the balances/tx
queries ROADMAP assigns to Blockscout.

---

## 4. Privy agent/server wallets — integration surface (SignerPort design input)

**[fact]** Server-side SDK: `@privy-io/node`; `new PrivyClient({ appId, appSecret })`;
`privy.wallets().create({ chain_type: 'ethereum' })`, `.sign()`, and transaction methods;
credentials are `PRIVY_APP_ID` + `PRIVY_APP_SECRET` `[V16]`.

**[fact]** Policy engine: rules (spend limits, recipient/contract allowlists, approval
workflows) are defined via dashboard or REST/SDK and attached to wallets as `policy_ids`;
enforcement happens **inside the secure enclave at sign time** — signing requests violating a
policy are rejected by Privy itself `[V16][V17]`.

**[design]** Implications for vault's `SignerPort`:

1. The port can stay **thin** — `sign(request) → approved | rejected(reason)` — because Privy
   provides a second, independent enforcement layer.
2. Kryptr's gate remains the **authoritative** layer (Bankr lesson: platform policy alone was
   misconfigured/absent by default — `bankrbot-analysis.md` RC-1/RC-4).
3. Credentials: `PRIVY_APP_SECRET` lives only in secret storage (commandment #2); per-environment
   app ids so dev can never sign on prod wallets.
4. Policy mapping: our `SecurityPolicy` fields (`dailyCapUsd`, `allowedRecipients`,
   `approvalThresholdUsd`) should be mirrored into Privy policies where expressible, giving
   defense-in-depth even if our gate has a bug.
5. Docs to anchor implementation: server-wallets overview + policies pages `[V16][V17]`.

---

## 5. ERC-4337 bundlers on Base (session-key migration path)

**[fact]** Pimlico is the reference ERC-4337 bundler with Base support, plus verifying and
ERC-20 paymasters for gas sponsorship; integration runs through `permissionless.js`
(`SmartAccountClient`, entrypoint v0.6/v0.7) with the bundler transport pointed at a Pimlico
endpoint. A Privy + permissionless.js starter repo exists, demonstrating the pattern of a
server-managed signer producing UserOperations `[V18][V19][V20]`. **[inference]** Alternatives
(Alchemy/QuickNode bundlers, Biconomy) exist but Pimlico is the best-documented fit for our
hybrid: Privy server wallet as the UserOp signer → Pimlico bundler on Base → on-chain session-key
policy (ERC-7579 modules) as the final trust boundary per wave-2 §5.

---

## 6. Source registry

`[W#]` resolve in `wave2-trading-research.md` §6; `[S#]` in `bankrbot-analysis.md` §9.

| ID  | Source (URL)                                                                                                                                                                             | Date / accessed     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| V1  | 0x — Swap API quickstart — https://docs.0x.org/docs/introduction/quickstart/swap-tokens-with-0x-swap-api                                                                                 | accessed 2026-08-16 |
| V2  | 0x — API overview & auth errors — https://docs.0x.org/api-reference/api-overview                                                                                                         | accessed 2026-08-16 |
| V3  | QuickNode — efficient token swaps with 0x (v1 sunset note, price vs quote) — https://www.quicknode.com/guides/quicknode-products/swap-api/efficient-token-swaps-with-smart-order-routing | accessed 2026-08-16 |
| V4  | 0x — getting started — https://docs.0x.org/docs/introduction/quickstart/getting-started                                                                                                  | accessed 2026-08-16 |
| V5  | Base docs — network information / public RPC guidance — https://docs.base.org                                                                                                            | accessed 2026-08-16 |
| V6  | Base RPC provider landscape (public + free tiers) — synthesis of provider docs (Alchemy/Infura/dRPC/QuickNode/PublicNode/Ankr), accessed 2026-08-16                                      | 2026                |
| V7  | Basescan — Multicall3 on Base — https://basescan.org/address/0xcA11bde05977b3631167028862bE2a173976CA11                                                                                  | accessed 2026-08-16 |
| V8  | Multicall3 — deployments list — https://multicall3.com/deployments                                                                                                                       | accessed 2026-08-16 |
| V9  | Blockscout — API v2 documentation — https://docs.blockscout.com                                                                                                                          | accessed 2026-08-16 |
| V10 | Blockscout — requests & limits — https://docs.blockscout.com/devs/apis/requests-and-limits                                                                                               | accessed 2026-08-16 |
| V11 | Blockscout — PRO API — https://docs.blockscout.com/devs/pro-api                                                                                                                          | accessed 2026-08-16 |
| V12 | Robinhood — Chain mainnet support article (RPC, explorer, lookalike warning) — https://robinhood.com/us/en/support/articles/robinhood-chain-mainnet/                                     | accessed 2026-08-16 |
| V13 | Robinhood Chain docs — connecting — https://docs.robinhood.com/chain/connecting/                                                                                                         | accessed 2026-08-16 |
| V14 | L2BEAT — Robinhood project page — https://l2beat.com/scaling/projects/robinhood                                                                                                          | accessed 2026-08-16 |
| V15 | Arbitrum Foundation — build on Robinhood Chain — https://blog.arbitrum.foundation/build-your-first-dapp-on-robinhood-chain/                                                              | accessed 2026-08-16 |
| V16 | Privy — server wallets overview — https://docs.privy.io/guide/server-wallets/overview                                                                                                    | accessed 2026-08-16 |
| V17 | Privy — policies & controls — https://docs.privy.io/guide/server-wallets/policies                                                                                                        | accessed 2026-08-16 |
| V18 | Pimlico — docs home — https://docs.pimlico.io/                                                                                                                                           | accessed 2026-08-16 |
| V19 | Pimlico — permissionless.js smart accounts — https://docs.pimlico.io/permissionless/how-to/smart-accounts                                                                                | accessed 2026-08-16 |
| V20 | Privy — permissionless.js example repo — https://github.com/privy-io/permissionless-example                                                                                              | accessed 2026-08-16 |
