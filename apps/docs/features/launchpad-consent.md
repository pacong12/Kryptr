---
status: planned
title: Launchpad consent
---

# Launchpad consent

<StatusBanner />

::: warning Phase status: planned — the launchpad is dark
No token factory is deployed, the deploy manifest is empty, and therefore no
token can be launched today. The deploy gate, the consent screen, and the
verification surface are built; the factory that would make launches possible
is not live. Until a factory passes verification and lands in the deploy
manifest, every deploy intent is rejected fail-closed.
:::

The Kryptr launchpad lets a human launch a token through the same security
gate as everything else. Design is frozen; this page describes what the flow
will be, and is explicit about what does not exist yet.

## Consent is the gate

A launch is a `TransactionIntent` with `kind: 'deploy'` carrying a
**DeployContext** — the full launch parameter set frozen at the moment of
consent: token name/symbol/supply, factory address, fee schedule and fee
recipients, bond-paid status, and the verification reference. What you see on
the consent screen is exactly what the gate validates. The launch consent
screen shows the fee preview and requires an explicit permanence
acknowledgment: after deployment there are no admin controls and no upgrade
path — fees, fee recipients and total supply cannot be changed by anyone,
including Kryptr, and there is no undo.

Two rules are unconditional and permanent:

- **Every deploy requires human approval** (`needs_human_approval`), for every
  origin class, forever. There is no policy setting that changes this.
- **automation cannot launch tokens — every deploy requires human approval.**
  Automation origins are structurally rejected for deploys; no configuration
  can enable them.

## Fees: parameterized at launch, immutable after

- The total fee on trades of the launched token is set per launch in integer
  basis points — **reference default 175 bps (1.75%)** — and splits across
  exactly four recipients: `creator`, `lp`, `protocol`, `buyback`.
- The schedule and recipients **freeze on-chain at deploy**. No setter exists
  after launch — not in the factory, not in the API, not in configuration.
- The API is never in the fee path. It validates the schedule pre-sign
  (integer-bps arithmetic only) and touches nothing afterwards.

## Bond: the spam control

Launching requires paying an **on-chain bond** at deploy time. The bond
parameter lives in the factory contract; the gate verifies bond-paid as a
precondition of the deploy intent. Together with per-origin API caps, the bond
is the economic anchor against launch spam. (Bond mechanics belong to the
factory era — they are not live today.)

## T21 verification: what the consent screen may claim

Before any factory address goes live, the factory and its token template must
pass the full **T21 verification battery**: fee-split and bond-accounting
invariant tests, clean static analysis, fork tests against real Base state,
and on-chain proofs that deploys are admin-key-free and non-upgradeable. All
five batteries must pass at the same release tag, or the factory does not go
live — fail-closed.

The result is recorded in a verification artifact with a stable id of the form
`t21:<chain>:<releaseTag>` (example: `t21:base:contracts/v1.0.0`) and a
`contentHash` (SHA-256 of the artifact's canonical JSON form). The consent
screen fetches the artifact, compares both the hash and the claims, and may
render only the frozen claim vocabulary:

| Claim                 | What it states                                                   |
| --------------------- | ---------------------------------------------------------------- |
| `admin_key_free`      | No admin surface exists anywhere in the factory or template.     |
| `non_upgradeable`     | No upgrade path exists; clone behavior is fixed by construction. |
| `fee_split_invariant` | Fee-split invariants held across the full test battery.          |
| `bond_accounting`     | Bond-accounting invariants held across the full test battery.    |

The only statement the artifact supports is: the factory **passed the
verification battery — this is not a warranty**. Verification statements on
this site or in the app will never go beyond that, and Kryptr does not make
"bug-free" claims. If the artifact cannot be fetched or verified, the consent
screen renders the launch as unverified and blocks submission — fail-closed.

## Chains

Base first. Robinhood Chain launches stay deferred until chain support is
confirmed. The launch chain comes from the server-side launch draft — the
consent screen has no chain selector — so no Robinhood draft will exist until
that support is confirmed.

## What exists today vs. what does not

| Piece                                                  | State today                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| Deploy gate (HITL, firewall, allowlist)                | Live in the API — rejects everything while the manifest is empty |
| Launch consent screen (fee preview, verification card) | Built — blocks until T21 verification passes                     |
| Token factory contract                                 | **Not deployed**                                                 |
| T21 verification artifact                              | **Does not exist yet**                                           |
| Bond mechanics, fee accrual                            | Factory era — not live                                           |

::: tip Sources
Decision and binding conditions: `docs/research/launchpad-decision.md`.
Automation firewall and deploy-gate design:
`docs/research/wave5-launchpad-vault-design.md` (§1 firewall, §2 gate branch,
§3 DeployContext). T21 battery, artifact id, `contentHash`, and claim
vocabulary: `docs/research/wave5-t21-verification-design.md` (§4–§8). Fee
economics and rulings: `docs/research/launchpad-discussion.md`. Frozen types:
`packages/shared-types/src/lib/deploy.ts`.
:::
