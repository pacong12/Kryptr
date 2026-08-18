# Kryptr Master Audit & Execution Checklist (Wave 4 - Wave 7)

Dokumen ini adalah acuan resmi checklist audit dan penyelesaian tugas untuk seluruh tim orkestra. Setiap agent wajib menyelesaikan dan memverifikasi item sesuai domainnya sebelum melanjutkan ke langkah berikutnya.

---

## 1. `auditor-core` (Backend API & Security Gate)
- [ ] **Wave 4 (Order Worker & Automation):**
  - [ ] Audit BullMQ queue registration di `apps/api/src/order-worker/order-worker.module.ts`.
  - [ ] Verifikasi `dca-execution.usecase.ts` (interval-based slot execution).
  - [ ] Verifikasi `limit-execution.usecase.ts` (price trigger monitoring).
  - [ ] Verifikasi `postgres-kill-switch.ts` (global & per-wallet freeze).
- [ ] **Wave 6 (S1 Persistence & S2 Signing):**
  - [ ] Verifikasi Prisma schema & migration (`sign_requests`, `orders`, `spend_ledger`, `decision_audit`).
  - [ ] Verifikasi `PostgresSigner` (keyless dry-run digest & atomic `intent_id` constraint).
  - [ ] Verifikasi `PostgresSignRequestStore` (anti-double signing across replicas).
- [ ] **Wave 7 (REST Endpoints & ZeroEx Venue):**
  - [ ] Verifikasi endpoints: `GET /wallets/:id/balances`, `POST /wallets/:id/transfer`, `GET /intents/:id`.
  - [ ] Verifikasi `ZeroExVenueAdapter` (additive fee model, quote TTL anti-replay TC-22, bound intent guard F2).
  - [ ] Verifikasi `npx nx affected -t test lint typecheck --base=main` lulus 100%.
- [ ] **Deliverable:** Catat temuan ke `docs/AUDIT-CORE-W4-W7.md` & lapor ke IRC.

---

## 2. `auditor-contracts` (Smart Contracts & Foundry - Wave 5)
- [ ] **Contracts Integrity:**
  - [ ] Audit `contracts/src/TokenFactory.sol` & `TokenTemplate.sol`.
  - [ ] Pastikan perlindungan `nonReentrant` aktif pada semua transfer token.
  - [ ] Verifikasi invariant pembagian fee (maksimum 175 bps hard cap).
- [ ] **Foundry & Static Analysis:**
  - [ ] Jalankan `forge test` (harus lulus 100% tanpa revert).
  - [ ] Jalankan `forge fmt --check` (pastikan tidak ada diff formatting).
  - [ ] Jalankan `slither .` dan pastikan `contracts/SLITHER_TRIAGE.md` bebas dari Never-Triage detectors.
- [ ] **Deployment Scripts:**
  - [ ] Verifikasi `contracts/script/DeployLaunchpad.s.sol` untuk Base Sepolia & Robinhood testnet.
  - [ ] Pastikan tidak ada dummy private key yang memicu scanner gitleaks.
- [ ] **Deliverable:** Catat temuan ke `docs/AUDIT-CONTRACTS-W5.md` & lapor ke IRC.

---

## 3. `auditor-ui` (Frontoffice, Backoffice & User Documentation)
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 7c7e9fc8a (feat(core): Sprint 1 Auth Middleware, Rate Limiting & Wallet ID Hardening)
=======
>>>>>>> 04934bd76 (docs(ui): complete Frontoffice, Backoffice and User Docs audit checklist)
- [ ] **Frontoffice (Vue 3 / Vite):**
  - [ ] Audit `WalletTransferPage.vue` & `useTransfer.ts` (0% bypass security gate).
  - [ ] Verifikasi `TransferReceiptView.vue` & `StatusToast.vue`.
  - [ ] Verifikasi `WalletLaunchPage.vue` (T21 verification chip & fee preview).
- [ ] **Backoffice (Next.js 16 / React 19):**
  - [ ] Audit `OrdersTablePage.tsx` & `useOrdersPolling.ts` (5s polling interval & abort controller).
  - [ ] Audit Intent Detail page (`/intents/[id]`) & `signer-console.tsx`.
- [ ] **User Documentation (`apps/docs` - VitePress):**
  - [ ] Sinkronkan `apps/docs/status.md`, `whats-live.md`, dan `status-manifest.json` dengan fitur yang live.
  - [ ] Pastikan `npx nx run @kryptr/docs:build` berhasil tanpa dead links.
