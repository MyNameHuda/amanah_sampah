-- ============================================================================
--  MIGRASI: "Santri" -> "Siswa"  (TABEL, INDEX, DAN ROLE DI DATABASE)
--  Status : BELUM DIJALANKAN. File ini hanya referensi/manual.
--
--  KENAPA ADA: rename 13-10-2026 sengaja hanya menyentuh KODE. Semua nilai
--  yang disimpan di database dibiarkan apa adanya supaya aplikasi tetap jalan
--  dan tidak ada risiko kehilangan data. File ini berisi langkah berikutnya
--  kalau someday kamu mau menormalkan sisi database juga.
--
--  ⚠️  JANGAN jalankan file ini sendirian. Lihat "LANGKAH 3" di bawah —
--      kodenya masih membaca nilai LAMA ('santri'). Migrasi DB tanpa
--      langkah 3 akan membuat SEMUA akun siswa tidak bisa login.
--
--  Eksekusi   : psql "$DATABASE_URL" -f docs/migrasi-santri-siswa.sql
--  Setelah itu: HAPUS file ini, atau pindahkan isinya ke drizzle/ sebagai
--               migrasi resmi kalau sudah benar-benar dijalankan.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- LANGKAH 1 — Nama tabel
-- ---------------------------------------------------------------------------
-- Eksport TS sudah bernama `siswa`, tapi string nama tabelnya sengaja
-- dibiarkan 'santri' (lihat src/server/db/schema.ts).
--
-- Foreign key dari penukaran_reward / transaksi_pembelian / sesi_verifikasi /
-- poin_ledger / reset_denda_log mengikuti otomatis karena FK menyimpan OID
-- tabel, bukan namanya. Tidak perlu disentuh satu per satu.
ALTER TABLE "santri" RENAME TO "siswa";

-- Nama index juga diubah supaya tidak ada yang tersisa berawalan "santri_".
ALTER INDEX "santri_nis_is_blocked_index"  RENAME TO "siswa_nis_is_blocked_index";
ALTER INDEX "santri_archived_at_index"    RENAME TO "siswa_archived_at_index";

-- ---------------------------------------------------------------------------
-- LANGKAH 2 — Nilai enum role
-- ---------------------------------------------------------------------------
-- ALTER TYPE ... RENAME VALUE mempertahankan OID label lama, jadi seluruh baris
-- users yang sudah punya role 'santri' otomatis terbaca 'siswa'. Tidak ada data
-- yang hilang dan tidak perlu UPDATE thousands-row.
ALTER TYPE "role" RENAME VALUE 'santri' TO 'siswa';

-- ---------------------------------------------------------------------------
-- LANGKAH 3 — Kode WAJIB diubah bersamaan (manual, sudah dilakukan separuh)
-- ---------------------------------------------------------------------------
-- Kode saat ini masih membaca nilai LAMA. Semua nilai berikut harus
-- dibalik dari 'santri' -> 'siswa' supaya cocok dengan database:
--
--   src/server/db/schema.ts
--     - pgTable('santri')        -> pgTable('siswa')
--     - roleEnum: 'santri'       -> 'siswa'
--     - index('santri_...') x2   -> 'siswa_...'
--
--   src/server/auth/roles.ts
--     - ROLES[0]                 'santri' -> 'siswa'
--     - ROLE_LABELS key          'santri' -> 'siswa'  (label tetap "Siswa")
--     - isSiswa(): role ===     'santri' -> 'siswa'
--
--   src/client/api/client.ts            union Role: 'santri' -> 'siswa'
--   src/client/App.tsx                  allowedRoles={['santri']} -> ['siswa']
--   src/client/auth/redirectForRole.ts  case 'santri': -> case 'siswa':
--   src/client/utils/role.ts            3 key: 'santri' -> 'siswa'
--   src/client/utils/auditAction.ts     key 'santri.create' -> 'siswa.create'
--   src/client/pages/MustChangePasswordPage.tsx  fallback 'santri' -> 'siswa'
--   src/client/pages/SuperAdminUsers.tsx         7 nilai role 'santri' -> 'siswa'
--   src/server/routes/me/profile.ts               type: 'santri' -> 'siswa'
--   src/server/routes/produk/[barcode]/log.ts     actor_role
--   src/server/routes/siswa/index.ts              role / recordAudit / resourceType
--   src/server/routes/super-admin/siswa/[nis]/adjust-poin.ts   resourceType
--   src/server/routes/super-admin/users/index.ts  2x roleRaw
--
-- Setelah langkah 1-3: npm run gen:routes && npm run typecheck &&
--                      npm run typecheck:server && npm run build

-- ---------------------------------------------------------------------------
-- LANGKAH 4 — Data historis di audit log (OPSIONAL)
-- ---------------------------------------------------------------------------
-- Kalau kamu mau baris audit lama ikut ternormalisasi. Lewati bagian ini kalau
-- riwayat yang ada lebih baik dibiarkan apa adanya sebagai jejak audit.
--
-- UPDATE audit_logs
--    SET role = 'siswa' WHERE role = 'santri';
--
-- UPDATE audit_logs_archive
--    SET role = 'siswa' WHERE role = 'santri';
--
-- UPDATE audit_logs
--    SET resource_type = 'siswa' WHERE resource_type = 'santri';
--
-- UPDATE audit_logs_archive
--    SET resource_type = 'siswa' WHERE resource_type = 'santri';
--
-- UPDATE audit_logs
--    SET action = 'siswa.create' WHERE action = 'santri.create';
--
-- UPDATE audit_logs_archive
--    SET action = 'siswa.create' WHERE action = 'santri.create';

COMMIT;

-- ============================================================================
--  VERIFIKASI (jalankan setelah COMMIT)
-- ============================================================================
--  SELECT count(*) FROM "siswa";
--  SELECT role, count(*) FROM users GROUP BY role ORDER BY role;
--  SELECT unnest(enum_range(NULL::role));
--  \d "siswa"
--
--  Harapkan: tabel "siswa" ada, role enum memuat 'siswa', dan angka pada
--  count users TIDAK berubah.
-- ============================================================================

-- ============================================================================
--  ROLLBACK (kalau perlu, sebelum ada data baru masuk)
-- ============================================================================
--  BEGIN;
--  ALTER TYPE "role" RENAME VALUE 'siswa' TO 'santri';
--  ALTER INDEX "siswa_nis_is_blocked_index"  RENAME TO "santri_nis_is_blocked_index";
--  ALTER INDEX "siswa_archived_at_index"    RENAME TO "santri_archived_at_index";
--  ALTER TABLE "siswa" RENAME TO "santri";
--  COMMIT;
--  (lalu kembalikan kode ke nilai 'santri' seperti semula)
-- ============================================================================