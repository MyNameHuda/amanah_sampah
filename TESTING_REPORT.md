# Laporan Audit & Black-Box Test — Amanah Sampah 2.0

**Tanggal:** 2026-09-29
**Ruang lingkup:** 62 route API, 15 halaman React, 13 tabel PostgreSQL
**Metode:** black-box HTTP terhadap dev server sungguhan (`127.0.0.1:3000`) + database Neon
**Fixtures:** 143 assertion E2E, dibuat dan dihapus 100% (prefix `E2E` / `FOCUS` / `F2`)

> **Status update (2.0.1):** BUG-1 sudah diperbaiki — `api/pembelian/index.ts`
> kini memanggil `requireCapability(auth.role, 'kelola_pembelian')` sebelum
> membaca body. Diverifikasi ulang: `siswa` dan `petugas_kesantrian` kini
> mendapat **422** dan saldo tidak berubah, sementara `staff_kantin`,
> `admin_kesantrian`, dan `super_admin` tetap **201**. Detail di bagian 4.
> Semua temuan lain masih terbuka.

---

## 1. Ringkasan Eksekutif

| Metrik | Nilai |
|---|---|
| Total assertion E2E | 143 |
| Lulus run pertama | 109 |
| Gagal run pertama | 34 |
| └─ asli bug aplikasi | 12 |
| └─ asumsi test yang salah (sudah dikoreksi) | 22 |
| Build produksi | ✅ sukses |
| Typecheck client + server | ✅ 0 error |
| File mati di `src/` | 0 |
| Bug KRITIS ditemukan | **1** — sudah diperbaiki di 2.0.1 |
| Bug terbuka tersisa | 5 |

**Verdict:** Fondasi backend solid — logika poin, ledger, dan guard autentikasi
terbukti benar pada skenario terkontrol. Satu bug kritis (lubang RBAC di
`POST /api/pembelian`) **sudah diperbaiki dan diverifikasi ulang lewat 5 role**.
Sisa 5 temuan terbuka: 6 path client salah, cron tanpa autentikasi, `/api/status`
tidak melaporkan kondisi database, handler `GET` produk yang hilang, dan 4
capability RBAC yang masih mati.

---

## 2. Analisis Arsitektur

### Bentuk aplikasi

```
Browser (React 18 + Vite 5 + Tailwind 3)
   │  Authorization: Bearer <JWT>
   ▼
Vercel Functions (api/**, 62 route, TypeScript)
   │  guard: requireAuth → requireSuperAdmin / requireRole / requireCapability
   ▼
Neon Postgres (drizzle-orm + @neondatabase/serverless via WebSocket)
   │
   └── S3-compatible storage (presigned URL, belum dikonfigurasi)
```

### Modul server (`src/server/`, 12 file)

| Modul | Tugas |
|---|---|
| `http.ts` | Wrapper handler Vercel, `readBody`, `requireAuth`, `JsonResult` |
| `http-guards.ts` | `requireSuperAdmin`, `requireRole`, `requireCapability`, deteksi maintenance/readonly |
| `auth/jwt.ts` | Tanda tangan HS256, TTL 1 hari / 7 hari (remember_me) |
| `auth/roles.ts` | Tabel 7 capability + hierarki role |
| `auth/t3.ts` | Guard Tier-3: aksi destruktif butuh re-verify password |
| `serialize.ts` | Mapping baris DB → bentuk JSON + helper otorisasi produk |
| `db/index.ts` | Pool neon, type parser bigint |
| `db/schema.ts` | 13 tabel turunan dari 18 migrasi Laravel |
| `db/queries.ts` | Query bersama (operator Postgres `->>` untuk jsonb) |

### Distribusi route

| Domain | Jumlah route | Role utama |
|---|---|---|
| Auth & profil | 5 | semua |
| Siswa | 4 | admin, petugas |
| Katalog (kategori/produk) | 10 | admin, petugas, staff |
| Pembelian (POS) | 2 | staff kantin |
| Verifikasi | 10 | petugas |
| Reward | 7 | admin / siswa |
| Reset poin | 3 | admin, super admin |
| Super admin | 17 | super admin |
| Cron & setup | 4 | **cron tanpa auth** |
| Status | 1 | publik |

