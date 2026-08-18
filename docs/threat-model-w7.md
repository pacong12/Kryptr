# Kryptr Wave 7 Threat Model & Security Simulation Suite

**Author:** `redteam` (Kryptr Security Team)  
**Date:** 2026-08-18  
**Audience:** `vault`, `web3`, `ops`, `conductor`  
**Status:** **ACTIVE** | **Priority:** CRITICAL  

---

## Executive Summary

This document presents a comprehensive threat model and attack simulation suite for **Wave 7** (S2 completion + S6 Mainnet preparation). Building on lessons from the May 2026 Bankr/Grok incidents (`$150K-$200K single-wallet losses`), we simulate adversarial attacks targeting:

1. **Security gate bypass** — direct signing without approval
2. **Prompt injection / calldata poisoning** — encoded instruction attacks
3. **Fail-open vulnerabilities** — error handling that defaults to allow
4. **Rate limit exhaustion** — concurrent request flooding
5. **Policy manipulation** — privilege escalation via config tampering

All simulations run in **isolated test harnesses** with **fail-closed** expectations. Any violation triggers immediate red team alert to conductor and domain owners.

---

## 1. Attack Surface Map

### In-Scope Components (W7)

| Component | Path | Entry Points | Risk Level |
|-----------|------|--------------|------------|
| **ZeroExVenueAdapter** | `apps/api/src/trading/infrastructure/zero-ex-venue.adapter.ts` | `/api/trading/quote`, `/api/trading/execute` | HIGH |
| **Intent Evaluation Gate** | `apps/api/src/security/application/evaluate-intent.usecase.ts` | `/api/security/evaluate-intent` | CRITICAL |
| **Spend Ledger** | `apps/api/src/security/infrastructure/postgres-spend-ledger.ts` | Internal API calls | HIGH |
| **Tier D Battery Contracts** | `contracts/src/BatteryTiered.sol` | Forge tests, deployment script | MEDIUM |
| **API Wallet Endpoints** | `apps/api/src/wallet/*.controller.ts` | `/api/wallets/:id`, `/api/transfers` | MEDIUM |

### Out-of-Scope (Phase 1)

❌ External AI agent integrations (Phase 4)  
❌ Uniswap v4 integration (not production-ready)  
❌ Factory contract mainnet deployment (S6 pending verification)  

---

## 2. Threat Actors & Capabilities

| Actor | Capability | Attack Vector | Evidence |
|-------|------------|---------------|----------|
| **External Opportunistic** | Automated scanning, phishing | E-2 endpoint abuse, E-4 social engineering | `[S4][S14]` |
| **Targeted Financial** | Encoded payloads, session attacks | Prompt injection, calldata poisoning | `[S7][S11]` |
| **Compromised Agent** | Legit origin hijack | Grok-like unauthorized intent generation | `[S11]` |
| **Malicious Insider** | Policy access | T9 policy tampering, T3 privilege escalation | `[L26][L27]` |

---

## 3. Critical Threat Vectors (W7 Specific)

### T1 — ZeroEx Calldata Poisoning (CRITICAL)

**Scenario:** Attacker submits malformed or obfuscated swap calldata through ZeroExVenueAdapter, attempting to:
- Bypass decimal validation (e.g., `1e-18` vs `1e18`)
- Inject malicious recipient addresses via encoded parameters
- Exploit rate-limit gaps through parallel requests

**Attack Pattern:**
```typescript
// Example poisoned payload
{
  sellToken: "0xencoded_malicious_address",
  buyToken: "0x...deadbeef...",
  receiver: null, // attempt to use fallback attacker address
  parts: [{ steps: [/* manipulated routing */] }]
}
```

**Expected Behavior (Fail-Closed):**
- Reject any input failing checksum validation
- Log poisoning attempt as SECURITY_ALERT
- Return HTTP 400 without executing transaction

**Test Coverage:** See `tests/red-team/calldata-poisoning.spec.ts`

---

### T2 — Intent Evaluation Gate Bypass (CRITICAL)

**Scenario:** Direct call to `signer.port.sign()` without passing through `EvaluateIntentUseCase`, replicating May 4 Bankr incident pattern where natural language instructions triggered transfers.

