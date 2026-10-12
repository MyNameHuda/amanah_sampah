# 🏫 Amanah Sampah

> Sistem manajemen poin sampah (deposit-refund) untuk pondok pesantren / sekolah.
> Satu project Vercel: React SPA + backend TypeScript (Vercel Functions) + Neon Postgres.

[![Node](https://img.shields.io/badge/Node-%E2%89%A522-5FA04E)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-18-61DAFB)](https://react.dev)
[![Vercel](https://img.shields.io/badge/Vercel-Functions-black)](https://vercel.com)
[![Neon](https://img.shields.io/badge/Neon-Postgres-00E599)](https://neon.tech)

---

## Konsep

```
SISAWA BELI PRODUK DI KANTIN   →  POIN BERKURANG   (utang plastik)
SISAWA BAWA SAMPAH KE POS      →  POIN BERTAMBAH   (verifikasi petugas)
SISAWA TUKAR POIN DENGAN REWARD→  POIN DIPAKAI     (admin approve)
```

Berbeda dari aplikasi poin pada umumnya, poin di sini **tidak bisa dibuat dari
nihil**: plastik yang dibuang harus diverifikasi petugas lebih dulu. Sistemnya
mirip *deposit-refund*, bukan sistem reward'.

## Stack

| Lapisan | Teknologi |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Barcode | `@zxing/browser` (kamera HP/tablet, multi-format) |
| Backend | TypeScript di Vercel Functions, routing berbasis file (`api/**`) |
| Auth | JWT (`jose`), bcryptjs, 5-tier role + 2 admin tier |
| Database | Neon Postgres (serverless driver) + Drizzle ORM |
| Object storage | S3-compatible (Supabase Storage / Cloudflare R2) via presigned URL |
| Validasi | Manual di tiap handler (`requireString`, `requireRole`, `requireCapability`) |

## Peran Pengguna

| Peran | Tanggung jawab |
|---|---|
| Siswa | Lihat poin sendiri, tukar reward |
| Staff Kantin | POS pembelian, buat produk & kategori |
| Petugas Kesantrian | Verifikasi pembuangan sampah, kelola produk |
| Admin Kesantrian | Kelola user, produk, kategori, reset poin |
| Super Admin | Akses penuh: reverse transaksi, adjust poin, config, monitoring |

## Struktur Project

```
amanah_sampah/
├── api/
│   └── index.js            # SATU serverless function (dihasilkan `npm run bundle:api`)
│
├── src/
│   ├── client/             # React SPA
│   │   ├── pages/          #   8 halaman (login + 5 dashboard + dll)
│   │   ├── components/     #   21 komponen (BarcodeScanner, Modal, dll)
│   │   ├── api/ auth/ hooks/ utils/
│   └── server/             # Backend shared
│       ├── db/             #   schema Drizzle + client Neon
│       ├── auth/           #   JWT, password, roles, T3 guard
│       ├── routes/         #   58 handler (default export, satu file satu route)
│       ├── router.ts       #   pencocokan path — dipakai dev DAN produksi
│       ├── routes.generated.ts  # tabel route (hasil `npm run gen:routes`)
│       ├── http.ts         #   wrapper request/response + error shape
│       └── http-guards.ts  #   requireAuth, requireRole, requireCapability
│
├── drizzle/                # SQL manual (0001_cron.sql)
├── scripts/                # dev-api.mts, gen-routes.mts
├── vercel.json             # build, region, rewrites, crons
├── drizzle.config.ts
└── tailwind.config.js  postcss.config.js  vite.config.ts
```

### Cara routing bekerja

Vercel memetakan **struktur folder** ke URL, bukan router eksplisit:

| File | URL | Method |
|---|---|---|
| `api/produk/index.ts` | `/api/produk` | GET, POST |
| `api/produk/[barcode]/index.ts` | `/api/produk/{barcode}` | GET, PATCH, DELETE |
| `api/produk/check-barcode/[barcode].ts` | `/api/produk/check-barcode/{barcode}` | GET |
| `api/super-admin/cron.ts` | `/api/super-admin/cron` | GET, POST |
| `api/cron/purge-tokens.ts` | `/api/cron/purge-tokens` | GET |

Konvensi penting: **`index.ts` = path akar**, nama file setelahnya = path literal.
`index.ts` tidak pernah diikutkan ke URL. Semua handler dibungkus `handler()` dari
`src/server/http.ts` yang sudah menangani parsing body dan bentuk error JSON.

## Menjalankan Secara Lokal

Butuh **dua terminal**:

```bash
# Terminal 1 — API di port 3000
npm run dev:api

# Terminal 2 — UI di port 5173, proxy /api -> :3000
npm run dev
```

Lalu buka `http://127.0.0.1:5173`.

Sebelum itu, siapkan `.env` (WAJIB — tanpa ini semua query database gagal):

```bash
cp .env.example .env
```

Minimal `DATABASE_URL` (Neon **pooled**) dan `JWT_SECRET` harus terisi.
`AWS_*` boleh kosong selama Anda tidak menguji upload foto bukti.

### Kenapa harus dua terminal

`npm run dev` hanya menjalankan **Vite** — yaitu frontend. Folder `api/**` hanya
dieksekusi oleh Vercel, bukan oleh Vite. Jadi kalau hanya `npm run dev`, Vite akan
mencoba proxy `/api/*` ke `127.0.0.1:3000`, tidak ada yang mendengar di sana, dan
browser menampilkan:

```
[vite] http proxy error: /api/auth/login
Error: connect ECONNREFUSED 127.0.0.1:3000
```

Itu **bukan** bug login — artinya API-nya belum jalan.

### `dev:api` lokal vs Vercel CLI

| Command | Cara kerja | Kapan dipakai |
|---|---|---|
| `npm run dev:api` | `scripts/dev-api.mts` — `node:http` di atas handler, tanpa akun Vercel | Default. Cepat, tidak butuh login |
| `npm run dev:api:vercel` | CLI Vercel asli | Hanya kalau perlu meniru perilaku produksi persis |

CLI Vercel v56 mewajibkan `vercel login` lebih dulu. Kalau belum pernah login,
pakai `npm run dev:api`.

`scripts/dev-api.mts` meniru routing file-based Vercel (termasuk `[param]` dinamis
dan `index.ts` sebagai path akar) dan me-reload modul otomatis saat `api/**`
berubah. Yang **tidak** disimulasikan: batas 30 detik per function, env var
per-environment Vercel, dan `process.env.VERCEL`.

Saat start, server mencetak semua route yang terdaftar — berguna untuk
mencari tahu path mana yang valid:

```
ANY  /api/auth/login
ANY  /api/produk/[barcode]
ANY  /api/verifikasi/sesi/[id]/items
```

Setiap request juga dicatat lengkap dengan file handler yang dipakai:

```
✓ 200 GET  /api/status                →  api/status.ts  (12ms)
✗ 401 GET  /api/siswa/me             →  api/siswa/me.ts  (8ms)
```

### Database

```bash
npm run db:push       # push schema Drizzle ke Neon
npm run db:generate   # generate file migrasi
npm run db:studio     # Drizzle Studio
```

Fungsi SQL untuk cron harus di-install sekali lewat Neon SQL Editor:

```bash
# jalankan isi file ini
drizzle/0001_cron.sql
```

Aman dijalankan berulang (`CREATE OR REPLACE`).

## Script

| Command | Fungsi |
|---|---|
| `npm run dev` | Vite saja — frontend di :5173 |
| `npm run dev:api` | API lokal di :3000 (tanpa akun Vercel) |
| `npm run dev:api:vercel` | API via CLI Vercel (perlu `vercel login` dulu) |
| `npm run build` | Build produksi ke `dist/` |
| `npm run typecheck` | Typecheck client + server |
| `npm run typecheck:server` | Typecheck `src/server` + `api` saja |
| `npm run gen:routes` | Regenerate `src/server/routes.generated.ts` — **wajib** setiap menambah/menRename handler di `src/server/routes/` |
| `npm run db:push` / `db:generate` / `db:studio` | Manage skema database |

> **Node.js minimum 22.** Driver `@neondatabase/serverless` yang dipakai
> `src/server/db/index.ts` membuka koneksi lewat **WebSocket**, dan kode ini
> tidak memasang polyfill — ia mengandalkan `WebSocket` global yang stabil
> sejak Node 22. Di Node 20 semua query database akan gagal.

## Arsitektur routing — kenapa hanya 1 file di `api/`

Aplikasi ini punya **58 route** tapi **satu** serverless function
(`api/index.js`). Alasannya: **Vercel Hobby hanya mengizinkan 12 function
per deployment.** Dengan satu function, seluruh backend jalan di plan gratis.

Handler tetap punya file masing-masing di `src/server/routes/`, tetap
default-export, dan tidak ada satu pun yang berubah logikanya. Yang berubah
hanya cara route dipilih — `src/server/router.ts`.

### Tiga hal yang harus dijaga

**1. Import relatif wajib ber-ekstensi `.ts`.** `package.json` memakai
`"type": "module"`, jadi Vercel menjalankan function sebagai **ESM native**
yang menolak specifier tanpa ekstensi:

```
ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/src/server/router.ts'
```

**2. Backend harus di-bundle sendiri, bukan relied on auto-transpile.**
`@vercel/node` hanya meng-transpile file TypeScript yang berada **di dalam**
folder `api/`. File di `src/server/**` ikut ter-serta lewat file tracing tapi
TANPA di-transpile. Karena itu `npm run build` menjalankan
`npm run bundle:api` (esbuild) yang menghasilkan `api/index.js` — 190 KB,
73 file, semua import relatif ter-inline, semua `node_modules` tetap external.

**3. Nama file kurung siku TIDAK bisa diandalkan.** `api/[[...slug]].js`
terdaftar di Vercel sebagai route **satu segmen**: `vercel inspect`
menampilkannya `api/[[...slug]]`, tapi query yang masuk hanya
`{"[...slug]": "..."}` (skalar, bukan array), dan `/api/auth/me` membalas
`NOT_FOUND` padahal catch-all seharusnya cocok. Approach-nya dibalik —
function diletakkan di `/api` tanpa kurung, dan routing dilakukan eksplisit:

```json
"rewrites": [
  { "source": "/api/:path*", "destination": "/api" },
  { "source": "/:path*",    "destination": "/index.html" }
]
```

Vercel menyuntikkan query `path`, tetapi **`req.url` tetap path ASLI** yang
diminta klien — sudah diverifikasi lewat deployment, bukan asumsi.

### Dev server dan produksi memakai router yang sama

`scripts/dev-api.mts` memanggil `src/server/router.ts`, bukan implementasi
routing sendiri. Dulu masing-masing punya implementasi sendiri, dan keduanya
bisa berbeda — yang sudah terbukti tiga kali: Vercel menolak deploy karena
nama dynamic segment `[nis]` vs `[reset_id]` berbeda di level yang sama, limit
12 function juga tidak pernah terlihat dari lokal, dan import `.ts` yang
berhenti gagal hanya di runtime Vercel.

## Deployment

Semua konfigurasi ada di `vercel.json`:

```jsonc
{
  "regions": ["sin1"],        // WAJIB — Neon ada di ap-southeast-1 (Singapore).
                              // Default Vercel iad1 = +500ms per query.
  "functions": { "api/**/*.ts": { "maxDuration": 30 } },
  "crons": [ /* 2 job, lihat di bawah */ ],
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

**`regions: ["sin1"]` adalah bagian paling penting.** Tanpa itu setiap query
database bolak-balik AS–Singapura dan aplikasi terasa lambat saat dipakai.

### Environment variables

Semua ada di `.env.example`. Yang wajib diisi di Vercel:

| Variabel | Wajib | Keterangan |
|---|---|---|
| `DATABASE_URL` | ya | Neon **Pooled** connection string |
| `JWT_SECRET` | ya | Min. 32 byte. Menggantinya = semua token lama invalid |
| `AWS_*` (6 var) | ya | Bucket foto bukti, harus **public** |
| `BOOTSTRAP_ADMIN_*` | sekali | Buat admin pertama, lalu **hapus** dari Vercel |
| `CRON_SECRET` | tidak | ⚠️ belum diverifikasi oleh kode — lihat Known Issues |

## Cron

Dua job pemeliharaan data, didefinisikan di `vercel.json` → `crons`:

| Job | Jadwal | Fungsi SQL | Effect |
|---|---|---|---|
| `/api/cron/purge-tokens` | `17 3 * * *` | `amanah_purge_expired_tokens(30)` | Hapus PAT yang kedaluwarsa / tak dipakai 30 hari |
| `/api/cron/archive-audit` | `43 4 * * *` | `amanah_archive_audit()` | Arsipkan + bersihkan `audit_logs` |

`pg_cron` (scheduler bawaan Postgres) **tidak bisa dipakai** di Neon: Neon hanya
mengizinkan `CREATE EXTENSION` di database bernama `postgres`, sedangkan project
ini memakai `neondb`.

Status dan trigger manual tersedia di `GET` / `POST /api/super-admin/cron`
(khusus `super_admin`).

## Known Issues

Ditemukan saat audit 28 Sep 2026.

### 1. Path salah di sisi client → 404

Handler-nya ada dan benar; yang salah path yang dipanggil frontend.

| Lokasi | Memanggil | Seharusnya | Dampak |
|---|---|---|---|
| `SuperAdminDashboard.tsx:302` | `/super-admin/cron/run` | `/super-admin/cron` | Tombol "Run cron" mati |
| `AdminDashboard.tsx:118` | `/admin/verifikasi/active` | `/verifikasi/active` | Daftar sesi terbuka kosong |
| `AdminDashboard.tsx:128` | `/admin/verifikasi/{id}/log` | `/verifikasi/{id}/log` | Modal log sesi kosong |
| `AdminDashboard.tsx:145` | `/admin/verifikasi/{id}/force-end` | `/verifikasi/{id}/force-end` | Force-end sesi gagal |
| `UserAuditModal.tsx:48` | `/super-admin/users/{id}/audit` | — handler belum ada | Timeline audit user kosong |
| `StaffDashboard.tsx:53,193` | `/pembelian/history` | `/pembelian` | Statistik "Hari Ini" selalu 0 |

### 2. 🔴 Kredensial database ter-commit di git

File `scripts/verify-*.ts` (11 file) pernah memuat connection string Neon
**lengkap dengan password** di baris 2, dan file-file itu **ter-track di git**
(terlihat di 5 commit, remote `github.com/MyNameHuda/amanah_sampah`):

```ts
process.env.DATABASE_URL ??= 'postgresql://neondb_owner:npg_...@ep-....neon.tech/neondb?...';
```

File-file tersebut **sudah dihapus** pada 2026-09-29. **Menghapus file tidak
menghapus kredensial dari riwayat git** — yang masih harus dilakukan:

1. **Rotate password** role di Neon console (dashboard → Roles). Ini wajib,
   karena repo punya remote GitHub dan passwordnya ada di riwayat commit.
2. Kalau repo ternyata publik, rotasi tanpa syarat — anggap kredensial bocor.
3. Kalau repo privat dan Anda memutuskan tidak melakukan rotasi, setidaknya
   pastikan `.env` tidak pernah ikut ter-commit.

### 3. `CRON_SECRET` tidak ditegakkan

`/api/cron/*` tidak pernah mengecek header `Authorization`, jadi kedua endpoint itu
terbuka publik — siapa pun yang tahu URL bisa memanggilnya. **Sudah dikonfirmasi
lewat HTTP test: keduanya membalas `200` tanpa token apa pun.** Dampaknya kecil
(hanya menghapus token yang sudah kedaluwarsa), tapi jangan diasumsikan terlindungi.
Set `CRON_SECRET` sendiri **tidak menambah keamanan apa pun** selama kode tidak
membandingkannya.

### 4. ~~`POST /api/pembelian` tidak punya pemeriksaan role~~ ✅ SUDAH DIPERBAIKI (2.0.1)

Dulu ini **lubang RBAC paling serius di aplikasi ini**, sudah dibuktikan lewat
HTTP test. Handler `store()` hanya memanggil `requireAuth()` — tidak pernah
memanggil `requireCapability(auth.role, 'kelola_pembelian')`.

Akibatnya **Siswa mana pun yang sudah login bisa membuat transaksi pembelian
atas nama Siswa lain**, lengkap dengan pengurangan poin:

| Aktor | Dulu | Sekarang |
|---|---|---|
| `siswa` | 201 Created | **422** ✓ |
| `petugas_kesantrian` | 201 Created | **422** ✓ |
| `staff_kantin` | 201 | 201 ✓ |
| `admin_kesantrian` | 201 | 201 ✓ |
| `super_admin` | 201 | 201 ✓ |

Perbaikan: `api/pembelian/index.ts` memanggil
`requireCapability(auth.role, 'kelola_pembelian')` sebelum membaca body request.

Masalah latennya masih ada: capability `kelola_katalog`, `kelola_reward`,
`kelola_siswa`, dan `super_admin_panel` **tetap tidak terpakai** di seluruh
`api/**`. Otorisasi katalog masih bergantung pada `canManageProduk()` di
`src/server/serialize.ts` yang definisinya **bertentangan** dengan tabel
capability.

### 5. `GET /api/status` tidak melaporkan status database

`api/status.ts:19` memanggil `pingDatabase()` **tanpa `await`**, padahal fungsi
itu `async`. Akibatnya `body.database` berisi objek `Promise`, yang diserialisasi
menjadi `{}`. Hasilnya endpoint health check **tidak pernah melaporkan kondisi
database**:

```json
{ "status": "running", "database": {}, "storage": false, "auth": true }
```

Perbaikan: `const db = await pingDatabase();`

### 6. `GET /api/produk/{barcode}` tidak ada

`api/produk/[barcode]/index.ts` hanya menangani `PATCH` dan `DELETE`, padahal
README dan dump endpoint mengiklankan `GET, PATCH, DELETE`. Memanggilnya membalas
`405 method_not_allowed`. Dampak rendah: tidak ada komponen frontend yang
memanggilnya (semua lewat `/produk/scan/{bc}` dan `/produk/check-barcode/{bc}`),
jadi ini ketidaksesuaian kontrak, bukan fitur yang patah.

### 7. Tidak ada test suite otomatis

Dulu ada `scripts/verify-*.ts` sebagai verifikasi ad-hoc, tapi skrip itu memanggil
handler secara langsung — **tidak pernah menguji routing HTTP**, sehingga path yang
salah di bagian 1 tidak pernah terdeteksi. Skrip tersebut sudah dihapus.

Perbandingan dengan Laravel: `DatabaseSeeder.php` yang dulu mengisi 51 Siswa demo
+ produk contoh ikut terhapus bersama folder `prototype/`. Akibatnya **database
instalasi baru benar-benar kosong** — nol kategori, nol produk, nol reward. Admin
harus mengisi semuanya manual sebelum aplikasi bisa dipakai. Pertimbangkan
menuliskan seeder TypeScript di `scripts/seed.ts`.

### 8. `npm run dev` saja tidak menjalankan API

Sudah dijelaskan di bagian [Menjalankan Secara Lokal](#menjalankan-secara-lokal).
Gejalanya `ECONNREFUSED 127.0.0.1:3000` — itu artinya API belum jalan, bukan
kredensial login yang salah.

## Lisensi

Proprietary. © 2026 Amanah Sampah Project.