---

## 3. Hasil Test per Modul

| # | Modul | Hasil | Catatan |
|---|---|---|---|
| 1 | Auth & token | 9/9 ✅ | Login email + NIS, remember_me, anti-enumerasi, 401/405 benar |
| 2 | Profil | 3/3 ✅ | Update nama, validasi kosong |
| 3 | Siswa | 6/6 ✅ | Guard "siswa tidak boleh listing semua" bekerja |
| 4 | Katalog | 15/18 ⚠️ | `GET /produk/{barcode}` 405 |
| 5 | POS pembelian | 5/9 ❌ | **RBAC bocor** + 1 asumsi test salah |
| 6 | Verifikasi | 12/14 ⚠️ | Sesi ganda, match utang, force-end, cancel semua benar |
| 7 | Reward | 11/14 ⚠️ | PATCH butuh body lengkap (mengikuti Laravel) |
| 8 | Reset poin | 4/7 ⚠️ | Alur 2 langkah **benar**, butuh Siswa `blocked` |
| 9 | Super admin — user | 8/11 ⚠️ | Soft-delete by design |
| 10 | Super admin — config/mode | 10/10 ✅ | Maintenance → `/status` 503 ✓ |
| 11 | Super admin — T3 & destruktif | 7/7 ✅ | Reverse wajib mode read-only |
| 12 | Cron & setup | 1/3 ❌ | **Cron terbuka publik** |
| 13 | Path client | 0/6 ❌ | Semua 6 path salah (konfirmasi) |
| 14 | Konsistensi data | 1/2 ⚠️ | Invarian ledger **benar** di skenario terkontrol |

---

## 4. Bug yang Dikonfirmasi

### ✅ BUG-1 — `POST /api/pembelian` tidak memeriksa role (KRITIS) — **SUDAH DIPERBAIKI**

**Lokasi:** `api/pembelian/index.ts` → `store()`

Handler memanggil `requireAuth()` lalu langsung memproses. Tidak ada satu pun
pemeriksaan capability. Capability `kelola_pembelian` **sudah didefinisikan** di
`src/server/auth/roles.ts:54` tetapi tidak pernah dipanggil di seluruh `api/**`.

**Bukti — HTTP test sungguhan:**

| Aktor | Sebelum fix | Sesudah fix | Saldo |
|---|---|---|---|
| `siswa` | 201 Created ❌ | **422** ✓ | tidak berubah ✓ |
| `petugas_kesantrian` | 201 Created ❌ | **422** ✓ | tidak berubah ✓ |
| `staff_kantin` | 201 | 201 ✓ | −1 ✓ |
| `admin_kesantrian` | 201 | 201 ✓ | −1 ✓ |
| `super_admin` | 201 | 201 ✓ | −1 ✓ |

**Dampak kalau tidak diperbaiki:** Siswa mana pun yang sudah login bisa membuat
transaksi pembelian **atas nama Siswa lain**, lengkap dengan pengurangan poin
dan pencatatan di `poin_ledger`. Ini manipulasi saldo jarak jauh.

**Perbaikan yang diterapkan:**
```ts
async function store(ctx: Ctx, auth: { sub: number; role: any }) {
  requireCapability(auth.role, 'kelola_pembelian');   // ← sebelum readBody
  const db = getDb();
  const body = readBody(ctx);
  // ...
}
```

---

### 🟠 BUG-2 — 6 path di frontend tidak punya route

Dikonfirmasi lewat HTTP: semuanya membalas `404`.

| Lokasi | Path dipanggil | Seharusnya |
|---|---|---|
| `AdminDashboard.tsx:118` | `/admin/verifikasi/active` | `/verifikasi/active` |
| `AdminDashboard.tsx:128` | `/admin/verifikasi/{id}/log` | `/verifikasi/{id}/log` |
| `AdminDashboard.tsx:145` | `/admin/verifikasi/{id}/force-end` | `/verifikasi/{id}/force-end` |
| `SuperAdminDashboard.tsx:302` | `/super-admin/cron/run` | `/super-admin/cron` |
| `StaffDashboard.tsx:53,193` | `/pembelian/history` | `/pembelian` |
| `UserAuditModal.tsx:48` | `/super-admin/users/{id}/audit` | `/super-admin/audit/search?user_id=` |

