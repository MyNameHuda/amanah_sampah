/**
 * GET    /api/super-admin/users/{userId} — detail satu user
 * PATCH  /api/super-admin/users/{userId} — ubah nama / role / NIS
import { eq } from 'drizzle-orm';
 * POST   /api/super-admin/users/{userId}/reset-password — reset password
import { requireSuperAdmin, iso } from '../../../../src/server/http-guards';
import { handler, HttpError, readBody, requireString, requireAuth, type Ctx } from '../../../../src/server/http';
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../../src/server/db/index';
import { recordAudit } from '../../../../src/server/audit';
import { hashPassword, checkPasswordPolicy } from '../../../../src/server/auth/password';
import { requireT3Reverify } from '../../../../src/server/auth/t3';
import { revokeAllForUser } from '../../../../src/server/auth/jwt';
import { ROLES, isRole, isSuperAdmin, type Role } from '../../../../src/server/auth/roles';
import { requireSuperAdmin, iso } from '../../../../src/server/http-guards';
import {
  handler, HttpError, readBody, requireString, optionalString, requireAuth, type Ctx,
} from '../../../../src/server/http';

const userId = (ctx: Ctx) => {
  const id = Number(ctx.req.query.userId);
  if (!Number.isInteger(id)) throw new HttpError(422, 'userId tidak valid.', { field: 'userId' });
  return id;
};

export default handler(async (ctx: Ctx) => {
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const id = userId(ctx);
  const db = getDb();

  if (ctx.req.method === 'GET') {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    if (!row) throw new HttpError(404, 'User tidak ditemukan.', { field: 'userId' });
    const [santriRow] = await db
      .select()
      .from(schema.santri)
      .where(eq(schema.santri.userId, id))
      .limit(1);
    return {
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        nis: santriRow?.nis ?? null,
        kelas: santriRow?.kelas ?? null,
        is_suspended: row.suspendedAt !== null,
        suspended_at: iso(row.suspendedAt),
        must_change_password: row.mustChangePassword,
        created_at: iso(row.createdAt),
        updated_at: iso(row.updatedAt),
      },
    };
  }

  if (ctx.req.method === 'PATCH' || ctx.req.method === 'PUT') {
    await requireT3Reverify(ctx, auth);
    const body = readBody(ctx);

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    if (!row) throw new HttpError(404, 'User tidak ditemukan.', { field: 'userId' });

    // Cegah super admin demote diri sendiri.
    // Boleh pindah antara super_admin <-> super_admin_tier3, tapi TIDAK boleh
    // turun ke admin/petugas/staff — kalau tidak, admin bisa mengunci dirinya
    // sendiri keluar dari panel tanpa ada jalan kembali.
    if (id === auth.sub && 'role' in body) {
      const next = String(body.role);
      if (next !== 'super_admin' && next !== 'super_admin_tier3') {
        throw new HttpError(422, 'Tidak bisa demote akun sendiri.', { field: 'role' });
      }
    }

    const patch: Record<string, unknown> = {};
    if ('name' in body) {
      const v = requireString(body, 'name', { max: 255 });
      patch.name = v;
    }
    if ('role' in body) {
      const r = requireString(body, 'role', { max: 30 });
      if (!isRole(r)) {
        throw new HttpError(422, `Role '${r}' tidak dikenal. Pilihan: ${ROLES.join(', ')}.`, {
          field: 'role',
        });
      }
      patch.role = r as Role;
    }
    if (Object.keys(patch).length === 0) {
      throw new HttpError(422, 'Tidak ada field yang di-update.', { field: 'body' });
    }

    const before = { name: row.name, role: row.role };
    const [updated] = await db
      .update(schema.users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();

    // Nama di tabel Santri ikut, karena accessor lama membaca dari sana
    if ('name' in patch) {
      await db
        .update(schema.santri)
        .set({ nama: patch.name as string })
        .where(eq(schema.santri.userId, id));
    }

    await recordAudit(
      'superadmin.user_update',
      { user_id: id, before, after: { name: updated.name, role: updated.role } },
      { userId: auth.sub, role: auth.role, resourceType: 'user', resourceId: id, ip: ctx.ip, userAgent: ctx.userAgent },
    );

    return {
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        is_suspended: updated.suspendedAt !== null,
      },
    };
  }
});
