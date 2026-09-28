/**
 * POST /api/reset/{nis}/start — mulai reset denda (admin/super admin).
 *
 * Kontrak dari ResetController.php. Aturan penting (D10/D11):
 *   - target reset = 0 poin
 *   - debts TETAP OPEN; siswa harus return sampah secara bertahap
 *   - butuh 2 langkah verifikasi (step1 = admin konfirmasi terima pembayaran)
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { recordAudit } from '../../../src/server/audit';
import { requireAdminOrSuper } from '../../../src/server/http-guards';
import { handler, HttpError, requireAuth, type Ctx } from '../../../src/server/http';
import { serializeReset } from '../../../src/server/http-guards';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');

  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);

  const nis = String(ctx.req.query.nis ?? '').trim();
  if (!nis) throw new HttpError(422, 'NIS wajib diisi.', { field: 'nis' });

  const db = getDb();
  const [santri] = await db.select().from(schema.santri).where(eq(schema.santri.nis, nis)).limit(1);
  if (!santri) throw new HttpError(404, 'Santri tidak ditemukan.');
  if (!santri.isBlocked) {
    throw new HttpError(422, 'Santri tidak dalam keadaan blocked.', { field: 'nis' });
  }

  const now = new Date();
  const [log] = await db
    .insert(schema.resetDendaLog)
    .values({
      nis,
      adminId: auth.sub,
      poinSebelum: santri.currentPoin,
      poinSesudah: 0, // [v1.1] target = 0
      verifikasiStep1: false,
      verifikasiStep2: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await recordAudit(
    'reset.start',
    { reset_id: log.id, nis, poin_before: santri.currentPoin },
    { userId: auth.sub, role: auth.role, resourceType: 'reset', resourceId: log.id, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return { reset: serializeReset(log) };
});
