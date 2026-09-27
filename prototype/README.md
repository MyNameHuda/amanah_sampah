# Amanah Sampah — Prototype Backend (Laravel 11)

**Status:** v1.1 prototype, runnable end-to-end
**Companion docs:** `../DECISION-LOG.md` v2.0, `../ERD.md` v1.1, `../PRD.md` v1.1

---

## Apa Ini?

Backend Laravel 11 + Sanctum untuk sistem **Amanah Sampah** — adaptasi non-moneter dari Deposit-Refund System untuk pondok pesantren. Prototype ini **runnable** dengan database SQLite (no Postgres install required).

Stack:
- Laravel 11
- PHP 8.2
- SQLite (dev) / PostgreSQL (production via `.env` switch)
- Sanctum (token-based auth)
- Vite (frontend belum diimplementasi, gunakan API langsung via Postman/curl)

## Quick Start

```bash
cd "C:\Users\bangn\Documents\Kerja\amanah_sampah\prototype"

# (sudah dilakukan) Install dependencies:
composer install

# (sudah dilakukan) Generate app key:
php artisan key:generate

# (sudah dilakukan) Migrate + seed:
php artisan migrate:fresh --force
php artisan db:seed --force

# Start dev server:
php artisan serve --host=127.0.0.1 --port=8000
```

Akses di: `http://127.0.0.1:8000`
- `GET /` → JSON info
- `GET /up` → health check
- `POST /api/auth/login` → login endpoint

## Default Credentials (dari seeder)

| Role | Login | Password |
|---|---|---|
| Admin Kesantrian | `admin@amanah.id` | `admin12345` |
| Staff Kantin | `staff@amanah.id` | `staff12345` |
| Petugas Kesantrian | `petugas@amanah.id` | `petugas12345` |
| Super Admin | `super@amanah.id` | `super12345` |
| Santri (demo) | NIS `23001` | `demo12345` |

> Force-change-password diaktifkan untuk Santri. Staff/Petugas/Admin/Super-admin pakai default password.

## Demo Flow (tested)

```
1. Staff login → POST /api/auth/login {login, password}
   → dapat token

2. Staff transaksi:
   POST /api/pembelian {nis, barcode, qty}
   → system computes penalty_tier (-1 / -2 / -3 capped)
   → creates transaksi_pembelian + poin_ledger
   → updates current_poin + is_blocked

3. Petugas verifikasi:
   POST /api/verifikasi/sesi {nis}    → open sesi
   POST /api/verifikasi/sesi/{id}/items {barcode, qty_in}  → per item
   POST /api/verifikasi/sesi/{id}/commit  → finalize + atomic update

4. Admin reset (kalau siswa blocked):
   POST /api/reset/{nis}/start
   POST /api/reset/{id}/step1
   POST /api/reset/{id}/apply

5. Super admin tools:
   GET  /api/super-admin/health
   GET  /api/super-admin/coverage
   POST /api/super-admin/mode (toggle maintenance/read-only)
   POST /api/super-admin/reverse-transaction/{txId} (Tier 3, butuh read-only + alasan)
```

## Sample Tested Scenarios

### Scenario 1: Siswa Rajin
```
Beli Chitato 5  → poin -5 (no outstanding, penalty -1)
Setor Chitato 5 → poin +10 (5 × 2) = +5
Beli Aqua 3     → poin -3 (Ses 1 fully settled, no outstanding) = +2
Setor Aqua 3    → poin +6 = +8
```

### Scenario 2: Carry-over Penalty (tested ✓)
```
Beli Chitato 3   → prior_open=0, penalty_per_unit=-1, poin=-3
Beli Aqua 2      → prior_open=1, penalty_per_unit=-2, poin=-7
Beli Snack 2     → prior_open=2, penalty_per_unit=-3, poin=-13
```

### Scenario 3: Verifikasi Commit (tested ✓)
```
Sesi 1 items:
  - Chitato 3/3 → matched=3, poin_delta=+6
  - Aqua 1/2    → matched=1, shortfall=1, poin_delta=+2

Commit: total_poin_change = +8
  Before: -7
  After: -7 + 8 = +1  ✓
```

