/**
 * GET /api/siswa/{nis} — detail satu siswa.
 *
 * Role: admin/super_admin (NIS mana pun), staff_kantin, petugas,
 * dan siswa HANYA untuk NIS sendiri (ownership check).
 */
import { and, eq, count, desc, inArray, sum } from 'drizzle-orm';
import { getDb, schema } from '../../../db/index.ts';
import { handler, HttpError, requireAuth, type Ctx } from '../../../http.ts';
import { serializeSiswa, serializeLedger } from '../../../http-guards.ts';
import { isSiswa } from '../../../auth/roles.ts';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');

  const auth = await requireAuth(ctx);
  const nis = String(ctx.req.query.nis ?? '').trim();
  if (!nis) throw new HttpError(422, 'NIS wajib diisi.', { field: 'nis' });

  const db = getDb();

  if (isSiswa(auth.role)) {
    const own = await db
      .select()
      .from(schema.siswa)
      .where(eq(schema.siswa.userId, auth.sub))
      .limit(1);
    if (!own[0] || own[0].nis !== nis) {
      throw new HttpError(422, 'Siswa hanya boleh akses data sendiri.', { field: 'auth' });
    }
  }

  const rows = await db.select().from(schema.siswa).where(eq(schema.siswa.nis, nis)).limit(1);
  const row = rows[0];
  if (!row) throw new HttpError(404, 'Siswa tidak ditemukan.');

  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, row.userId)).limit(1);
  const [open] = await db
    .select({ n: count() })
    .from(schema.transaksiPembelian)
    .where(and(eq(schema.transaksiPembelian.nis, nis), eq(schema.transaksiPembelian.status, 'open')));

  const openDebts = await debtsOf(db, nis);
  const ledger = await db
    .select()
    .from(schema.poinLedger)
    .where(eq(schema.poinLedger.nis, nis))
    .orderBy(desc(schema.poinLedger.waktu))
    .limit(20);

  return {
    siswa: serializeSiswa({ ...row, userName: u?.name }),
    open_debts: openDebts,
    recent_ledger: ledger.map(serializeLedger),
    prior_open_count: Number(open?.n ?? 0),
    current_penalty_tier: -1,
    // Staff & petugas perlu tahu ini SEBELUM scan, biar gagal cepat dan jelas
    // (asli: Siswa::isAccountSuspended())
    is_suspended: !!u?.suspendedAt,
  };
});

/** Debts open digabung per barcode, dengan nama produk. */
export async function debtsOf(db: ReturnType<typeof getDb>, nis: string) {
  const rows = await db
    .select({
      barcode: schema.transaksiPembelian.barcode,
      qty: sum(schema.transaksiPembelian.qty),
    })
    .from(schema.transaksiPembelian)
    .where(and(eq(schema.transaksiPembelian.nis, nis), eq(schema.transaksiPembelian.status, 'open')))
    .groupBy(schema.transaksiPembelian.barcode);
  if (rows.length === 0) return [];

  const prods = await db
    .select()
    .from(schema.produk)
    .where(inArray(schema.produk.barcode, rows.map((r) => r.barcode)));
  const byBc = new Map(prods.map((p) => [p.barcode, p.namaProduk]));

  return rows.map((r) => ({
    barcode: r.barcode,
    nama_produk: byBc.get(r.barcode) ?? r.barcode,
    qty: Number(r.qty),
  }));
}

