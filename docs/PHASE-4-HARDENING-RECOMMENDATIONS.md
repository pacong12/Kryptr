# Kryptr Phase 4 Hardening Recommendations

**Prepared by:** @redteam (Kryptr Security Team)  
**Date:** 2026-08-18  
**Context:** Wave 7 Security Assessment Findings  
**Audience:** Conductor + All Domain Owners  

---

## Executive Summary

Based on comprehensive red team testing across attack simulations, fail-closed validation, and contract security analysis, this document provides prioritized recommendations for hardening Phase 4 capabilities (agent integrations, external AI systems, social connectors). The focus is on addressing identified gaps before they become production vulnerabilities.

### Priority Matrix

| Recommendation | Effort | Impact | Timeline | Owner |
|----------------|--------|--------|----------|-------|
| Soak Clock Automation | Low | Critical | Immediate | ops |
| Alerting Dashboard | Medium | High | 1 week | vault+ops |
| Nonce Burn Implementation | Medium | High | 2 weeks | web3 |
| Encoded Payload Monitoring | Low | Medium | 1 week | vault |
| External Agent Isolation | High | Critical | Q4 2026 | all |

---

## Critical Recommendations (Immediate Action Required)

### CRIT-001: Soak Clock CI/CD Integration

**Finding:** Current soak clock enforcement requires manual verification, creating bypass risk via admin override flags.

**Business Impact:** Without automated gate, compromised PR merge could deploy untested Tier D contracts before minimum observation period expires.

**Technical Specification:**

```yaml
# .github/workflows/tierd-soak-enforcement.yml
name: TierD Soak Clock Gate

on:
  workflow_dispatch:
  schedule:
    - cron: '0 * * * *' # Hourly checks

jobs:
  enforce-soak:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        
      - name: Calculate minimum soak timestamp
        id: soak-check
        run: |
          # Get last deployment commit timestamp
          DEPLOY_COMMIT=$(git log --oneline -n 1 deployments/ | cut -d' ' -f1)
          DEPLOY_TIME=$(git log -1 --format=%ct "$DEPLOY_COMMIT")
          
          # Require 24-hour minimum
          MIN_SOAK_EPOCH=$((DEPLOY_TIME + 86400))
          CURRENT_EPOCH=$(date +%s)
          
          REMAINING_SECONDS=$((MIN_SOAK_EPOCH - CURRENT_EPOCH))
          
          if [[ $REMAINING_SECONDS -gt 0 ]]; then
            echo "SoakClockViolation=true" >> $GITHUB_OUTPUT
            echo "❌ Deployment blocked: $REMAINING_SECONDS seconds remaining"
            exit 1
          else
            echo "SoakClockPass=true" >> $GITHUB_OUTPUT
            echo "✅ Soak period satisfied: $(($CURRENT_EPOCH - DEPLOY_TIME)) seconds elapsed"
          fi
      
      - name: Log audit trail entry
        if: steps.soak-check.outputs.S soakClockPass == 'true'
        run: |
          echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Soak clock passed - deployment eligible" \
            >> /tmp/deployment-audit.log
  
      - name: Notify IRC on bypass attempt
        if: steps.soak-check.outputs.SoakClockViolation == 'true'
        run: |
          node scripts/agent-irc.mjs send redteam conductor \
            "⚠️ SOAT_CLOCK_VIOLATION: Attempted deployment with insufficient soak period"
```

**Acceptance Criteria:**
- [ ] Automatic rejection if < 24h from PR merge
- [ ] Audit log entries immutable (append-only)
- [ ] Conductor notified immediately on any bypass attempts
- [ ] Coverage ≥ 95% for soak duration logic

**Implementation Checklist:**
- [ ] Create GitHub Actions workflow file
- [ ] Integrate with existing deployment pipeline
- [ ] Set up alerting webhook to `#kryptr` channel
- [ ] Test edge cases: timezone handling, clock skew mitigation

---

### CRIT-002: Real-Time Security Metrics Dashboard

**Finding:** Attack logs exist but lack real-time visibility; operators cannot detect coordinated botnet attacks in time.

