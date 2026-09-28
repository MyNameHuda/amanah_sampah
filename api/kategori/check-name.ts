/**
 * GET /api/kategori/check-name — cek ketersediaan nama kategori (real-time).
 * 200 = tersedia, 409 = duplikat, 422 = format tidak valid.
 * `?id=` dipakai saat edit supaya kategori itu sendiri tidak dianggap kembar.
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { handler, JsonResult, requireAuth, type Ctx } from '../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET') return new JsonResult(405, { error: 'method_not_allowed' });

  await requireAuth(ctx);
  const nama = String(ctx.req.query.nama ?? '').trim();
  if (nama === '' || nama.length > 50) {
    return new JsonResult(422, {
      available: false,
      reason: 'invalid_format',
      message: 'Nama kategori kosong atau terlalu panjang (max 50 char).',
    });
  }

  const idRaw = ctx.req.query.id;
  const id = idRaw === undefined || idRaw === null || idRaw === '' ? null : Number(idRaw);

  const db = getDb();

  const found = await db
    .select()
    .from(schema.kategoriProduk)
    .where(eq(schema.kategoriProduk.namaKategori, nama))
    .limit(1);

  const hit = id ? found.filter((f) => f.id !== id)[0] : found[0];

  if (hit) {
    return new JsonResult(409, {
      available: false,
      reason: 'duplicate',
      message: `Nama kategori '${nama}' sudah dipakai.`,
      existing: { id: hit.id, nama_kategori: hit.namaKategori },
    });
  }

  return { available: true, nama, message: 'Nama kategori tersedia.' };
});
