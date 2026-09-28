/**
 * POST /api/super-admin/recompute-saldo — T3.3: hitung ulang saldo dari ledger.
 *
 * Hanya `current_poin` yang berubah. `poin_ledger` TIDAK pernah diubah
 * — ledger adalah sumber kebenaran, dan kalau ledger salah, yang harus
 * diperbaiki adalah ledger, bukan hasil hitungannya.
 *
 * Berguna setelah ada koreksi manual yang membuat current_poin melenceng
 * dari penjumlahan delta. `?nis=` membatasi ke satu siswa; tanpa itu
 * semua siswa diproses.
 */
import { eq, sum, inArray } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { recordAudit } from '../../src/server/audit';
import { getNegativeLimit } from '../../src/server/config';
import { requireSuperAdmin } from '../../src/server/http-guards';
import { handler, HttpError, readBody, requireString, requireAuth, type Ctx } from '../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST' && ctx.req.method !== 'PATCH') {
    throw new HttpError(405, 'Method not allowed.');
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);

  const body = readBody(ctx);
  const alasan = requireString(body, 'alasan', { min: 30, max: 500 });
  // Nis boleh dikirim di body (seperti Laravel) ATAU di query (?nis=) —
  // frontend bisa pilih mana saja.
  const nisBody = typeof body.nis === 'string' ? body.nis.trim() : '';
  const nisQuery = typeof ctx.req.query.nis === 'string' ? ctx.req.query.nis.trim() : '';
  const nisFilter = nisBody !== '' ? nisBody : (nisQuery !== '' ? nisQuery : null);

  const db = getDb();
  const now = new Date();
  const limit = await getNegativeLimit();

  const rows = nisFilter
    ? await db.select().from(schema.santri).where(eq(schema.santri.nis, nisFilter)).limit(1)
    : await db.select().from(schema.santri).limit(2000);

  if (nisFilter && rows.length === 0) {
    throw new HttpError(404, `Siswa dengan NIS '${nisFilter}' tidak ditemukan.`, { field: 'nis' });
  }

  const nisList = rows.map((r) => r.nis);
  const totals = nisList.length
    ? await db
        .select({ nis: schema.poinLedger.nis, total: sum(schema.poinLedger.poinDelta) })
        .from(schema.poinLedger)
        .where(inArray(schema.poinLedger.nis, nisList))
        .groupBy(schema.poinLedger.nis)
    : [];
  const totalByNis = new Map(totals.map((t) => [t.nis, Number(t.total) as number]));

  const changed: { nis: string; before: number; after: number }[] = [];
  const untouched: { nis: string; current: number }[] = [];

  for (const row of rows) {
    // Siswa tanpa baris ledger = saldo 0 (belum pernah ada transaksi)
    const total = totalByNis.get(row.nis) ?? 0;
    if (total === row.currentPoin) {
      untouched.push({ nis: row.nis, current: row.currentPoin });
      continue;
    }
    changed.push({ nis: row.nis, before: row.currentPoin, after: total });
    await db
      .update(schema.santri)
      .set({
        currentPoin: total,
        isBlocked: total <= limit,
        ...(total <= limit ? {} : { blockReason: null, blockAt: null }),
        updatedAt: now,
      })
      .where(eq(schema.santri.nis, row.nis));
  }

  await recordAudit(
    'superadmin.recompute_saldo',
    { nis_filter: nisFilter ?? 'ALL', count: rows.length, changed: changed.length },
    { userId: auth.sub, role: auth.role, adminAlasan: alasan, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    message: `${rows.length} siswa saldo di-recompute. ${changed.length} berubah, ${untouched.length} sudah cocok.`,
    count: rows.length,
    changed_count: changed.length,
    unchanged_count: untouched.length,
    changed,
  };
});
