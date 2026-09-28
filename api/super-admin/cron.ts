/**
 * GET  /api/super-admin/cron — status pekerjaan perawatan.
 * POST /api/super-admin/cron — jalankan manual sekarang.
 *
 * Latar belakang: di Render ada supervisor yang menjalankan
 * `php artisan schedule:run` tiap menit, jadi amanah:archive-audit dan
 * amanah:purge-expired-tokens jalan otomatis. Di Vercel tidak ada proses
 * yang bisa berjalan terus-menerus, jadi keduanya TIDAK AKAN JALAN
 * sendiri kecuali dijadwalkan lewat Vercel Cron (vercel.json -> crons).
 *
 * Endpoint ini menjawab dua pertanyaan yang paling sering jadi bahan
 * pertanyaan "kok audit log-nya numpuk?":
 *   1. apakah jadwalnya benar-benar terpasang di Vercel?
 *   2. berapa banyak yang sudah dibersihkan?
 *
 * Fungsi logikanya tetap di database (drizzle/0001_cron.sql) supaya
 * aturan bisnis tidak ditulis ulang di dua tempat.
 */
import { getSql, getDb, schema } from '../../src/server/db/index';
import { count, isNotNull, lt } from 'drizzle-orm';
import { requireSuperAdmin } from '../../src/server/http-guards';
import { handler, HttpError, requireAuth, type Ctx } from '../../src/server/http';

export default handler(async (ctx: Ctx) => {
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const q = getSql();
  const db = getDb();

  // Fungsi-fungsi ini dibuat oleh drizzle/0001_cron.sql. Kalau belum ada,
  // scheduler Vercel Cron akan memanggil endpoint dan menerima pesan
  // error yang jelas — bukan diam-diam gagal.
  let functionsReady = false;
  let missingDetail = '';
  try {
    const fn = await q`
      select proname from pg_proc
      where proname in ('amanah_purge_expired_tokens', 'amanah_archive_audit')
    `;
    functionsReady = (fn as any[]).length === 2;
  } catch (e) {
    missingDetail = e instanceof Error ? e.message : String(e);
  }

  // Ukuran tabel — supaya super admin bisa melihat efek cron dari jauh.
  const auditRows = await db.select({ n: count() }).from(schema.auditLogs);
  const archiveRows = await db.select({ n: count() }).from(schema.auditLogsArchive);
  const tokenRows = await db
    .select({ n: count() })
    .from(schema.personalAccessTokens)
    .where(isNotNull(schema.personalAccessTokens.expiresAt));
  const expiredRows = await db
    .select({ n: count() })
    .from(schema.personalAccessTokens)
    .where(lt(schema.personalAccessTokens.expiresAt, new Date()));

  const tables = {
    audit_logs: Number(auditRows[0]?.n ?? 0),
    audit_logs_archive: Number(archiveRows[0]?.n ?? 0),
    tokens_total: Number(tokenRows[0]?.n ?? 0),
    tokens_expired: Number(expiredRows[0]?.n ?? 0),
  };

  const schedule = {
    mechanism: 'Vercel Cron (didefinisikan di vercel.json -> crons)',
    jobs: [
      { path: '/api/cron/purge-tokens', schedule: '17 3 * * *', note: 'harian 03:17 UTC' },
      { path: '/api/cron/archive-audit', schedule: '43 4 * * *', note: 'harian 04:43 UTC' },
    ],
    note: 'Jadwal di atas dibaca dari vercel.json. Status eksekusi aktual ada di Vercel Dashboard → project → Cron Jobs.',
    cron_secret_set: !!process.env.CRON_SECRET,
  };

  const health = {
    functions_ready: functionsReady,
    detail: functionsReady
      ? 'Fungsi SQL tersedia.'
      : 'Fungsi SQL belum ada. Jalankan drizzle/0001_cron.sql di Neon SQL Editor, lalu panggil endpoint ini lagi.',
    ...(missingDetail ? { error: missingDetail } : {}),
  };

  if (ctx.req.method === 'GET') {
    return { installed: functionsReady, health, schedule, tables };
  }

  if (ctx.req.method === 'POST') {
    const body = (ctx.req.body ?? {}) as Record<string, unknown>;
    const job = typeof body.job === 'string' ? body.job : 'all';
    const results: Record<string, unknown> = {};

    if (job === 'purge-tokens' || job === 'all') {
      try {
        const rows = await q`select amanah_purge_expired_tokens(30) as purged`;
        results.purge_tokens = { ok: true, purged: Number((rows as any[])[0]?.purged ?? 0) };
      } catch (e) {
        results.purge_tokens = {
          ok: false,
          error: 'Jalankan drizzle/0001_cron.sql di Neon SQL Editor dulu.',
          detail: e instanceof Error ? e.message : String(e),
        };
      }
    }

    if (job === 'archive-audit' || job === 'all') {
      try {
        const rows = await q`select * from amanah_archive_audit()`;
        const r = (rows as any[])[0] ?? {};
        results.archive_audit = {
          ok: true,
          marked: Number(r.marked ?? 0),
          copied: Number(r.copied ?? 0),
          purged: Number(r.purged ?? 0),
          deleted: Number(r.deleted ?? 0),
          cleaned: Number(r.cleaned ?? 0),
        };
      } catch (e) {
        results.archive_audit = {
          ok: false,
          error: 'Jalankan drizzle/0001_cron.sql di Neon SQL Editor dulu.',
          detail: e instanceof Error ? e.message : String(e),
        };
      }
    }

    return { ran: job, at: new Date().toISOString(), results, tables };
  }

  throw new HttpError(405, 'Method not allowed.');
});
