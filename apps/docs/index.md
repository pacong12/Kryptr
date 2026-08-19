---
status: live
layout: home
title: Kryptr Docs
hero:
  name: Kryptr Docs
  text: Security-gated finance for autonomous agents
  tagline: User documentation — written to be honest about what is live, what is preview, and what is still planned.
  actions:
    - theme: brand
      text: What is Kryptr
      link: /getting-started/
    - theme: alt
      text: "What's live today"
      link: /whats-live
features:
  - title: Keyless by construction
    details: Kryptr never stores seed phrases or private keys. Everything you can do today is read-only or gate-approved — signing arrives later behind a dedicated boundary.
  - title: Gate before sign
    details: Every action is a structured intent evaluated by a security gate — origin allowlists, spend caps, human approval above thresholds. Nothing skips the gate.
  - title: Phase-honest
    details: Every page carries a status banner (live, preview, planned). The limitations page says plainly what Kryptr cannot do yet.
---

<StatusBanner />

## Read this first

Kryptr is in **Phase 1**. You can connect a wallet, see balances on Base and
Robinhood Chain, request transfers and swaps, create limit and DCA orders
(preview — the order worker ships disabled by default), and
watch every decision the security gate makes.

**Wave 6 status:** S1 Persistence ✓ complete, S2 Signing Ceremony ✓ complete, S3 Deploy Rehearsal ✓✓✓ complete & green on both testnet chains. Tier D ⏸️ postponed pending decision; Soak Clock ⏸️ not started. Factory remains DARK until Tier D PASS + soak completion. No mainnet deployment ETA announced.

**Signing is dry-run only in this phase — nothing is broadcast on-chain yet.**

## 🚀 Mainnet Readiness (Phase 3)

### Current Status: Testnet Rehearsal Complete ✅

We've successfully completed extensive testing on Base Sepolia testnet with full rehearsal scenarios. The system is production-ready pending final mainnet deployment gate approval.

### What's Next for Mainnet Launch?

1. **Deploy Rehearsal Testing** (In Progress) - Live contract deployments on testnet with real transaction flows
2. **Mainnet Gate Verification** - Security audit completion and formal approvals
3. **Production Deployment** - Factory contract deployment to Base Mainnet
4. **User Onboarding** - Gradual rollout to verified users

### Network Detection & Warnings

The app now includes automatic network detection:

- 🟢 **Production Mode**: Green banner when connected to Base Mainnet
- 🟡 **Testnet Mode**: Amber warning banner when connected to test networks

This ensures you're always aware of which network you're interacting with before confirming any launches or transactions.

: [Production Release Notes](/PRODUCTION-RELEASE-NOTES) | [Launchpad Consent Guide](/features/launchpad-consent) | [What's Live Today](/whats-live)
Everything that moves value stops at an unsigned preview behind the security
gate. That boundary is deliberate: the gate ships first, signing ships later.

::: tip Verification always happens in the app
This site explains Kryptr; it never asks you to trust a link. Consent screens,
the launch-detail view, and the app footer are the sources of truth. See
[Honest edges](/honest-edges/limitations) for what is not available yet.
:::
