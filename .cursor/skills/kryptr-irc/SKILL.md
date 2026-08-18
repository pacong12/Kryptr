---
name: kryptr-irc
description: 'Redis IRC protocol untuk komunikasi antar agent Kryptr. USE WHEN: selesai task, hit blocker, butuh koordinasi dengan agent lain, atau mau broadcast status.'
---

# Kryptr IRC — Redis Agent Communication

## Script
```
/home/muting/kryptr/scripts/agent-irc.mjs
```
Redis: `redis://localhost:6379`

---

## Commands

```bash
# Kirim pesan ke agent spesifik
node /home/muting/kryptr/scripts/agent-irc.mjs send <from> <to> "<pesan>"

# Broadcast ke semua
node /home/muting/kryptr/scripts/agent-irc.mjs send <from> all "<pesan>"

# Baca history (default 40 pesan)
node /home/muting/kryptr/scripts/agent-irc.mjs log 20

# Live feed semua channel
node /home/muting/kryptr/scripts/agent-irc.mjs tail
```

---

## Agents & Names

| Name | Role |
|------|------|
| `conductor` | Pemimpin, merge authority, keputusan final |
| `vault` | API, security, signing |
| `face` | Frontoffice Vue |
| `deck` | Backoffice Next.js |
| `ops` | CI/infra |
| `web3` | Research, threat intel |

---

## Wajib Lapor IRC

### Setelah task selesai:
```bash
node /home/muting/kryptr/scripts/agent-irc.mjs send <namamu> conductor "done: <ringkasan apa yang diselesaikan, commit hash, gate status>"
node /home/muting/kryptr/scripts/agent-irc.mjs send <namamu> all "<status singkat>"
```

### Saat blocked:
```bash
node /home/muting/kryptr/scripts/agent-irc.mjs send <namamu> conductor "blocked: <apa yang diblok, apa yang sudah dicoba, apa yang dibutuhkan>"
```

### Sebelum mulai task:
```bash
# Selalu cek pesan masuk dulu
node /home/muting/kryptr/scripts/agent-irc.mjs log 10
```

---

## Format Pesan

| Prefix | Kapan |
|--------|-------|
| `done:` | task selesai |
| `blocked:` | tidak bisa lanjut |
| `needs-input:` | butuh keputusan conductor |
| `gate-fail:` | CI/lint/test gagal |
| `ROADMAP-INPUT <nama>:` | submit input musyawarah |
| `MERGED:` | conductor selesai merge PR |
| `DISPUTE:` | conductor broadcast konflik |

---

## Conductor-Loop

Background process yang auto-monitor semua agent dan auto-prompt conductor saat semua idle:

```bash
# Start (dari /home/muting/kryptr)
node scripts/conductor-loop.mjs > /tmp/conductor-loop.log 2>&1 &

# Cek log
cat /tmp/conductor-loop.log

# Stop
pkill -f conductor-loop.mjs
```

Loop akan otomatis prompt conductor ketika semua agent idle dan ada unread messages.
