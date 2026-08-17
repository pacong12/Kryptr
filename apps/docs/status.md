---
status: live
title: Wave 6 status
---

# Wave 6 status

<StatusBanner />

## S1 — Persistence (Phase-1)

**Status: Complete ✓**

- PR #105 merged: Prisma/Postgres phase-1 adapters (keyless, hermetic default)
- PR #108 merged: Phase-2 design for orders/order_executions/kill_switch adapters
- Production deployment ready pending Tier D decision

## S2 — Signing Ceremony

**Status: Complete ✓**

- PR #94 merged: Design for EOA manual signing ceremony
- PR #102 merged: Tooling complete (ceremony deploy-kit with round-trip decode, fail-closed asserts)
- Operator-side hardware wallet signing mechanism settled

## S3 — Deploy Rehearsal

**Status: COMPLETE & GREEN ✓✓✓**

- Template `0xAf816eC9018D2290E711D4e927acc7962702D35B` deployed on Base Sepolia (84532) + Robinhood Chain testnet (46630)
- Factory `0xd3153acf69909e5844130B4735feb7525750A5B` deployed on both chains
- All 8/8 CI verification jobs passed independently on both chains
- Keylessly verified via Blockscout readback
- **Important:** This is a rehearsal only — NOT an execution event

## Tier D — Execution Battery

**Status: POSTPONED ⏸️**

Pending future decision on sample-clone execution mechanism. S3 rehearsed all mechanisms successfully, but full production execution requires separate decision and soak completion.

The battery suite includes:

- P-5 Blockscout source verification on both chains
- G2–G5 automated gates plus FK-6 submission
- G4 readback including contract clone from deployed instance
- Sample clone transaction (bonded to 0.01 ETH) requiring user-signed execution

All technical checks are green; awaiting go/no-go decision before proceeding.

## Soak Clock

**Status: Not Started ⏸️**

Soak clock cannot start without Tier D PASS announcement. The soak period requires:

1. Verified factory deployment (Tier D pass)
2. Written T21 verification artifact
3. Factory entry in deploy manifest
4. Manual soak timer trigger after official announcement

## S4 — Venue Marketplace

**Status: Not Started ⏸️**

Waiting user decision on venue architecture and execution mechanism selection. No development started pending decision gate.

## S6 — Mainnet Gate

**Status: Pending ⏸️**

Depends on successful soak completion and final governance approval. No ETA announced.

---

**Summary:** S1-S3 complete; Tier D postponed pending decision; soakin not started; S4/S6 pending future decisions.