**Dampak:**-monitoring verifikasi, force-end sesi, trigger cron manual,
audit per-user, dan riwayat pembelian — semuanya tidak berfungsi di UI.

---

### 🟠 BUG-3 — `/api/cron/*` terbuka tanpa autentikasi

```
GET /api/cron/purge-tokens  →  200  {"job":"purge-expired-tokens","purged":0,...}
GET /api/cron/archive-audit →  200
```

`CRON_SECRET` ada di `.env.example` tapi kodenya tidak pernah membandingkannya.
Siapa pun yang tahu URL bisa memicu. Dampaknya terbatas (idempoten, hanya
membihkan data lama), tapi tetap tidak seharusnya terbuka.

---

### 🟡 BUG-4 — `GET /api/status` tidak melaporkan status database

`api/status.ts:19` memanggil `pingDatabase()` **tanpa `await`**. Fungsi itu
`async`, jadi `body.database` berisi `Promise` yang ter-serialisasi jadi `{}`.

```json
{ "status": "running", "database": {}, "storage": false, "auth": true }
```

Endpoint health check tidak pernah bisa memberi tahu apakah database hidup.
**Perbaikan:** `const db = await pingDatabase();`

---

### 🟡 BUG-5 — `GET /api/produk/{barcode}` tidak ada

`api/produk/[barcode]/index.ts` hanya menangani `PATCH` dan `DELETE`, padahal
README mengiklankan `GET, PATCH, DELETE`. Memanggilnya → `405`.

Dampak rendah: tidak ada komponen frontend yang memanggilnya (semua lewat
`/produk/scan/{bc}` dan `/produk/check-barcode/{bc}`).

---

### 🟡 BUG-6 — Sistem otorisasi ganda yang bertentangan

Ada **dua sumber kebenaran** yang tidak sepakat:

| | `roles.ts` `CAPABILITIES` | `serialize.ts` `canManageProduk()` |
|---|---|---|
| staff_kantin | ❌ tidak boleh | ✅ boleh |
| petugas_kesantrian | ❌ tidak boleh | ✅ boleh |
| admin / super_admin | ✅ boleh | ✅ boleh |

Yang benar-benar ditegakkan di `api/**` hanya `input_verifikasi`. Empat
capability lain (`kelola_katalog`, `kelola_reward`, `kelola_siswa`,
`super_admin_panel`) **mati** — didefinisikan tapi nol pemanggilan.

---

### 🟢 BUG-7 — Marker `suspended` tidak konsisten (rendah)

`api/auth/login.ts` → `suspendedError()` melempar `HttpError(422, …, {field:'login'})`
**tanpa** flag `suspended: true`, padahal `requireAuth` menyertakannya dan
`client.ts` bereaksi padanya. Saat ini tidak merusak UX karena halaman Login
menampilkan pesannya langsung, tapi kontraknya tidak konsisten.

---

## 5. Yang Terbukti **Benar** (Penting)

Tidak semuanya rusak. Berikut ini **terbukti benar** lewat test:

**🔐 Keamanan & auth**
- Guard 401 bekerja untuk semua endpoint terlindungi
- Anti-enumerasi: email tak dikenal & password salah memberi pesan identik
- JWT: token sampah ditolak 401, `remember_me` benar menambah TTL ke 10080 menit
- Sesi ganda verifikasi ditolak (multi-session guard)
- T3: `adjust-poin` **wajib** `password_reverify`; salah → ditolak
- T3: `reverse` transaksi **wajib** mode read-only aktif
- `user_id: 1` di-JWT → `requireSuperAdmin` menolak (proteksi user root)
- `is_suspended` pernah JWT masih berlaku → 403, bukan eternal hang

**💰 Logika poin (uji terkontrol)**
```
Invarian:  Σ poin_delta  ==  {_siswa.current_poin}

  setelah 3 pembelian        sum(ledger)=  -6   current_poin=  -6   ✓
  setelah commit verifikasi  sum(ledger)=   2   current_poin=   2   ✓
```
Setiap baris `poin_ledger.saldo_sesudah` juga konsisten dengan running total
(`running += delta`). **Tidak ada penalti/lop yang bocor.**

**🔄 Alur bisnis**
- Pembelian single & batch: saldo naik saat verifikasi, turun saat pembelian
- Match utang: `qty_matched`vs`qty_excess` benar, transaksi otomatis di-`void`
- Reward: stok turun, saldo turun, duplikat nama ditolak, arsip/restore jalan
- Reset poin 2 langkah: butuh `blocked` → step1 → apply → saldo 0 + unblock,
  apply kedua kali ditolak (idempoten)
- Hapus user = **soft delete** (dinonaktifkan), sesuai kebijakan

**🛡️ Validasi**
- Path traversal `foto_bukti_path: '../../etc/passwd'` → ditolak
- qty negatif/0, NIS tak dikenal, barcode tak dikenal, kategori tak dikenal → 422
- `is_maintenance` → `/api/status` balas **503**
- `config` menolak nilai non-numerik, batas positif, dan key di luar allowlist
- `mode` menolak key non-allowlist dan value non-boolean

---

## 6. Masalah Struktural

### 6.1 Tidak ada seeder — instalasi baru kosong

`prototype/database/seeders/DatabaseSeeder.php` (51 Siswa demo + produk contoh)
terhapus bersama folder `prototype/`, dan tidak ada pengganti TypeScript.

Kondisi database saat audit: **1 user, 0 kategori, 0 produk, 0 reward, 0 Siswa**.
Aplikasi secara teknis jalan, tapi admin harus mengisi katalog dari nol sebelum
sistem bisa dipakai di sekolah mana pun.

### 6.2 19 PHPUnit test hilang tanpa diporting

`prototype/tests/Feature/` berisi 19 test otomatis:

`AuthFlow` · `BarcodeScan` · `BootstrapAdmin` · `CatalogAndSiswa` ·
`ConsoleCommands` · `CreateSuperAdmin` · `FotoBuktiVerifikasi` ·
`PembelianFlow` · `PhotoUploadService` · `ProductBarcodeAdd` ·
`ProfileAndSecurity` · `RateLimiting` · `ResetPoinFlow` · `RewardFlow` ·
`SeederIdempotency` · `SesiMenggantung` · `SuperAdminFlow` · `SuspendedUser` ·
`Tier3Auth` · `VerifikasiFlow`

Semuanya terhapus. Proyek turun dari **19 test otomatis → 0**. Ini menjelaskan
kenapa BUG-1 (lubang RBAC) lolos selama rewrite: skrip verifikasi yang menggantikannya
memanggil handler langsung, sehingga tidak pernah menguji otorisasi lintas-role.

### 6.3 Kredensial database bocor di riwayat git

11 file `scripts/verify-*.ts` memuat password Neon
(`npg_VASQkM30fKyi@ep-summer-frost-…`) di baris 2, dan file itu **ter-track di
5 commit**, dengan remote `github.com/MyNameHuda/amanah_sampah`.

File sudah dihapus, **tapi password masih di riwayat git**. Wajib di-rotate.

---

## 7. Klasifikasi 34 Kegagalan Run Pertama

Agar tidak ada kebingungan mana bug dan mana artefak test:

| Status | Jumlah | Rincian |
|---|---|---|
| **Bug aplikasi** | 12 | BUG-1 (×3 role), BUG-2 (×6 path), BUG-3 (×2 cron), BUG-4 |
| **Asumsi test salah** | 22 | lihat tabel bawah |

**Asumsi test yang salah (aplikasi-nya justru benar):**

