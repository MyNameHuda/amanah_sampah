/**
 * GET /api/verifikasi/active — T2.5: daftar sesi verifikasi yang belum di-commit.
 * Admin bisa lihat real-time: petugas mana sedang verifikasi siswa siapa.
 *
 * Bedanya dari /verifikasi/sesi-terbuka (yang dipakai petugas): ini sudut
 * pandang admin, jadi tidak ada flag is_mine — semua sesi ditampilkan.
 */
import { isNull, desc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { requireAdminOrSuper } from '../../src/server/http-guards';
import { handler, HttpError, requireAuth, type Ctx } from '../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);

  const db = getDb();
  const sesi = await db
    .select()
    .from(schema.sesiVerifikasi)
    .where(isNull(schema.sesiVerifikasi.waktuSelesai))
    .orderBy(desc(schema.sesiVerifikasi.waktuMulai));

  const ids = sesi.map((s) => s.id);
  const items = ids.length ? await db.select().from(schema.sesiVerifikasiItems) : [];

  const bySesi = new Map<number, typeof items>();
  for (const it of items) {
    if (!ids.includes(it.idSesi)) continue;
    const list = bySesi.get(it.idSesi) ?? [];
    list.push(it);
    bySesi.set(it.idSesi, list);
  }

  const nisList = [...new Set(sesi.map((s) => s.nis))];
  const siswa = nisList.length
    ? await db
        .select({
          nis: schema.santri.nis,
          nama: schema.users.name,
          kelas: schema.santri.kelas,
          poin: schema.santri.currentPoin,
          blocked: schema.santri.isBlocked,
        })
        .from(schema.santri)
        .innerJoin(schema.users, eq(schema.users.id, schema.santri.userId))
        .where(inArray(schema.santri.nis, nisList))
    : [];
  const siswaByNis = new Map(siswa.map((s) => [s.nis, s]));

  const petugasIds = [...new Set(sesi.map((s) => s.petugasId))];
  const petugas = petugasIds.length
    ? await db
        .select({ id: schema.users.id, name: schema.users.name })
        .from(schema.users)
        .where(inArray(schema.users.id, petugasIds))
    : [];
  const petugasById = new Map(petugas.map((p) => [p.id, p.name]));

  const data = sesi.map((s) => {
    const list = bySesi.get(s.id) ?? [];
    const lastItem = list.length
      ? list.reduce((a, b) => (a.createdAt > b.createdAt ? a : b))
      : null;
    const row = siswaByNis.get(s.nis);
    return {
      id: s.id,
      nis: s.nis,
      nama_siswa: row?.nama ?? null,
      kelas_siswa: row?.kelas ?? null,
      current_poin_siswa: row?.poin ?? null,
      is_blocked: row?.blocked ?? null,
      petugas_id: s.petugasId,
      nama_petugas: petugasById.get(s.petugasId) ?? null,
      waktu_mulai: s.waktuMulai,
      items_count: list.length,
      // Poin yang sudah diinput tapi belum TER-COMMIT ke saldo
      total_poin_change_uncommitted: list.reduce((a, b) => a + b.poinDelta, 0),
      last_item_at: lastItem?.createdAt ?? null,
    };
  });

  return { data, count: data.length, fetched_at: new Date().toISOString() };
});
