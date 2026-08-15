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

- Done: wallet module (domain rules + port + 3 use cases + in-memory repo,
  POST/GET /wallets, GET /wallets/:id/balances), security gate
  (EvaluateIntentUseCase: policy→payload→origin→chain→threshold→cap,
  fail-closed; POST /security/evaluate; encoded-payload heuristic
  documented in payload-inspection.ts), chain port (ChainReader + static
  mock), class-validator DTOs + global ValidationPipe, global envelope
  exception filter (every response ApiEnvelope), ConfigModule reading
  API_PORT from .env.example. 76 jest tests green (TDD red-green), typecheck
  - build green; lint target does not exist yet on main (skipped per rules).
    CreateWallet provisions a fail-closed default SecurityPolicy so no wallet
    can exist unknown to the gate. No signing logic, no private keys anywhere.
- Blocked: nothing in Wave 1. Wave-2 prerequisites identified with web3
  (threat model §7): server-side origin stamping from auth (origin is
  client-supplied today — flagged in evaluate-intent.dto.ts), decision
  persistence + append-only audit, kill switch, real ChainReader/PriceLookup
  adapters. Deck (backoffice) contract agreed for POST
  /security/intents/:id/decision — needs decision persistence first.
- Learned: tsconfig project references (TS6305) require clean dist when
  sources change mid-flight; jest.Mocked<Class> drags private members in —
  Nest Test modules with provider overrides are the cleaner seam; the
  encoded-payload heuristic must whitelist 0x-prefixed values or every
  address looks like smuggled hex.
