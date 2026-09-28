/**
 * GET /api/produk/check-barcode/{barcode} — cek duplikat real-time untuk
 * form Tambah Produk. Lebih informatif daripada 422 generik.
 *
 * 200: { available: true,  barcode }
 * 409: { available: false, barcode, existing }
 * 422: format tidak valid
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { handler, JsonResult, requireAuth, type Ctx } from '../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET') return new JsonResult(405, { error: 'method_not_allowed' });
  await requireAuth(ctx);

  const barcode = String(ctx.req.query.barcode ?? '').trim();
  if (barcode === '' || barcode.length > 50) {
    return new JsonResult(422, {
      available: false,
      barcode,
      reason: 'invalid_format',
      message: 'Barcode kosong atau terlalu panjang (max 50 char).',
    });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.produk)
    .where(eq(schema.produk.barcode, barcode))
    .limit(1);
  const existing = rows[0];

  if (existing) {
    const cat = await db
      .select()
      .from(schema.kategoriProduk)
      .where(eq(schema.kategoriProduk.id, existing.idKategori))
      .limit(1);
    return new JsonResult(409, {
      available: false,
      barcode,
      reason: 'duplicate',
      message: `Barcode '${barcode}' sudah dipakai oleh '${existing.namaProduk}'.`,
      existing: {
        barcode: existing.barcode,
        nama_produk: existing.namaProduk,
        kategori: cat[0]?.namaKategori ?? null,
        archived: existing.archivedAt !== null,
      },
    });
  }

  return {
    available: true,
    barcode,
    message: 'Barcode tersedia untuk produk baru.',
  };
});
