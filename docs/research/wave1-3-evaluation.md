# Evaluasi Wave 1–3 & Ruling Menuju Wave 4

Status: **final** — sintesis retro 5 agen (VaultAPI, OpsCI, DeckUI, FaceUI, Web3Intel) + konduktor.

## Ringkasan hasil per wave

| Wave | Cakupan                                                                                                   | PR      | Hasil terukur                                                                        |
| ---- | --------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| 1    | Fondasi: monorepo Nx, orkestra, shared-ui, dashboard backoffice, shell frontoffice, vault core, lint gate | #1–#12  | 5 proyek hijau; 16+16 komponen shared-ui; kebijakan cabang terbukti                  |
| 2    | Trading: kontrak SwapQuote/SwapContext, quote→gate→preview, DeckUI decision panel, FaceUI swap UX, smoke  | #13–#22 | 158 test api; smoke golden path; 1 anomali CI tertangkap pasca-merge (flake clock)   |
| 3    | Realitas: viem chain reads, 0x v2, CoinGecko fail-closed, dry-run signing, HITL deploy, CI live+gitleaks  | #23–#32 | 250 test api; smoke 6 blok; test:live opt-in; 1 hotfix upstream (0x pindah endpoint) |

## Tema yang berjalan baik (konsensus 5 agen)

1. **Contract-first** — shared-types dibekukan sebelum coding paralel; nol rework UI meski endpoint telat; wave 3 membuktikan friksi negosiasi-tengah-jalan (wave 2) hilang total setelah kontrak dibekukan eksplisit ("shape FROZEN" di IRC).
2. **Fail-closed sebagai properti produk yang bisa dites** — tanpa key tidak ada data palsu dan tidak ada auto-approve; setiap cabang degradasi diasersikan (envelope + health).
3. **Port/adapter tipis** — transisi static→real tanpa rewrite; saat 0x memindahkan endpoint, hotfix (#32) terdeteksi cepat karena adapter tipis + suite `{live}`.
4. **Disiplin merge-order** — tiga gelombang beruntun tanpa konflik destruktif; gate menangkap masalah nyata (base bug #12, secret hygiene, flake clock #22).

## Friksi yang harus dihapus di wave 4

1. **CI buta terhadap upstream drift** — keyed suite skip di CI, sehingga perpindahan endpoint 0x baru ketahuan saat user memakai key. → **Ruling: nightly live-run terjadwal** (OpsCI).
2. **Type error baru meledak di gate** (ts-jest transpile-only) + dist usang TS6305 saat run-many paralel. → **Ruling: typecheck di loop dev agen; jangan andalkan gate sebagai first catch** (VaultAPI/FaceUI).
3. **Hermeticity pecah saat `.env` nyata muncul** — nx memuat `.env` ke env task. Sudah diperbaiki di #32 (resolveEnvFilePaths + pin env wiring). Prinsip berlaku umum: **perilaku env-dependent = opt-in eksplisit + default fail-closed**.
4. **Gotcha tooling berulang** (worktree upstream, hook sweeping, nama target berkolon, gitleaks permission). → Sudah terdokumentasi di retro; wave 4 tidak menambah tool baru tanpa catatan gotcha.

## Ruling wave 4 (order automation) — mengikat

Dari risiko yang diangkat kru, ruling berikut WAJIB:

1. **Setiap eksekusi terjadwal = TransactionIntent BARU lewat gate penuh.** Tidak ada pre-authorization rangkaian (pelajaran insiden Bankr RC-4: automation + excessive agency). Kill switch dicek di titik eksekusi, bukan hanya evaluasi (VaultAPI + Web3Intel).
2. **Harga trigger sisi-server = attack surface.** Sumber harga trigger harus oracle resmi (Chainlink di Base) dengan freshness + deviation bound; harga tak diketahui → `needs_human_approval`. Dua sumber bila murah; satu print tunggal tidak boleh memicu eksekusi sendirian (Web3Intel).
3. **Idempotensi deterministik**: job id deterministik per order; pola SpendLedger (idempoten per id) agar worker restart tidak double-fill (VaultAPI + OpsCI).
4. **Semua logika waktu pakai jam injectable** — pelajaran #22 mutlak: DCA interval, expiry, TTL (VaultAPI + OpsCI).
5. **Lifecycle order dibekukan di shared-types SEBELUM build paralel**: status (live/triggered/cancelling/cancelled/expired/filled) + semantik worker-health + kode error worker-down ala `aggregator_unconfigured` (FaceUI + DeckUI).
6. **Kill switch = server action dengan konfirmasi + entri audit timeline**; semantik pause-new vs cancel-active didefinisikan di kontrak sebelum UI (DeckUI).
7. **Redis service container di CI** — tidak bisa ditunda lagi; tanpa itu worker test hanya mock. Konvensi env-gate + test:live diperluas ke suite worker (OpsCI).
8. **MEV**: eksekusi publik tetap target sandwich → minAmountOut selalu dihitung ulang (sudah ada), re-quote saat eksekusi, dan private RPC dipertimbangkan bila volume nyata (Web3Intel).

## Antrean riset wave 4 (sebelum kontrak dibekukan)

- Web3Intel: opsi oracle trigger di Base (Chainlink data streams vs price feeds, freshness/deviation, rate limit & pricing), preseden DCA/limit bot, pola kompetitor.
- OpsCI: desain service container Redis untuk CI + skema nightly live-run.
- VaultAPI: desain BullMQ (queue topology, job id, retry/backoff, persistence) di atas port yang ada (SignerPort tetap dry-run only — worker tanpa key).