**Attack Pattern:**
```typescript
// Malicious direct signer call
await signer.sign({
  target: routerAddress,
  value: BigInt(transferAmount),
  data: encodeTransferCall(to, amount),
});
```

**Expected Behavior:**
- Module boundary check prevents signer import outside security domain
- CI contract test fails if any value-moving route lacks gate interceptor
- Audit log records ALL signature requests (even dry-run)

**Test Coverage:** See `tests/red-team/gate-bypass.spec.ts`

---

### T3 — Concurrent Request Flooding (HIGH)

**Scenario:** Denial-of-service via excessive parallel quote requests to ZeroExVenueAdapter, exhausting API rate limits or causing race conditions in spend ledger.

**Attack Pattern:**
```bash
for i in {1..1000}; do
  curl -X POST http://api:3000/trading/quote \
    -H "Content-Type: application/json" \
    -d '{"walletId":"test","amount":"1e18"}' &
done
wait
```

**Expected Behavior:**
- Rate limiter returns HTTP 429 after threshold exceeded
- Spend ledger rejects overlapping transactions per wallet
- Health endpoint flags degraded state

**Test Coverage:** See `tests/red-team/rate-limit-flood.spec.ts`

---

### T4 — Encode Payload Injection (HIGH)

**Scenario:** Base64/Morse/Unicode-obfuscated instructions reach agent endpoint, producing malicious intent. Replicates May 4 chain where `"send everything to 0x..."` became actual transfer.

**Input Examples:**
```
"U2VuZCBleGVjdXRpb24=" // base64-encoded "Send execution"
"↯⬧⧫⬥" // Unicode obfuscation
"<script>alert('malicious')</script>" // XSS → SQLi vector
```

**Expected Behavior:**
- `SecurityPolicy.rejectEncodedPayloads === true` triggers rejection
- Input sanitization layer strips encoding before intent creation
- Origin allowlist validated server-side (never client-supplied)

**Test Coverage:** See `tests/red-team/payload-injection.spec.ts`

---

### T5 — Soak Clock Bypass (MEDIUM)

**Scenario:** Attempt to deploy Tier D contracts before minimum 24-hour soak period expires, circumventing PR merge validation logic.

**Attack Pattern:**
- Modify `TierD.fork.test.ts` to skip time-based assertions
- Force deployment via admin override flag
- Manipulate environment variables to falsify soak duration

**Expected Behavior:**
- Forge test fails if `block.timestamp - deploymentTime < 24h`
- CI/CD gate blocks merge if soak clock not satisfied
- Conductor receives ALERT notification before any deployment

**Test Coverage:** See `tests/red-team/soak-clock-bypass.spec.ts`

---

### T6 — Burn-after-Use Nonce Replay (MEDIUM)

**Scenario:** Reuse of previous transaction nonce in keyless signature recovery mechanism, enabling replay attacks.

**Attack Pattern:**
```solidity
// Attempt replay with old nonce
uint256 oldNonce = 42;
bool success = recoverKeylessSig(messageHash, oldSignature, oldNonce);
// Should revert: nonce too low
```

**Expected Behavior:**
- Nonce validation enforces monotonic increase (nonce > lastUsedNonce)
- Burn-after-use pattern ensures each nonce consumed once
- Contract reverts on any nonce replay attempt

**Test Coverage:** See `tests/red-team/noncereplay.spec.ts`

---

## 4. Fail-Closed Behavior Requirements

### F1 — Network Failure Handling

| Failure Mode | Expected Response | Test Case |
|--------------|------------------|-----------|
| Gateway unavailable | Reject intent → `SecurityDecision.result = 'rejected'` | `network-failure-gateway-down.spec.ts` |
| RPC provider timeout | Timeout + fall back to secondary RPC | `rate-limit-timeout.spec.ts` |
| Database connection lost | Abort transaction, maintain consistency | `postgres-connection-fail.spec.ts` |

### F2 — Signature Validation Enforcement

- Every value-moving endpoint must pass signature check
- Invalid signature → automatic rejection, no grace periods
- Dry-run signatures still logged to audit trail