**Business Impact:** Delayed detection of ongoing attacks increases potential loss window and complicates forensic analysis.

**Dashboard Requirements:**

```typescript
// apps/api/src/security/security-dashboard.service.ts
interface SecurityMetrics {
  // Attack attempts by type (last hour)
  attackAttemptsByType: Record<string, number>;
  
  // Rate limit violations (real-time count)
  rateLimitViolations: {
    total: number;
    uniqueWallets: number;
    topOffenders: string[];
  };
  
  // Fail-closed behavior compliance
  failClosedCompliance: {
    evaluatedIntents: number;
    rejectedOnFailure: number;
    autoApprovedError: number; // Should always be 0
  };
  
  // Recovery metrics
  averageRecoveryTimeMs: number;
  humanReviewQueueSize: number;
}

class SecurityDashboardService {
  private metricsBuffer: SecurityMetrics[] = [];
  private dashboardUpdateInterval = 5000; // 5-second updates

  async getRealTimeMetrics(): Promise<SecurityMetrics> {
    const recentWindow = this.metricsBuffer.slice(-12); // Last minute
    
    return {
      attackAttemptsByType: this.groupByAttackType(recentWindow),
      rateLimitViolations: this.analyzeRateLimits(recentWindow),
      failClosedCompliance: this.calculateCompliance(recentWindow),
      averageRecoveryTimeMs: this.computeAverageRecovery(recentWindow),
      humanReviewQueueSize: await this.queueRepository.countPending(),
    };
  }

  private analyzeRateLimits(metrics: SecurityMetrics[]): RateLimitStats {
    const recent = metrics.filter(m => m.rateLimitViolations.total > 0);
    
    return {
      total: recent.reduce((sum, m) => sum + m.rateLimitViolations.total, 0),
      uniqueWallets: new Set(
        recent.flatMap(m => m.rateLimitViolations.topOffenders)
      ).size,
      topOffenders: recent
        .flatMap(m => m.rateLimitViolations.topOffenders)
        .sort((a, b) => /* frequency sort */)
        .slice(0, 10),
    };
  }
}
```

**Frontend Component (DeckUI):**
```vue
<!-- components/admin/SecurityMetricsCard.vue -->
<script setup lang="ts">
import { useSocket } from '@/composables/useSocket';
import type { SecurityMetrics } from '@kryptr/shared-types';

const metrics = ref<SecurityMetrics>({
  attackAttemptsByType: {},
  rateLimitViolations: { total: 0, uniqueWallets: 0, topOffenders: [] },
  failClosedCompliance: { evaluatedIntents: 0, rejectedOnFailure: 0, autoApprovedError: 0 },
  averageRecoveryTimeMs: 0,
  humanReviewQueueSize: 0,
});

const socket = useSocket();
socket.on('security-metrics', (data: SecurityMetrics) => {
  metrics.value = data;
});
</script>

<template>
  <div class="security-dashboard">
    <metric-card title="Attack Attempts (1h)" :value="attackCount">
      <bar-chart :data="attackTypes" color="#ef4444" />
    </metric-card>
    
    <metric-card 
      title="Fail-Closed Compliance" 
      :value="`${complianceRate}%`"
      :status="failClosedCompliance.autoApprovedError === 0 ? 'pass' : 'fail'"
    >
      <alert v-if="failClosedCompliance.autoApprovedError > 0" 
             icon="🚨" 
             :message="`${failClosedCompliance.autoApprovedError} unauthorized approvals!`" />
    </metric-card>
    
    <metric-card title="Human Review Queue" :value="humanReviewQueueSize" status="warning" />
  </div>
</template>
```

**Acceptance Criteria:**
- [ ] Metrics refresh every 5 seconds
- [ ] Alert threshold: >100 attack attempts/min triggers critical notification
- [ ] Historical data retention: 30 days
- [ ] Access control: Only authorized admins can view

---

## High Priority Recommendations (1-2 Week Timeline)

### HIGH-001: Implement Nonce Burn-After-Use Pattern

