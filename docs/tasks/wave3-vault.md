# 🔐 VAULT — Wave 3 mission: make Phase 1 real

Branch: `feat/api-real-integrations` (fresh worktree from latest `main`,
AFTER conductor prep PR with viem + shared-types wave-3 contracts lands).
Ownership: `apps/api` only. Read `docs/ORCHESTRA.md` first.

## Contracts (on main — consume verbatim)

`FeedStatus` now includes `'unconfigured'`; new `ChainReaderHealth`,
`SignRequest`, `SignRequestStatus`, `UnsignedTxPreview` in
`@kryptr/shared-types`. viem is pre-installed.

## Mission

Replace mocks with real integrations behind existing ports. NO external
keys exist yet — every keyed adapter degrades cleanly, never fakes data.

### Deliverables

1. **ViemChainReader** behind the existing ChainReader port
   (`CHAIN_MODE=viem|static`, default `static`; Base only this wave).
   - `RPC_URL_BASE` env, default `https://mainnet.base.org`, fallback
     `https://base-rpc.publicnode.com`; multicall3
     `0xcA11bde05977b3631167028862bE2a173976CA11` for batched ERC-20 reads.
   - Robinhood Chain stays static-mock; note its official RPC
     (`rpc.mainnet.gateway.robinhood.com` — NOT the lookalike
     rpc.robinhood.com) in the port docs for wave 4.
   - DI seam: `VIEM_CLIENT` injection token + `ViemClientPort` shape so
     smoke can stub without network (contract already published to OpsCI).
   - `GET /wallets/:id/balances` becomes real in viem mode; WalletBalance
     shape unchanged. RPC failure → `DomainError('chain_unavailable', 502)`.
2. **0x adapter** (`ZeroExDexAdapter`) on `/swap/v2/quote`
   (`https://api.0x.org`, headers `0x-api-key` + `0x-version`,
   `chainId=8453`), selected by `DEX_SOURCE=zero-ex|static-mock`.
   - Map `buyAmount/sellAmount/fees/route.fills/transaction{to,data,value}`
     onto `SwapQuote`/`UnsignedSwapTx`; id from 0x response.
   - Unconfigured (no `ZEROX_API_KEY`) → `DomainError('aggregator_unconfigured', 503)`
     - `health()` = `{status:'unconfigured', source:'0x'}`.
   - GATE SECURITY: recompute `minBuyAmount` from `amountOut`+`slippageBps`
     in an adapter-normalization step; NEVER trust 0x's embedded floor.
     Contract suite asserts this. Runs the shared contract suite only when
     `ZEROX_API_KEY` present (describeKeyed helper from ops).
3. **CoinGecko PriceFeed** (`CoingeckoPriceFeed`, `COINGECKO_API_KEY`),
   `PRICE_FEED_MODE=coingecko|static` (default static is REMOVED — default
   is coingecko-configured-or-fail-closed; static only via explicit opt-in).
   - Fail-closed: unconfigured/stale → `getUsdValue` null → valuations
     escalate to `needs_human_approval`. No silent fallback.
   - TTL cache ~30s. Health: unconfigured/down/stale/healthy.
4. **Gate branch**: `kind === 'deploy'` short-circuits to
   `needs_human_approval` AFTER origin/chain allowlists, BEFORE valuation
   — reason `deploy_requires_human_approval`. Explicit unit tests.
5. **SignerPort + DryRunSigner**: port
   `{ requestSignature({intentId, preview}), getStatus(id) }`; DryRunSigner
   computes the digest (hashing unsigned tx needs no key), always returns
   status `'dry_run'`, note 'dry-run only — nothing broadcast'.
   - `POST /security/intents/:id/sign-request` (approved-only guard
     reused); sign events appended to DecisionAudit as
     `sign_requested`/`dry_run_signed` timeline steps.
6. **Health**: `GET /health/chains` → `ApiEnvelope<ChainReaderHealth[]>`
   (never expose raw RPC URL); `GET /health/feeds` reports 0x + CoinGecko +
   chain-reader freshness with the new vocabulary.

## Acceptance

- Gates green incl. describeKeyed skips logged in CI.
- Deterministic degradation: every unconfigured path asserted in tests.
- Nothing signs; no keys logged; no raw RPC URLs in responses.
