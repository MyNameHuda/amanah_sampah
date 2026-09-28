/**
 * GET /api/super-admin/santri/{nis}/timeline — T2.2: timeline aktivitas siswa.
 *
 * Gabungan transaksi pembelian dan baris poin_ledger, diurut dari yang
 * terbaru. Dipakai Super Admin ketika ada laporan "poin saya kok
 * berubah sendiri" — di sinilah jejaknya dicari.
 */
import { eq, desc } from 'drizzle-orm';
import { getDb, schema } from '../../../../src/server/db/index';
import { requireSuperAdmin } from '../../../../src/server/http-guards';
import { serializeTransaksi, serializeLedger, iso } from '../../../../src/server/http-guards';
import { handler, HttpError, requireAuth, type Ctx } from '../../../../src/server/http';

const LIMIT = 50;

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);

  const nis = String(ctx.req.query.nis ?? '').trim();
  if (!nis) throw new HttpError(422, 'NIS wajib diisi.', { field: 'nis' });

  const db = getDb();
  const [santri] = await db.select().from(schema.santri).where(eq(schema.santri.nis, nis)).limit(1);
  if (!santri) throw new HttpError(404, 'Siswa tidak ditemukan.', { field: 'nis' });

  const tx = await db
    .select()
    .from(schema.transaksiPembelian)
    .where(eq(schema.transaksiPembelian.nis, nis))
    .orderBy(desc(schema.transaksiPembelian.waktu))
    .limit(LIMIT);

  const poin = await db
    .select()
    .from(schema.poinLedger)
    .where(eq(schema.poinLedger.nis, nis))
    .orderBy(desc(schema.poinLedger.waktu))
    .limit(LIMIT);

  const timeline = [
    ...tx.map((t) => ({
      type: 'pembelian' as const,
      waktu: iso(t.waktu),
      data: serializeTransaksi(t) as Record<string, unknown>,
    })),
    ...poin.map((p) => ({
      type: 'poin_ledger' as const,
      waktu: iso(p.waktu),
      data: serializeLedger(p) as Record<string, unknown>,
    })),
  ]
    .sort((a, b) => {
      const ta = a.waktu ? Date.parse(a.waktu) : 0;
      const tb = b.waktu ? Date.parse(b.waktu) : 0;
      return tb - ta;
    })
    .slice(0, LIMIT);

  return { nis, timeline };
});
