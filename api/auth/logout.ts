/**
 * POST /api/auth/logout
 *
 * Mencabut token yang sedang dipakai, lalu mencatat audit log.
 * Token milik device lain milik user yang sama TIDAK dicabut —
 * multi-device allowed (B7), sama seperti perilaku Laravel.
 */
import { revokeToken } from '../../src/server/auth/jwt';
import { recordAudit } from '../../src/server/audit';
import { handler, HttpError, requireAuth, type Ctx } from '../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') {
    throw new HttpError(405, 'Method not allowed.');
  }

  const auth = await requireAuth(ctx);

  const header = ctx.req.headers.authorization;
  const bearer = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : '';
  if (bearer) await revokeToken(bearer);

  // Audit tetap dicatat walau token sudah tidak ada — user memang login
  // saat itu, dan jejaknya tetap berguna untuk forensik.
  await recordAudit('auth.logout', {}, {
    userId: auth.sub,
    role: auth.role,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return { message: 'Logout berhasil.' };
});
