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
import { getDb, schema } from '../../../../db/index.ts';
import { recordAudit } from '../../../../audit.ts';
import { hashPassword, checkPasswordPolicy, describeProblems } from '../../../../auth/password.ts';
import { requireT3Reverify } from '../../../../auth/t3.ts';
import { revokeAllForUser } from '../../../../auth/jwt.ts';
import { requireSuperAdmin } from '../../../../http-guards.ts';
import {
  handler, HttpError, readBody, requireString, requireAuth, type Ctx,
} from '../../../../http.ts';

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
  // min 8 hanya lantai terendah; `checkPasswordPolicy` di bawahnya yang
  // menegakkan 12 + komposisi huruf. Jangan diturunkan ke 8 di sini.
  const newPassword = requireString(body, 'new_password', { min: 8, max: 255 });
  // Reset admin-initialized: policy penuh dipakai untuk semua role,
  // karena password ini datang dari admin, bukan dari sistem.
  const policy = checkPasswordPolicy(newPassword);
  if (!policy.ok) {
    // Sebutkan masalahnya secara spesifik — lihat catatan di users/index.ts.
    throw new HttpError(
      422,
      `Password baru tidak memenuhi syarat: ${describeProblems(policy.problems)}.`,
      { field: 'new_password', problems: policy.problems },
    );
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
