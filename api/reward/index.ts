/**
 * GET  /api/reward — reward AKTIF saja, urut dari biaya termurah.
 *       Terbuka untuk semua role (Santri perlu ini untuk tukar reward).
 * POST /api/reward — buat reward baru (admin/super admin).
 *
 * CATATAN: file ini harus menang atas /api/reward/{id}, tapi
 * /api/reward/admin ada di file terpisah (admin.ts) yang lebih spesifik
 * dan urination Vercel akan mengemonsukkannya.
 */
import { eq, and, asc, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { recordAudit } from '../../src/server/audit';
import { serializeReward } from '../../src/server/serialize';
import { requireAdminOrSuper } from '../../src/server/http-guards';
import {
  handler, HttpError, Created, readBody, requireString, requireAuth, type Ctx,
} from '../../src/server/http';

export default handler(async (ctx: Ctx) => {
  const auth = await requireAuth(ctx);
  const db = getDb();

  if (ctx.req.method === 'GET') {
    const rows = await db
      .select()
      .from(schema.reward)
      .where(and(eq(schema.reward.statusAktif, true), isNull(schema.reward.archivedAt)))
      .orderBy(asc(schema.reward.biayaPoin));
    return { data: rows.map((r) => serializeReward(r)) };
  }

  if (ctx.req.method === 'POST') {
    requireAdminOrSuper(auth.role);
    const body = readBody(ctx);

    const nama = requireString(body, 'nama_reward', { max: 100 });
    const biaya = Number(body.biaya_poin);
    const stok = Number(body.stok);
    if (!Number.isInteger(biaya) || biaya < 1 || biaya > 1_000_000) {
      throw new HttpError(422, 'biaya_poin harus integer 1..1000000.', { field: 'biaya_poin' });
    }
    if (!Number.isInteger(stok) || stok < 0) {
      throw new HttpError(422, 'stok harus integer >= 0.', { field: 'stok' });
    }

    // Cek duplikat nama, case-insensitive
    const dup = await db
      .select()
      .from(schema.reward)
      .where(sql`lower(${schema.reward.namaReward}) = ${nama.toLowerCase()}`)
      .limit(1);
    if (dup.length) {
      throw new HttpError(422, `Reward dengan nama '${nama}' sudah ada.`, {
        field: 'nama_reward',
      });
    }

    const now = new Date();
    const [reward] = await db
      .insert(schema.reward)
      .values({
        idReward: crypto.randomUUID(),
        namaReward: nama,
        biayaPoin: biaya,
        stok,
        statusAktif: true,
        createdBy: auth.sub,
        updatedBy: auth.sub,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await recordAudit(
      'reward.create',
      { reward_id: reward.idReward, payload: { nama_reward: nama, biaya_poin: biaya, stok } },
      { userId: auth.sub, role: auth.role, resourceType: 'reward', resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent },
    );

    return Created({ reward: serializeReward(reward) });
  }

  throw new HttpError(405, 'Method not allowed.');
});

