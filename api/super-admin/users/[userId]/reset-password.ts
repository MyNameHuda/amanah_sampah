/**
 * POST /api/super-admin/users/{userId}/reset-password — T1.4: reset password
 * user tanpa tahu password lamanya.
 *
 * Password baru WAJIB diketik admin dan langsung dikirim ke user lewat
 * kanal lain (WhatsApp sekolah). Wajib `must_change_password` supaya user
 * menggantinya sendiri di login pertama.
 *
 * Semua token dicabut: kalau tidak, sesi lama masih hidup dengan
 * password yang sudah tidak berlaku.
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../../src/server/db/index';
import { recordAudit } from '../../../../src/server/audit';
import { hashPassword, checkPasswordPolicy } from '../../../../src/server/auth/password';
import { requireT3Reverify } from '../../../../src/server/auth/t3';
import { revokeAllForUser } from '../../../../src/server/auth/jwt';
import { requireSuperAdmin } from '../../../../src/server/http-guards';
import {
  handler, HttpError, readBody, requireString, requireAuth, type Ctx,
} from '../../../../src/server/http';

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

  const body = readBody(ctx);
  const newPassword = requireString(body, 'new_password', { min: 8, max: 255 });
  // Reset admin-initialized: policy penuh dipakai untuk semua role,
  // karena password ini datang dari admin, bukan dari sistem.
  const policy = checkPasswordPolicy(newPassword);
  if (!policy.ok) {
    throw new HttpError(422, 'Password baru tidak memenuhi syarat.', {
      field: 'new_password',
    });
  }

  const db = getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!row) throw new HttpError(404, 'User tidak ditemukan.', { field: 'userId' });

  await db
    .update(schema.users)
    .set({
      password: await hashPassword(newPassword),
      mustChangePassword: true,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, id));

  const revoked = await revokeAllForUser(id);

  await recordAudit(
    'superadmin.reset_password',
    { user_id: id, tokens_revoked: revoked },
    { userId: auth.sub, role: auth.role, resourceType: 'user', resourceId: id, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    message: `Password ${row.name} direset. ${revoked} sesi dicabut — dia harus login lagi dan akan diminta ganti password.`,
    user: { id: row.id, name: row.name, must_change_password: true, tokens_revoked: revoked },
  };
});
