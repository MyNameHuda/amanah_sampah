/**
 * POST /api/verifikasi/sesi/{id}/cancel — batalkan sesi.
 *
 * CATATAN: sesi menggantung TIDAK pernah di-cancel otomatis. Tidak ada
 * cron atau command yang melakukannya. Sesi idle hanya ditangani lewat
 * notifikasi `sesi-terbuka` (petugas menyelesaikan sendiri) atau force-end
 * dari admin. Kalau suatu saat auto-cancel diinginkan, implementasikan
 * sungguhan — dan pastikan tidak meng-kill sesi yang sedang aktif dipakai.
 *
 * Cancel TIDAK mengubah saldo poin dan tidak menyentuh utang: item yang
 * sudah diinput dibuang, tapi tidak pernah di-commit, jadi tidak pernah
 * masuk pembukuan.
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../../src/server/db/index';
import { recordAudit } from '../../../../src/server/audit';
import { handler, HttpError, readBody, optionalString, requireAuth, type Ctx } from '../../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  const auth = await requireAuth(ctx);

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

  // Sudah ditutup -> idempotent, bukan error
  if (sesi.waktuSelesai) {
    return { message: 'Already closed.' };
  }

  const now = new Date();
  await db
    .update(schema.sesiVerifikasi)
    .set({ waktuSelesai: now, updatedAt: now })
    .where(eq(schema.sesiVerifikasi.id, id));

  await recordAudit(
    'verifikasi.cancel',
    { sesi_id: id, reason: optionalString(readBody(ctx), 'reason') ?? null },
    { userId: auth.sub, role: auth.role, resourceType: 'sesi', resourceId: id, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return { message: 'Sesi di-cancel.' };
});
