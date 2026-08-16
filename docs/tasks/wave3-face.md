# 🎨 FACE — Wave 3 mission: real-data UX

Branch: `feat/frontoffice-real` (fresh worktree from latest `main`, AFTER
conductor prep PR lands). Ownership: `apps/frontoffice` only.

## Context

API gains real chain reads (Base), key-gated quotes, fail-closed prices,
and a dry-run signer. No keys exist in this deployment — degradation UX is
the core of this wave. `WalletBalance` shape is STABLE; `mockMode` stays as
the API-unreachable fallback.

### Deliverables

1. **Balances**: empty-state for wallets holding nothing; per-chain partial
   failure renders present chains + a note row for missing ones (never
   fabricate zeros); swap asset options SHOW-and-DISABLE 0-balance assets
   with reason text ("No balance") instead of hiding.
2. **Quotes**: branch on error code — `aggregator_unconfigured` →
   informational Alert (NEW `@kryptr/shared-ui/vue/alert`), copy: "Live
   quotes not available — this deployment has no swap aggregator
   configured, so we can't fetch a real quote. Kryptr never fabricates
   quotes, so swap is paused." NO retry button (a missing key never
   succeeds on retry). Transient codes (`aggregator_unavailable`,
   `network_error`) keep the retry CTA.
3. **Dry-run signing**: secondary "Dry-run sign" button on the approved
   state → `POST /api/security/intents/:id/sign-request` →
   `ApiEnvelope<SignRequest>` rendered labeled "Dry-run signature —
   nothing broadcast." Thin `useSignRequest` composable (display only).
4. **Cuts (agreed)**: Base-only, held tokens only (no discovery), manual
   refresh (no polling), no copy-to-clipboard.
5. Replace hand-rolled banners with shared-ui Alert where sensible.

## Acceptance

- Gates green; all degradation states covered by tests
  (unconfigured/transient/partial-chain/empty-wallet).
