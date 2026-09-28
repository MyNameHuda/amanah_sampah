/**
 * GET  /api/super-admin/users — daftar user + filter
 * POST /api/super-admin/users — buat user baru
 *
 * Create user adalah operasi yang mengubah hak akses, jadi T3 WAJIB
 * re-verify password dulu.
 */
import { and, asc, eq, or, ilike, isNull, isNotNull } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { recordAudit } from '../../../src/server/audit';
import { hashPassword, checkPasswordPolicy } from '../../../src/server/auth/password';
import { requireT3Reverify } from '../../../src/server/auth/t3';
import { ROLES, type Role, isRole } from '../../../src/server/auth/roles';
import { requireSuperAdmin, iso } from '../../../src/server/http-guards';
import { handler, HttpError, Created, readBody, requireString, optionalString, requireAuth, type Ctx } from '../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const db = getDb();

  if (ctx.req.method === 'GET') return list(ctx, db, auth.role);
  if (ctx.req.method === 'POST') return create(ctx, db, auth);
  throw new HttpError(405, 'Method not allowed.');
});

async function list(ctx: Ctx, db: ReturnType<typeof getDb>, role: Role) {
  void role;
  const conds = [];
  if (ctx.req.query.suspended === '1' || ctx.req.query.suspended === 'true') {
    conds.push(isNotNull(schema.users.suspendedAt));
  } else if (ctx.req.query.suspended === '0') {
    conds.push(isNull(schema.users.suspendedAt));
  }
  const roleFilter = ctx.req.query.role;
  if (roleFilter && isRole(String(roleFilter))) {
    conds.push(eq(schema.users.role, String(roleFilter) as Role));
  }
  const q = String(ctx.req.query.q ?? '').trim();
  if (q) {
    conds.push(or(ilike(schema.users.name, `%${q}%`), ilike(schema.users.email, `%${q}%`)));
  }
  const where = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select()
    .from(schema.users)
    .where(where)
    .orderBy(asc(schema.users.name))
    .limit(200);

  const nisByUser = await db
    .select({ userId: schema.santri.userId, nis: schema.santri.nis })
    .from(schema.santri);
  const nisMap = new Map(nisByUser.map((s) => [s.userId, s.nis]));

  return {
    data: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      nis: nisMap.get(u.id) ?? null,
      is_suspended: u.suspendedAt !== null,
      suspended_at: iso(u.suspendedAt),
      must_change_password: u.mustChangePassword,
      created_at: iso(u.createdAt),
      updated_at: iso(u.updatedAt),
    })),
  };
}

async function create(ctx: Ctx, db: ReturnType<typeof getDb>, auth: { sub: number; role: Role }) {
  // Operasi yang mengubah hak akses -> T3 wajib re-verify
  await requireT3Reverify(ctx, auth);

  const body = readBody(ctx);
  const name = requireString(body, 'name', { max: 255 });
  const roleRaw = requireString(body, 'role', { max: 30 });
  const email = optionalString(body, 'email') ?? null;
  const password = requireString(body, 'password', { min: 8, max: 255 });
  const nis = optionalString(body, 'nis') ?? null;
  const kelas = optionalString(body, 'kelas') ?? null;
  const asrama = optionalString(body, 'asrama') ?? null;
  const mustChange =
    body.must_change_password === undefined ? true : body.must_change_password === true;

  if (!isRole(roleRaw)) {
    throw new HttpError(422, `Role '${roleRaw}' tidak dikenal. Pilihan: ${ROLES.join(', ')}.`, {
      field: 'role',
    });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(422, 'Format email tidak valid.', { field: 'email' });
  }
  // Password default untuk Santri boleh lemah (siswa belum tahu password-nya),
  // jadi policy di sini sengaja lebih ketat untuk role lain.
  //assisI create code.
  const policy = checkPasswordPolicy(password);
  if (!policy.ok && roleRaw !== 'santri') {
    throw new HttpError(422, 'Password tidak memenuhi syarat.', {
      field: 'password',
    });
  }
  if (nis) {
    if (nis.length > 20) {
      throw new HttpError(422, 'NIS maksimal 20 karakter.', { field: 'nis' });
    }
    if (roleRaw !== 'santri') {
      throw new HttpError(422, 'NIS hanya boleh diisi untuk role Santri.', { field: 'nis' });
    }
  }

  if (email) {
    const dup = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (dup.length) {
      throw new HttpError(422, 'Email sudah dipakai.', { field: 'email' });
    }
  }
  if (nis) {
    const dup = await db.select().from(schema.santri).where(eq(schema.santri.nis, nis)).limit(1);
    if (dup.length) {
      throw new HttpError(422, 'NIS sudah dipakai.', { field: 'nis' });
    }
  }

  const now = new Date();
  const [user] = await db
    .insert(schema.users)
    .values({
      email,
      name,
      role: roleRaw,
      password: await hashPassword(password),
      mustChangePassword: mustChange,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.users.id });

  if (nis) {
    await db.insert(schema.santri).values({
      nis,
      userId: user.id,
      nama: name,
      kelas: kelas ?? '-',
      asrama,
      currentPoin: 0,
      isBlocked: false,
      createdAt: now,
      updatedAt: now,
    });
    // Baris pembuka di poin_ledger
    await db.insert(schema.poinLedger).values({
      nis,
      sourceType: 'initial',
      sourceId: null,
      poinDelta: 0,
      saldoSebelum: 0,
      saldoSesudah: 0,
      waktu: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  await recordAudit(
    'superadmin.user_create',
    { user_id: user.id, role: roleRaw, nis, has_email: !!email },
    { userId: auth.sub, role: auth.role, resourceType: 'user', resourceId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return Created({ user: { id: user.id, name, email, role: roleRaw, nis } });
}