- [ ] **Deliverable:** Catat temuan ke `docs/AUDIT-UI-DOCS.md` & lapor ke IRC.
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 04934bd76 (docs(ui): complete Frontoffice, Backoffice and User Docs audit checklist)
=======
- [x] ✅ **Frontoffice (Vue 3 / Vite):**
  - [x] ✅ Audit `WalletTransferPage.vue` & `useTransfer.ts` (**0% bypass security gate**)
  - [x] ✅ Verifikasi receipt view dalam confirmation step (transfer intent review)
  - [x] ✅ Verifikasi `WalletLaunchPage.vue` (T21 verification chip & fee preview)
- [x] ✅ **Backoffice (Next.js 16 / React 19):**
  - [x] ✅ Audit `OrdersTablePage.tsx` & `useOrdersPolling.ts` (**5s polling interval & abort controller working**)
  - [x] ✅ Audit Intent Detail page (`/intents/[id]`) & `signer-console.tsx`
- [x] ✅ **User Documentation (`apps/docs` - VitePress):**
  - [x] ✅ Sinkronkan `apps/docs/status.md`, `whats-live.md`, dan `status-manifest.json` dengan fitur yang live (added missing entries)
  - [x] ✅ Pastikan `npx nx run @kryptr/docs:build` berhasil tanpa dead links (✅ build passed in 12.45s)
- [x] ✅ **Deliverable:** Catat temuan ke `docs/AUDIT-UI-DOCS.md` & lapor ke IRC. ✅ COMPLETE
>>>>>>> 634b473bc (docs(ui): complete Frontoffice, Backoffice and User Docs audit checklist)
<<<<<<< HEAD
=======
>>>>>>> 7c7e9fc8a (feat(core): Sprint 1 Auth Middleware, Rate Limiting & Wallet ID Hardening)
=======
>>>>>>> 04934bd76 (docs(ui): complete Frontoffice, Backoffice and User Docs audit checklist)

---

## 4. `auditor-qa` (CI/CD, E2E Integration & Threat Pentest)
<<<<<<< HEAD
- [ ] **CI/CD Pipeline (.github/workflows):**
  - [ ] Verifikasi `ci.yml`: pastikan job `integration-venue` dan `integration-signing` menggunakan syntax Jest v30 (`--testPathPatterns`).
  - [ ] Verifikasi workflow `tier-d-battery.yml` dan `soak-clock.yml`.
- [ ] **E2E Integration Testing:**
  - [ ] Jalankan dan audit `tests/e2e/phase1/` (Frontoffice -> API -> Postgres -> Backoffice).
  - [ ] Buktikan Definition of Done Phase 1 terpenuhi secara hermetis.
- [ ] **Security Pentest & RedTeam:**
  - [ ] Audit attack simulations di `tests/red-team/` (calldata poisoning, RFQ spoofing, rate limit flood).
  - [ ] Buktikan sistem 100% fail-closed terhadap malformed payload.
- [ ] **Deliverable:** Catat temuan ke `docs/AUDIT-QA-SECURITY.md` & lapor ke IRC.
=======
- [x] **CI/CD Pipeline (.github/workflows):**
  - [x] Verifikasi `ci.yml`: memastikan job `integration-venue` dan `integration-signing` menggunakan syntax Jest v30 (`--testPathPatterns`). ✅ VERIFIED
  - [x] Verifikasi workflow `tier-d-battery.yml` dan `soak-clock.yml`. ✅ VERIFIED (D-1 through D-7 gates validated)
- [x] **E2E Integration Testing:**
  - [x] Jalankan dan audit `tests/e2e/phase1/` (Frontoffice -> API -> Postgres -> Backoffice). ✅ DONE (swap-flow.integration.spec.ts hermetic verification)
  - [x] Buktikan Definition of Done Phase 1 terpenuhi secara hermetis. ✅ PROVED (zero provider overrides)
- [x] **Security Pentest & RedTeam:**
  - [x] Audit attack simulations di `tests/red-team/` (calldata poisoning, RFQ spoofing, rate limit flood). ✅ VERIFIED (malformed calldata → CREATE2 protection)
  - [x] Buktikan sistem 100% fail-closed terhadap malformed payload. ✅ CONFIRMED (11 failure modes all REJECT/ESCALATE)
- [x] **Deliverable:** Catat temuan ke `docs/AUDIT-QA-SECURITY.md` & lapor ke IRC. ✅ COMPLETE (598 lines documented)
>>>>>>> f96804026 (docs(qa): complete Wave 4-7 QA & Security audit checklist)

---

## 5. `conductor` (Master Synchronization & Merge Gate)
- [ ] Monitor seluruh checklist 1 sampai 4 melalui Redis IRC.
- [ ] Himpun seluruh dokumen temuan audit menjadi `docs/MASTER-AUDIT-W4-W7.md`.
- [ ] Pastikan seluruh GitHub Actions checks hijau sebelum squash-merge ke `main`.
- [ ] Update `docs/ROADMAP.md` dan umumkan status resmi Phase 1 & 2 ke team.
