/**
 * POST /api/verifikasi/sesi/{id}/items — tambah item ke sesi.
 *
 * Foto bukti TIDAK lewat body request. Limit payload Vercel hanya 4,5 MB,
 * sedangkan foto di lapangan bisa 5 MB — kalau dipaksakan lewat sini, yang
 * gagal adalah request-nya dan petugas kehilangan catatannya. Jadi flow-nya:
 *   1. client ambil URL presigned dari /api/verifikasi/foto-bukti/presign
 *   2. client PUT file langsung ke Supabase (tidak lewat Vercel)
 *   3. client kirim `foto_bukti_path` hasil langkah 2 ke endpoint ini
 *
 * Aturan hitung (dari aslinya):
 *   qty_open_at_time = total utang produk ini saat item dicatat
 *   qty_matched      = min(qty_in, qty_open)
 *   qty_excess       = sisa yang tidak punya utang
 *   qty_shortfall    = utang yang tidak tertutup
 *   poin_delta       = qty_matched x 2   (v1.1; dulu matched - shortfall)
 */
import { and, eq, sum } from 'drizzle-orm';
import { getDb, schema } from '../../../../src/server/db/index';
import { requireCapability } from '../../../../src/server/http-guards';
import {
  assertSantriNotSuspended, presentItem, productNameMap,
} from '../../../../src/server/verifikasi';
import {
  handler, HttpError, Created, readBody, requireString, optionalString, requireAuth, type Ctx,
} from '../../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  const auth = await requireAuth(ctx);
  requireCapability(auth.role, 'input_verifikasi');

  const id = Number(ctx.req.query.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, 'id sesi tidak valid.', { field: 'id' });
  }

  const body = readBody(ctx);
  const barcode = requireString(body, 'barcode', { max: 50 });
  const qtyIn = Number(body.qty_in);
  if (!Number.isInteger(qtyIn) || qtyIn < 0) {
    throw new HttpError(422, 'qty_in harus integer >= 0.', { field: 'qty_in' });
  }
  // Catatan petugas untuk kasus barcode rusak. Dulu ada di schema tapi
  // TIDAK pernah dibaca controller, jadi nilai yang dikirim frontend dibuang diam-diam.
  const catatan = optionalString(body, 'catatan') ?? null;
  if (catatan && catatan.length > 500) {
    throw new HttpError(422, 'catatan maksimal 500 karakter.', { field: 'catatan' });
  }
  // Path relatif di bucket, hasil upload presigned.
  const fotoPath = optionalString(body, 'foto_bukti_path') ?? null;
  if (fotoPath && (fotoPath.length > 500 || fotoPath.includes('..'))) {
    throw new HttpError(422, 'foto_bukti_path tidak valid.', { field: 'foto_bukti_path' });
  }

  const db = getDb();
  const [sesi] = await db
    .select()
    .from(schema.sesiVerifikasi)
    .where(eq(schema.sesiVerifikasi.id, id))
    .limit(1);
  if (!sesi) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan.', { field: 'id' });
  if (sesi.waktuSelesai) {
    throw new HttpError(422, 'Sesi sudah selesai.', { field: 'sesi' });
  }

  // Sesi bisa saja sudah dibuka sebelum akun siswa di-suspend. Cek lagi
  // di sini, kalau tidak petugas bisa tetap mengisi sesi yang berjalan.
  await assertSantriNotSuspended(sesi.nis, auth.role);

  const [produk] = await db
    .select()
    .from(schema.produk)
    .where(eq(schema.produk.barcode, barcode))
    .limit(1);
  if (!produk) {
    throw new HttpError(422, `Produk '${barcode}' tidak ditemukan.`, { field: 'barcode' });
  }

  let item: Record<string, any> = {};
  let openQ = 0;
  let qtyMatched = 0;

  await db.transaction(async (tx) => {
    // Snapshot utang produk ini SAAT INI (bukan saat sesi dibuka)
    const [row] = await tx
      .select({ q: sum(schema.transaksiPembelian.qty) })
      .from(schema.transaksiPembelian)
      .where(
        and(
          eq(schema.transaksiPembelian.nis, sesi.nis),
          eq(schema.transaksiPembelian.barcode, barcode),
          eq(schema.transaksiPembelian.status, 'open'),
        ),
      );
    openQ = Number(row?.q ?? 0);
    qtyMatched = Math.min(qtyIn, openQ);

    const now = new Date();
    const [created] = await tx
      .insert(schema.sesiVerifikasiItems)
      .values({
        idSesi: id,
        barcode,
        qtyIn,
        qtyOpenAtTime: openQ,
        qtyMatched,
        qtyExcess: Math.max(0, qtyIn - openQ),
        qtyShortfall: Math.max(0, openQ - qtyIn),
        poinDelta: qtyMatched * 2,
        fotoBuktiPath: fotoPath,
        catatan,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    item = created;
  });

  const nameMap = await productNameMap([barcode]);

  return Created({
    item: presentItem(item, nameMap.get(barcode) ?? null),
    note:
      qtyIn === 0 && openQ > 0
        ? `Pure-shortfall valid: siswa lapor tanpa bawa sampah. Penalty: -${openQ} poin (sudah dipotong saat pembelian).`
        : null,
  });
});
