/**
 * GET /api/cron/archive-audit — dipanggil Vercel Cron.
 *
 * Menggantikan `amanah:archive-audit` yang dulu jalan bulanan lewat
 * supervisor Laravel. Tanpa ini, tabel audit_logs tumbuh tanpa batas
 * dan akhirnya data di Neon habis.
 *
 * Dijadwalkan HARIAN, bukan bulanan. Jadwal aslinya juga begitu
 * (schedule->monthlyOn) dan itu tidak masalah: langkah-langkah di
 * dalam amanah_archive_audit() bersifat idempotent — kalau belum waktunya
 * bulan berganti, semua counters kembali 0 dan tidak ada yang berubah.
 * Menjalankannya setiap hari membuat crash/m downtime tidak menyebabkan
 * satu bulan data menumpuk tanpa proses.
 *
 * Logikanya tetap milik database (fungsi SQL amanah_archive_audit).
 */
import { getSql } from '../../src/server/db/index';
import { handler, type Ctx } from '../../src/server/http';

export default handler(async (_ctx: Ctx) => {
  const q = getSql();
  const started = Date.now();

  try {
    const rows = await q`select * from amanah_archive_audit()`;
    const r = (rows as any[])[0] ?? {};
    return {
      job: 'archive-audit',
      ok: true,
      // (a) ditandai siap arsip, (b) disalin ke audit_logs_archive,
      // (c) arsip lama ditandai purge, (d) dihapus, (e) audit_logs dibersihkan
      marked: Number(r.marked ?? 0),
      copied: Number(r.copied ?? 0),
      purged: Number(r.purged ?? 0),
      deleted: Number(r.deleted ?? 0),
      cleaned: Number(r.cleaned ?? 0),
      elapsed_ms: Date.now() - started,
      at: new Date().toISOString(),
    };
  } catch (e) {
    return {
      job: 'archive-audit',
      ok: false,
      error:
        'Fungsi amanah_archive_audit() belum ada di database. Jalankan drizzle/0001_cron.sql di Neon SQL Editor.',
      detail: e instanceof Error ? e.message : String(e),
      at: new Date().toISOString(),
    };
  }
});