## File Structure

```
prototype/
├── app/
│   ├── Console/Commands/ArchiveAuditLogs.php   # php artisan amanah:archive-audit
│   ├── Http/
│   │   ├── Controllers/Api/
│   │   │   ├── AuthController.php
│   │   │   ├── CatalogController.php
│   │   │   ├── PembelianController.php
│   │   │   ├── ResetController.php
│   │   │   ├── RewardController.php
│   │   │   ├── SantriController.php
│   │   │   ├── SuperAdminController.php
│   │   │   └── VerifikasiController.php
│   │   └── Middleware/RoleMiddleware.php
│   └── Models/
│       ├── AuditLog.php
│       ├── ConfigSetting.php
│       ├── KategoriProduk.php
│       ├── PenukaranReward.php
│       ├── PoinLedger.php
│       ├── Produk.php
│       ├── ResetDendaLog.php
│       ├── Reward.php
│       ├── Santri.php
│       ├── SesiVerifikasi.php
│       ├── SesiVerifikasiItem.php
│       ├── TransaksiPembelian.php
│       └── User.php
├── database/
│   ├── migrations/                 # 13 + Sanctum + skip = 15 files
│   └── seeders/DatabaseSeeder.php  # 4 staff + 50 siswa + 9 produk + 5 reward
├── routes/
│   ├── api.php
│   ├── web.php
│   └── console.php
└── bootstrap/app.php
```

## Database Schema

Lihat `../ERD.md` untuk dokumentasi lengkap. 13 tables + index:

- `users`, `santri`
- `kategori_produk`, `produk`
- `reward`, `penukaran_reward`
- `transaksi_pembelian`
- `sesi_verifikasi`, `sesi_verifikasi_items`
- `poin_ledger`
- `reset_denda_log`
- `config_settings`
- `audit_logs`, `audit_logs_archive`

## Poin Scheme (v2)

Lihat `../DECISION-LOG.md` §D untuk business rules lengkap.

| Action | Poin Change |
|---|---|
| Starting poin | 0 |
| Beli plastik, no outstanding | −1 per unit |
| Beli plastik, 1 outstanding | −2 per unit |
| Beli plastik, 2+ outstanding | −3 per unit (capped) |
| Match setor | +2 per unit |
| Excess | netral |
| Shortfall at setor | no penalty (sudah dipotong saat beli) |
| Reset target | 0 |
| Block threshold | ≤ −50 |

## Super Admin Tools (v1.1)

Tier 1 (operational): system health, force logout, password reset, suspend, mode toggle, cron trigger
Tier 2 (investigation): audit search, per-santri timeline, coverage breakdown
Tier 3 (correction): reverse transaction, adjust poin, recompute saldo (perlu alasan min 30 char + read-only mode untuk reverse)

## Switching ke PostgreSQL

Edit `.env`:
```
DB_CONNECTION=pgsql
DB_HOST=your-host
DB_PORT=5432
DB_DATABASE=amanah_sampah
DB_USERNAME=your-user
DB_PASSWORD=your-password
```

Jalankan:
```bash
php artisan migrate:fresh --force
php artisan db:seed --force
```

## Testing

```bash
php artisan test
```

(Belum ada tests tertulis di prototype ini; PRD §14 specifies AC-01 sampai AC-22. Tests akan ditambah di iterasi berikutnya.)

## Known Limitations

- Tidak ada frontend (Blade/React). Gunakan Postman/curl untuk testing.
- Email belum configured (audit log Tier 3 notification tidak send email).
- `cached:clear` mungkin perlu setelah ubah config_settings.
- `bcrypt rounds=12` di dev = password hashing lambat (~50ms).

## Next Steps

Lihat todo list di session ini. Langkah selanjutnya yang tersedia:
1. **React/TS frontend** scaffold (UI shells per role)
2. **Update Laporan-AmanahSampah.docx** dengan final decisions
3. **Seed data + UAT scenario** refinement (extended demo flow)
4. **PHPUnit tests** untuk business logic (point calculation matrix)
5. **Deployment guide** untuk production (Postgres, Vercel VPS, etc.)
