---
status: live
title: Orders & kill switch
---

# Orders & kill switch

<StatusBanner />

Orders let you pre-define trades — **limit** orders and **DCA** (dollar-cost
averaging) schedules — that the order worker evaluates on a timer. Every
execution attempt still goes through the full security gate: an order is a
standing instruction, never a pre-authorization.

## Supported order types

| Type    | State                                                                |
| ------- | -------------------------------------------------------------------- |
| `limit` | Supported — triggers once when the price condition is met.           |
| `dca`   | Supported — recurring; each slot is a separate, gated execution.     |
| `stop`  | **Not supported yet** — rejected at creation with an explicit error. |
| `twap`  | **Not supported yet** — rejected at creation with an explicit error. |

Unsupported types are rejected loudly (`order_type_unsupported`), never
accepted silently.

## Order lifecycle (frozen vocabulary)

An order moves through these statuses:
`pending_approval`, `open`, `paused`, `triggered`, `filled`,
`partially_filled`, `cancelled`, `rejected`, `expired`, `failed`.

Notes that matter in practice:

- A successful DCA slot returns the order to `open` for the next slot; only
  the final slot reaches `filled`.
- `failed`, `cancelled`, `expired`, and `filled` are terminal — automation
  never touches a terminal order.
- An order whose TTL runs out without triggering becomes `expired` (limit
  orders).

## Trigger prices: two sources, fail-closed

Trigger evaluation uses an on-chain Chainlink Data Feed as the primary source
and a keyless market-price source as the sanity check. The rules:

- **Freshness bound** — a feed reading older than the max-age window (default
  45 minutes) is treated as stale: `trigger_price_stale`, no trigger, order
  stays `open`.
- **Deviation bound** — if primary and sanity sources disagree beyond the
  deviation limit (default 0.5%), there is no trigger.
- **Unknown price** — if both sources fail, the outcome is
  `needs_human_approval` posture: the order stays `open` and waits. A stale
  or unknown price never fires an order.

## A trigger is a proposal, not an authorization

When a condition triggers, the worker mints a **fresh TransactionIntent** for
that slot — deterministic id, origin `automation:order-worker` — and runs it
through the full gate: caps, allowlists, kill switch, HITL thresholds. The
execution re-quotes at execution time and re-checks your limit bound; a
violated bound rejects fail-closed and the order stays open. Gate decisions
are never auto-retried.

## Kill switch

Three frozen modes, checked at execution time (not only at evaluation):

- `off` — normal operation.
- `pause_new` — the worker stops creating new executions; registered orders
  stay in place.
- `cancel_active` — all `open` and `paused` orders are cancelled (each with
  an audit entry) and new executions are refused.

Every mode change is a confirmed action with an audit entry recording actor,
time, from→to, and reason.

### Emergency Freeze (Phase 2 - Task 3.1)

In addition to standard kill-switch modes, Phase 2 introduces an **emergency
freeze button** accessible from the Backoffice Orders table page:

```typescript
// POST /kill-switch/freeze with immediate effect
POST /api/orders/actions {
  action: 'emergency_freeze',
  reason: 'SYSTEM_EMERGENCY'
}
```

This action:
- Immediately blocks ALL order execution system-wide
- Requires double-confirm via UI confirmation dialog
- Logs to audit trail with `EMERGENCY_FREEZE_TRIGGERED` flag
- Cannot be undone until manually reverted by administrator

The emergency freeze provides operators with a safety net for critical situations requiring instant automation shutdown.

## UI Controls & Live Monitoring (Phase 2 - Tasks 3.1 & 3.2)

### Backoffice Order Management

The Backoffice provides real-time monitoring and control capabilities:

1. **Orders Table with Live Polling** (Task 3.1)
   - Auto-refreshes every 5 seconds via `useOrdersPolling` composable
   - AbortController ensures no race conditions during polling
   - Visual indicators for loading state and last fetch timestamp
   
2. **Kill-Switch Dialog**
   - Interactive modal for safe mode switching
   - Requires human justification for audit purposes
   - Real-time status display with mode badges
   
3. **Emergency Freeze Button**
   - Prominent red warning section at top of orders page
   - Confirmation dialog prevents accidental activation
   - Immediate feedback on success/failure states

### Frontoffice Order History View (Task 3.2)

Frontoffice users can manage their active orders through:

1. **Active Orders List**
   - Clean table view with type, side, pair, amount, trigger info
   - Status badges with color-coded indicators
   - Execution ledger expansion for detailed history
   
2. **Cancel Order Modal**
   - Confirmation dialog with required reason field
   - Only applies to `pending` and `active` orders
   - Cancels gracefully if order hasn't executed yet
   
3. **Real-time Updates**
   - WebSocket/polling integration for live status changes
   - Worker health banner warns when offline

## Phase status: preview — two honest boundaries {#phase-status-preview}

1. **The worker ships disabled by default.** Until automation is explicitly
   switched on, order pages degrade fail-closed ("unavailable" — never guessed
   healthy).
2. **Executions are dry-run only.** Executed slots stop at the unsigned
   boundary — nothing is broadcast on-chain yet, because there is no live
   signer.

## API Reference

### Cancel Order

```http
POST /wallets/{walletId}/orders/{orderId}/cancel
Content-Type: application/json

{
  "reason": "User cancellation requested"
}
```

**Response:**
```json
{
  "success": true,
  "orderId": "order-123",
  "timestamp": "2026-08-18T12:00:00Z"
}
```

**Error Responses:**
- `404` — Order not found
- `409` — Order already executed (terminal status)
- `423` — Worker unavailable

### Emergency Freeze

```http
POST /api/orders/actions
Content-Type: application/json

{
  "action": "emergency_freeze",
  "reason": "CRITICAL_SECURITY_INCIDENT"
}
```

## Error Handling & User Feedback

Worker problems surface as human-readable messages mapped from frozen error
codes (`worker_unavailable`, `kill_switch_active`, `quote_unavailable`, …) —
never raw stack traces.

### Common Error Codes

| Code                      | Meaning                                    |
|---------------------------|--------------------------------------------|
| `worker_unavailable`      | Order execution worker is offline          |
| `kill_switch_active`      | System-wide freeze is engaged              |
| `order_already_executed`  | Cannot cancel terminal/cancelled orders    |
| `price_feed_stale`        | Oracle data too old for trigger evaluation |
| `insufficient_balance`    | Wallet lacks funds for proposed execution  |

## Testing Checklist

- [ ] Verify kill-switch modes transition correctly
- [ ] Test emergency freeze requires double confirmation
- [ ] Confirm cancel modal validates reason input
- [ ] Validate live polling updates show proper loading states
- [ ] Check worker health banner appears when offline

:::: tip Sources
Frozen order lifecycle, kill-switch modes, oracle rules, and intent
automation contract: `docs/research/wave4-contract-freeze.md` §1–§5 (incl.
revisions). Trigger threats T22–T24: `docs/research/kryptr-threat-model.md`.
Worker error vocabulary: `packages/shared-types/src/lib/orders.ts`.
::::
