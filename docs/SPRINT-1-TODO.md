<<<<<<< HEAD
<<<<<<< HEAD
# Sprint 1: Critical Remediation - Operational Checklist

**Created:** 2026-08-18  
**Sprint Duration:** 2 weeks (Aug 18 - Aug 31)  
**Reference:** Next Sprint Plan (docs/NEXT-SPRINT-PLAN.md)  
**Status:** 🟢 READY TO EXECUTE

---

## Sprint Goal

Implement critical security and quality fixes identified in W4-W7 audit to achieve production readiness.

---

## Team Assignments & Branches

| Agent | Branch | Focus Area | Priority Level |
|-------|--------|------------|----------------|
| @auditor-core | `feat/core-sprint1-auth-remediation` | JWT Auth + Wallet ID Migration | 🔴 CRITICAL |
| @auditor-ui | `feat/ui-sprint1-csp-headers` | CSP Headers Implementation | 🟡 HIGH |
| @auditor-qa | `feat/qa-sprint1-e2e-automation` | E2E Test Automation Infrastructure | 🟡 HIGH |
| @auditor-contracts | `feat/contracts-sprint1-rehearsal-prep` | Contract Security Review | 🟠 MEDIUM |

---

## Task 1.1: Authentication Middleware Setup

### Owner: @auditor-core

#### Checklist:
- [ ] **1.1.1** Install Passport.js and JWT dependencies (`npm install @nestjs/jwt @nestjs/passport passport passport-jwt`)
  - Status: PENDING
  - Acceptance: Version pinned in package.json
  
- [ ] **1.1.2** Create authentication module structure
  ```typescript
  // apps/api/src/auth/auth.module.ts
  @Module({
    imports: [JwtModule.registerAsync({...})],
    providers: [AuthService, JwtStrategy],
    exports: [JwtModule, AuthService]
  })
  export class AuthModule {}
  ```
  - Status: PENDING
  - Acceptance: Module compiles without errors

- [ ] **1.1.3** Implement JWT guard decorator
  ```typescript
  // apps/api/src/auth/decorators/jwt-user.decorator.ts
  export const JwtUser = createParamDecorator((data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.[data];
  });
  ```
  - Status: PENDING
  - Acceptance: Guard usable via `@UseGuards(JwtAuthGuard)`

- [ ] **1.1.4** Apply guards to /intents POST endpoint
  ```typescript
  // apps/api/src/security/intent.controller.ts
  @Post()
  @UseGuards(JwtAuthGuard)
  async evaluateIntent(@Body() intent: IntentDto): Promise<IntentResponse> {
    return this.evaluateIntents.evaluate(intent);
  }
  ```
  - Status: PENDING
  - Acceptance: Unauthorized requests return 401

---

## Task 1.2: Wallet ID Migration

### Owner: @auditor-core

