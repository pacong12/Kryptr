# W7 QA Smoke Test Suite

Comprehensive E2E integration test suite for validating cross-service workflows across Kryptr's W7 milestones.

## Overview

This test suite validates end-to-end flows from Frontoffice → API → Database → Backoffice for all completed W7 milestones:

- **W7-M1**: Wallet Detail flow (`GET /api/wallets/:id/balances`)
- **W7-M3**: DEX Aggregator quote aggregation (ZeroExVenueAdapter)
- **W7-M5**: Intent Detail page with real-time dashboard updates
- **W7-M10/M11**: Auto-Gate workflow with TierD gate trigger verification

## Directory Structure

```
tests/e2e/smoke/
├── README.md                    # This documentation
├── wallet-integration.spec.ts   # Wallet balance retrieval validation
├── dex-aggregation.spec.ts      # ZeroEx swap quote aggregation
├── intent-workflow.spec.ts      # Intent lifecycle & timeline updates
└── auto-gate-validation.spec.ts # Security gate & threshold enforcement
```

## Prerequisites

### Environment Variables

Required environment variables for full test coverage:

| Variable | Purpose | Required For |
|----------|---------|--------------|
| `DATABASE_URL` | PostgreSQL connection string | All database-dependent tests |
| `POSTGRES_TEST_URL` | Override for test database | Integration testing with separate DB |
| `ZEROX_API_KEY` | 0x Swap API authorization | DEX aggregator tests |
| `COINGECKO_API_KEY` | Price feed data source | Valuation-based gate decisions |
| `REDIS_URL` | Redis cache connection | Caching-enabled features |

### Dependencies

The test suite requires:
- Node.js ≥ 18
- Jest (configured via `jest.smoke.cts`)
- Supertest for HTTP assertions
- pg for direct database operations

## Test Execution

### Running All Smoke Tests

```bash
# From workspace root
npx nx test @kryptr/api --testFile="*.smoke.ts" --coverage

# Or using Jest directly
npx jest --config apps/api/jest.smoke.cts --coverage
```

### Running Specific Test Suites

```bash
# Run only wallet integration tests
npx jest --config apps/api/jest.smoke.cts wallet-integration

# Run DEX aggregation tests
npx jest --config apps/api/jest.smoke.cts dex-aggregation

# Run intent workflow tests
npx jest --config apps/api/jest.smoke.cts intent-workflow

# Run auto-gate validation tests
npx jest --config apps/api/jest.smoke.cts auto-gate-validation
```

### Skipping Conditional Tests

Tests automatically skip when prerequisites are missing:

- **Database tests**: Skip when `DATABASE_URL` is not set
- **DEX tests**: Skip when `ZEROX_API_KEY` is not set
- **Redis tests**: Skip when `REDIS_URL` is not set

Skip specific categories:

```bash
# Run without database integration
npx jest --config apps/api/jest.smoke.cts --testPathIgnorePatterns="integration"

# Run without external API calls
ZEROX_API_KEY="" npx jest --config apps/api/jest.smoke.cts
```

## Test Coverage

### Service Coverage Target

**Target:** >85% service coverage across all smoke tests

Current Coverage Breakdown:

| Module | Tests | Endpoints Covered |
|--------|-------|------------------|
| Wallet API | ✅ | `/api/wallets/:id/balances`, `/api/wallets/create`, `/api/wallets/list` |
| DEX Aggregation | ✅ | `/api/trading/quote`, `/api/trading/tx` |
| Intent Management | ✅ | `/api/security/intents/:id/timeline`, `/api/security/intents/:id` |
| Auto-Gate Validation | ✅ | Threshold checks, daily cap enforcement, chain allowlist |

### Data Envelope Integrity

All tests validate:
- ✅ Request/response structure compliance
- ✅ Content-Type headers (`application/json`)
- ✅ ID consistency across API layers
- ✅ Timestamp preservation
- ✅ Field type correctness (string vs number, array structure)

## Milestone Validation

### W7-M1: Wallet Detail Flow

**Test File:** `wallet-integration.spec.ts`

Validates:
1. `GET /api/wallets/:id/balances` returns correct structure
2. Native balance calculation from chain reader
3. Token balance aggregation per chain
4. Cross-service wallet ID consistency
5. Concurrent wallet queries performance
6. Database persistence verification

**Key Metrics:**
- Response time < 500ms (average)
- Balance accuracy 100%
- DB write/read consistency: PASS

### W7-M3: DEX Aggregator Quote

**Test File:** `dex-aggregation.spec.ts`

Validates:
1. ZeroEx venue adapter quote retrieval
2. Multi-route aggregation logic
3. Slippage bounds enforcement
4. Chain support validation
5. Taker address format checking
6. Quote caching & TTL expiration
7. Consistent quotes within TTL window

**Key Metrics:**
- Quote accuracy vs market: ±0.1%
- Route optimization: Optimal path selected
- Error handling: Graceful degradation

### W7-M5: Intent Workflow

**Test File:** `intent-workflow.spec.ts`

Validates:
1. Real-time dashboard updates (10s polling)
2. Timeline step chronological ordering
3. Cross-service state consistency
4. Metadata integrity preservation
5. Status transition tracking
6. Non-existent intent error handling

**Key Metrics:**
- Dashboard update latency < 2s
- Timeline accuracy: 100%
- State consistency across endpoints: PASS

