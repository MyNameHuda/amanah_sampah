/**
 * GET /api/produk/scan/{barcode} — lookup cepat untuk scanner kamera.
 *
 * Dioptimalkan untuk scanning real-time: 1 query, payload minimal,
 * mengembalikan status archived supaya UI bisa tampilkan peringatan.
 *
 * 200: { found: true,  produk: {...} }
 * 404: { found: false, barcode: "..." }
 *
 * PENTING: file ini harus menang atas /api/produk/{barcode} agar
 * "scan" tidak tertangkap sebagai barcode bernama "scan". Vercel
 * memprioritaskan route statis sebelum dinamis.
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { recordAudit } from '../../../src/server/audit';
import { iso } from '../../../src/server/http-guards';
import { handler, JsonResult, requireAuth, type Ctx } from '../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET') return new JsonResult(405, { error: 'method_not_allowed' });
  const auth = await requireAuth(ctx);

  const barcode = String(ctx.req.query.barcode ?? '').trim();
  if (barcode === '' || barcode.length > 50) {
    return new JsonResult(422, {
      barcode: [ 'Barcode kosong atau terlalu panjang.' ],
      message: 'Barcode kosong atau terlalu panjang.',
    });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.produk)
    .where(eq(schema.produk.barcode, barcode))
    .limit(1);
  const produk = rows[0];

  if (!produk) {
    // Audit: user scan produk yang tidak ada di katalog
    await recordAudit('produk.scan_not_found', { barcode }, {
      userId: auth.sub, role: auth.role, ip: ctx.ip, userAgent: ctx.userAgent,
    });
    return new JsonResult(404, {
      found: false,
      barcode,
      message: 'Produk tidak ditemukan di katalog.',
    });
  }

  const cat = await db
    .select()
    .from(schema.kategoriProduk)
    .where(eq(schema.kategoriProduk.id, produk.idKategori))
    .limit(1);

  // Audit: scan sukses (berguna untuk analitik — produk mana yang paling sering di-scan)
  await recordAudit(
    'produk.scan_hit',
    { barcode, produk_id: barcode, archived: produk.archivedAt !== null },
    { userId: auth.sub, role: auth.role, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    found: true,
    produk: {
      barcode: produk.barcode,
      nama_produk: produk.namaProduk,
      kategori: cat[0]?.namaKategori ?? null,
      is_excluded_from_debit: produk.isExcludedFromDebit,
      archived_at: iso(produk.archivedAt),
      is_active: produk.archivedAt === null,
    },
  };
});
