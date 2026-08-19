# Production Load Simulation Framework (Task 3.1)

**Status:** ✅ COMPLETE  
**Created:** 2026-08-19  
**Branch:** feat/qa-sprint3-mainnet-soak-tests  
**Purpose:** Validate system stability under simulated mainnet conditions with statistical significance  

---

## Overview

This load testing infrastructure simulates realistic mainnet transaction patterns to establish performance baselines and validate fail-closed behavior across all failure modes at scale.

### Key Features

✅ **Multi-Scenario Orchestration** - Normal, peak, and stress traffic patterns  
✅ **Distributed Virtual Users** - Configurable concurrency levels (50-500+ users)  
✅ **Real-Time Metrics Collection** - P50/P95/P99 latency, throughput, error rates  
✅ **Automated Baseline Establishment** - 95% confidence intervals with bootstrapping  
✅ **Threshold Validation** - Fail-closed behavior on performance breaches  
✅ **CI/CD Integration** - Daily scheduled runs + on-demand execution via GitHub Actions  

---

## Architecture

```
tests/load/
├── orchestrator.ts              # Main load test coordinator
├── metrics-collector.ts         # Aggregation and reporting engine
├── run-test.ts                  # CLI entry point
└── scenarios/
    ├── mainnet-normal.json      # Typical usage pattern (70/30 read-write)
    ├── mainnet-peak.json        # Peak hour simulation (spike handling)
    └── mainnet-stress.json      # Extreme overload (graceful degradation)
    
reports/
├── load-test-<timestamp>.json   # Individual test results
├── performance-<scenario>.json  # Performance baseline snapshots
└── comparison-summary.md        # Cross-scenario analysis
```

---

## Quick Start

### Local Execution

```bash
# Set environment variables
export BASE_URL="https://api.kryptr.test"
export API_KEY="your-test-api-key"

# Run normal load scenario (default: 10 minute duration)
npm run test:load:normal -- --duration 600

# Run peak load scenario with custom user count
npm run test:load:peak -- --users 150 --duration 3600

# Run stress test with circuit breaker enabled
npm run test:load:stress -- --enable-circuit-breaker

# Run full suite sequentially
npm run test:load:all
```

### CI/CD Execution

GitHub Actions workflow automatically runs daily at **04:00 UTC**:

```yaml
# Schedule trigger from .github/workflows/soak-load.yml
schedule:
  - cron: '0 4 * * *'
```

Manual triggering via `workflow_dispatch`:
```bash
gh workflow run soak-load.yml \
  -f scenario=all \
  -f duration_hours=24
```

---

## Configuration

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `BASE_URL` | Yes | Target API endpoint | `http://localhost:3000` |
| `API_KEY` | No | Authentication token | None |
| `NODE_ENV` | No | Runtime environment | `production` |
| `LOG_LEVEL` | No | Verbose logging | `info` |

### Scenario Parameters

Each scenario defines:

```json
{
  "name": "mainnet-normal",
  "targetDurationSec": 86400,           // Test duration in seconds
  "virtualUsers": 50,                   // Concurrent virtual users
  "endpoints": [...],                   // Request targets with weights
  "trafficPattern": {...},              // User distribution & timing
  "thresholds": {                       // Pass/fail criteria
    "p95ResponseTimeMs": 200,
    "errorRatePercent": 0.1
  }
}
```

### Endpoint Configuration

```json
{
  "path": "/api/v1/transfers",
  "weight": 20,                         // Probability of selection
  "method": "POST",
  "body": {"amount": 1000, "currency": "USDC"},
  "authRequired": true,
  "responseTimeTargetMs": 200           // Per-endpoint SLA
}
```

---

## Metrics Reference

### Latency Percentiles

| Metric | Definition | Target | Significance |
|--------|------------|--------|--------------|
| **P50** | Median response time | <100ms | Typical user experience |
| **P95** | 95th percentile latency | ≤200ms | SLO threshold |
| **P99** | 99th percentile latency | ≤300ms | Edge case handling |
| **Max** | Worst observed latency | ≤1000ms | Maximum acceptable delay |

### Throughput Metrics

- **req/s**: Average requests per second processed
- **Total Requests**: Cumulative requests during test window
- **Peak RPS**: Maximum sustained throughput achieved

### Reliability Indicators

