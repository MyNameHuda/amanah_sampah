/**
 * GET   /api/reward/{id} — detail satu reward (admin/super admin)
 * PATCH /api/reward/{id} — update nama / biaya / stok / status_aktif
 */
import { eq, and, sql, isNull } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { recordAudit } from '../../../src/server/audit';
import { requireAdminOrSuper } from '../../../src/server/http-guards';
import { serializeReward } from '../../../src/server/serialize';
import { handler, HttpError, readBody, requireString, requireAuth, type Ctx } from '../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);

  const id = String(ctx.req.query.id ?? '').trim();
  if (!id) throw new HttpError(422, 'id_reward wajib diisi.', { field: 'id_reward' });

  if (ctx.req.method === 'GET') {
    const db = getDb();
    const rows = await db.select().from(schema.reward).where(eq(schema.reward.idReward, id)).limit(1);
    if (!rows[0]) throw new HttpError(404, 'Reward tidak ditemukan.', { field: 'id_reward' });
    return { reward: serializeReward(rows[0]) };
  }

  if (ctx.req.method === 'PATCH' || ctx.req.method === 'PUT') {
    const db = getDb();
    const rows = await db.select().from(schema.reward).where(eq(schema.reward.idReward, id)).limit(1);
    const reward = rows[0];
    if (!reward) throw new HttpError(404, 'Reward tidak ditemukan.', { field: 'id_reward' });

    if (reward.archivedAt !== null) {
      throw new HttpError(422, 'Reward sudah di-archive. Restore dulu untuk mengedit.', {
        field: 'reward',
      });
    }

    const body = readBody(ctx);
    // Semua field WAJIB (required) di aslinya, sama seperti Laravel
    const nama = requireString(body, 'nama_reward', { max: 100 });
    const biaya = Number(body.biaya_poin);
    const stok = Number(body.stok);
    if (!Number.isInteger(biaya) || biaya < 1 || biaya > 1_000_000) {
      throw new HttpError(422, 'biaya_poin harus integer 1..1000000.', { field: 'biaya_poin' });
    }
    if (!Number.isInteger(stok) || stok < 0) {
      throw new HttpError(422, 'stok harus integer >= 0.', { field: 'stok' });
    }
    if (typeof body.status_aktif !== 'boolean') {
      throw new HttpError(422, 'status_aktif wajib diisi (true/false).', { field: 'status_aktif' });
    }
    const statusAktif = body.status_aktif as boolean;

    // Unik per nama, kecuali dirinya sendiri
    const dup = await db
      .select()
      .from(schema.reward)
      .where(sql`lower(${schema.reward.namaReward}) = ${nama.toLowerCase()}`)
      .limit(1);
    if (dup.length && dup[0].idReward !== id) {
      throw new HttpError(422, 'Nama reward sudah dipakai reward lain.', {
        field: 'nama_reward',
      });
    }

    const before = {
      nama_reward: reward.namaReward,
      biaya_poin: reward.biayaPoin,
      stok: reward.stok,
      status_aktif: reward.statusAktif,
    };

    const [updated] = await db
      .update(schema.reward)
      .set({ namaReward: nama, biayaPoin: biaya, stok, statusAktif, updatedBy: auth.sub, updatedAt: new Date() })
      .where(eq(schema.reward.idReward, id))
      .returning();

    await recordAudit(
      'reward.update',
      {
        reward_id: id,
        payload: {
          before,
          after: {
            nama_reward: updated.namaReward,
            biaya_poin: updated.biayaPoin,
            stok: updated.stok,
            status_aktif: updated.statusAktif,
          },
        },
      },
      { userId: auth.sub, role: auth.role, resourceType: 'reward', resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent },
    );

    return { reward: serializeReward(updated) };
  }

  throw new HttpError(405, 'Method not allowed.');
});

void and;
void isNull;