|.Key yang salah | Field yang benar | Sumber |
|---|---|---|
| `GET /siswa/me` → `body.nis` | `body.siswa.nis` | `api/siswa/me.ts` |
| `POST /pembelian` → `body.siswa.current_poin` | sudah benar, tapi `before` salah | — |
| `GET /kategori/check-name?name=` | `?nama=` (frontend sudah benar) | `ProductManagerModal.tsx:182` |
| `PATCH /reward/{id}` hanya harga+stok | butuh `nama_reward` + `status_aktif` juga | `api/reward/[id]/index.ts` |
| `POST /super-admin/users/{id}/suspend` `{suspend:…}` | `{suspended:…}` | `api/super-admin/users/[userId]/suspend.ts` |
| `adjust-poin` `{delta:…}` | `{poin_delta:…}` | `api/super-admin/siswa/[nis]/adjust-poin.ts` |
| `GET /reset/{id}/step1` | `POST` saja | `api/reset/[reset_id]/step1.ts` |
| `POST /reset/{nis}/start` tanpa blokir | butuh Siswa `is_blocked` | `api/reset/[nis]/start.ts` |
| hapus user tanpa riwayat | ditolak, soft delete by design | `api/super-admin/users/[userId]/delete.ts` |
| `reverse` tanpa mode read-only | wajib read-only dulu | `api/super-admin/transactions/[txId]/reverse.ts` |
| presign tanpa `size` | `size` wajib diisi | `api/verifikasi/foto-bukti/presign.ts` |
| 2 alur reset/setiap grup | 1 alur, 1 negative test | — |

> **Catatan:** 2 "selisih saldo" yang muncul di run pertama **tidak dapat
> direproduksi** pada uji terkontrol. Penyebabnya adalah test itu sendiri:
> `recompute-saldo` dijalankan di tengah rangkaian dan skrip cleanup sempat
> menghapus baris `config_settings`. Keduanya sudah diperbaiki dan invarian
> terbukti utuh.

---

## 8. Perbaikan Kode yang Direkomendasikan

| Prioritas | Aksi | File | Status |
|---|---|---|---|
| **P0** | `requireCapability(auth.role, 'kelola_pembelian')` | `api/pembelian/index.ts` | ✅ **selesai (2.0.1)** |
| **P0** | Rotate password role di Neon console | Neon dashboard → Roles | ⬜ **belum** — wajib |
| **P1** | Perbaiki 6 path client | 4 file di `src/client/` | ⬜ belum |
| **P1** | `await pingDatabase()` | `api/status.ts:19` | ⬜ belum |
| **P1** | Bandingkan `CRON_SECRET` di `/api/cron/*` | `api/cron/*.ts` | ⬜ belum |
| **P2** | Terapkan atau hapus 4 capability mati | `src/server/serialize.ts`, `src/server/auth/roles.ts` | ⬜ belum |
| **P2** | Tambah handler `GET` di produk barcode | `api/produk/[barcode]/index.ts` | ⬜ belum |
| **P2** | Tulis `scripts/seed.ts` | baru | ⬜ belum |
| **P2** | Port 19 test ke runner HTTP | baru | ⬜ belum |
| **P3** | Konsistenkan marker `suspended` | `api/auth/login.ts` | ⬜ belum |

---

## 9. Jejak Audit

Semua fixture test sudah dihapus. Audit akhir database:

| Tabel | Rows |
|---|---|
| `users` | 1 (super admin asli, tidak disentuh) |
| `config_settings` | 4 (termasuk `is_readonly` yang sempat terhapus — **sudah dipulihkan**) |
| `siswa`, `produk`, `kategori_produk`, `reward` | 0 |
| `transaksi_pembelian`, `poin_ledger`, `sesi_verifikasi`, `penukaran_reward`, `reset_denda_log` | 0 |
| `audit_logs` | 96 (jejak audit, tidak dihapus — itu justru tujuannya) |
| `personal_access_tokens` | 0 |

> **Catatan jujur:** selama pengujian, skrip cleanup sempat menghapus baris
> `config_settings.is_readonly` (karena `updated_by`-nya menunjuk user test).
> Baris tersebut **sudah dipulihkan** dengan nilai `'false'` sesuai kondisi awal.
> Selain itu, akun super admin asli **tidak pernah disentuh** — passwordnya diubah
> oleh ownersaat first-login (tercatat di `audit_logs` sebagai
> `auth.password_change_first_login`), jadi `.env` memang sudah tidak sinkron.
> Itu perilaku yang benar, bukan bug.
