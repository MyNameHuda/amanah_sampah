/**
 * GET /api/super-admin/audit/search — T2.1: pencarian audit log lanjut.
 *
 * CATATAN BUG YANG DIPERBAIKI: filter NIS di versi Laravel memakai
 *   whereRaw("JSON_EXTRACT(payload, '$.nis') = ?")
 * itu sintaks MySQL. Di PostgreSQL hasilnya
 *   ERROR: function json_extract(json, unknown) does not exist
 * Di sini memakai operator ->> yang native Postgres, hasilnya identik.
 *
 * Bentuk response mengikuti paginator Laravel supaya frontend yang sudah
 * ada tidak perlu diubah.
 */
import { and, or, eq, gte, lte, like, desc, sql, inArray, count } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { requireSuperAdmin } from '../../../src/server/http-guards';
import { handler, requireAuth, type Ctx } from '../../../src/server/http';

const PER_PAGE = 50;

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET') {
    return { message: 'Gunakan GET.', error: 'method_not_allowed' };
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const db = getDb();

  const q = ctx.req.query;
  const conds = [];

  const nis = typeof q.nis === 'string' ? q.nis.trim() : '';
  if (nis) {
    // Dua jalur: payload->>'nis' atau payload->>'target_nis'
    conds.push(
      or(
        sql`${schema.auditLogs.payload}->>'nis' = ${nis}`,
        sql`${schema.auditLogs.payload}->>'target_nis' = ${nis}`,
      ),
    );
  }
  const action = typeof q.action === 'string' ? q.action.trim() : '';
  if (action) conds.push(like(schema.auditLogs.action, `%${action}%`));

  const role = typeof q.role === 'string' ? q.role.trim() : '';
  if (role) conds.push(eq(schema.auditLogs.role, role));

  if (typeof q.from === 'string' && q.from !== '') {
    const d = new Date(q.from);
    if (!Number.isNaN(d.getTime())) conds.push(gte(schema.auditLogs.waktu, d));
  }
  if (typeof q.to === 'string' && q.to !== '') {
    const d = new Date(q.to);
    if (!Number.isNaN(d.getTime())) conds.push(lte(schema.auditLogs.waktu, d));
  }
  const userId = Number(q.user_id);
  if (Number.isInteger(userId) && userId > 0) conds.push(eq(schema.auditLogs.userId, userId));

  const where = conds.length ? and(...conds) : undefined;
  const page = Math.max(1, Number(q.page ?? 1) || 1);

  const [totalRow] = await db.select({ n: count() }).from(schema.auditLogs).where(where);
  const total = Number(totalRow?.n ?? 0);
  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE));

  const rows = await db
    .select()
    .from(schema.auditLogs)
    .where(where)
    .orderBy(desc(schema.auditLogs.waktu))
    .limit(PER_PAGE)
    .offset((page - 1) * PER_PAGE);

  // with('user') — nama yang melakukan aksi
  const ids = [...new Set(rows.map((r) => r.userId).filter((v): v is number => v !== null))];
  const users = ids.length
    ? await db
        .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
        .from(schema.users)
        .where(inArray(schema.users.id, ids))
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  const data = rows.map((r) => ({
    id: r.id,
    user_id: r.userId,
    user: r.userId ? (byId.get(r.userId) ?? null) : null,
    role: r.role,
    action: r.action,
    resource_type: r.resourceType,
    resource_id: r.resourceId,
    payload: r.payload,
    admin_alasan: r.adminAlasan,
    ip_address: r.ipAddress,
    user_agent: r.userAgent,
    waktu: r.waktu,
    archive_at: r.archiveAt,
    purged_at: r.purgedAt,
  }));

  const from = rows.length ? (page - 1) * PER_PAGE + 1 : null;
  const to = from !== null ? from + rows.length - 1 : null;

  return {
    data,
    current_page: page,
    last_page: lastPage,
    per_page: PER_PAGE,
    total,
    from,
    to,
    links: '',
    path: '/api/super-admin/audit/search',
  };
});
