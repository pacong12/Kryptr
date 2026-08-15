# Kryptr Roadmap

Phased clone of the BankrBot concept. Each phase ships with its security
requirements — never bolted on afterwards.

## Goals — what "done" means per phase

| Phase | Goal (measurable) | Exit criteria |
|---|---|---|
| 1 | User connects wallet, sees balances, sends a transfer that passes the security gate; backoffice monitors it live | E2E happy path demo + all gates green |
| 2 | Agent schedules DCA/limit orders that execute on time without human touch | 24h soak test, zero missed executions |
| 3 | Agent launches a token; fees accrue to its wallet per the fixed schedule | On-chain fee split verified in Blockscout |
| 4 | Natural-language request becomes a gated intent; Grok/Bankr attack replay is blocked | Red-team report, 0 unauthorized transfers |

## When agents disagree or are confused

Per `docs/ORCHESTRA.md`: contract-first proposals between the two agents
involved; if unresolved after one round, the conductor decides. Roadmap
ambiguities are bugs — report them, don't guess.

## Phase 1 — Wallet & basic trading (MVP)

- [ ] Wallet service: create/list agent wallets (`AgentWallet`)
- [ ] Non-custodial signing boundary (WalletConnect / Privy / ERC-4337 —
      decide before implementation; app itself never stores seed phrases)
- [ ] Balance reads via viem + Blockscout (Base, Robinhood Chain)
- [ ] Transfers + swaps through a DEX aggregator
- [ ] Security gate v1: origin allowlist + approval threshold
- [ ] Backoffice: wallet list, transaction feed, health dashboard
- [ ] Frontoffice: connect wallet, view balances, send/swap

## Phase 2 — Order automation

- [ ] BullMQ (Redis) job queue for scheduled execution
- [ ] Limit / stop orders, DCA, TWAP (`Order` model already in shared-types)
- [ ] Daily spend caps enforced at the security gate
- [ ] Backoffice: order monitoring, kill switch

## Phase 3 — Token launchpad

- [ ] Token factory contract (deploy via natural-language-safe structured
      intents only)
- [ ] Fee schedule fixed at launch (`TokenFeeSchedule`)
- [ ] Fee distribution to agent wallets + buyback mechanism
- [ ] Frontoffice: launch flow + token pages
- [ ] Backoffice: launch moderation queue

## Phase 4 — Agent runtime & LLM gateway

- [ ] OpenAI-compatible LLM gateway with per-agent metering
- [ ] Natural language → **structured intent** translation layer
- [ ] Prompt-injection defense suite: encoding detection, source
      whitelists, human-in-the-loop approval above thresholds
- [ ] Social connectors (X / Telegram) — read-only first, execution only
      after Phase 1–3 security reviews
- [ ] Red-team exercises replaying the Grok/Bankr attack chain

## Non-goals (for now)

- Custodial key storage inside the API
- Direct "AI output → signed tx" paths, ever
- Leveraged trading
