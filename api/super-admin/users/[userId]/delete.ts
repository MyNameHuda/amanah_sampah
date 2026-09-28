/**
 * DELETE /api/super-admin/users/{userId} — hapus user (soft via archive).
 *
 * TIDAK menghapus baris fisik. Akun nonaktif (tidak staff, tidak
 * petugas) di-archive supaya jejak audit dan riwayatnya tetap utuh.
 * Staff/petugas yang punya riwayat transaksi tidak bisa dihapus.
 */
import { and, eq, isNotNull, count } from 'drizzle-orm';
import { getDb, schema } from '../../../../src/server/db/index';
import { recordAudit } from '../../../../src/server/audit';
import { requireT3Reverify } from '../../../../src/server/auth/t3';
import { revokeAllForUser } from '../../../../src/server/auth/jwt';
import { isStaffKantin, isPetugas, isSuperAdmin, type Role } from '../../../../src/server/auth/roles';
import { requireSuperAdmin } from '../../../../src/server/http-guards';
import {
  handler, HttpError, readBody, requireString, requireAuth, type Ctx,
} from '../../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'DELETE' && ctx.req.method !== 'POST') {
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
    throw new HttpError(422, 'Tidak bisa menghapus akun sendiri.', { field: 'userId' });
  }

  const body = readBody(ctx);
  const alasan = requireString(body, 'alasan', { min: 10, max: 500 });

  const db = getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!row) throw new HttpError(404, 'User tidak ditemukan.', { field: 'userId' });

  const role = row.role as Role;
  if (isSuperAdmin(role) || isStaffKantin(role) || isPetugas(role)) {
    throw new HttpError(
      422,
      `User dengan role '${role}' tidak bisa dihapus — ada riwayat operasional. Gunakan suspend.`,
      { field: 'userId' },
    );
  }

  // Akun yang punya histori transaksi/verifikasi tidak boleh dihapus
  const [txCount] = await db
    .select({ n: count() })
    .from(schema.transaksiPembelian)
    .where(eq(schema.transaksiPembelian.staffId, id));
  if (Number(txCount?.n ?? 0) > 0) {
    throw new HttpError(422, 'User punya riwayat transaksi. Gunakan suspend.', { field: 'userId' });
  }

  const [sesiCount] = await db
    .select({ n: count() })
    .from(schema.sesiVerifikasi)
    .where(eq(schema.sesiVerifikasi.petugasId, id));
  if (Number(sesiCount?.n ?? 0) > 0) {
    throw new HttpError(422, 'User punya riwayat verifikasi. Gunakan suspend.', { field: 'userId' });
  }

  const revoked = await revokeAllForUser(id);
  const now = new Date();

  // Soft delete: nonaktifkan + tandai. Barisnya tetap ada untuk audit.
  const [updated] = await db
    .update(schema.users)
    .set({ suspendedAt: now, mustChangePassword: true, updatedAt: now })
    .where(and(eq(schema.users.id, id), isNotNull(schema.users.id)))
    .returning();

  await recordAudit(
    'superadmin.user_delete',
    { user_id: id, name: row.name, role, tokens_revoked: revoked },
    { userId: auth.sub, role: auth.role, resourceType: 'user', resourceId: id, adminAlasan: alasan, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    message: `User ${row.name} dinonaktifkan. Data tidak dihapus fisik — riwayat tetap bisa diaudit.`,
    user: { id: updated.id, name: updated.name, is_suspended: true, tokens_revoked: revoked },
  };
});
