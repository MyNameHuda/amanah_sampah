/**
 * GET /api/santri/{nis}/pembelian — riwayat pembelian untuk satu siswa.
 *
 * Role: admin/super_admin (NIS mana pun), staff_kantin, petugas,
 * dan santri HANYA untuk NIS sendiri.
 */
import { eq, desc, inArray } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { handler, HttpError, requireAuth, type Ctx } from '../../../src/server/http';
import { serializeTransaksi, serializeProduk } from '../../../src/server/http-guards';
import { isSantri } from '../../../src/server/auth/roles';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');

  const auth = await requireAuth(ctx);
  const nis = String(ctx.req.query.nis ?? '').trim();
  if (!nis) throw new HttpError(422, 'NIS wajib diisi.', { field: 'nis' });

  const db = getDb();

  if (isSantri(auth.role)) {
    const own = await db
      .select()
      .from(schema.santri)
      .where(eq(schema.santri.userId, auth.sub))
      .limit(1);
    if (!own[0] || own[0].nis !== nis) {
      throw new HttpError(422, 'Santri hanya boleh akses data sendiri.', { field: 'auth' });
    }
  }

  const rows = await db
    .select()
    .from(schema.transaksiPembelian)
    .where(eq(schema.transaksiPembelian.nis, nis))
    .orderBy(desc(schema.transaksiPembelian.waktu))
    .limit(50);

  // with('produk') — nama produk ikut supaya frontend tak perlu fetch terpisah
  const out = rows.map((t: Record<string, any>) => ({ ...serializeTransaksi(t) })) as Record<string, unknown>[];
  if (rows.length > 0) {
    const barcodes = [...new Set(rows.map((t: Record<string, any>) => t.barcode as string))] as string[];
    const prods = await db
      .select()
      .from(schema.produk)
      .where(inArray(schema.produk.barcode, barcodes));
    const byBc = new Map(prods.map((p: Record<string, any>) => [p.barcode, p]));
    for (const item of out) {
      const p = byBc.get(item.barcode as string);
      item.produk = p ? serializeProduk(p) : null;
    }
  }

  return { data: out };
});
