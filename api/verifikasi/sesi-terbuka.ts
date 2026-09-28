/**
 * GET /api/verifikasi/sesi-terbuka — sesi verifikasi yang belum di-commit.
 *
 * Ini yang dibutuhkan petugas untuk melihat notifikasi. Dua kasus yang
 * harus dibedakan:
 *  - is_mine: true  -> sesi milik petugas yang sedang login. PENTING:
 *    kalau dia refresh atau browser-nya crash, tanpa endpoint ini dia
 *    tidak bisa menemukan sesinya lagi, dan item yang sudah dikerjakan
 *    tidak bisa di-commit.
 *  - is_mine: false -> milik petugas lain, supaya dia tahu harus cari
 *    siapa, bukan bingung dengan error 422 yang tidak menjelaskan siapa.
 */
import { isNull, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { requireCapability } from '../../src/server/http-guards';
import { DURASI_IDLE_MENIT, presentSantri } from '../../src/server/verifikasi';
import { handler, requireAuth, type Ctx } from '../../src/server/http';

export default handler(async (_ctx: Ctx) => {
  const auth = await requireAuth(_ctx);
  requireCapability(auth.role, 'input_verifikasi');

  const db = getDb();

  const sesi = await db
    .select()
    .from(schema.sesiVerifikasi)
    .where(isNull(schema.sesiVerifikasi.waktuSelesai))
    .orderBy(desc(schema.sesiVerifikasi.waktuMulai));

  const ids = sesi.map((s) => s.id);
  const items = ids.length
    ? await db.select().from(schema.sesiVerifikasiItems)
    : [];

  const bySesi = new Map<number, typeof items>();
  for (const it of items) {
    const list = bySesi.get(it.idSesi) ?? [];
    list.push(it);
    bySesi.set(it.idSesi, list);
  }

  const now = Date.now();
  const data = [];

  for (const s of sesi) {
    const list = bySesi.get(s.id) ?? [];
    // Aktivitas terakhir = item terbaru, fallback ke waktu_mulai
    const lastTs = list.length
      ? Math.max(...list.map((i) => new Date(i.createdAt).getTime()))
      : new Date(s.waktuMulai).getTime();

    // PENTING: dihitung DARI lastActivity KE now. Kalau ditulis terbalik
    // (diff di arah yang salah), hasilnya negatif dan setiap sesi selalu
    // terbaca "tidak idle".
    const idleMenit = Math.floor((now - lastTs) / 60000);
    const isIdle = idleMenit >= DURASI_IDLE_MENIT;


    data.push({
      id: s.id,
      nis: s.nis,
      nama_siswa: (await presentSantri(s.nis))?.nama ?? null,
      petugas_id: s.petugasId,
      is_mine: s.petugasId === auth.sub,
      waktu_mulai: s.waktuMulai,
      items_count: list.length,
      // Poin yang sudah diinput tapi belum TER-COMMIT ke saldo. Ini uang
      // yang belum masuk pembukuan — alasan terkuat untuk menyelesaikan sesi.
      poin_belum_tercatat: list.reduce((a, b) => a + b.poinDelta, 0),
      last_activity_at: new Date(lastTs).toISOString(),
      idle_menit: idleMenit,
      is_idle: isIdle,
    });
  }

  const milikSaya = data.filter((d) => d.is_mine);

  return {
    data,
    count: data.length,
    count_mine: milikSaya.length,
    count_idle_mine: milikSaya.filter((d) => d.is_idle).length,
    idle_threshold_menit: DURASI_IDLE_MENIT,
    fetched_at: new Date().toISOString(),
  };
});