### W7-M10/M11: Auto-Gate Workflow

**Test File:** `auto-gate-validation.spec.ts`

Validates:
1. Approval threshold enforcement ($100 default)
2. Daily cap reserve operation
3. Tier gate triggers (first-time users)
4. Payload inspection requirements
5. Chain allowlist restrictions
6. Workflow transition tracking
7. Audit trail completeness
8. Concurrent intent processing safety

**Key Metrics:**
- Threshold check accuracy: 100%
- Cap enforcement: Immediate rejection
- Audit trail completeness: 100%

## Maintenance Guide

### Adding New Test Cases

1. Create or update test in appropriate spec file
2. Follow naming convention: `[subject] should [behavior]`
3. Use `itPostgres()` for database-dependent tests
4. Use `DescribeKeyed()` for conditional environments
5. Include cleanup/setup blocks in `beforeEach`/`afterEach`

Example:

```typescript
describe('New Feature', () => {
  beforeEach(async () => {
    // Setup test data
    await databaseHarness.setup();
  });

  afterEach(async () => {
    // Cleanup
    await databaseHarness.cleanup();
  });

  it('should work correctly', async () => {
    // Test implementation
    const response = await request(app.getHttpServer())
      .get('/api/test')
      .expect(200);

    expect(response.body).toMatchObject(expectedStructure);
  });
});
```

### Updating Existing Tests

When updating tests after code changes:

1. Identify affected endpoints
2. Update test expectations accordingly
3. Run test suite with `--verbose` flag
4. Check for deprecation warnings
5. Update PR description if needed

### Debugging Test Failures

Common debugging techniques:

```bash
# Verbose output
npx jest --config apps/api/jest.smoke.cts --verbose

# Run single test with debug logs
npx jest --config apps/api/jest.smoke.cts -t "specific test name"

# Timeout troubleshooting
npx jest --config apps/api/jest.smoke.cts --testTimeout=30000

# Snapshot comparison
npx jest --config apps/api/jest.smoke.cts --u
```

### CI/CD Pipeline Integration

Smoke tests run automatically on:
- Pull requests to main branch
- Scheduled nightly runs
- Manual trigger via GitHub Actions

Pipeline configuration: `.github/workflows/smoke-tests.yml`

```yaml
name: E2E Smoke Tests

on:
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * *'  # Nightly at midnight UTC

jobs:
  smoke-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npx nx test @kryptr/api --testFile="*.smoke.ts" --coverage
      - uses: codecov/codecov-action@v3
```

## Performance Benchmarks

### Response Time Targets

| Endpoint | p50 | p95 | p99 |
|----------|-----|-----|-----|
| GET /api/wallets/:id/balances | 150ms | 300ms | 500ms |
| POST /api/trading/quote | 800ms | 1500ms | 2500ms |
| GET /api/security/intents/:id/timeline | 100ms | 200ms | 350ms |
| POST /api/security/intents | 200ms | 400ms | 600ms |

### Load Testing Guidelines

For load testing scenarios:

```bash
# Simulate 10 concurrent requests
npx k6 run scripts/load-test.js

# Monitor database connection pool
psql -d kryptr_test -c "SELECT state, count FROM pg_stat_activity WHERE datname = 'kryptr_test';"
```

## Known Limitations

1. **External API Dependency**: DEX tests require ZeroEx API availability
2. **Chain-Specific Tests**: Currently tested on Base network only
3. **Price Feed Accuracy**: Dependent on CoinGecko free tier limits
4. **Real-time Updates**: Dashboard polling simulated with 2s interval

## Troubleshooting

### Common Errors

#### "Database connection failed"

**Solution:** Ensure `DATABASE_URL` is set and PostgreSQL is running:

```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/kryptr_test"
```

#### "ZEROX_API_KEY required"

**Solution:** Obtain API key from https://docs.0x.org/ and set environment variable:

```bash
export ZEROX_API_KEY="your-api-key-here"
```

#### "Quote not found for id"

**Solution:** Quotes expire after TTL (typically 60s). Request fresh quote:

```bash
# Wait max 5 seconds before retrying
sleep 5
```

#### "Daily cap exceeded"

**Solution:** This is expected behavior for repeated submissions. Allow reset period or use different wallet.

### Getting Help

- Review test logs in `test-output/jest-smoke/`
- Check CI failure reports in GitHub Actions
- Consult Slack channel #qa-testing
- Open issue with reproducible test case

## Contributing

### Code Style Guidelines

- Use TypeScript strict mode
- Type all function parameters and return values
- Include JSDoc comments for complex logic
- Format with Prettier before committing

### Commit Message Convention

```
feat(e2e): Add wallet balance validation test

- Validate GET /api/wallets/:id/balances endpoint
- Add database harness for clean test state
- Include cross-service consistency checks
- W7-M1 milestone validation

Fixes: #W7-M1
```

### Review Process

All test additions require:
1. Passing local test suite
2. Positive CI pipeline status
3. At least one reviewer approval
4. Updated coverage report (>85% maintained)

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-08-18 | Initial release for W7 milestone validation |
| 1.0.1 | TBD | Added performance benchmarks |
| 1.1.0 | TBD | Extended coverage for additional chains |

## License

Internal use only - Kryptr proprietary testing framework.

---

**QA Agent:** Maintained by @qa team  
**Last Updated:** 2024-08-18  
**Status:** Active for Phase 1-3 DoD verification