#### Checklist:
- [ ] **1.2.1** Create migration schema for UUID mapping
  ```sql
  -- migrations/001_wallet_uuid_migration.sql
  CREATE TABLE wallet_id_mapping (
    old_hash_id VARCHAR(255) PRIMARY KEY,
    new_uuid UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
  - Status: PENDING
  - Acceptance: Migration applies cleanly

- [ ] **1.2.2** Generate UUID for existing wallets
  ```bash
  # scripts/migrate-wallets.ts
  await db.execute(`UPDATE wallets SET id = gen_random_uuid()`);
  await insert mappings into wallet_id_mapping table;
  ```
  - Status: PENDING
  - Acceptance: All wallets have UUID v4 format

- [ ] **1.2.3** Update wallet.controller.ts to use UUID
  ```typescript
  // apps/api/src/wallet/wallet.controller.ts
  @Get(':walletId')
  async getWallet(@Param('walletId') walletId: string, @User() userId: string) {
    // Use validated UUID
  }
  ```
  - Status: PENDING
  - Acceptance: No hash-based IDs accepted in API

---

## Task 2.1: Frontoffice CSP Headers

### Owner: @auditor-ui

#### Checklist:
- [ ] **2.1.1** Update vite.config.mts with CSP plugin
  ```typescript
  import { ViteCSPPlugin } from '@vitejs/plugin-secure-helpers';
  
  export default defineConfig({
    plugins: [ViteCSPPlugin()],
    build: {
      rollupOptions: {
        output: {
          cspNonce: 'my-nonce' // Dynamically injected
        }
      }
    }
  });
  ```
  - Status: PENDING
  - Acceptance: Plugin installed and configured

- [ ] **2.1.2** Add CSP headers to server.ts
  ```typescript
  // apps/frontoffice/src/server.ts
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "https:", "data:"],
        fontSrc: ["https://fonts.gstatic.com"]
      }
    }
  }));
  ```
  - Status: PENDING
  - Acceptance: Headers visible in response inspection

- [ ] **2.1.3** Remove inline event handlers where possible
  ```diff
  - <button onclick="handleClick()">Submit</button>
  + <button id="submit-btn">Submit</button>
  + useEffect(() => {
  +   document.getElementById('submit-btn').addEventListener('click', handleClick);
  + }, []);
  ```
  - Status: PENDING
  - Acceptance: Zero inline onclick attributes remaining

---

## Task 2.2: Backoffice CSP Headers

### Owner: @auditor-ui

#### Checklist:
- [ ] **2.2.1** Configure CSP in next.config.js
  ```javascript
  // apps/backoffice/next.config.js
  module.exports = {
    async headers() {
      return [{
        source: '/(.*)',
        headers: [{
          key: 'Content-Security-Policy',
          value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; ..."
        }]
      }];
    }
  };
  ```
  - Status: PENDING
  - Acceptance: Headers present on all routes

- [ ] **2.2.2** Set up CSP reporting endpoint
  ```typescript
  // apps/backoffice/pages/api/security/csp-reports.ts
  export default async function handler(req, res) {
    if (req.method === 'POST') {
      await logViolation(req.body);
      res.status(200).json({ success: true });
    } else {
      res.setHeader('Report-To', '{...}');
      res.status(405).end();
    }
  }
  ```
  - Status: PENDING
  - Acceptance: Violations logged to database

- [ ] **2.2.3** Monitor violations for 48 hours
  - Status: PENDING
  - Acceptance: Zero false positives after monitoring period

---

## Task 3.1: Playwright E2E Suite

### Owner: @auditor-qa

#### Checklist:
- [ ] **3.1.1** Install Playwright and dependencies
  ```bash
  npm install -D playwright
  npx playwright install --with-deps
  ```
  - Status: PENDING
  - Acceptance: Browser binaries installed successfully

- [ ] **3.1.2** Create base page objects
  ```typescript
  // tests/e2e/pages/WalletConnectPage.ts
  export class WalletConnectPage {
    constructor(private page: Page) {}
    
    async connectPrivy(): Promise<void> {
      await this.page.click('[data-testid="connect-wallet"]');
      await this.page.click('[data-privy-provider="metamask"]');
    }
    
    waitForConnection(): Promise<void> {
      return this.page.waitForSelector('.wallet-connected', { state: 'visible' });
    }
  }
  ```
  - Status: PENDING
  - Acceptance: Page object methods execute correctly

- [ ] **3.1.3** Implement happy path test
  ```typescript
  // tests/e2e/wallet-flow.spec.ts
  test('complete wallet connection flow', async ({ page }) => {
    const walletPage = new WalletConnectPage(page);
    
    await page.goto('/frontoffice');
    await walletPage.connectPrivy();
    await walletPage.waitForConnection();
    
    expect(await page.url()).toContain('/dashboard');
  });
  ```
  - Status: PENDING
  - Acceptance: Test passes locally and in CI

- [ ] **3.1.4** Configure CI pipeline integration
  ```yaml
  # .github/workflows/e2e-tests.yml
  - name: Run E2E Tests
    run: npx playwright test
    env:
      DATABASE_URL: ${{ secrets.TEST_DATABASE }}
      REDIS_URL: ${{ secrets.TEST_REDIS }}
  ```
  - Status: PENDING
  - Acceptance: Tests run automatically on PR

---

## Task 3.2: Mock Service Setup

### Owner: @auditor-qa

#### Checklist:
- [ ] **3.2.1** Mock Privy connection responses
  ```typescript
  // tests/fixtures/mock-privy.ts
  export const mockPrivyResponse = {
    user: { id: 'test-123', address: '0x...' },
    connected: true,
    provider: 'metamask'
  };
  ```
  - Status: PENDING
  - Acceptance: Response matches actual Privy API contract

- [ ] **3.2.2** Mock blockchain RPC calls
  ```typescript
  // tests/fixtures/mock-viem.ts
  viemMock.mockContractRead.mockReturnValue('0x1');
  viemMock.mockContractWrite.mockResolvedValue({ hash: '0xabc...' });
  ```
  - Status: PENDING
  - Acceptance: Mock returns consistent values across tests

- [ ] **3.2.3** Isolated PostgreSQL instance per test file
  ```dockerfile
  # docker-compose.test.yml
  services:
    test-db:
      image: postgres:15
      environment:
        POSTGRES_DB: kryptr_test
        POSTGRES_PASSWORD: test
  ```
  - Status: PENDING
  - Acceptance: Database cleaned between test suites

---

## Task 4.1: Contract Security Audit

### Owner: @auditor-contracts

#### Checklist:
- [ ] **4.1.1** Re-run forge test suite with verbose output
  ```bash
  forge test -vvv --fork-url $BASE_SEPOLIA_RPC
  ```
  - Status: PENDING
  - Acceptance: All 100% pass rate maintained

- [ ] **4.1.2** Static analysis with Slither v0.9+
  ```bash
  slither . --detect reentrancy,address-zero
  ```
  - Status: PENDING
  - Acceptance: Zero critical findings

- [ ] **4.1.3** Verify fee cap enforcement (INV-FEE-1)
  - [ ] Code review: Fee calculation logic documented
  - [ ] Test coverage: Fee cap boundary conditions tested
  - Status: PENDING
  - Acceptance: Manual + automated verification complete

---

## Task 4.2: ABI Handoff Preparation

### Owner: @auditor-contracts

#### Checklist:
- [ ] **4.2.1** Export canonical ABIs
  ```bash
  forge cache out TokenFactory.sol --abi > abi/TokenFactory.json
  forge cache out TokenTemplate.sol --abi > abi/TokenTemplate.json
  ```
  - Status: PENDING
  - Acceptance: ABIs include all public interfaces

- [ ] **4.2.2** Generate type declarations
  ```typescript
  // src/types/generated/artifacts.ts
  export type TokenFactoryArtifact = typeof TokenFactoryABI;
  export type TokenTemplateArtifact = typeof TokenTemplateABI;
  ```
  - Status: PENDING
  - Acceptance: Type-safe usage in frontend/backoffice

---

## Daily Standup Requirements

All team members must provide status update every morning at **10:00 AM WIB**:

```
✅ Done yesterday
🚧 In progress today
⚠️ Blockers encountered
```

**Example update:**
- auditor-core: ✅ Completed JWT guard implementation | 🚧 Starting wallet migration | ⚠️ Need DB access approval
- auditor-ui: ✅ Installed CSP plugin | 🚧 Updating backend headers | ⚠️ None
- auditor-qa: ✅ Playwright installed | 🚧 Creating first page object | ⚠️ Mock service timeout issues

---

## Completion Criteria

### Sprint 1 Entry Gate (ALL MUST PASS):
- [ ] Every checkbox marked [x] as completed
- [ ] All tests pass (unit + E2E)
- [ ] CI pipeline green for each branch
- [ ] Security scanner shows zero vulnerabilities added
- [ ] Code review approved by lead developer

### Sprint 1 Exit Gate:
- [ ] Feature branches merged to main
- [ ] Documentation updated (API docs, architecture diagrams)
- [ ] Release notes published
- [ ] Stakeholder sign-off obtained
- [ ] Phase 2 Go/No-Go decision made

---

## Risk Escalation Matrix

| Severity | Response Time | Contact |
|----------|---------------|---------|
| 🔴 Critical (blocks team) | Within 1 hour | Managing Director |
| 🟡 High (team productivity impact) | Within 4 hours | Conductor |
| 🟢 Low (individual blocker) | Within 24 hours | Lead Developer |

**Escalation Template:**
```
URGENT: [Risk Type] blocking [Agent Name]
Impact: [Describe what work is stopped]
Blocker: [Root cause description]
Request: [What approval/help needed]
Timeline: Must resolve by [date/time]
```

---

**Approved By:** @conductor  
**Version:** 1.0  
**Last Updated:** 2026-08-18  
**Next Review:** After daily standup  
=======
=======
>>>>>>> 7c7e9fc8a (feat(core): Sprint 1 Auth Middleware, Rate Limiting & Wallet ID Hardening)
# SPRINT 1 ACTIONABLE TODO LIST (Critical Remediation)

Sprint target: 2026-08-18 to 2026-09-01
Reference plan: docs/NEXT-SPRINT-PLAN.md
Status: ACTIVE

---

## 1. `auditor-core` (Backend API & Auth Remediation)
Branch: `feat/core-sprint1-auth-remediation`
Worktree: `/home/muting/kryptr-wt/new-core`

- [ ] **Task 1.1: Test Mock Fix (Immediate)**
  - [ ] Add `CreateTransferUseCase` mock provider in `apps/api/src/wallet/wallet.controller.spec.ts`.
  - [ ] Verify `npx nx run @kryptr/api:test` passes 100%.
- [ ] **Task 1.2: JWT Auth Middleware**
  - [ ] Add `@nestjs/jwt` and `@nestjs/passport` configuration in `apps/api/src/security/`.
  - [ ] Implement AuthGuard on `POST /intents/*` and `POST /wallets/:id/transfer`.
  - [ ] Write unit & integration tests for 401 Unauthorized rejection.
- [ ] **Task 1.3: Wallet ID Scheme Hardening**
  - [ ] Audit wallet ID generator in `apps/api/src/wallet/domain/`.
  - [ ] Add cryptographic entropy check to prevent sequential/predictable IDs.
- [ ] **Task 1.4: Rate Limiting Guard**
  - [ ] Configure `@nestjs/throttler` with Redis store in `apps/api/src/app/app.module.ts`.
  - [ ] Set limits: 100 req/min read, 20 req/min write.
- [ ] **Delivery:**
  - [ ] Run gate: `npx nx affected -t lint typecheck test build --base=main`.
  - [ ] Create PR: `feat(core): Sprint 1 Auth Middleware, Rate Limiting & Wallet ID Hardening`.
  - [ ] IRC report: `agent-irc send auditor-core conductor "done: Sprint 1 Core tasks complete, PR open"`.

---

## 2. `auditor-ui` (Frontend Security Headers & Polish)
Branch: `feat/ui-sprint1-csp-headers`
Worktree: `/home/muting/kryptr-wt/new-ui`

- [ ] **Task 2.1: CSP Headers (Frontoffice)**
  - [ ] Configure strict Content-Security-Policy headers in `apps/frontoffice/vite.config.mts` / HTML meta tags.
  - [ ] Disallow inline script execution without nonce/hash.
- [ ] **Task 2.2: CSP Headers (Backoffice)**
  - [ ] Add security headers middleware in `apps/backoffice/src/middleware.ts` or `next.config.js`.
  - [ ] Protect Next.js routes against clickjacking (`X-Frame-Options: DENY`) and XSS.
- [ ] **Task 2.3: Vitest Timeout & UI Polish**
  - [ ] Tune timeout threshold in `apps/frontoffice/vitest.config.mts`.
  - [ ] Ensure all frontoffice unit tests pass cleanly without flaky async timers.
- [ ] **Task 2.4: Developer Documentation Sync**
  - [ ] Add JWT auth usage section in `apps/docs/getting-started/`.
  - [ ] Verify `npx nx run @kryptr/docs:build` exits 0.
- [ ] **Delivery:**
  - [ ] Run gate: `npx nx run frontoffice:test && npx nx run backoffice:test && npx nx run @kryptr/docs:build`.
  - [ ] Create PR: `feat(ui): Sprint 1 CSP Headers, Test Timing Fix & Docs Update`.
  - [ ] IRC report: `agent-irc send auditor-ui conductor "done: Sprint 1 UI tasks complete, PR open"`.

---

## 3. `auditor-qa` (E2E CI Pipeline & Pentest Baseline)
Branch: `feat/qa-sprint1-e2e-automation`
Worktree: `/home/muting/kryptr-wt/new-qa`

- [ ] **Task 3.1: Playwright / E2E CI Workflow**
  - [ ] Configure headless browser E2E test runner in `.github/workflows/e2e-browser.yml`.
  - [ ] Implement happy path test: Connect Wallet -> Transfer Form -> Security Gate Approval -> Receipt View.
- [ ] **Task 3.2: Red Team Regression Harness**
  - [ ] Wire automated attack scripts from `tests/red-team/` into a dedicated CI smoke job.
  - [ ] Verify 100% fail-closed rejection on unauthorized intent injections.
- [ ] **Task 3.3: API Performance Baseline**
  - [ ] Create lightweight load test script checking p95 response time under 200ms.
- [ ] **Delivery:**
  - [ ] Run gate: `npx nx affected -t test --base=main`.
  - [ ] Create PR: `test(qa): Sprint 1 E2E Browser Automation & Security Pentest CI Harness`.
  - [ ] IRC report: `agent-irc send auditor-qa conductor "done: Sprint 1 QA tasks complete, PR open"`.

---

## 4. `auditor-contracts` (Testnet Deployment Rehearsal Readiness)
Branch: `feat/contracts-sprint1-rehearsal-prep`
Worktree: `/home/muting/kryptr-wt/new-contracts`

- [ ] **Task 4.1: Factory ABI Export**
  - [ ] Export compiled `TokenFactory.json` ABI and copy to shared contract artifacts directory for Core API consumption.
- [ ] **Task 4.2: Testnet Rehearsal Script Verification**
  - [ ] Dry-run `contracts/script/DeployLaunchpad.s.sol` against local anvil / Base Sepolia fork.
  - [ ] Verify generated manifest format strictly complies with `deployments.schema.json`.
- [ ] **Task 4.3: Slither Continuous Gate**
  - [ ] Verify `contracts/SLITHER_TRIAGE.md` remains 100% clean against latest contract commits.
- [ ] **Delivery:**
  - [ ] Run gate: `cd contracts && forge test && forge fmt --check`.
  - [ ] Create PR: `feat(contracts): Sprint 1 ABI Artifact Export & Rehearsal Manifest Verification`.
  - [ ] IRC report: `agent-irc send auditor-contracts conductor "done: Sprint 1 Contracts tasks complete, PR open"`.

---

## 5. `conductor` (Execution Gate & Merge Protocol)
- [ ] Monitor IRC updates for Task 1.1 to 4.3.
- [ ] Review PRs when submitted.
- [ ] Ensure all GitHub Actions checks pass before squash-merging.
- [ ] Update `docs/SPRINT-1-TODO.md` checklist status upon each PR merge.
<<<<<<< HEAD
>>>>>>> 433c465f4 (feat(ui): Sprint 1 CSP Headers, Test Timing Fix)
=======
>>>>>>> 7c7e9fc8a (feat(core): Sprint 1 Auth Middleware, Rate Limiting & Wallet ID Hardening)
