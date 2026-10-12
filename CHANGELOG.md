# Changelog

Semua perubahan penting pada Amanah Sampah didokumentasikan di file ini.

Format: [Semantic Versioning](https://semver.org/)
- `MAJOR`: perubahan yang merusak
- `MINOR`: fitur baru (backward-compatible)
- `PATCH`: perbaikan bug

Versi saat ini: **2.2.0**

---

## [2.2.0] - 2026-09-29

Lima endpoint backend yang sebelumnya **tidak punya UI sama sekali** kini
terpakai. Sebelumnya backend punya kemampuan yang tidak bisa diakses dari
layar mana pun.

### Added

**`GET /api/siswa/me` — dipakai SiswaDashboard.** Menggantikan dua request
(`/auth/me` untuk ambil NIS, lalu `/siswa/{nis}`). Endpoint ini mengembalikan
profile + utang terbuka + 20 ledger terakhir sekaligus, **dan memverifikasi
sendiri** bahwa NIS-nya milik pemanggil — jadi `/siswa/{nis}` yang juga
menerima NIS milik orang lain tidak dipakai untuk halaman ini.

**Riwayat Transaksi di SiswaDashboard** — dari `GET /api/siswa/{nis}/pembelian`.
Card list di mobile, tabel di desktop; menampilkan waktu, produk, barcode, qty,
poin per unit, total, dan status (belum lunas / lunas / dibatalkan).

**Koreksi Poin (T3) di User Management** — dari
`POST /api/super-admin/siswa/{nis}/adjust-poin`. Hanya untuk role Siswa.
Wajib alasan (min 30 karakter, masuk audit) + re-verify password super admin.
Menampilkan saldo sebelum koreksi.

**Timeline Siswa (T3) di User Management** — dari
`GET /api/super-admin/siswa/{nis}/timeline`. Tampilan vertikal read-only
menggabungkan transaksi, poin ledger, reward, reset, dan UTIK.

**Tombol "Hitung Ulang Saldo" di tab Coverage** — dari
`POST /api/super-admin/recompute-saldo`. `current_poin` setiap Siswa di-set
ulang menjadi Σ delta di `poin_ledger`, status blokir di-refresh. Berguna
setelah koreksi manual. Berlaku untuk semua siswa (maks 2000 per jalan).

### Changed

`GET /api/super-admin/users` sekarang ikut mengembalikan **`current_poin`**
untuk user role Siswa (sebelumnya hanya `nis`). Super admin bisa melihat saldo
sekilas di tabel user, dan modal Koreksi Poin menampilkan nilai sebelum koreksi.

### Verification

- **Audit kontrak:** 5/5 endpoint terdeteksi terpakai di frontend
- **Uji lokal (dev server): 16/16 lulus** — termasuk guard (NIS orang lain
  ditolak 422, password salah ditolak 422, alasan < 30 ditolak 422, poin 0
  ditolak 422)
- **Uji produksi: 8/8 lulus** — termasuk pembuktian bahwa `recompute-saldo`
  benar-benar menulis ulang `current_poin` dari ledger (0 → -10 saat Σ = -10),
  bukan hanya mengklaim bekerja

---

## [2.1.2] - 2026-09-29

### Fixed

**`/api/status` sekarang benar-benar mengecek kondisi database.**

`pingDatabase()` dipanggil **tanpa `await`** di `api/status.ts`, padahal fungsinya
`async`. Akibatnya `body.database` berisi objek `Promise`, yang di-serialize
menjadi `{}` — endpoint health check **tidak pernah** melaporkan kondisi
database sama sekali.

Ini bukan sekadar kosmetik. Saat password database dirotasi, seluruh aplikasi
mati (semua query 500) tapi `/api/status` tetap membalas `200` dengan
`"status":"running"`. Monitoring akan bilang aman sementara aplikasi mati
total. Sekarang:

```json
"database": { "ok": true, "latencyMs": 64 }
```

`status` juga ikut menyesuaikan (`running` / `degraded` / `maintenance`) dan
balas **503** kalau database tidak bisa dihubungi, supaya UptimeRobot langsung
tahu.

**Driver WebSocket Neon dikonfigurasi eksplisit.** `neonConfig.webSocketConstructor`
kini diisi dengan `ws`, bukan mengandalkan `WebSocket` global runtime. Ini
konfigurasi yang direkomendasikan Neon untuk Node serverless, dan menghapus
ketergantungan pada global yang tidak selalu ada di Vercel Functions.

### Known issues

- **Body JSON yang rusak membalas 500, seharusnya 400.** Parser body milik
  Vercel melempar error lebih dulu, sebelum `readBody()` di `http.ts` sempat
  memberi balasan 400. Fungsional tidak terganggu — hanya kode statusnya.

---

## [2.1.1] - 2026-09-29

Audit kontrak menyeluruh: **77 panggilan API frontend dibandingkan dengan 58
route backend**, hasilnya **0 path rusak** (sebelumnya 8).

### Fixed

**9 call site memanggil path yang tidak ada di backend (semua 404).**

| Lokasi | Dulu | Sekarang |
|---|---|---|
| `AdminDashboard:118` | `/admin/verifikasi/active` | `/verifikasi/active` |
| `AdminDashboard:128` | `/admin/verifikasi/{id}/log` | `/verifikasi/{id}/log` |
| `AdminDashboard:145` | `/admin/verifikasi/{id}/force-end` | `/verifikasi/{id}/force-end` |
| `StaffDashboard:53,193` | `/pembelian/history` | `/pembelian` |
| `SuperAdminDashboard:247` | `/super-admin/users/{id}/toggle-suspend` | `.../suspend` + `{suspended, alasan}` |
| `SuperAdminUsers:187` | idem | idem |
| `SuperAdminDashboard:310` | `/super-admin/cron/run` | `/super-admin/cron` |
| `SuperAdminDashboard:328` | `/super-admin/reverse-transaction/{id}` | `/super-admin/transactions/{txId}/reverse` |
| `UserAuditModal:49` | `/super-admin/users/{id}/audit` | `/super-admin/audit/search?user_id=` |

**`DELETE /super-admin/users/{id}` membalas 200 tanpa efek samping.** Handler
`[userId]/index.ts` hanya mengimplementasikan GET/PATCH/PUT dan berakhir tanpa
fallback, jadi request DELETE jatuh ke `res.status(200).json({message:'OK.'})`.
Tombol "Archive" terlihat berhasil padahal tidak terjadi apa-apa. Diganti ke
`POST /super-admin/users/{id}/delete`, yang memang ada — sekarang modal Archive
mengumpulkan alasan (audit) + re-verify password (T3).

**Toast cron selalu menampilkan "OK".** Endpoint `/super-admin/cron` mengembalikan
`{ran, at, results, tables}` — tidak punya `message`, jadi klien jatuh ke teks
generik. Sekarang ditampilkan hasil sebenarnya per job.

**Kartu "Sebagai Actor" / "Sebagai Target" selalu 0.** `audit/search?user_id=`
hanya mencocokkan aktor (`audit_logs.user_id`), tidak ada filter target. Kartu
yang tidak punya sumber data dihapus, digantikan "Jenis Aksi".

**Super admin bisa masuk dashboard staff/petugas/admin dengan mengetik URL.**
`super_admin` + `super_admin_tier3` tercantum di `allowedRoles` ketiga route
itu. Sekarang dibuang — super admin hanya bisa `/super` dan `/super/users`.
Backend tetap menerima role super_admin di endpoint operasional; yang dikunci
adalah akses UI-nya.

### Changed

**Otorisasi katalog sekarang satu sumber.** `canManageProduk()` dan
`canEditProduk()` di `serialize.ts` tadinya menuliskan roster role sendiri yang
**bertentangan** dengan `kelola_katalog` di `roles.ts`. Sekarang keduanya
membaca dari `CAPABILITIES`, dan capability-nya dipecah sesuai aturan bisnis:
`kelola_katalog` (tambah) dan `kelola_katalog_edit` (ubah/archive).

Aturan bisnis yang berlaku — **staff kantin boleh kelola katalog**: menambah
produk & kategori ya, mengubah/meng-archive milik orang lain tidak.

**Label & warna aksi audit disatukan** ke `src/client/utils/auditAction.ts`.
Dulu peta warnanya diketik manual di `UserAuditModal` dan melenceng dari server:
`superadmin.password_reset` (server: `reset_password`),
`superadmin.toggle_suspend` (server: `user_suspend`/`user_unsuspend`), dan 3
aksinya (`cron_manual_trigger`, `coverage`, `audit`) tidak pernah ada di server.
Konsekuensinya aksi keamanan tampil abu-abu seperti `auth.logout`. Sekalian,
teks aksinya ditampilkan mentah — sekarang pakai label bahasa manusia.

### Verification

12 assertion empiris lewat HTTP sungguhan, **12/12 lulus**: endpoint yang
tadinya 404, suspend (path + body + audit), audit search, serta aturan
katalog staff kantin (buat = 201, archive = 422).

---

## [2.1.0] - 2026-09-29

### Changed

**Backend diubah dari 58 serverless function menjadi SATU catch-all function.**

Alasannya keras: Vercel Hobby hanya mengizinkan **12 function per
deployment**, sedangkan aplikasi ini punya 58 route. Build-nya sendiri sudah
berhasil — yang ditolak murni karena jumlah function.

- 58 handler dipindahkan dari `api/**` ke `src/server/routes/**`
  (struktur folder dipertahankan persis; hanya import relatif yang di-rewrite,
  256 import). Tidak ada logika handler yang berubah.
- `src/server/router.ts` (baru) — pencocokan path, dengan urutan
  **statis menang atas dinamis**.
- `src/server/routes.generated.ts` (baru, hasil generate) — tabel route statis
  berisi import eksplisit ke seluruh handler. Diperlukan karena di dalam
  serverless function filesystem sudah dibundle, jadi `fs.readdir` tidak bisa
  dipakai mencari handler.
- `scripts/gen-routes.mts` + `npm run gen:routes` — regenerate tabel route
  setiap kali ada handler baru.
- `scripts/bundle-api.mts` + `npm run bundle:api` (baru) — esbuild bundel
  `src/server/entry.ts` jadi satu file `api/index.js` (190 KB, 73 file,
  `node_modules` tetap external). Dijalankan otomatis oleh `npm run build`.
- `vercel.json` — pola `functions` jadi `api/index.js`, dan routing ditulis
  eksplisit lewat rewrite.

### Fixed

**Backend tidak bisa di-deploy sama sekali.** Tiga masalah berlapis, semua
hanya muncul di Vercel dan tidak pernah terlihat dari lokal:

1. **Import relatif tanpa ekstensi.** `"type": "module"` membuat Vercel
   menjalankan function sebagai ESM native yang menolak specifier tanpa
   ekstensi:
   `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/src/server/router'`.
   TypeScript tidak pernah meng-complain (`moduleResolution: "bundler"` +
   `allowImportingTsExtensions`) dan build lokal selalu hijau. Semua import
   relatif di `api/**` dan `src/server/**` kini ber-ekstensi `.ts` (337 import).

2. **File di luar `api/` tidak di-transpile.** `@vercel/node` hanya
   meng-transpile TypeScript yang berada di dalam `api/`; `src/server/**`
   ikut ter-serta tanpa ditranspilasi, sehingga import `.ts`-nya menggantung.
   Karena itu backend sekarang di-bundle sendiri oleh esbuild saat build.

3. **Nama file kurung siku tidak bisa diandalkan.** `api/[[...slug]].js`
   didaftarkan Vercel sebagai route **satu segmen** — `vercel inspect`
   menampilkannya `api/[[...slug]]`, tapi query yang masuk hanya
   `{"[...slug]": "..."}` (skalar, bukan array), dan `/api/auth/me` membalas
   `NOT_FOUND` padahal catch-all seharusnya cocok. Ditemukan lewat endpoint
   debug yang melaporkan apa yang sebenarnya dikirim Vercel.
   Approach dibalik: function diletakkan di `api/index.js` (tanpa kurung),
   routing eksplisit via rewrite `/api/:path*` → `/api`. Diverifikasi bahwa
   `req.url` tetap path ASLI meski sudah di-rewrite.

### Verification

Regresi penuh **27/27 lulus** lewat HTTP ke dev server, plus **18 smoke test
lolos di deployment Vercel**:

- 58/58 route: router mencocokkan path yang benar **dan** handler menjawab
- 9 kasus precedence: `/api/siswa/me` bukan `:nis`, `/api/reward/admin` bukan
  `:id`, `/api/produk/scan/:bc` bukan `/api/produk/:barcode`, dll.
- Alur utama: pembelian → verifikasi → commit → reward redeem
- Fix BUG-1 masih berlaku (`siswa` & `petugas` tetap dapat 422)
- Produksi: SPA 4/4 path, `/api/status` 200 dengan `region=sin1`,
  guard 401 di 6 endpoint, 6/6 route 2+ segmen sampai ke function,
  route tak dikenal 404 dari router

### Environment variables

Deployment production memakai `DATABASE_URL` dan `JWT_SECRET` (di-encrypt).
`AWS_*` dan `CRON_SECRET` sengaja tidak di-set, sesuai keputusan: upload foto
bukti akan gagal dan endpoint cron tetap terbuka.

### Deployment

**Production: <https://amanah-sampah.vercel.app>** — 1 deployment, alias ke
domain bersih (bukan URL preview).

Vercel Toolbar **tidak ada** di production: HTML hasil build bersih dari script
`/_vercel/*`. Toolbar hanya di-inject ke deployment *preview*, dan seluruh
deployment preview sudah dihapus.

Verifikasi produksi (lewat domain, tanpa deployment protection):

| Yang dicek | Hasil |
|---|---|
| SPA 7 path (`/`, `/login`, 5 dashboard, path acak) | 200, HTML |
| Vercel toolbar / marker di HTML | tidak ada |
| `GET /api/status` | 200, `region=sin1`, `regionOk=true` |
| Guard 401 di 6 endpoint | benar |
| Routing 2+ segmen | 6/6 mencapai function |
| Route asing | 404 dari router |
| `POST /api/auth/login` (body JSON) | 422 — body ter-parse, query DB jalan |
| `POST /api/auth/login` (body kosong) | 422 validasi, bukan 400 body rusak |
| `POST` ke route terlindungi | 401 |

---

## [2.0.1] - 2026-09-29

### Removed

**Pembersihan source code tidak terpakai, setelah audit + black-box test
seluruh aplikasi (143 test HTTP terhadap 62 route).**

- `scripts/verify-*.ts` — 11 skrip verifikasi ad-hoc. Alasan dihapus:
  (a) setiap file memuat connection string Neon **lengkap dengan password**
  di baris 2 dan file itu ter-track di git; (b) skripnya memanggil handler
  secara langsung tanpa HTTP, sehingga path yang salah di sisi client tidak
  pernah terdeteksi. **Password tetap ada di riwayat git — masih wajib di-rotate
  di Neon console.**
- `.preview/` — 5 screenshot PNG (2,4 MB) dari sesi preview UI sebelumnya
- Dependency `ws`, `@types/ws`, `zod` — nol import di seluruh `api/` dan `src/`.
  (`zod` tidak pernah dipakai meski README mengklaim validasi memakai Zod;
  validasi sekarang manual di tiap handler.)

Tidak ada file mati di `src/` — semua halaman, komponen, dan hook terverifikasi
dipakai (banyak yang via `React.lazy`).

### Changed

- `engines.node` dinaikkan dari `>=20` ke **`>=22`**. Driver
  `@neondatabase/serverless` membuka koneksi lewat WebSocket dan kode ini
  tidak memasang polyfill — ia mengandalkan `WebSocket` global yang stabil
  sejak Node 22.
- README: klaim "Validasi | Zod" dikoreksi; bagian Known Issues ditulis ulang
  berdasarkan temuan yang sudah diverifikasi lewat HTTP, bukan asumsi.

### Fixed

**Lubang RBAC pada `POST /api/pembelian` (BUG-1, kritis).**
Handler `store()` hanya memanggil `requireAuth()` dan sama sekali tidak
memeriksa capability. Terbukti lewat black-box HTTP test: `siswa` maupun
`petugas_kesantrian` sama-sama mendapat **201 Created** dan berhasil mengurangi
poin Siswa. Capability `kelola_pembelian` sebenarnya sudah ada di
`src/server/auth/roles.ts:54` sejak awal, tapi tidak pernah dipanggil.

Perbaikan: `api/pembelian/index.ts` kini memanggil
`requireCapability(auth.role, 'kelola_pembelian')` sebelum membaca body request.

Hasil verifikasi setelah fix (5 role, diuji lewat HTTP sungguhan):

| Role | Sebelum | Sesudah | Saldo |
|---|---|---|---|
| `siswa` | 201 | **422** | tidak berubah ✓ |
| `petugas_kesantrian` | 201 | **422** | tidak berubah ✓ |
| `staff_kantin` | 201 | 201 | −1 ✓ |
| `admin_kesantrian` | 201 | 201 | −1 ✓ |
| `super_admin` | 201 | 201 | −1 ✓ |

### Known issues (terverifikasi lewat test — belum diperbaiki)

1. **`/api/cron/*` terbuka tanpa autentikasi** — keduanya membalas `200` tanpa
   token, dan `CRON_SECRET` tidak pernah dibandingkan.
2. **6 path di frontend salah** → `404` (lihat README Known Issues).
3. **`GET /api/status` tidak melaporkan status database.** `api/status.ts:19`
   memanggil `pingDatabase()` tanpa `await`, sehingga `database` selalu `{}`.
4. **`GET /api/produk/{barcode}` tidak ada** (`405`), padahal dikiklankan di
   README. Tidak ada komponen frontend yang memanggilnya.
5. **Sistem otorisasi ganda.** Empat capability (`kelola_katalog`,
   `kelola_reward`, `kelola_siswa`, `super_admin_panel`) masih mati, dan
   `canManageProduk()` di `src/server/serialize.ts` bertentangan definisinya
   dengan tabel capability.
6. **Tidak ada seeder.** `DatabaseSeeder.php` (51 Siswa demo + produk contoh)
   terhapus bersama `prototype/`, sehingga instalasi baru benar-benar kosong.
7. **19 PHPUnit test tidak dipporting.** `prototype/tests/Feature/` berisi 19
   test (AuthFlow, PembelianFlow, RewardFlow, ResetPoinFlow, SuspendedUser,
   Tier3Auth, dst) — semuanya hilang tanpa pengganti. Aplikasi turun dari
   19 test otomatis menjadi 0.

---

## [2.0.0] - 2026-09-28

### Changed

**Backend ditulis ulang dari Laravel 12 + PHP 8.2 menjadi TypeScript.**
Ini perubahan arsitektur terbesar dalam sejarah proyek — seluruh
`prototype/` (Laravel) dihapus, dan `api/**` menjadi satu-satunya backend.

- **58 handler baru** di `api/**` sebagai Vercel Functions, menggantikan
  63 route Laravel di `prototype/routes/api.php`
- **12 modul server** di `src/server/` — JWT, guard, serialisasi, HTTP wrapper
- **Drizzle ORM** menggantikan Eloquent; `src/server/db/schema.ts` diturunkan
  dari 18 file migrasi Laravel
- **Neon serverless driver** (`@neondatabase/serverless`) menggantikan driver
  Laravel + supervisor
- **Frontend dipindah** ke `src/client/` (dulu `prototype-frontend/`, sudah tidak ada)
- `src/server/http.ts` menyediakan `handler()` yang meniru bentuk response dan
  bentuk error Laravel (`ValidationException`) supaya port tidak mengubah kontrak

**Deployment disederhanakan menjadi satu project Vercel** (dulu dua jalur:
Vercel untuk frontend + Render untuk backend Laravel).

- `vercel.json` sekarang memegang build, region, rewrites, dan crons
- **`regions: ["sin1"]`** ditambahkan — Neon berada di `ap-southeast-1`, dan
  default Vercel `iad1` menambahkan ±500ms per query

### Added

- **Vercel Cron** menggantikan supervisor Laravel (`php artisan schedule:run`)
  yang tidak bisa berjalan di serverless. Dua job: `purge-tokens` dan
  `archive-audit`, logikanya tetap milik database lewat fungsi SQL
  `amanah_purge_expired_tokens()` dan `amanah_archive_audit()`
- **`drizzle/0001_cron.sql`** — implementasi SQL untuk kedua fungsi di atas
- **`api/super-admin/cron.ts`** — status pekerjaan perawatan (GET) dan trigger
  manual (POST), khusus `super_admin`
- **Presigned URL untuk foto bukti** (`api/verifikasi/foto-bukti/presign.ts`).
  Versi Laravel mengirim multipart; multipart tidak praktis di Vercel Functions
  karena ukuran body
- **Super Admin T1–T3** — manajemen user, config, mode, reverse transaksi,
  adjust poin, recompute saldo, system health, audit search, timeline per siswa,
  coverage, force-logout
- **Monitoring sesi verifikasi** — daftar sesi aktif, log sesi, force-end
- **`scripts/verify-*.ts`** — 11 skrip verifikasi yang memanggil handler langsung
- **`tsconfig.server.json`** — typecheck terpisah untuk `src/server` + `api`
  (script `typecheck:server` sebelumnya menunjuk file yang tidak pernah ada)

### Removed

- **`prototype/`** — seluruh aplikasi Laravel 12: 10 controller, 13 model,
  16 migration, 5 artisan command, 133 PHPUnit test, seeder, dan
  `vendor/` (157 MB)
- **`render.yaml`** dan **`.dockerignore`** — jalur deploy Render/Docker
- **Jalur `/admin/*`** — grup route Laravel yang tidak pernah dipindah
- **`prototype-frontend/`** — sudah tidak ada sejak konsolidasi ke satu project

### Documentation

- **`README.md` ditulis ulang** untuk arsitektur TypeScript: struktur folder
  aktual, konvensi routing file, setup, deployment, cron, dan known issues.
  Versi sebelumnya masih menjelaskan Laravel 11 dan folder `prototype-frontend/`
  yang sudah tidak ada.
- Dokumen produk (PRD, ERD, Decision-Log, manual, `.docx`) dipindahkan **keluar
  repo** ke `C:\Users\bangn\Documents\Kerja\_arsip-amanah_sampah\`. Repo sekarang
  source-only. `.gitignore` sudah dilonggarkan agar `README.md` dan
  `CHANGELOG.md` bisa ikut ter-track.

---

## Known Issues — 2.0.0

Belum diperbaiki pada rilis ini. Semuanya adalah **path yang salah di sisi
client** yang menyebabkan 404; handler-nya sendiri ada dan benar.

| Lokasi | Memanggil | Seharusnya | Dampak |
|---|---|---|---|
| `SuperAdminDashboard.tsx:302` | `/super-admin/cron/run` | `/super-admin/cron` | Tombol "Run cron" mati |
| `AdminDashboard.tsx:118` | `/admin/verifikasi/active` | `/verifikasi/active` | Daftar sesi terbuka kosong |
| `AdminDashboard.tsx:128` | `/admin/verifikasi/{id}/log` | `/verifikasi/{id}/log` | Modal log sesi kosong |
| `AdminDashboard.tsx:145` | `/admin/verifikasi/{id}/force-end` | `/verifikasi/{id}/force-end` | Force-end sesi gagal |
| `UserAuditModal.tsx:48` | `/super-admin/users/{id}/audit` | — belum ada handler | Timeline audit user kosong |
| `StaffDashboard.tsx:53,193` | `/pembelian/history` | `/pembelian` | Statistik "Hari Ini" selalu 0 |

Selain itu: **`CRON_SECRET` belum diverifikasi** — `/api/cron/*` tidak pernah
membandingkan header `Authorization`, sehingga terbuka publik.

---

## [1.1.0] - 2026-09-20

### Added

- 5-tier role system (siswa, staff_kantin, petugas, admin, super_admin)
- POS pembelian (Staff Kantin)
- Verifikasi pembuangan dengan FIFO matching (Petugas)
- Reward redemption dengan atomic stock/saldo update (Siswa)
- Reset poin 2-step verification (Admin + Super)
- Audit log untuk semua mutation sensitif
- 51 demo siswa + sample produk/kategori/reward

#### Tech Stack (versi ini)

- Backend: Laravel 12 + PHP 8.2
- Frontend: React 18 + TypeScript + Vite
- Database: SQLite (dev) / PostgreSQL (prod-ready)
- Auth: Laravel Sanctum (JWT)
- UI: Tailwind CSS

---

[2.0.0]: https://github.com/your-org/amanah-sampah/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/your-org/amanah-sampah/releases/tag/v1.1.0
