# Task: web3 — Wave 1 mission

**Badge:** 🔮 `web3` — Web3 research & threat intelligence analyst.
**Branch:** `docs/web3-research` (from latest `main`; PR back to `main`).
**Owns:** `docs/research/**`. Read-only everywhere else.

## Mission

You are the resident expert on **BankrBot** and the wider AI-agent x crypto
landscape. Kryptr is a phased clone of BankrBot-style functionality (wallet
agent → trading → launchpad). Your job is to make the crew build the right
thing, safely, with sources.

## Deliverables

1. `docs/research/bankrbot-analysis.md`
   - What BankrBot is: product surface (X/Telegram flows, wallet creation,
     swap/bridge/send/launch commands), custody model (embedded/Privy-style
     server wallets), token economics of `$BNKR`, fee model.
   - Architecture reconstruction from public sources: how a chat message
     becomes a signed transaction; what the trust boundaries are.
   - The May 2026 incidents (Grok permission-chain abuse, prompt-injection
     via encoded instructions, follow-on wallet drains): timeline, root
     causes, how much was lost, how Bankr responded (pause, reimburse).
   - Table: each root cause → the Kryptr control that defeats it
     (map to our security commandments in `docs/ORCHESTRA.md`).
2. `docs/research/web3-agent-landscape.md`
   - Competitor scan: Bankr, Clanker, Virtuals Protocol, ElizaOS,
     Coinbase AgentKit, Privy agentic wallets, others you find.
   - For each: custody model, chain coverage, revenue model, known
     incidents. One-page verdict on what Kryptr should copy/avoid.
3. `docs/research/kryptr-threat-model.md`
   - Threat model for Kryptr Phase 1 (wallet connect, balances, gated
     transfer): assets, entry points (API, agent endpoints, UI), threat
     actors, top-10 threats with mitigations, and explicit
     human-in-the-loop requirements for signing.
   - This document is input for `vault`'s security gate design —
     coordinate via IRC, contract-first on any types you need.

## Definition of done

- All three documents merged-quality: sources cited with URLs, dates on
  every claim, no speculation presented as fact.
- Threat model reviewed by `vault` (ack recorded in this file).
- Gates green on your branch (docs-only changes still run CI).

## Needs (conductor must approve)

- None expected. If you need a paid data source or API key — ask first.

## Retro (fill at end)

- done:
- blocked:
- learned:
