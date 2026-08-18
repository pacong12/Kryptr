# Kryptr Red Team Security Test Suite

**Status:** Active | **Maintainer:** @redteam  
**Last Updated:** 2026-08-18  

---

## Overview

This directory contains comprehensive security attack simulations designed to validate Wave 7 implementations against adversarial threats. All tests follow the principle of **fail-closed**: under ANY failure condition, the system must reject requests rather than auto-approve.

### Test Philosophy

1. **Replay Bankr/Grok Incidents:** Replicate May 2026 attack patterns ($150K-$200K losses)
2. **Test Before Production:** Validate defenses before S6 mainnet deployment
3. **Safe Exploitation:** Run in isolated environments only - NEVER on production systems
4. **Immediate Alerting:** Any FAIL condition triggers IRC notification to conductor + domain owners

---

## Test Categories

### 🎯 Attack Vector Simulations (`attack-simulations/`)

Testing direct adversary attempts to breach security boundaries:

| Test File | Attack Type | Severity | Status |
|-----------|-------------|----------|--------|
| `calldata-poisoning.spec.ts` | Malformed swap parameters → bypass decimals/validation | CRITICAL | ✅ PASS |
| `gate-bypass.spec.ts` | Direct signer calls without intent evaluation | CRITICAL | ✅ PASS |
| `rate-limit-flood.spec.ts` | Concurrent request flooding → DoS/race conditions | HIGH | ✅ PASS |
| `payload-injection.spec.ts` | Base64/Morse/unicode obfuscation → unauthorized transfers | HIGH | ✅ PASS |

#### Running Attack Tests

```bash
# Full suite
pnpm exec vitest run tests/red-team/attack-simulations/

# Single attack vector
pnpm exec vitest run tests/red-team/attack-simulations/calldata-poisoning.spec.ts --reporter=verbose
```

---

### 🛡️ Fail-Closed Validation (`fail-closed/`)

Ensuring system rejects under ALL failure modes:

| Test File | Failure Mode | Expected Behavior | Status |
|-----------|--------------|-------------------|--------|
| `network-failure-scenarios.spec.ts` | Signer unavailable / RPC timeout | Reject → pending state | ✅ PASS |
| `signature-enforcement.spec.ts` | Invalid signatures / replay attempts | Block immediately | ✅ PASS |
| `timeout-handling.spec.ts` | Service timeouts (30s limit) | Default to rejection | ✅ PASS |
| `policy-violation-rejection.spec.ts` | Daily cap exceeded / chain not allowlisted | Auto-reject | ✅ PASS |

#### Key Requirements Verified

✅ No automated approval when ANY dependency fails  
✅ Human review queue activated during degraded modes  
✅ All rejections logged to immutable audit trail  

---

### 🔒 Contract Security (`contract-security/`)

Smart contract vulnerability analysis:

| Test File | Focus Area | Findings | Status |
|-----------|------------|----------|--------|
| `tierd-vulnerability-analysis.spec.ts` | Soak clock bypass attempts | CI/CD integration needed | ⚠️ NEEDS ATTENTION |
| `nonce-replay-protection.spec.ts` | Burn-after-use mechanisms | Implemented correctly | ✅ PASS |
| `keyless-signature-recovery.spec.ts` | Domain separation / low-S attacks | Minor improvements suggested | ✅ PASS |

#### Testing Methodology

Based on formal verification techniques from Solidity security audits:
- Arithmetic overflow guards verification
- Checks-Effects-Interactions pattern validation
- Access control matrix testing
- Reentrancy attack simulation

---

## Quick Start Guide

### Prerequisites

```bash
# Install dependencies
pnpm install

# Ensure test environment variables configured
cp .env.example .env
```

### Running Full Suite

```bash
# Comprehensive security audit
pnpm exec vitest run tests/red-team/ --coverage

# Generate HTML coverage report
open coverage/index.html
```

### Individual Test Execution

```bash
# Focus on specific attack vector
pnpm exec vitest run tests/red-team/attack-simulations/gate-bypass.spec.ts

# Run with verbose output
pnpm exec vitest run tests/red-team/ --reporter=verbose

# Watch mode for development
pnpm exec vitest watch tests/red-team/
```

### Integration with CI/CD

Tests automatically run on:
- PR creation to `main` branch
- Weekly scheduled runs (Sunday 02:00 UTC)
- Manual trigger via GitHub Actions workflow dispatch

---

## Interpreting Results

### Pass Criteria ✅

- **All assertions pass** - System behaves as expected under attack
- **Fail-closed verified** - No approval occurred when should have rejected
- **Audit logging complete** - All events recorded to immutable trail
- **Alerting triggered** - IRC notifications sent to oncall team

### Fail Indicators ❌

If any test FAILS:

1. **Stop:** Do NOT merge related code changes
2. **Investigate:** Review failed assertion logs
3. **Remediate:** Fix vulnerability + add regression test
4. **Re-test:** Confirm fix works across all scenarios
5. **Escalate:** Notify conductor via IRC if critical finding

### Warning Signs ⚠️

Non-critical issues that should be addressed:

- Missing edge case coverage
- Performance degradation under load (>2x baseline)
- Documentation gaps in security policies
- Recommended enhancements for defense depth

---

## Security Incident Response

If test reveals actual vulnerability:

### Immediate Actions (≤5 minutes)

```bash
# Broadcast alert to #kryptr channel
node scripts/agent-irc.mjs send redteam conductor \
  "VULNERABILITY DETECTED: [Severity] - [Brief description]"

# Pause affected component via kill switch
curl -X PATCH http://localhost:3000/api/admin/kill-switch \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode":"pause_new","reason":"Red team vulnerability detected"}'
```

### Post-Incident (≤24 hours)

1. **Root Cause Analysis:** Document attack path + entry point
2. **Fix Implementation:** Patch vulnerability in codebase
3. **Regression Test:** Add new test case to prevent recurrence
4. **Conductor Report:** Submit findings summary + patch ETA

---

## Contribution Guidelines

### Adding New Attack Vectors

When simulating NEW threat scenarios:

```typescript
// Template for new attack simulation
describe('RedTeam - [Attack Type] ([RT-XXX])', () => {
  it('[Expected behavior] under [specific condition]', async () => {
    // Setup: Create poisoned/malicious input
    const maliciousInput = createPoisonedPayload();
    
    // Execute: Attempt attack
    const result = await dangerousOperation(maliciousInput);
    
    // Verify: Fail-closed behavior
    expect(result).toBe(SECURITY_CHECK_RESULTS.rejected);
    expect(mockSigner.sign).not.toHaveBeenCalled();
    
    // Log: Record attempt for security monitoring
    console.warn(`🚨 REDTEAM_ALERT: ${attackDescription}`);
  });
});
```

### Updating Existing Tests

When modifying tests:

- Maintain backwards compatibility for passing scenarios
- Update evidence documentation in `/docs/`
- Notify domain owners if behavior changes

### Code Quality Standards

- **Type Safety:** Zero `any` types permitted
- **Coverage:** Minimum 85% branch coverage required
- **Comments:** Explain security rationale, not obvious logic
- **Naming:** Clear intent in test descriptions (e.g., "REJECTS invalid checksum")

---

## References & Resources

### External Research

- `[S1–S22]` Bankr incident evidence registry → `bankrbot-analysis.md`
- `[O1–O22]` Oracle manipulation research → `wave4-oracle-research.md`
- `[L1–L30]` Agent compromise study → `web3-agent-landscape.md`

### Internal Documentation

- Threat Model: `/docs/threat-model-w7.md`
- Assessment Report: `/docs/red-team-report.md`
- ORCHESTRA Commandments → Security gate requirements
- HITL Requirements → Phase 1 human-in-the-loop specifications

### Tools & Frameworks

- **Testing:** Vitest + TypeScript
- **Coverage:** c8 (Code Coverage)
- **Fuzz Testing:** Echidna (upcoming)
- **Formal Verification:** KLEE/EVM (planned for Q4 2026)

---

## License & Compliance

This security test suite is proprietary to Kryptr and intended solely for internal security assessment purposes. Redistribution requires explicit authorization from Conductor office.

**Classification:** INTERNAL USE ONLY  
**Distribution List:** Conductor + Domain Owners (vault, web3, ops, deck, face)  
**Expiration:** Retest required quarterly or after major architecture changes

---

*Generated by @redteam following Kryptr Agent Protocol §3.4 (Security Pentesting Persona)*
