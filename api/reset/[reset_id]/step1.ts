/**
 * POST /api/reset/{reset_id}/step1 — admin konfirmasi pembayaran sudah diterima.
 * Wajib sebelum endpoint /apply bisa dipakai.
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

  const resetId = Number(ctx.req.query.reset_id ?? ctx.req.query.resetId);
  if (!Number.isInteger(resetId)) {
    throw new HttpError(422, 'reset_id tidak valid.', { field: 'reset_id' });
  }

  const db = getDb();
  const [updated] = await db
    .update(schema.resetDendaLog)
    .set({ verifikasiStep1: true, updatedAt: new Date() })
    .where(eq(schema.resetDendaLog.id, resetId))
    .returning();

  if (!updated) throw new HttpError(404, 'Data reset tidak ditemukan.');

  await recordAudit(
    'reset.step1',
    { reset_id: resetId },
    { userId: auth.sub, role: auth.role, resourceType: 'reset', resourceId: resetId, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return { reset: serializeReset(updated) };
});
