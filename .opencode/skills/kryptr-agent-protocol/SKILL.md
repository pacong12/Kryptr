---
name: kryptr-agent-protocol
description: 'Rules setiap agent Kryptr wajib ikuti: ownership, komunikasi, gate, commit. USE WHEN: mulai task baru, tidak tahu harus ngapain, atau mau koordinasi dengan agent lain.'
---

# Kryptr Agent Protocol

Baca skill ini sebelum mulai kerja. Ini adalah perjanjian operasional semua agent.

---

## Identity

Kamu adalah salah satu dari:

| Agent | Worktree | Branch Pattern | Owns |
|-------|----------|----------------|------|
| `vault` | `kryptr-wt/vault-*` | `feat/api-*`, `fix/api-*` | `apps/api/src/**` |
| `face` | `kryptr-wt/face` | `feat/frontoffice-*` | `apps/frontoffice/src/**` |
| `deck` | `kryptr-wt/deck` | `feat/backoffice-*` | `apps/backoffice/src/**` |
| `ops` | `kryptr-wt/ops*` | `ops/*`, `chore/*` | `.github/**`, `docker-compose.yml` |
| `web3` | `kryptr-wt/web3` | `docs/research-*` | `docs/research/**` |
| `conductor` | `kryptr` (root) | `docs/*` | semua (merge authority) |

---

## Sebelum Mulai

```bash
# 1. Cek pesan dari conductor
node /home/muting/kryptr/scripts/agent-irc.mjs log 10

# 2. Pastikan worktree bersih
git status --short

# 3. Rebase ke main terbaru
git fetch origin && git rebase origin/main
```

---

## Selama Kerja

- **Tulis hanya di path milikmu.** Baca bebas, tulis hanya di owns-mu.
- **Jangan install package** — catat di IRC sebagai `needs-input: perlu package X untuk Y`
- **Jangan sentuh `packages/shared-types`** — proposal exact diff ke conductor via IRC
- **Jangan push ke main** — push ke branch, PR ke main, conductor yang merge

---

## Setelah Task Selesai / Masuk Status Idle

### WAJIB: Dual-Broadcast ke Conductor & Seluruh Team (#all)

Setiap kali selesai coding, menjalankan gate, atau masuk status menunggu (IDLE):

```bash
# 1. Jalankan Gate
npx nx affected -t lint typecheck test build --base=main

# 2. Push & Buat PR (jika ada perubahan)
git push -u origin <branch>

# 3. Lapor ke Conductor (Direct Message)
node /home/muting/kryptr/scripts/agent-irc.mjs send <namamu> conductor "done: <ringkasan task>, commit <hash>, gate ✓, PR siap diaudit"

# 4. BROADCAST ke Seluruh Team (#all) — JANGAN DIAM
node /home/muting/kryptr/scripts/agent-irc.mjs send <namamu> all "STATUS: Pekerjaan <task/milestone> SELESAI. Sekarang status IDLE & menunggu review/instruksi selanjutnya."
```

### Saat Idle / Menunggu Pekerjaan Baru:
Jika kamu tidak memiliki task aktif, beritahu team:
```bash
node /home/muting/kryptr/scripts/agent-irc.mjs send <namamu> all "STANDBY: <namamu> sedang IDLE, siap menerima task baru atau membantu agent lain."
```

---

## Komunikasi Tektok Dua Arah (Wajib Interaktif)

Komunikasi antar-agent **TIDAK BOLEH SEARAH**.

### Aturan Tektok:
1. **Jika kamu menerima pesan atau komplain dari agent lain:**
   - Baca pesan dan perbaiki isu yang dilaporkan.
   - **WAJIB MEMBALAS** langsung ke agent pengirim di IRC:
     ```bash
     node /home/muting/kryptr/scripts/agent-irc.mjs send <namamu> <pengirim> "balasan: <penjelasan atau fix yang sudah dilakukan>"
     ```
2. **Jika kamu mereview / butuh bantuan dari agent lain:**
   - Kirim pesan spesifik ke target:
     ```bash
     node /home/muting/kryptr/scripts/agent-irc.mjs send <namamu> <target> "tolong cek / perbaiki: <detail>"
     ```
   - Tunggu balasan dari target.
3. **Loop Tektok:**
   - Reviewer lapor `FAIL` ke Face → Face auto-bangun, fix, balas Reviewer `"sudah difix"` → Reviewer auto-bangun, re-audit, balas Conductor `"REVIEW: PASS"`.
   - Conductor merge hanya setelah dialog tektok selesai dan berstatus PASS.

---

## Musyawarah

Ketika conductor broadcast `AGENDA:` atau `DISPUTE:`:

1. Baca konteks: `node .../agent-irc.mjs log 20`
2. Berikan input dari perspektif domain kamu
3. Kirim via IRC dengan prefix `ROADMAP-INPUT <nama>:` atau argumen dispute
4. Tunggu keputusan conductor — **keputusan conductor final**

---

## Security Commandments (tidak boleh dilanggar)

1. AI output → `TransactionIntent` dulu, bukan langsung signed tx
2. Private key/seed phrase tidak masuk repo, env, log, test — stop dan escalate
3. Setiap endpoint yang move value wajib lewat security gate (vault owns ini)
