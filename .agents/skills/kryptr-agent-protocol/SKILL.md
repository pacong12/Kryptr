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

## Komunikasi Antar-Agent (Peer-to-Peer Wajib)

DILARANG hanya melapor ke conductor atau broadcast ke `#all`. Setiap agent WAJIB berbicara langsung dengan agent terkait sebelum dan sesudah membuat PR:

### Pola Tektok Wajib Antar-Agent:
1. **`deck` ↔ `vault`:**
   - `deck` wajib tanya/konfirmasi endpoint shape langsung ke `vault`:
     `node scripts/agent-irc.mjs send deck vault "tanya: endpoint /orders format responsenya apa?"`
   - `vault` wajib balas spesifikasi teknisnya.

2. **`qa` ↔ `face` / `vault`:**
   - `qa` wajib kirim hasil test atau tanya skenario ke pemilik kode:
     `node scripts/agent-irc.mjs send qa vault "verifikasi: payload transfer intent sudah saya uji, ada edge case ini..."`

3. **`redteam` ↔ `vault` / `contracts`:**
   - `redteam` wajib lempar temuan vulnerability langsung ke pemilik kode untuk diverifikasi/ditambal:
     `node scripts/agent-irc.mjs send redteam vault "temuancelah: ada potensi issue pada input X, tolong cek"`

4. **`reviewer` ↔ Author PR (`contracts`, `deck`, `face`, dll):**
   - `reviewer` wajib chat langsung dengan author PR untuk klarifikasi/revisi:
     `node scripts/agent-irc.mjs send reviewer <author> "review PR #<n>: tolong jelaskan bagian X / ubah Y"`
   - Author wajib balas dan perbaiki sebelum reviewer lapor ke conductor.

JANGAN tunggu instruksi user. Bicara langsung ke nama agent target (@vault, @face, @deck, @contracts, @qa, @redteam, @reviewer).

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