- **Success Rate**: `(Successful / Total) × 100`
- **Error Rate**: `Failed / Total × 100`
  - 4xx client errors (validation, auth failures)
  - 5xx server errors (internal exceptions)
  - Timeouts (>10s response time)

---

## Threshold Validation Rules

### Normal Load (`mainnet-normal`)
```
✅ P95 ≤ 200ms
✅ Error Rate ≤ 0.1%
✅ Success Rate ≥ 99.9%
✅ Zero resource exhaustion (CPU/memory/network)
```

### Peak Load (`mainnet-peak`)
```
✅ P95 ≤ 250ms (allowable 25% degradation vs normal)
✅ Error Rate ≤ 0.5%
✅ Spike response within ±30s windows
✅ Graceful degradation during burst windows
```

### Stress Load (`mainnet-stress`)
```
✅ P95 ≤ 500ms (graceful degradation expected)
✅ Error Rate ≤ 5% (acceptable under extreme pressure)
✅ Circuit breakers activate before system collapse
✅ Automatic recovery after stress subsides
✅ No permanent state corruption
```

---

## Failure Scenarios & Fail-Closed Behavior

### Expected System Responses

1. **High Response Time** (>500ms p95 during normal load)
   - **Action**: Increase auto-scaling triggers
   - **Fail-Closed Gate**: Block new deployments until resolved
   
2. **Cascading Failures** (multiple endpoints returning 5xx)
   - **Action**: Activate circuit breakers between services
   - **Fail-Closed Gate**: Freeze all transactions globally
   
3. **Connection Pool Exhaustion** (<10% available connections)
   - **Action**: Scale connection pool + optimize timeouts
   - **Fail-Closed Gate**: Reject write operations immediately
   
4. **Memory Pressure** (>90% heap utilization)
   - **Action**: Trigger garbage collection + memory leak detection
   - **Fail-Closed Gate**: Disable non-critical features

---

## Debugging Guide

### Common Issues

#### Issue: "No metric points collected"
**Cause**: Base URL unreachable or authentication failed  
**Fix**: Verify `BASE_URL` environment variable and API key validity

#### Issue: "Connection refused errors >5%"
**Cause**: Target server not accepting connections at scale  
**Fix**: Check rate limiting configuration and connection pooling settings

#### Issue: "P95 consistently above threshold"
**Cause**: Database bottlenecks or slow external API calls  
**Fix**: Optimize query performance + add caching layers

#### Issue: "False positive alerts on threshold breach"
**Cause**: Baseline thresholds too aggressive for current workload  
**Fix**: Adjust thresholds using historical trend data

### Advanced Troubleshooting

Enable verbose logging:
```bash
export LOG_LEVEL=debug
npm run test:load:normal -- --verbose
```

Generate detailed flame graphs:
```bash
NODE_ENV=test npx ts-node tests/load/generate-flamegraph.ts
```

---

## Contributing

### Adding New Scenarios

1. Create new JSON config file in `tests/load/scenarios/`
2. Define endpoints, traffic patterns, and thresholds
3. Update `.github/workflows/soak-load.yml` with new job
4. Submit PR with baseline metrics from initial run

### Extending Metrics Collection

Modify `metrics-collector.ts` to add:
- Custom KPI definitions
- Additional percentiles (P90, P97, etc.)
- Resource utilization monitoring (CPU, memory)
- Network I/O measurements

---

## Security Considerations

⚠️ **Production Warning**: Do NOT run stress tests against production environments without:
- Explicit authorization from security team
- Maintenance window coordination
- Rollback procedures documented
- Real-time monitoring dashboards configured

### Safe Testing Practices

✅ Use staging environments with realistic data volumes  
✅ Implement circuit breakers before enabling burst testing  
✅ Set maximum concurrent user limits (≤1000 recommended)  
✅ Monitor database query patterns for unintended side effects  

---

## Next Steps

After Task 3.1 completion, proceed to:

**Task 3.2**: Advanced Persistent Threat (APT) Simulation Suite  
**Task 3.3**: Automated Compliance & Audit Trail Verification

Reference: `docs/SPRINT-3-TODO.md` for complete Sprint 3 roadmap

---

**Last Updated**: 2026-08-19  
**Maintainer**: @auditor-qa  
**License**: MIT
