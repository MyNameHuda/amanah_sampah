/**
 * GET /api/verifikasi/{id}/log — T2.6: log lengkap satu sesi verifikasi
 * (semua item yang pernah di-add,_open maupun sudah di-commit).
 *
 * Sudut pandang admin, jadi bisa melihat sesi milik petugas mana pun —
 * bukan cuma miliknya sendiri seperti /verifikasi/sesi/{id}.
 *
 * PENTING soal routing: file ini menerima semua yang berbentuk /verifikasi/{id}/log.
 * Vercel memprioritaskan route statis lebih dulu, jadi /verifikasi/sesi/{id}
 * tetap ditangani oleh api/verifikasi/sesi/[id]/index.ts, bukan file ini.
 */
import { eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { requireAdminOrSuper } from '../../../src/server/http-guards';
import { photoUrl } from '../../../src/server/verifikasi';
import { handler, HttpError, requireAuth, type Ctx } from '../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);

  const id = Number(ctx.req.query.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, 'id sesi tidak valid.', { field: 'id' });
  }

  const db = getDb();
  const [sesi] = await db
    .select()
    .from(schema.sesiVerifikasi)
    .where(eq(schema.sesiVerifikasi.id, id))
    .limit(1);
  if (!sesi) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan.', { field: 'id' });

  const [siswa] = await db
    .select({ nama: schema.users.name, kelas: schema.santri.kelas })
    .from(schema.santri)
    .innerJoin(schema.users, eq(schema.users.id, schema.santri.userId))
    .where(eq(schema.santri.nis, sesi.nis))
    .limit(1);

  const [petugas] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, sesi.petugasId))
    .limit(1);

  const items = await db
    .select()
    .from(schema.sesiVerifikasiItems)
    .where(eq(schema.sesiVerifikasiItems.idSesi, id));

  const barcodes = [...new Set(items.map((i) => i.barcode))];
  const prods = barcodes.length
    ? await db
        .select()
        .from(schema.produk)
        .where(inArray(schema.produk.barcode, barcodes))
    : [];
  const namaByBc = new Map(prods.map((p) => [p.barcode, p.namaProduk]));

  return {
    sesi: {
      id: sesi.id,
      nis: sesi.nis,
      nama_siswa: siswa?.nama ?? null,
      kelas_siswa: siswa?.kelas ?? null,
      petugas_id: sesi.petugasId,
      nama_petugas: petugas?.name ?? null,
      waktu_mulai: sesi.waktuMulai,
      waktu_selesai: sesi.waktuSelesai,
      status: sesi.waktuSelesai ? 'closed' : 'open',
      total_poin_change: sesi.totalPoinChange ?? 0,
    },
    items: items.map((i) => ({
      id: i.id,
      barcode: i.barcode,
      nama_produk: namaByBc.get(i.barcode) ?? null,
      qty_in: i.qtyIn,
      qty_matched: i.qtyMatched,
      qty_excess: i.qtyExcess,
      qty_shortfall: i.qtyShortfall,
      poin_delta: i.poinDelta,
      foto_bukti_path: i.fotoBuktiPath ?? null,
      // URL disusun di server supaya frontend tidak perlu tahu apakah foto
      // dilayani dari symlink lokal atau Supabase.
      foto_bukti_url: photoUrl(i.fotoBuktiPath),
      catatan: i.catatan ?? null,
      created_at: i.createdAt,
    })),
  };
});
