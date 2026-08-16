# Wave 5 Launchpad — Environment Variable Policy

Status: **RULING** (team discussion, 2026-08-16; synthesized by conductor).
Trigger: the user presented an internet-sourced env list from a
BankrBot-style launchpad and asked the team to discuss it.

## Core principle

Env carries **wiring only**: non-secret, non-parameter, every entry
fail-closed by default. Anything that changes fees, recipients, supply,
ownership, or which factory is trusted is **frozen on-chain, in the deploy
manifest, or in code constants** — never runtime-tunable via env.

## Rejected outright (never, in any environment including CI secrets)

| Variable                                                            | Reason                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRIVATE_KEY`                                                       | Keyless by construction (T21 `admin_key_free`); deploy = consent→HITL, never signing from env. An existential violation, not a config choice.                                                                                                                                                                         |
| `PLATFORM_FEE_BPS` (as authority)                                   | Fee totals are per-launch, integer bps, frozen on-chain (`LAUNCH_TOTAL_FEE_BPS=175` reference in code; RATE/DISTRIBUTION spaces per T21 §4.2). A global env fee dial silently re-interprets consent and breaks `fee_split_invariant`. Their 95 bps single-platform-fee model does not map to our 175 bps 4-way split. |
| `FACTORY_OWNER_ADDRESS` / `ALLOW_EOA_FACTORY_OWNER`                 | Factory has no admin surface; any owner concept contradicts `admin_key_free` / `non_upgradeable` (G4 P-2/P-3). Not even as `=false` toggles.                                                                                                                                                                          |
| `TREASURY_ADDRESS` / recipients as env authority                    | Recipients freeze on-chain at deploy (DeployContext); env-swappable recipients = recipient-swap vector (T17). Env may inform at deploy time only, then freezes.                                                                                                                                                       |
| `NEXT_PUBLIC_FACTORY_ADDRESS` / `TESTNET_FACTORY_ADDRESS` (browser) | Factory identity flows ONLY from CI-schema-validated manifests → gate allowlist. A client-configurable factory address is a consent-spoofing vector; the UI renders what the gate verified. Also breaks the invariant "what the user sees = what the gate validates".                                                 |

## Accepted env (wave-5 launchpad surface)

| Variable                                                     | Scope                 | Notes                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_MANIFESTS_DIR`                                       | API runtime           | The ONLY deploy-gate trust-anchor env (verified in PR #68 wiring). Default `contracts/deployments`; missing/unreadable = fail-closed = launchpad dark. Production: ops-provisioned read-only dir. Config can only RESTRICT, never enable. |
| `VITE_API_URL` / `NEXT_PUBLIC_API_URL`                       | frontends             | Already exist; the only env frontends truly need.                                                                                                                                                                                         |
| `NEXT_PUBLIC_APP_URL`                                        | backoffice (optional) | Display-only canonical link base; harmless.                                                                                                                                                                                               |
| `METADATA_ALLOWED_ORIGINS`, `METADATA_RATE_LIMIT_PER_MINUTE` | API runtime (later)   | Two-layer rate limiting layer 1, when a metadata endpoint lands. Defaults fail-closed. Note (SecReview68): `GET /launchpad/verification/:id` needs rate limiting too (unauthenticated enumeration).                                       |

## Keyed adapters (optional, fail-closed, user-owned secrets)

Absent key ⇒ graceful skip/degradation, never fake data, never blocking:

- `GMGN_API_KEY` — third-party market data is inference/display ONLY; never
  a price authority (T22 manipulation surface).
- `PINATA_JWT` — pinning-only scope in a backend adapter; MUST NOT grant
  rewrite power over published metadata (immutable contracts vs mutable
  metadata = post-launch rug surface; metadata must be hash-committed, CID
  recorded at deploy).
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — build-time inject only if a
  browser-wallet phase lands; empty ⇒ feature dark, build still green.
  Semi-public, quota-scoped, low risk — but never authoritative.

## Manifest / code / chain domain (NOT env)

- Factory address, `V4_*` / `PERMIT2_ADDRESS`, fee/tick-spacing →
  `contracts/deployments` manifests (schema-validated in CI) or
  template constructor constants.
- `EXPECTED_*_CODE_HASH` → pinned verification constants IN CODE (wave-4
  feed-verification precedent: env-configurable expectations can be lied to
  via env).
- `GRADUATION_TARGET_ETH`, `VIRTUAL_ETH_RESERVE_ETH` → template/venue
  constructor parameters, verified by fork tests (FK-2).
- `SMOKE_BUY_ETH` — meaningless without a key (we never have keys);
  real-chain coverage is FORK tests (anvil + `deal()`, keyless). If a
  real-chain smoke ever exists: bounded-allowance wallet + protected
  Environment + nightly-only + advisory.

## Chain facts and RPC trust model

- **46630 = Robinhood Chain TESTNET; mainnet = 4663** (fact, re-confirmed
  2026-08-16 via docs.robinhood.com/chain/connecting). The template list is
  testnet-oriented. Our Robinhood launch stays deferred until vault confirms
  chain support (memo ruling).
- RPC = untrusted data plane, never an authorization source. Mitigations:
  trigger = proposal only (every action through the full gate); staleness
  checks fail-closed (T23); independent sanity source within deviation
  bounds (T24); critical reads re-verifiable via second RPC + Blockscout;
  artifacts pin block number + bytecode hashes; swap prices from 0x quote
  binding, never RPC (T12/T14). Production: RPC allowlist, ≥2 providers
  with cross-check on mismatch. Signing never transits RPC.
- Onboarding a new chain (e.g. Robinhood later) = full gate: T21 battery
  re-run per chain (`t21:<chain>:<releaseTag>`), allowlist empty until
  manifest + verification land, runtime chainId must match RPC chainId —
  mismatch = fail, never trusted silently.

## CI secrets policy

- Zero secrets for fork PRs (GitHub default; our fork-tests need none).
- Real production secrets (when any appear): protected GitHub Environment,
  required reviewers, branch-restricted to main/nightly.
- `TESTNET_FACTORY_ADDRESS` + smoke parameters: CI-environment scoped at
  most, never production runtime.