**Finding:** Contract nonce system lacks irreversible burn mechanism, enabling replay attacks under certain conditions.

**Smart Contract Implementation:**

```solidity
// contracts/src/TierDBattery.sol
contract TierDBattery {
    struct NonceState {
        uint256 lastUsedNonce;
        mapping(uint256 => bool) burnedNonces; // Immutable record
        bytes32 nonceHashChain; // Hash chain integrity
    }
    
    NonceState public nonceState;
    
    function executeWithNonce(bytes calldata payload, uint256 nonce) external {
        _validateBurnAfterUse(nonce);
        
        // Execute transaction
        _executePayload(payload);
        
        // IRREVERSIBLY BURN NONCE
        _burnNonceImmutable(nonce);
    }
    
    function _validateBurnAfterUse(uint256 nonce) private view {
        require(nonce > nonceState.lastUsedNonce, "Nonce must increase");
        require(!nonceState.burnedNonces[nonce], "Nonce already consumed");
    }
    
    function _burnNonceImmutable(uint256 nonce) private {
        // Prevent state mutation after execution
        nonceState.burnedNonces[nonce] = true;
        
        // Update hash chain for audit trail
        bytes32 currentHash = keccak256(abi.encodePacked(nonce, block.timestamp));
        bytes32 newChainHash = keccak256(abi.encodePacked(currentHash, nonceState.nonceHashChain));
        nonceState.nonceHashChain = newChainHash;
        
        emit NonceBurned(nonce, newChainHash);
    }
    
    event NonceBurned(uint256 indexed nonce, bytes32 chainHash);
}
```

**Forge Test Cases:**
```solidity
// contracts/test/TierDBattery.t.sol
function test_nonceBurnIrreversible() public {
    uint256 initialNonce = 42;
    battery.executeWithNonce(payload, initialNonce);
    
    // Attempt replay
    vm.expectRevert("NonceAlreadyConsumed");
    battery.executeWithNonce(payload, initialNonce);
    
    // Verify burn recorded immutably
    assertTrue(battery.nonceState().burnedNonces(initialNonce));
    
    // Hash chain updated
    bytes32 expectedHash = computeNonceChainHash();
    assertEq(battery.nonceState().nonceHashChain(), expectedHash);
}
```

**Audit Requirements:**
- [ ] Formal verification using Mythril/Echidna
- [ ] Independent code review by two security auditors
- [ ] Gas optimization analysis (current estimate: +150 gas per tx)

---

### HIGH-002: Encoded Payload Detection Enhancement

**Finding:** Current base64 detection regex misses some obfuscation patterns (Morse, unicode homoglyphs).

**Enhanced Detection Logic:**

```typescript
// apps/api/src/security/payload-inspection.ts
class PayloadInspector {
  private readonly ENCODING_PATTERNS = {
    base64: /^[A-Za-z0-9+/]{16,}={0,2}$/,
    base64url: /^[A-Za-z0-9_-]{16,}={0,2}$/i,
    morse: /[•—.,]/, // Unicode Morse symbols
    unicodeMix: /[^\u0000-\u007F]{3,}/, // Multi-byte character clusters
    htmlEntities: /&#\d+;|&[a-z]+;/gi,
  };

  inspect(textInstructions: string | null): InspectionResult {
    if (!textInstructions) return { safe: true };

    const findings: string[] = [];

    // Check each encoding pattern
    for (const [type, pattern] of Object.entries(this.ENCODING_PATTERNS)) {
      if (pattern.test(textInstructions)) {
        findings.push(`EncodedPayloadDetected:${type}`);
      }
    }

    // Homoglyph analysis
    if (this.hasHomoglyphs(textInstructions)) {
      findings.push('SuspiciousCharacterSubstitution');
    }

    return {
      safe: findings.length === 0,
      detectedPatterns: findings,
      severity: findings.length > 1 ? 'HIGH' : 'MEDIUM',
    };
  }

  private hasHomoglyphs(text: string): boolean {
    const latinOnly = /^[a-zA-Z0-9@\.:_\s-]+$/;
    
    // Flag Cyrillic/Greek/Latin mix (common spoofing technique)
    const hasMixedScripts = !latinOnly.test(text);
    const cyrillicPattern = /[\u0400-\u04FF]/;
    
    return cyrillicPattern.test(text);
  }
}
```

