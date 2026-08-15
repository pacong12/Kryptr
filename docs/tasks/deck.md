# 🖥️ DECK — Wave 1 mission

Branch: `feat/backoffice-dashboard` (from `feat/backoffice-shadcn` until
that PR merges, then rebase onto `main`). Read `docs/ORCHESTRA.md` + skills
`kryptr-clean-architecture`, `kryptr-ci-pipeline`, `kryptr-git-flow`.

## Mission

Build the Kryptr backoffice dashboard (admin/monitoring) with shadcn/ui
primitives only.

### Deliverables

1. **API client** (`src/lib/api.ts`): typed fetch wrapper for
   `ApiEnvelope<T>`; base URL from `process.env.NEXT_PUBLIC_API_URL`.
   Server components fetch; client components interact.
2. **Dashboard page** (`/`):
   - Health card hitting `GET /health` (`Card`, `Badge`).
   - Wallets table (`Table`) from `GET /wallets`.
   - Recent intents panel listing `TransactionIntent`s with status badges
     (feed may be mocked in Wave 1 — note it in the retro).
3. **Intent review page** (`/intents`): list + detail view showing the
   `SecurityDecision` fields; approve/reject buttons POST to the security
   gate (wire to vault's endpoints; stub UI state if endpoint lags).
4. **Layout**: sidebar nav (Dashboard / Intents / Wallets) using shadcn
   `NavigationMenu` or simple composed primitives.

## Contracts you consume

- Same REST contract as `face` — coordinate once with `vault`, not twice.
  If `face` already agreed a shape, reuse it verbatim.

## Done means

- Gates green on branch; PR opened; retro below filled.

## Retro

- Done:
- Blocked:
- Learned:
