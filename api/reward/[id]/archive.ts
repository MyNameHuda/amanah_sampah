/**
 * POST /api/reward/{id}/archive — soft-delete reward (admin/super admin).
 * Reward berstok 0 atau yang pernah di-redeem TETAP boleh di-archive.
 * Mengarchive otomatis membuat status_aktif = false.
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

  // Sudah archived -> idempotent, bukan error (pola sama dengan aslinya)
  if (reward.archivedAt !== null) {
    return { reward: serializeReward(reward), message: 'Reward sudah di-archive.' };
  }

  const now = new Date();
  const [updated] = await db
    .update(schema.reward)
    .set({ archivedAt: now, archivedBy: auth.sub, statusAktif: false, updatedBy: auth.sub, updatedAt: now })
    .where(eq(schema.reward.idReward, id))
    .returning();

  await recordAudit(
    'reward.archive',
    { reward_id: id, nama_reward: reward.namaReward },
    { userId: auth.sub, role: auth.role, resourceType: 'reward', resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    reward: serializeReward(updated),
    message: `Reward '${reward.namaReward}' telah di-archive.`,
  };
});
