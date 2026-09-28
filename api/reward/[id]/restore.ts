/**
 * POST /api/reward/{id}/restore — pulihkan reward dari archive.
 * HANYA super admin (operasi terbatas / PRD T3).
 * Penting untuk recovery kalau admin salah archive reward yang masih berstok.
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { recordAudit } from '../../../src/server/audit';
import { requireCapability } from '../../../src/server/http-guards';
import { serializeReward } from '../../../src/server/serialize';
import { isSuperAdmin } from '../../../src/server/auth/roles';
import { handler, HttpError, requireAuth, type Ctx } from '../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  const auth = await requireAuth(ctx);

  if (!isSuperAdmin(auth.role)) {
    throw new HttpError(422, 'Hanya Super Admin yang bisa restore reward.', { field: 'auth' });
  }

  const id = String(ctx.req.query.id ?? '').trim();
  if (!id) throw new HttpError(422, 'id_reward wajib diisi.', { field: 'id_reward' });

  const db = getDb();
  const rows = await db.select().from(schema.reward).where(eq(schema.reward.idReward, id)).limit(1);
  const reward = rows[0];
  if (!reward) throw new HttpError(404, 'Reward tidak ditemukan.', { field: 'id_reward' });

  if (reward.archivedAt === null) {
    return { reward: serializeReward(reward), message: 'Reward tidak di-archive.' };
  }

  const [updated] = await db
    .update(schema.reward)
    .set({ archivedAt: null, archivedBy: null, statusAktif: true, updatedBy: auth.sub, updatedAt: new Date() })
    .where(eq(schema.reward.idReward, id))
    .returning();

  await recordAudit(
    'reward.restore',
    { reward_id: id, nama_reward: reward.namaReward },
    { userId: auth.sub, role: auth.role, resourceType: 'reward', resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    reward: serializeReward(updated),
    message: `Reward '${reward.namaReward}' telah dipulihkan.`,
  };
});
