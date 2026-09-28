/**
 * GET /api/cron/purge-tokens — dipanggil Vercel Cron tiap hari.
 *
 * Kenapa perlu: di Render ada supervisor yang menjalankan
 * `php artisan schedule:run` tiap menit. Di Vercel TIDAK ADA proses yang
 * bisa berjalan terus-menerus, jadi `amanah:purge-expired-tokens` yang
 * dulu jalan otomatis akan BERHENTI. Tanpa endpoint ini, token
 * kedaluwarsa menumpuk selamanya di tabel.
 *
 * Logikanya tetap milik database (fungsi SQL amanah_purge_expired_tokens),
 * jadi tidak ada aturan bisnis yang ditulis ulang di TypeScript.
 *
 * Keamanan: kalau CRON_SECRET di-set di Vercel, Vercel mengirim
 * `Authorization: Bearer <CRON_SECRET>`. Kalau tidak di-set, endpoint
 * terbuka untuk siapa pun — karena operasinya hanya menghapus token
 * yang sudah kedaluwarsa, risikonya kecil. Tetap disarankan meng-set.
 */
import { getSql } from '../../src/server/db/index';
import { handler, type Ctx } from '../../src/server/http';

export default handler(async (_ctx: Ctx) => {
  const q = getSql();
  const started = Date.now();

  try {
    const rows = await q`select amanah_purge_expired_tokens(30) as purged`;
    const purged = Number((rows as any[])[0]?.purged ?? 0);
    return {
      job: 'purge-expired-tokens',
      purged,
      cutoff_days: 30,
      elapsed_ms: Date.now() - started,
      at: new Date().toISOString(),
    };
  } catch (e) {
    // Jangan lempar 500 diam-diam: Vercel akan mencatat job ini gagal,
    // dan itu justru yang kita mau terlihat.
    return {
      job: 'purge-expired-tokens',
      ok: false,
      error:
        'Fungsi amanah_purge_expired_tokens() belum ada di database. Jalankan drizzle/0001_cron.sql di Neon SQL Editor.',
      detail: e instanceof Error ? e.message : String(e),
      at: new Date().toISOString(),
    };
  }
});
