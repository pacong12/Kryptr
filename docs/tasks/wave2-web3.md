# 🔮 WEB3 — Wave 2 mission: trading research doc

Branch: `docs/wave2-trading-research` (fresh worktree from latest `main`).
Ownership: `docs/research/` only. Read `docs/ORCHESTRA.md` + your wave-1
docs (`bankrbot-analysis.md`, `kryptr-threat-model.md`,
`web3-agent-landscape.md`) before writing — keep conventions.

## Mission

Formalize the wave-2 trading research brief (delivered on IRC) into a cited
research doc.

### Deliverable

`docs/research/wave2-trading-research.md` covering:

1. **DEX aggregator comparison** — 0x (Base reference adapter; key model,
   tiers, quote/swap split, x402 agent path), 1inch (backup), OKX, and the
   Robinhood Chain situation (chainId 4663: Uniswap v2/v3/v4 + UniswapX at
   launch, Rialto; no aggregator API support found yet → direct Uniswap
   adapter behind the same port).
2. **Price feeds** — Chainlink as Robinhood Chain's official oracle (Data
   Feeds + Data Streams), Pyth Hermes key mandate, CoinGecko demo tier as
   dev-default, prod path recommendation. All behind vault's PriceFeedPort.
3. **Swap threats** (continuing kryptr-threat-model.md conventions: threat
   IDs continue the existing sequence, [design]/[fact] tags, mitigations):
   1inch Fusion v1 calldata corruption ($5M, 2025-03), 0x Settler
   composability attack ($128K, 2025-04), ParaSwap AugustusV6 unrevoked
   approvals (2025-10), ~$60M retail sandwich losses 2025. Mitigations
   mapped to Kryptr's gate: server-side minAmountOut, quote TTL +
   single-use binding, router allowlist, no arbitrary calls, MEV-protected
   RPC, approval revocation.
4. **Signing boundary decision record** — Privy-style embedded wallets +
   policy engine default-ON + Kryptr gate second layer; ERC-4337 session
   keys as later migration; WalletConnect optional self-custody; cites for
   each claim.

## Acceptance

- Doc merged with ≥25 dated sources; threat IDs continue the sequence
  without renumbering existing ones; ROADMAP's signing-boundary note cites
  this file.