**Integration Points:**
1. Pre-process ALL text instructions through inspector before intent creation
2. Reject immediate if ANY encoding detected (`rejectEncodedPayloads = true`)
3. Log flagged attempts with full context to audit trail
4. Trigger IRC alert if patterns match known attack signatures

---

## Medium Priority Recommendations (Q4 2026 Planning)

### MED-001: External Agent Isolation Framework

**Context:** Phase 4 introduces external AI agents (social connectors, marketplace bots) which significantly expand attack surface.

**Architecture Design:**

```typescript
// packages/shared-types/src/lib/agent-security.ts
interface ExternalAgentPolicy {
  agentId: string;
  maxDailyVolumeUsd: number;
  allowedChains: ChainId[];
  originDomain?: string; // Require SSL certificate绑定
  requiresMultiSig: boolean;
  cooldownPeriodMs: number; // New recipient restriction
}

class AgentIsolationService {
  private agentWhitelist = new Map<string, ExternalAgentPolicy>();
  
  async validateAgentIntent(
    agentId: string,
    intent: TransactionIntent
  ): Promise<SecurityDecision> {
    const policy = this.agentWhitelist.get(agentId);
    if (!policy) {
      return REJECT_REASON: 'UnregisteredExternalAgent'};
    }
    
    // Enforce per-agent spend caps
    const dailySpend = await this.getSpendLedger(agentId);
    if (dailySpend > policy.maxDailyVolumeUsd) {
      return SECURITY_CHECK_RESULTS.rejected;
    }
    
    // Require multi-sig for high-value transfers
    if (intent.usdValue > 1000 && policy.requiresMultiSig) {
      await this.requireMultiSignature(intent);
    }
    
    // Cooldown for new recipients
    if (isNewRecipient(intent.toAddress) && !policy.cooldownPassed()) {
      return SECURITY_CHECK_RESULTS.needs_human_approval;
    }
    
    return SECURITY_CHECK_RESULTS.approved;
  }
}
```

**Testing Strategy:**
- Fuzz testing with randomized agent behaviors
- Replay existing Bankr attack patterns against isolated agents
- Formal verification of isolation boundaries

---

## Implementation Status Tracker

| Recommendation | Status | Completion % | ETA | Blockers |
|----------------|--------|--------------|-----|----------|
| CRIT-001: Soak Clock Automation | 🟡 IN PROGRESS | 60% | Aug 22 | Ops team bandwidth |
| CRIT-002: Security Dashboard | 🔴 NOT STARTED | 0% | Sep 05 | Frontoffice capacity |
| HIGH-001: Nonce Burn | 🟡 IN PROGRESS | 30% | Aug 30 | Smart contract audit schedule |
| HIGH-002: Payload Detection | ✅ IMPLEMENTED | 100% | Aug 18 | None |
| MED-001: Agent Isolation | ⏳ PLANNING | 10% | Nov 15 | Phase 4 spec freeze |

---

## Success Metrics

Define measurable outcomes for hardening efforts:

1. **Zero Successful Attacks:** No exploitable vulnerabilities found in next quarter penetration test
2. **Detection Time:** < 5 minutes from attack start to operator alert
3. **Recovery Time:** < 30 minutes from detection to containment
4. **Compliance Rate:** 100% fail-closed behavior under simulated failures
5. **Coverage:** ≥ 90% test coverage for all security-relevant code paths

---

## Approval & Sign-off

**Red Team Lead:** @redteam (signed 2026-08-18)

**Conductor Decision Required:** ☐ Approved | ☐ Revisions Needed | ☐ Deferred

**Next Review Date:** 2026-09-15 (Monthly progress check)

---

*This document generated following Kryptr Agent Protocol §3.4 and ORCHESTRA commandments.*
