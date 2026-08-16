# 🔮 WEB3 — Wave 3 mission: integration research doc + launchpad round

Branch: `docs/wave3-integration-research` (fresh worktree from latest
`main`). Ownership: `docs/research/` only.

## Mission A — research doc (deliverable)

`docs/research/wave3-integration-research.md`, full cited version of the
IRC brief (conventions of earlier docs; ≥20 dated sources):

1. **0x v2 API** (v1 SUNSET 2025-04-11): `/swap/v2/price` +
   `/swap/v2/quote`, `0x-api-key` + `0x-version` headers, chainId 8453,
   field mapping to SwapQuote/UnsignedSwapTx, error codes without key
   (401/403), the minAmountOut-is-request-side subtlety.
2. **Base RPCs**: mainnet.base.org (rate-limited, non-prod),
   base-rpc.publicnode.com fallback, keyed free tiers (Alchemy/Infura/
   dRPC/QuickNode), multicall3 `0xcA11...CA11`.
3. **Explorers**: base.blockscout.com API v2 paths + brutal keyless
   limits; Robinhood Chain HAS Blockscout
   (robinhoodchain.blockscout.com) + official RPC
   `rpc.mainnet.gateway.robinhood.com` (warn re: rpc.robinhood.com
   lookalike).
4. **Privy surface** (design input for SignerPort): @privy-io/node
   client shape, credentials, policy engine semantics (enforced AT SIGN
   TIME), why Kryptr's gate stays authoritative.
5. **ERC-4337 path** on Base for the later migration: Pimlico +
   permissionless.js hybrid with Privy signer; alternatives one-liner.

## Mission B — launchpad discussion lead (user-requested, NO build)

Run the discussion round with the crew (brief already sent): token factory
design options, fee mechanics (Bankr 1.75% fixed-at-launch, flywheel),
Clanker narrow-surface pattern, T17+ threats, deploy-via-intent HITL rule
(vault confirmed: deploys ALWAYS escalate), Foundry CI question for ops,
UX surfaces for face/deck. Synthesize replies into
`docs/research/launchpad-discussion.md` (second branch/PR or same branch
after the round closes — your call; keep the two docs in ONE PR if
timing allows). Report the key disagreements to the conductor; the
conductor makes the build/no-build call with the user.

## Acceptance

- Mission A doc merged with citations; Mission B memo captures every
  crew position + open disagreements, decision deferred.
