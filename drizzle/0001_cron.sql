-- =============================================================================
-- Fungsi cron untuk dua pekerjaan perawatan.
--
-- CATATAN PENTING: VERSI INI TIDAK MEMAKAI pg_cron.
-- Versi pertama mencoba pg_cron (cron bawaan PostgreSQL), tapi di Neon
-- tidak bisa dipasang:
--     ERROR: can only create extension in database postgres
-- Neon hanya mengizinkan pembuatan extension di database bernama
-- `postgres`, sedangkan project ini memakai `neondb`.
--
-- Jadi penjadwalan dipindah ke Vercel Cron (lihat ../vercel.json -> crons),
-- yang memanggil dua endpoint di /api/cron/*. Fungsi SQL di bawah ini
-- tetap dipakai sebagai implementasi logikanya — endpoint cukup memanggil
-- `select amanah_*()`, jadi tidak ada logika bisnis yang ditulis ulang
-- dalam TypeScript.
--
-- CARA PAKAI: jalankan file ini satu kali di Neon SQL Editor.
-- Aman dijalankan berulang (CREATE OR REPLACE).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Purge token kedaluwarsa
--
-- Port dari amanah:purge-expired-tokens --days=30.
-- Syaratnya PERSIS sama: hapus kalau expires_at ATAU last_used_at sudah
-- lebih lama dari cutoff. Jangan diubah jadi hanya expires_at — token yang
-- masih valid tapi tidak dipakai 30 hari juga perlu dibersihkan.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION amanah_purge_expired_tokens(p_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_cutoff timestamptz := now() - make_interval(days => p_days);
  v_count   integer;
BEGIN
  DELETE FROM personal_access_tokens
  WHERE expires_at  < v_cutoff
     OR last_used_at < v_cutoff;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Arsipkan audit log
--
-- Port dari amanah:archive-audit, 5 langkah dan URUTANNYA PENTING:
--   a. tandai log lama siap diarsip
--   b. salin ke audit_logs_archive (idempotent lewat ON CONFLICT)
--   c. tandai arsip yang sudah tua untuk dihapus
--   d. hapus baris arsip yang ditandai
--   e. bersihkan audit_logs yang sudah disalin
--
-- Kalau (d) dijalankan sebelum (b), data hilang permanen. Jangan diubah.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION amanah_archive_audit()
RETURNS TABLE (marked integer, copied integer, purged integer, deleted integer, cleaned integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_month  timestamptz := date_trunc('month', now());
  v_prev   timestamptz := (date_trunc('month', now()) - interval '1 month');
  v_marked integer;
  v_copied integer;
  v_purged integer;
  v_deleted integer;
  v_cleaned integer;
BEGIN
  -- (a) tandai log sebelum awal bulan ini
  UPDATE audit_logs
  SET archive_at = v_month
  WHERE waktu < v_month AND archive_at IS NULL;
  GET DIAGNOSTICS v_marked = ROW_COUNT;

  -- (b) salin ke arsip. original_log_id punya UNIQUE constraint, jadi
  --     DO NOTHING membuat langkah ini aman dijalankan berulang.
  INSERT INTO audit_logs_archive (
    original_log_id, user_id, role, action, resource_type, resource_id,
    payload, admin_alasan, ip_address, user_agent,
    waktu, archive_at, archived_to_table_at
  )
  SELECT
    id, user_id, role, action, resource_type, resource_id,
    payload, admin_alasan, ip_address, user_agent,
    waktu, archive_at, now()
  FROM audit_logs
  WHERE archive_at = v_month
  ON CONFLICT (original_log_id) DO NOTHING;
  GET DIAGNOSTICS v_copied = ROW_COUNT;

  -- (c) tandai arsip yang lebih tua dari bulan sebelumnya untuk dihapus
  UPDATE audit_logs_archive
  SET purged_at = now()
  WHERE waktu < v_prev AND purged_at IS NULL;
  GET DIAGNOSTICS v_purged = ROW_COUNT;

  -- (d) hapus arsip yang ditandai
  DELETE FROM audit_logs_archive WHERE purged_at IS NOT NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- (e) bersihkan audit_logs yang sudah disalin ke arsip
  DELETE FROM audit_logs
  WHERE archive_at IS NOT NULL AND waktu < v_month;
  GET DIAGNOSTICS v_cleaned = ROW_COUNT;

  RETURN QUERY SELECT v_marked, v_copied, v_purged, v_deleted, v_cleaned;
END;
$$;

-- Uji manual kapan saja (aman, idempotent):
--   SELECT amanah_purge_expired_tokens(30);
--   SELECT * FROM amanah_archive_audit();
