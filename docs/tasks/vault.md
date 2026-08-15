# 🔐 VAULT — Wave 1 mission

Branch: `feat/api-vault` (from latest `main`). Read `docs/ORCHESTRA.md`,
skills `kryptr-clean-architecture`, `kryptr-ci-pipeline`, `kryptr-git-flow`
before starting.

## Mission

Stand up the wallet & security core in `apps/api` with clean architecture.

### Deliverables

1. **Wallet module** (`src/wallet/`)
   - `domain/`: `Wallet` entity rules (address validation, chain allowlist),
     `WalletRepository` port interface.
   - `application/`: `CreateWalletUseCase`, `ListWalletsUseCase`,
     `GetBalancesUseCase` (balances via `chain/` port; mock in tests).
   - `infrastructure/`: in-memory repository for now (Postgres/Prisma is
     Wave 2 — keep the port so the swap is trivial).
   - Controller: `POST /wallets`, `GET /wallets`, `GET /wallets/:id/balances`
     — all return `ApiEnvelope` from `@kryptr/shared-types`.
2. **Security gate module** (`src/security/`)
   - `application/`: `EvaluateIntentUseCase` implementing the checks:
     origin allowlist → chain allowlist → approval threshold → daily cap
     (USD cap check may stub price lookup behind a port).
   - Controller: `POST /security/evaluate` accepting a `TransactionIntent`.
   - Unit tests: every branch of the decision tree (approved /
     needs_human_approval / rejected), including encoded-payload rejection.
3. **Chain port stub** (`src/chain/`): interface `ChainReader`
   (`getNativeBalance`, `getTokenBalances`) + a static mock implementation
   wired in the module. Real viem/Blockscout client is Wave 2.

## Contracts you consume

- `AgentWallet`, `WalletBalance`, `TransactionIntent`, `SecurityPolicy`,
  `SecurityDecision`, `ApiEnvelope`, `ok/err` — all from `@kryptr/shared-types`.

## Needs (conductor must approve)

- `class-validator` + `@nestjs/config` (DTO validation, env access).

## Done means

- Gates green on branch: `lint typecheck test build`.
- PR opened with goal + gate results in the body.
- Retro section below filled in.

## Retro

- Done:
- Blocked:
- Learned:
