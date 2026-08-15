# 🪟 FACE — Wave 1 mission

Branch: `feat/frontoffice-home` (from `feat/frontoffice-shadcn` until that
PR merges, then rebase onto `main`). Read `docs/ORCHESTRA.md` + skills
`kryptr-clean-architecture`, `kryptr-ci-pipeline`, `kryptr-git-flow`.

## Mission

Turn `apps/frontoffice` into the user-facing Kryptr app shell using
shadcn-vue primitives only.

### Deliverables

1. **API client** (`src/lib/api.ts`): typed fetch wrapper returning
   `ApiEnvelope<T>` types from `@kryptr/shared-types`; base URL from
   `import.meta.env.VITE_API_URL`.
2. **Composables**: `useWallets()` (list + create), `useBalances(walletId)`.
   Components never fetch directly.
3. **Pages/views**:
   - Home: hero + "connect wallet" CTA (mock connect for Wave 1 — real
     WalletConnect is Wave 2), wallet list with `Card`/`Badge`.
   - Wallet detail: balance table (`Table`), transfer form (`Input`,
     `Button`, `Select`) that POSTs a `TransactionIntent` to
     `/security/evaluate` and shows the `SecurityDecision`.
4. **Routing**: vue-router with the two routes; simple nav header.

## Contracts you consume

- REST shapes agreed with `vault` (see `docs/tasks/vault.md`). If a shape
  is missing, propose it to vault + conductor — do not invent local types.

## Done means

- Gates green on branch; PR opened; retro below filled.

## Retro

- Done:
- Blocked:
- Learned:
