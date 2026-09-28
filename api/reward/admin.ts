/**
 * GET /api/reward/admin — SEMUA reward termasuk archived & non-aktif.
 * Filter: ?status=active|archived|inactive|all, ?q=<keyword>
 *
 * Hanya admin / super admin.
 */
import { and, asc, eq, ilike, isNull, isNotNull, count } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { requireAdminOrSuper } from '../../src/server/http-guards';
import { serializeReward } from '../../src/server/serialize';
import { handler, requireAuth, type Ctx } from '../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET') {
    return { message: 'Gunakan GET.', error: 'method_not_allowed' };
  }
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);

  const db = getDb();
  const conds = [];

  const status = String(ctx.req.query.status ?? 'all');
  if (status === 'active') {
    conds.push(eq(schema.reward.statusAktif, true), isNull(schema.reward.archivedAt));
  } else if (status === 'archived') {
    conds.push(isNotNull(schema.reward.archivedAt));
  } else if (status === 'inactive') {
    conds.push(eq(schema.reward.statusAktif, false), isNull(schema.reward.archivedAt));
  }

  const q = String(ctx.req.query.q ?? '').trim();
  if (q) conds.push(ilike(schema.reward.namaReward, `%${q}%`));

  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select()
    .from(schema.reward)
    .where(where)
    .orderBy(asc(schema.reward.biayaPoin));

  // Statistik ringan per reward: jumlah pernah di-redeem
  const stats = await db
    .select({
      idReward: schema.penukaranReward.idReward,
      n: count(),
    })
    .from(schema.penukaranReward)
    .groupBy(schema.penukaranReward.idReward);
  const byId = new Map(stats.map((s) => [s.idReward, Number(s.n)]));

  const data = rows.map((r) =>
    serializeReward(r, {
      redeemed_count: byId.get(r.idReward) ?? 0,
      is_archived: r.archivedAt !== null,
    }),
  );

  return { data };
});
