---
status: live
title: FAQ
---

# FAQ

<StatusBanner />

## Is Kryptr custodial? Does it hold my keys?

No. Kryptr never stores seed phrases or private keys — keyless is a
construction property, not a setting. Today Kryptr reads balances and
evaluates gate-approved intents; signing will arrive later behind a dedicated,
gate-exclusive boundary.

## Can an agent move my funds on its own?

No. Agents and automation can only produce structured **TransactionIntents**.
Each intent is checked against your wallet's security policy (origin
allowlist, chain allowlist, daily cap, approval threshold), anything above
your threshold requires explicit human approval, and automation origins are
denied by default. A triggered order mints a fresh intent through the full
gate — there is no pre-authorization of future actions.

## Why did nothing happen after my swap/order was approved?

Because signing is dry-run-only in the current phase: approved intents
produce unsigned previews, and nothing is broadcast on-chain. There is no
live signer yet. This is the Phase 1 boundary, stated on every relevant page.

## What does "fail-closed" mean?

When something is unknown or broken, Kryptr refuses instead of guessing:
errors never approve intents, unknown trigger prices never fire orders,
missing manifests keep the launchpad dark, and an unverifiable factory blocks
launch consent. Degradation is always visible, never faked.

## What do the gate results mean?

- `approved` — the intent passed the policy checks and may proceed.
- `needs_human_approval` — a human must decide (value above threshold,
  deploy intents, unknown prices). Nothing happens until then.
- `rejected` — the intent violated a policy rule; the reason is recorded.

## The launchpad says tokens are "verified". Does that mean they are safe?

It means exactly one thing: the factory **passed the verification battery —
this is not a warranty**. The verification artifact (stable id like
`t21:base:contracts/v1.0.0`, integrity-checked via its `contentHash`) proves
mechanical properties — no admin surface, no upgrade path, fee and bond
invariants holding in tests. Kryptr does not claim launched tokens are
bug-free, and no page or screen will say otherwise.

## Why can't automation launch tokens?

By structure, not configuration: **automation cannot launch tokens — every
deploy requires human approval.** Automation-origin deploy intents are
rejected before any policy is even read, and tests fail the build if that
ever changes.

## Where do I verify what is real?

Inside the app: consent screens, the launch-detail view, and the app footer
are the sources of truth. This documentation site lives on one official
domain (see the footer) and never asks you to act on links sent to you.

::: tip Sources
Gate semantics: `packages/shared-types/src/lib/security.ts` and
`docs/research/kryptr-threat-model.md` §7. Automation firewall:
`docs/research/wave5-launchpad-vault-design.md` §1. Verification wording:
`docs/research/wave5-t21-verification-design.md` §7–§8.
:::
