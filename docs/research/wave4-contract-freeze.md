# Wave 4 Contract Freeze — Order Automation

Status: **FROZEN** — kontrak di bawah ini mengikat untuk seluruh build wave 4.
Perubahan shape setelah freeze = PR amandemen eksplisit + pengumuman IRC "shape FROZEN (revisi)".

Rujukan: ruling evaluasi (docs/research/wave1-3-evaluation.md), desain worker
(wave4-worker-design.md), desain CI (wave4-ci-redis-design.md), riset oracle
(wave4-oracle-research.md).

## 1. Order lifecycle (shared-types, beku)

`ORDER_STATUSES` diperluas (anggota lama TETAP, tidak ada rename/hapus):

```
pending_approval | open | paused | triggered | filled | partially_filled | cancelled | rejected | expired | failed
```

Semantik transisi yang relevan untuk worker:

- `open` → `triggered`: kondisi trigger terpenuhi; eksekusi sedang berjalan.
- `triggered` → `filled` | `failed`: hasil eksekusi (failed = gate reject,
  quote unavailable, atau submit gagal setelah retry habis).
- `open` → `paused` (kill switch `pause_new` TIDAK mem-pause order aktif —
  lihat §3; `paused` hanya via pembatalan siklus DCA manual / HITL).
- `open` → `expired`: TTL order habis (limit) tanpa ter-trigger.
- `failed`/`cancelled`/`expired`/`filled` = terminal; worker tidak boleh
  menyentuh order terminal (diasersikan di test).

Skop wave 4: **limit + dca** diimplementasikan. `stop` dan `twap` DITOLAK di
pembuatan order dengan envelope error eksplisit (bukan diam-diam diterima).
Shape `OrderType` tetap berisi kelimanya (kompatibel), worker menolak yang
belum didukung.

## 2. Worker error codes (shared-types, beku)

Pola envelope-error wave 3 (`aggregator_unconfigured` dsb.):

```
worker_unavailable | order_not_found | order_not_live | order_type_unsupported
| trigger_price_unknown | trigger_price_stale | kill_switch_active
| duplicate_execution | execution_gate_rejected | quote_unavailable
```

- UI tidak pernah menampilkan stack trace; hanya kode + pesan manusia dari map
  i18n lokal (FaceUI/DeckUI memegang map-nya).
- `trigger_price_unknown`/`trigger_price_stale` TIDAK memicu eksekusi dan
  TIDAK membatalkan order — order tetap `open`, evaluasi berikutnya mencoba
  lagi (fail-closed, ruling evaluasi #2).

## 3. Kill switch (shared-types + API, beku)

```ts
KILL_SWITCH_MODES = ['off', 'pause_new', 'cancel_active'];
```

- `pause_new`: worker berhenti MEMBUAT eksekusi baru; order `open` tetap
  terdaftar (tidak dibatalkan).
- `cancel_active`: semua order `open`/`paused` dibatalkan (status `cancelled`,
  entri audit timeline per order) DAN eksekusi baru ditolak.
- Cek dilakukan di TITIK EKSEKUSI (claim time), bukan hanya saat evaluasi
  (ruling evaluasi #1).
- Perubahan mode = server action dengan konfirmasi UI + entri audit
  (actor, at, from→to, reason).

## 4. Oracle trigger (beku)

- Sumber primer: **Chainlink Data Feeds on-chain** via viem/Multicall3
  (keyless). ETH/USD Base feed; feed lain ditambahkan per-asset via registry
  konfigurasi.
- Sumber pembanding (hint): **CoinGecko keyless** (adapter wave 3 yang sudah
  ada). Dua-sumber: `|primary − hint| ≤ TRIGGER_DEVIATION_BPS` wajib lolos.
- Default beku: `TRIGGER_MAX_AGE_MS = 2_700_000` (45 menit),
  `TRIGGER_DEVIATION_BPS = 50` (0.5%), `TRIGGER_POLL_MS = 30_000`.
  Semuanya env-overridable; tanpa override → default ini.
- Harga tak diketahui (kedua sumber gagal) → outcome `needs_human_approval`,
  order tetap `open`, health feed menandai degraded. Tidak pernah pakai harga
  terakhir yang stale untuk memicu (T23).
- TWAP: **tidak diimplementasikan wave 4**; flag `interval` pada OrderType
  `twap` sudah ada di shape, worker menolak dengan `order_type_unsupported`.
- Trigger = proposal: setiap fill = TransactionIntent BARU lewat gate penuh +
  re-quote 0x saat eksekusi; minBuyAmount dari batas limit order (mitigasi
  MEV, ruling #8).

## 5. Intent automation (beku)

- Id deterministik: `intent:<orderId>:<slotKey>`; `slotKey` = ISO slot DCA
  (mis. `2026-08-17T00:00:00.000Z`) atau `once` untuk limit.
- `origin: 'automation:order-worker'` — WAJIB ada di
  `SecurityPolicy.allowedOrigins` wallet; default policy MENOLAK origin
  automation (fail-closed) dan penolakan ini diasersikan di test.
- Setiap eksekusi melewati `EvaluateIntentUseCase` penuh: cap, allowlist,
  kill switch, threshold HITL. Keputusan gate TIDAK pernah di-retry otomatis.
- **SpendLedger.record() prep PR** (ruling A): record di decision time
  (approve), idempoten per intentId — landing SEBELUM eksekusi worker
  diaktifkan.

## 6. CI (beku, mengikuti wave4-ci-redis-design.md)

- Service container `redis:7-alpine` pada job `main`, healthcheck-gated,
  localhost:6379.
- Target baru `test-workers` (dash, bukan colon; cache:false; runInBand) di
  baris affected CI; suite redis-gated skip elegan tanpa Redis (pola env-gate).
- Nightly live-run: `schedule` + `workflow_dispatch`; secrets milik user di
  GitHub (nama kanonis); tanpa secret → skip elegan + alasan log; `test:live`
  tetap jalan (RPC publik) sehingga nightly selalu memberi sinyal.

## 7. Dependensi yang disetujui wave 4

- `bullmq` + `ioredis` — bullmq v6 mendeklarasikan ioredis sebagai OPTIONAL
  peer dependency (tidak dibawa; berbeda dari v5), jadi keduanya dipasang
  eksplisit oleh konduktor. Tidak ada paket lain tanpa persetujuan baru.

## 8. Pembagian kerja (setelah prep PR merge)

| Agen      | Misi                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| VaultAPI  | Prep A: SpendLedger.record() + allowlist automation. Lalu: worker (queue, claim store, trigger port Chainlink, eksekusi via gate) |
| OpsCI     | Service container Redis + target `test-workers` + nightly live-run workflow                                                       |
| DeckUI    | Backoffice: tabel order, detail order + timeline eksekusi, kill switch (konfirmasi + audit), worker-health card ala feeds         |
| FaceUI    | Frontoffice: order lifecycle (list + status), form limit/DCA, error-code map, status worker-down                                  |
| Web3Intel | Threat model T22–T24 (wick/flash-print, stale-feed, oracle outage) + registry sumber                                              |

Merge-order: prep konduktor → VaultAPI (prep A dulu, lalu worker) → OpsCI
rebase → DeckUI/FaceUI paralel setelah kontrak terbukti di main.
