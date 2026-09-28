/**
 * POST /api/super-admin/users/{userId}/force-logout — T1.3: cabut semua
 * token user.
 *
 * Beda dengan suspend: ini tidak mengubah status akun, hanya memastikan
 * sesi yang sedang berjalan langsung mati. Dipakai saat ada kecurigaan
 * akun dipakai orang lain, tapi masih perlu diperiksa dulu sebelum
 * suspend.
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../../src/server/db/index';
import { recordAudit } from '../../../../src/server/audit';
import { requireT3Reverify } from '../../../../src/server/auth/t3';
import { revokeAllForUser } from '../../../../src/server/auth/jwt';
import { requireSuperAdmin } from '../../../../src/server/http-guards';
import { handler, HttpError, requireAuth, type Ctx } from '../../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST' && ctx.req.method !== 'PATCH') {
    throw new HttpError(405, 'Method not allowed.');
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  await requireT3Reverify(ctx, auth);

  const id = Number(ctx.req.query.userId);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, 'userId tidak valid.', { field: 'userId' });
  }
  if (id === auth.sub) {
    throw new HttpError(422, 'Gunakan logout biasa untuk akun sendiri.', { field: 'userId' });
  }

  const db = getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!row) throw new HttpError(404, 'User tidak ditemukan.', { field: 'userId' });

  const revoked = await revokeAllForUser(id);

  await recordAudit(
    'superadmin.force_logout',
    { user_id: id, tokens_revoked: revoked },
    { userId: auth.sub, role: auth.role, resourceType: 'user', resourceId: id, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    message: revoked > 0
      ? `${revoked} sesi ${row.name} dicabut. Dia harus login lagi.`
      : `Tidak ada sesi aktif milik ${row.name}.`,
    user: { id: row.id, name: row.name, tokens_revoked: revoked },
  };
});
