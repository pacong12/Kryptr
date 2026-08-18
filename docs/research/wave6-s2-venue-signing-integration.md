# Wave 6 S2 — Venue Signing Integration Analysis

> **Author:** `web3` (Web3Intel) · **Wave:** 6 · **Tracks:** S2 signing ceremony × venue
> adapter (S4, postponed pending Tier D gate). Research only — no application code.
> Sources: `zero-ex-venue.adapter.ts`, `zero-ex-dex.adapter.ts`,
> `request-sign.usecase.ts`, `signer.port.ts`, `@kryptr/shared-types/signing.ts`,
> `wave6-s2-signing-ceremony.md`, `wave6-s4-venue-design.md`.

---

## 1. Call chain: accepted venue quote → `SignerPort.requestSignature`

The current swap signing path (wave 3) does not route through the venue adapter.
The venue adapter has no `getQuote` / `buildSwapTx` surface matching `DexAggregatorPort`.
The sequence WHEN wired would be:

```ts
// 1. client → POST /api/quotes  (QuoteRequest)
// 2. TradingController → RequestQuoteUseCase.execute()
// 3. RequestQuoteUseCase → DexAggregatorPort.getQuote()
//      presently: ZeroExDexAdapter  (not ZeroExVenueAdapter)
//      future:    a venue-aware adapter implementing DexAggregatorPort
// 4. DexAggregatorPort.getQuote() → SwapQuote (stored in QuoteStore, bound TTL)
// 5. client → POST /api/intents  {kind:'swap', swap:{quoteId}}
// 6. SecurityPolicy gate → decision:'approved'
// 7. client → POST /api/security/intents/:id/sign
// 8. RequestSignatureUseCase.execute(intentId)
//     a. intentStore.findById(intentId)
//     b. decisionAudit.findByIntentId()  → asserts latest.result === 'approved'
//     c. quoteStore.findById(intent.swap.quoteId)
//         → asserts boundIntentId === intentId   [anti-replay, F2]
//         → asserts expiresAt > now()             [quote TTL / TC-22]
//     d. DexAggregatorPort.buildSwapTx(quote)   → UnsignedSwapTx {to, data, value}
//     e. toHexWei(value)
//     f. decisionAudit.appendSignEvent('sign_requested')
//     g. SignerPort.requestSignature({intentId, chain, preview: UnsignedTxPreview})
//     h. decisionAudit.appendSignEvent('dry_run_signed')
// 9. SignerPort impl (DryRunSigner wave 3) → SignRequest  [nothing broadcast]
```

**Gap:** `ZeroExVenueAdapter` implements no `DexAggregatorPort` methods
(`getQuote`, `buildSwapTx`, `health`). It cannot be injected where
`DexAggregatorPort` is expected today. Step 3/8d above has no venue path.

---

## 2. Field mapping: `ZeroExVenueQuote` → `UnsignedTxPreview`

`ZeroExVenueQuote` does **not exist as a named type** in the codebase today.
The existing venue adapter (`ZeroExVenueAdapter`) has no quote surface — it
exposes `createPool`, `getAccrualSnapshot`, `checkGraduation`, `executeSwap`
(throws `TODO`). `UnsignedTxPreview` is defined in `@kryptr/shared-types/signing.ts`:

```ts
interface UnsignedTxPreview {
  to:    `0x${string}`;   // contract address to call
  data:  `0x${string}`;   // ABI-encoded calldata
  value: `0x${string}`;   // hex wei (0x0 for ERC-20 swaps)
}
```

The 0x DEX adapter (`ZeroExDexAdapter`) populates an `UnsignedSwapTx`
(`to`, `data`, `value: string`) from `body.transaction` in the API response
and stores it in an in-memory `txCache` keyed by `quoteId`.
`RequestSignatureUseCase` calls `buildSwapTx(quote)` then converts
`value` string → hex via `toHexWei()`.

**For venue-routed swaps, the mapping would be:**

| `ZeroExQuoteBody.transaction` field | `UnsignedTxPreview` field | Notes |
|---|---|---|
| `tx.to` (`string`, 40-hex) | `to` (`0x${string}`) | validated by regex in `ZeroExDexAdapter.normalize()` |
| `tx.data` (`string`, `0x`-prefixed) | `data` (`0x${string}`) | must start `0x`; see §4 calldata risk |
| `tx.value` (`string`, decimal wei or absent) | `value` (`0x${string}`) | converted by `toHexWei()`; missing → `'0'` then `'0x0'` |

**Type mismatches / missing fields:**

- `UnsignedSwapTx.value` is `string` (decimal wei); `UnsignedTxPreview.value`
  is `0x${string}` (hex). Conversion in `toHexWei()` is correct but only
  present in `RequestSignatureUseCase` — any direct pass-through bypassing
  the use case would produce a type mismatch.