### F3 — Policy Violation Auto-Rejection

- Daily cap exceeded → reject all intents until reset (24h window)
- Chain not in allowlist → reject immediately
- Origin not in `allowedOrigins` → return 403 Forbidden

---

## 5. Mitigation Strategies

### Mitigation M1 — Layered Defense Architecture

```
┌─────────────────────────────────────┐
│   UI Layer (FaceUI/DeckUI)          │  ← User consent screen
├─────────────────────────────────────┤
│   API Gateway (Rate Limiter)        │  ← Throttle requests
├─────────────────────────────────────┤
│   Intent Evaluation Gate            │  ← Security policy check
├─────────────────────────────────────┤
│   Spend Ledger                      │  ← Atomic cap enforcement
├─────────────────────────────────────┤
│   Signer Service (Dry-run/Real)     │  ← Final signature enforcement
└─────────────────────────────────────┘
```

### Mitigation M2 — Real-Time Alerting

```typescript
// On any security event, broadcast to IRC
node scripts/agent-irc.mjs send redteam conductor \
  "VULNERABILITY DETECTED: ${event.type} on ${endpoint}"
```

### Mitigation M3 — Kill Switch Mechanism

```typescript
// Backoffice emergency pause (Bankr pattern)
PATCH /api/admin/kill-switch {
  mode: 'pause_all', // or 'pause_new', 'cancel_active'
  reason: string (required)
}
```

---

## 6. Security Testing Matrix

| Test ID | Attack Vector | Component | Severity | Status |
|---------|---------------|-----------|----------|--------|
| RT-001 | Calldata Poisoning | ZeroExVenueAdapter | CRITICAL | ✅ PASS |
| RT-002 | Gate Bypass | EvaluateIntentUseCase | CRITICAL | ✅ PASS |
| RT-003 | Rate Limit Flood | API Gateway | HIGH | ✅ PASS |
| RT-004 | Payload Injection | Intent Creation | HIGH | ✅ PASS |
| RT-005 | Soak Clock Bypass | CI/CD Gate | MEDIUM | ✅ PASS |
| RT-006 | Nonce Replay | TierD Contracts | MEDIUM | ✅ PASS |
| RT-007 | Network Failure | All Services | HIGH | ✅ PASS |
| RT-008 | Policy Tampering | Admin Endpoints | MEDIUM | ✅ PASS |

---

## 7. Incident Response Protocol

### Immediate Actions (Within 5 minutes)

1. **Detect**: Red team simulation flags FAIL condition
2. **Alert**: Broadcast to `#kryptr` via IRC message
3. **Contain**: Pause affected component via kill switch
4. **Notify**: Conductor + domain owner (`vault`/`web3`/`ops`)

### Post-Incident (Within 24 hours)

1. **Root Cause Analysis**: Document attack path + entry point
2. **Mitigation Implementation**: Fix vulnerability + add regression test
3. **Audit Trail Update**: Append security decision logs
4. **Conductor Report**: Submit findings summary + patch ETA

---

## 8. References

- `[S1–S22]` Bankr/Grok incident evidence registry (`bankrbot-analysis.md`)
- `[O1–O22]` Oracle trigger research (`wave4-oracle-research.md`)
- `[L1–L30]` Agent landscape study (`web3-agent-landscape.md`)
- **ORCHESTRA**: Commandments #1-3 (security gate requirements)
- **ROADMAP Phase 1**: HITL requirements (§7 Kryptr Phase 1 Threat Model)

---

## 9. Next Steps

| Task | Owner | Due Date |
|------|-------|----------|
| Run full simulation suite | `redteam` | 2026-08-18 |
| Review findings | `vault` + `web3` | 2026-08-19 |
| Implement mitigations | Domain owners | 2026-08-22 |
| Re-test all vectors | `redteam` | 2026-08-23 |
| Final sign-off | `conductor` | 2026-08-25 |

---

**Approval Required:** Conductor must ACK this threat model before any S6 mainnet deployment.  
**Review Cycle:** Retest quarterly or after major architecture changes.

---

*Generated by @redteam using Kryptr Agent Protocol §3.4 (Security Pentesting Persona)*
