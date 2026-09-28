/**
 * POST /api/reward/{id}/toggle-active — aktif/nonaktif cepat.
 * Berguna untuk menjeda reward tanpa|archive (stok & histori tetap utuh).
 * Reward yang sudah archived tidak boleh di-toggle.
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { recordAudit } from '../../../src/server/audit';
import { requireAdminOrSuper } from '../../../src/server/http-guards';
import { serializeReward } from '../../../src/server/serialize';
import { handler, HttpError, requireAuth, type Ctx } from '../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);

  const id = String(ctx.req.query.id ?? '').trim();
  if (!id) throw new HttpError(422, 'id_reward wajib diisi.', { field: 'id_reward' });

  const db = getDb();
  const rows = await db.select().from(schema.reward).where(eq(schema.reward.idReward, id)).limit(1);
  const reward = rows[0];
  if (!reward) throw new HttpError(404, 'Reward tidak ditemukan.', { field: 'id_reward' });
  if (reward.archivedAt !== null) {
    throw new HttpError(422, 'Reward archived.', { field: 'reward' });
  }

  const next = !reward.statusAktif;
  const [updated] = await db
    .update(schema.reward)
    .set({ statusAktif: next, updatedBy: auth.sub, updatedAt: new Date() })
    .where(eq(schema.reward.idReward, id))
    .returning();

  await recordAudit(
    'reward.toggle_active',
    { reward_id: id, status_aktif: next },
    { userId: auth.sub, role: auth.role, resourceType: 'reward', resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return { reward: serializeReward(updated) };
});
