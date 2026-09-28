/**
 * GET /api/santri/me — siswa melihat profil sendiri.
 *
 * PENTIK: file ini HARUS menang atas api/santri/[nis]/index.ts, karena
 * "me" juga cocok dengan placeholder {nis}. Vercel memprioritaskan route
 * statis sebelum dinamis, jadi ini aman. Jangan dihapus.
 */
import { and, eq, count, desc, inArray, sum } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { handler, HttpError, requireAuth, type Ctx } from '../../src/server/http';
import { serializeSantri, serializeLedger } from '../../src/server/http-guards';
import { isSantri } from '../../src/server/auth/roles';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');

  const auth = await requireAuth(ctx);
  if (!isSantri(auth.role)) {
    throw new HttpError(422, 'Hanya Santri.', { field: 'auth' });
  }

  const db = getDb();
  const rows = await db.select().from(schema.santri).where(eq(schema.santri.userId, auth.sub)).limit(1);
  const row = rows[0];
  if (!row) throw new HttpError(404, 'Data santri tidak ditemukan.');

  const [open] = await db
    .select({ n: count() })
    .from(schema.transaksiPembelian)
    .where(and(eq(schema.transaksiPembelian.nis, row.nis), eq(schema.transaksiPembelian.status, 'open')));

  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, auth.sub)).limit(1);

  const ledger = await db
    .select()
    .from(schema.poinLedger)
    .where(eq(schema.poinLedger.nis, row.nis))
    .orderBy(desc(schema.poinLedger.waktu))
    .limit(20);

  return {
    santri: { ...serializeSantri({ ...row, userName: u?.name }), is_suspended: !!u?.suspendedAt },
    open_debts: await openDebts(db, row.nis),
    recent_ledger: ledger.map(serializeLedger),
    prior_open_count: Number(open?.n ?? 0),
    current_penalty_tier: -1,
  };
});

/** Debts yang masih open, digabung per barcode. Bentuk sama dengan Laravel. */
export async function openDebts(db: ReturnType<typeof getDb>, nis: string) {
  const rows = await db
    .select({
      barcode: schema.transaksiPembelian.barcode,
      qty: sum(schema.transaksiPembelian.qty),
    })
    .from(schema.transaksiPembelian)
    .where(and(eq(schema.transaksiPembelian.nis, nis), eq(schema.transaksiPembelian.status, 'open')))
    .groupBy(schema.transaksiPembelian.barcode);

  if (rows.length === 0) return [];

  // Eager-load produk supaya nama tampil, bukan barcode saja
  const barcodes = rows.map((r) => r.barcode);
  const prods = await db
    .select()
    .from(schema.produk)
    .where(inArray(schema.produk.barcode, barcodes));
  const nameByBc = new Map(prods.map((p) => [p.barcode, p.namaProduk]));

  return rows.map((r) => ({
    barcode: r.barcode,
    // fallback ke barcode kalau produknya di-archive / hilang
    nama_produk: nameByBc.get(r.barcode) ?? r.barcode,
    qty: Number(r.qty),
  }));
}

