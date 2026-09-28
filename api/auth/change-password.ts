/**
 * POST /api/auth/change-password
 *
 * Dua mode:
 *  - normal          : wajib kirim current_password
 *  - for_first_login : lewati cek password lama, TAPI hanya boleh kalau
 *                      must_change_password = true (kepatuhan keamanan —
 *                      tanpa ini, siapa pun bisa set flag itu lewat endpoint ini)
 *
 * Sesuai Laravel: minimal 8 karakter (bukan 12 seperti policy bootstrap).
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { hashPassword, verifyPassword } from '../../src/server/auth/password';
import { revokeAllForUser } from '../../src/server/auth/jwt';
import { recordAudit } from '../../src/server/audit';
import {
  handler,
  HttpError,
  readBody,
  requireString,
  optionalString,
  readBoolean,
  requireAuth,
  type Ctx,
} from '../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') {
    throw new HttpError(405, 'Method not allowed.');
  }

  const auth = await requireAuth(ctx);
  const body = readBody(ctx);

  const newPassword = requireString(body, 'new_password', { min: 8, max: 255 });
  const confirmation = requireString(body, 'new_password_confirmation', { max: 255 });
  const currentPassword = optionalString(body, 'current_password');
  const forFirstLogin = readBoolean(body, 'for_first_login');

  if (newPassword !== confirmation) {
    throw new HttpError(422, 'Konfirmasi password tidak cocok.', {
      field: 'new_password',
    });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      password: schema.users.password,
      mustChangePassword: schema.users.mustChangePassword,
    })
    .from(schema.users)
    .where(eq(schema.users.id, auth.sub))
    .limit(1);

  const user = rows[0];
  if (!user) throw new HttpError(401, 'User tidak ditemukan.');

  if (forFirstLogin) {
    if (!user.mustChangePassword) {
      throw new HttpError(422, 'Mode ini hanya untuk first-login.', {
        field: 'for_first_login',
      });
    }
  } else {
    if (!currentPassword) {
      throw new HttpError(422, 'Kolom current_password wajib diisi.', {
        field: 'current_password',
      });
    }
    if (!(await verifyPassword(currentPassword, user.password))) {
      throw new HttpError(422, 'Password lama salah.', { field: 'current_password' });
    }
  }

  await db
    .update(schema.users)
    .set({
      password: await hashPassword(newPassword),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, auth.sub));

  await recordAudit(
    forFirstLogin ? 'auth.password_change_first_login' : 'auth.password_change',
    { is_first_login: forFirstLogin },
    { userId: auth.sub, role: auth.role, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  // Cabut SEMUA token lama user ini — kalau tidak, sesi di device lain
  // masih hidup dengan password lama, padahal password baru dipilih
  // justru karena dianggap bocor.
  const revoked = await revokeAllForUser(auth.sub);
  console.log(`[change-password] user ${auth.sub}: ${revoked} token dicabut`);

  return { message: 'Password berhasil diubah.', tokens_revoked: revoked };
});
