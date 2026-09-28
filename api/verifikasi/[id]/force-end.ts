/**
 * POST /api/verifikasi/{id}/force-end — T2.7: force-end sesi verifikasi.
 *
 * INI BUKAN commit. Items TIDAK diproses ke poin saldo — sesi ditutup paksa
 * supaya siswa tidak terkunci, tapi poinnya tidak masuk pembukuan. Item tetap
 * tercatat di sesi sebagai jejak audit.
 *
 * Alasan WAJIB (min 10 karakter) dan masuk ke audit log sebagai
 * admin_alasan. Tanpa itu, intervensi paksa tidak bisa diaudit.
 */
import { eq, and, isNull } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { recordAudit } from '../../../src/server/audit';
import { requireAdminOrSuper } from '../../../src/server/http-guards';
import { handler, HttpError, readBody, requireString, requireAuth, type Ctx } from '../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);

  const id = Number(ctx.req.query.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, 'id sesi tidak valid.', { field: 'id' });
  }

  const body = readBody(ctx);
  // Min 10 karakter: alasan seadanya ("masalah", "ya") tidak berguna untuk audit
  const alasan = requireString(body, 'alasan', { min: 10, max: 500 });

  const db = getDb();
  const [sesi] = await db
    .select()
    .from(schema.sesiVerifikasi)
    .where(eq(schema.sesiVerifikasi.id, id))
    .limit(1);
  if (!sesi) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan.', { field: 'id' });
  if (sesi.waktuSelesai) {
    throw new HttpError(422, 'Sesi sudah ditutup.', { field: 'sesi' });
  }

  const items = await db
    .select()
    .from(schema.sesiVerifikasiItems)
    .where(eq(schema.sesiVerifikasiItems.idSesi, id));

  const itemsCount = items.length;
  const totalPoin = items.reduce((a, b) => a + b.poinDelta, 0);
  const now = new Date();

  // Tutup sesi. TIDAK ada update saldo, TIDAK ada alokasi FIFO.
  await db
    .update(schema.sesiVerifikasi)
    .set({ waktuSelesai: now, updatedAt: now })
    .where(and(eq(schema.sesiVerifikasi.id, id), isNull(schema.sesiVerifikasi.waktuSelesai)));

  await recordAudit(
    'verifikasi.force_end',
    {
      sesi_id: id,
      nis: sesi.nis,
      petugas_id: sesi.petugasId,
      items_dropped_count: itemsCount,
      total_poin_dropped: totalPoin,
      note: 'Items tidak diproses ke poin saldo. Sesi di-close paksa oleh admin.',
    },
    {
      userId: auth.sub,
      role: auth.role,
      resourceType: 'sesi',
      resourceId: id,
      adminAlasan: alasan,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    },
  );

  const [fresh] = await db
    .select()
    .from(schema.sesiVerifikasi)
    .where(eq(schema.sesiVerifikasi.id, id))
    .limit(1);

  return {
    message: `Sesi #${id} di-force-end. Items TIDAK diproses — poin siswa tidak berubah dari sesi ini.`,
    sesi: fresh,
    items_dropped: { count: itemsCount, total_poin_uncommitted: totalPoin },
  };
});
