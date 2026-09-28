/**
 * POST /api/super-admin/users/{userId}/suspend — suspend / buka akun.
 *
 * Alasan WAJIB (min 10 karakter) supaya keputusan ini bisa diaudit —
 * siswa yang tiba-tiba tidak bisa setor sampah harus bisa dijelaskan.
 *
 * Menolak suspend akun sendiri: satu-satunya cara系統 ini boleh kehilangan
 * akses admin adalah lewat orang lain.
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../../src/server/db/index';
import { recordAudit } from '../../../../src/server/audit';
import { requireT3Reverify } from '../../../../src/server/auth/t3';
import { revokeAllForUser } from '../../../../src/server/auth/jwt';
import { requireSuperAdmin, iso } from '../../../../src/server/http-guards';
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
  if (id === auth.sub) {
    throw new HttpError(422, 'Tidak bisa suspend akun sendiri.', { field: 'userId' });
  }

  const body = readBody(ctx);
  if (typeof body.suspended !== 'boolean') {
    throw new HttpError(422, 'Kolom suspended harus boolean (true/false).', { field: 'suspended' });
  }
  const suspended = body.suspended;
  const alasan = requireString(body, 'alasan', { min: 10, max: 500 });

  const db = getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!row) throw new HttpError(404, 'User tidak ditemukan.', { field: 'userId' });

  const now = new Date();
  const [updated] = await db
    .update(schema.users)
    .set({
      suspendedAt: suspended ? now : null,
      updatedAt: now,
      // Buka kembali = pengguna wajib ganti password lagi, karena aksesnya
      // pernah hilang dan kita tidak bisa memastikan dia tetap pemilik.
      ...(suspended ? {} : { mustChangePassword: true }),
    })
    .where(eq(schema.users.id, id))
    .returning();

  // Cabut semua token: kalau dibiarkan, sesi yang sedang jalan masih
  // bisa dipakai padahal aksesnya sudah dicabut.
  const revoked = suspended ? await revokeAllForUser(id) : 0;

  await recordAudit(
    suspended ? 'superadmin.user_suspend' : 'superadmin.user_unsuspend',
    { user_id: id, target_role: row.role, tokens_revoked: revoked },
    { userId: auth.sub, role: auth.role, resourceType: 'user', resourceId: id, adminAlasan: alasan, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    message: suspended
      ? `Akun ${row.name} disuspend. ${revoked} sesi aktif dicabut.`
      : `Akun ${row.name} dibuka kembali. User harus ganti password saat login.`,
    user: {
      id: updated.id,
      name: updated.name,
      is_suspended: updated.suspendedAt !== null,
      suspended_at: iso(updated.suspendedAt),
      tokens_revoked: revoked,
    },
  };
});