- The venue adapter's `VenueAccrualSnapshot` carries `venueAccrualWei: bigint`
  and `tradeAmount: bigint` — neither maps into `UnsignedTxPreview`. Accrual
  data is a **separate ledger** (§4.5/§8.1 two-ledger separation); it must
  NOT be encoded into the tx calldata itself.
- No `quoteId` / `expiresAt` on the venue side today. The quote TTL
  anti-replay guard (`TC-22`) and the `boundIntentId` check (`F2`) both
  depend on `QuoteStore` holding a `SwapQuote`. A venue quote path needs
  equivalent storage or the replay guard is absent.

---

## 3. `accrualBasis` field (E-17 / TC-19) — gap analysis

**What it is:**  
TC-19 / E-17 requires that every venue registry entry include an
`accrual_basis` metadata field documenting the economic basis on which
venue share accrues. The design doc (`wave6-s4-venue-design.md` §8.3 E-17)
states: *"Registry includes accrual_basis field — Design doc requirement."*

The decided value is `"trade_amount"` — venue accrual = `floor(trade_amount × venueBps / 10_000)` per INV-VENUE-1 (`wave6-s4-venue-design.md` §8.1).

**Where it is (or isn't) enforced:**

| Layer | Status |
|---|---|
| Registry JSON schema (`.venues/{chain}.venues.json`) | **MISSING** — no registry file exists; `accrual_basis` field is design doc only |
| CI schema validation job | **MISSING** — not yet wired (E-13/TC-15 control) |
| `ZeroExVenueAdapter` at quote time | **NOT ENFORCED** — adapter computes accrual but never validates that `accrual_basis === 'trade_amount'` is recorded anywhere |
| `getAccrualSnapshot()` | Computes `floor(trade_amount × venueBps / 10_000)` correctly (INV-VENUE-1 math present) but uses no registry lookup |
| Registry validation at pool creation | **MISSING** — `createPool()` accepts `venueBps` as a raw parameter; no cross-check against a registry entry |

**Gap:** `accrualBasis` enforcement is design-only. No runtime path rejects a
pool or quote if the registry entry is absent or `accrual_basis` is wrong.
The adapter can produce accrual snapshots with arbitrary `venueBps` without
any registry gate. TC-19/E-17 compliance requires:

1. Registry entry with `accrual_basis: "trade_amount"` present before `createPool` runs.
2. `createPool` reads the registry and asserts `accrual_basis === 'trade_amount'` (or
   the declared value for the venue kind).
3. CI schema validation enforces field presence on every registry mutation.

Until those three hold, E-17 is **documentation, not enforcement**.

---

## 4. Security: calldata-poisoning risk in 0x v2 `data` field

**Threat surface:**

The `data` field in `ZeroExQuoteBody.transaction` is ABI-encoded calldata
returned by the 0x API. It flows from: 0x API response → `ZeroExDexAdapter.normalize()` →
`txCache` → `buildSwapTx()` → `UnsignedTxPreview.data` → `SignerPort.requestSignature()`
→ (eventually) an on-chain `CALL`.

**Mitigations in place:**

| Mitigation | Location | Covers |
|---|---|---|
| `data` must start with `0x` | `ZeroExDexAdapter.normalize()` (regex check on `tx.data`) | Rejects obviously malformed non-hex blobs |
| `to` must be valid 40-hex address | `normalize()` (`HEX_ADDRESS` regex) | Prevents null/arbitrary contract target |
| `minAmountOut` recomputed server-side | `normalize()` | Never trusts 0x-embedded floor (T11 threat) |
| Quote TTL enforced at sign time | `RequestSignatureUseCase` | Stale calldata can't be replayed post-expiry |
| `boundIntentId` check | `RequestSignatureUseCase` | Quote can't be reused across intents (F2 anti-replay) |
| Gate decision must be `'approved'` before sign | `RequestSignatureUseCase` | Gate evaluates intent params, not raw calldata |

**Gaps:**

1. **No calldata length or selector validation.** The `data` field is accepted
   as an opaque hex blob. A compromised or malicious 0x API response could
   embed a selector that calls an unintended function on the `to` contract.
   The gate evaluates the *intent* (swap params), not the *calldata* — so
   a poisoned `data` passes the gate if the intent params are clean.

2. **No `to` allowlist.** The `to` address is whatever 0x returns. It is
   not checked against an allowlist of known-safe 0x AllowanceHolder
   addresses per chain. A MITM or API-key compromise could point `to` at
   an attacker contract.

3. **User-originated swap params → URL query params → 0x API.** The `taker`
   address is server-resolved (mitigation). `sellToken`, `buyToken`,
   `sellAmount` originate from `QuoteRequest` (client-supplied). These pass
   through `url.searchParams.set()` with no further sanitization. 0x's API
   validates them, but if 0x has a param-injection vulnerability, client text
   reaches the API. Risk is low for numeric/address params but worth noting.

4. **In-memory `txCache`.** The cache is instance-local with no TTL eviction
   beyond the quote's `expiresAt` check at sign time. Under high quote volume,
   old calldata accumulates in memory. Not a direct poisoning vector but a
   resource management gap.

**Recommended controls for conductor / vault:**

- Allowlist `to` address per chain against known 0x AllowanceHolder addresses
  (publish with the venue registry, CI-validated).
- Validate `data` byte length is within reasonable bounds for a swap calldata
  (e.g. < 4 KB) and that the 4-byte selector matches expected 0x v2 selectors.
- Record the raw `calldataKeccak` in the sign request (mirrors P1 of the S2
  ceremony design) so G4-style post-execution comparison is possible.

---

## 5. Uniswap v4 as second venue — minimal additive interface

The conductor ruling (`wave6-s4-venue-design.md` §7, open items): *"0x v2 as first
adapter (Wave 3 foundation), Uniswap v4 as second adapter."* The additive model
requires a second venue without breaking the first.

**Minimal interface addition (conductor proposal, not application code):**

The existing `DexAggregatorPort` is the seam. No new port needed.
A `UniswapV4DexAdapter` implementing `DexAggregatorPort` is sufficient:

```ts
// Domain: zero code change required
// DexAggregatorPort already defines:
//   getQuote(request: DexQuoteRequest): Promise<SwapQuote>
//   buildSwapTx(quote: SwapQuote): Promise<UnsignedSwapTx>
//   health(): FeedHealth

// Infrastructure: new file only
// apps/api/src/trading/infrastructure/uniswap-v4-dex.adapter.ts
// implements DexAggregatorPort
// source field in SwapQuote: 'uniswap-v4'
// SwapRouteHop.venue: 'uniswap-v4'
```

**Venue registry discriminator:** the `kind` field in `.venues/{chain}.venues.json`
(`"0x-v2-liquidity"` vs `"uniswap-v4-liquidity"`) selects which adapter is
injected at pool-creation time. The `adapterPort: "DexAggregatorPort"` field
stays unchanged — adapter family selection is registry config, not a type change.

**What must NOT happen:**

- Do not add a new port (`UniswapV4Port`) — the existing port already handles
  the abstraction. Adding a port for one implementation is the antipattern the
  clean-architecture skill warns against.
- Do not inject both adapters into the same `DexAggregatorPort` slot —
  venue selection must be registry-driven at pool-creation time, not a
  runtime priority fallback.
- Do not put Uniswap v4-specific types in `@kryptr/shared-types` — the
  `SwapQuote.source` string field is the discriminator; it is already flexible.

**Venue adapter vs DEX adapter distinction:**

`ZeroExVenueAdapter` today handles *pool lifecycle* (create, accrue, graduate).
`ZeroExDexAdapter` handles *quote/swap execution*. These are different concerns
behind different ports. Uniswap v4 as a second venue needs both:

1. A `UniswapV4DexAdapter` implementing `DexAggregatorPort` (quote + calldata).
2. Pool lifecycle methods analogous to `ZeroExVenueAdapter.createPool()`
   (can extend the venue adapter pattern with a new registry entry, same types).

The venue adapter types (`VirtualPoolResult`, `VenueAccrualSnapshot`) are
generic enough to accommodate a Uniswap v4 pool — no type change needed.
`venueId` format `{chainId}:uniswap-v4:{tokenId}` already appears in the
spec test snapshot.

---

## 6. Summary of gaps for conductor

| ID | Gap | Severity | Owner |
|---|---|---|---|
| G1 | `ZeroExVenueAdapter` has no `DexAggregatorPort` impl; no call chain to signing exists | **Blocker** — S4 cannot wire to S2 signing without this | vault |
| G2 | No `ZeroExVenueQuote` type; quote TTL / anti-replay absent on venue path | **Blocker** — TC-22/F2 guards missing | vault |
| G3 | `accrualBasis` (E-17/TC-19) is docs-only; no registry lookup at `createPool` | High — TC-19 compliance absent | vault + ops |
| G4 | No `to` allowlist or calldata selector validation on 0x `data` | High — calldata-poisoning not fully mitigated | vault |
| G5 | Venue registry JSON files do not exist; CI schema validation not wired | High — E-13/TC-15 controls absent | ops |
| G6 | `txCache` in `ZeroExDexAdapter` is instance-local, no eviction | Low — resource leak, not security | vault |
| G7 | Uniswap v4 adapter not yet designed; registry `kind` → adapter injection mechanism undefined | Medium — needed before second venue lands | vault + conductor |
