/**
 * GET  /api/santri  — daftar siswa (admin)
 * POST /api/santri  — buat siswa baru (admin)
 *
 * Kontrak dari SantriController.php. `index` memakai paginate(50) Laravel
 * dengan bentuk: { data, current_page, last_page, per_page, total, from, to }
 */
import { and, or, eq, ilike, isNull, count, asc, inArray } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { hashPassword } from '../../src/server/auth/password';
import { recordAudit } from '../../src/server/audit';
import { requireAdminOrSuper } from '../../src/server/http-guards';
import {
  handler, HttpError, Created, readBody, requireString, optionalString, requireAuth, type Ctx,
} from '../../src/server/http';
import { serializeSantri } from '../../src/server/http-guards';

export default handler(async (ctx: Ctx) => {
  const auth = await requireAuth(ctx);
  const db = getDb();

  if (ctx.req.method === 'GET') return list(ctx, db);
  if (ctx.req.method === 'POST') return create(ctx, db, auth.sub, auth.role);
  throw new HttpError(405, 'Method not allowed.');
});

async function list(ctx: Ctx, db: ReturnType<typeof getDb>) {
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);

  const q = typeof ctx.req.query.q === 'string' ? ctx.req.query.q : '';
  const blocked = ctx.req.query.blocked === '1' || ctx.req.query.blocked === 'true';
  const active = ctx.req.query.active === '1' || ctx.req.query.active === 'true';
  const page = Math.max(1, Number(ctx.req.query.page ?? 1) || 1);
  const perPage = 50;

  const conds = [];
  if (q) {
    const pat = `%${q}%`;
    conds.push(
      or(
        ilike(schema.santri.nis, pat),
        ilike(schema.santri.nama, pat),
        ilike(schema.santri.kelas, pat),
      ),
    );
  }
  if (blocked) conds.push(eq(schema.santri.isBlocked, true));
  if (active) conds.push(isNull(schema.santri.archivedAt));
  const where = conds.length ? and(...conds) : undefined;

  const [{ n: total }] = await db
    .select({ n: count() })
    .from(schema.santri)
    .where(where);

  const rows = await db
    .select()
    .from(schema.santri)
    .where(where)
    .orderBy(asc(schema.santri.nama))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const ids = rows.map((r) => r.userId);
  // Santri with user - nama diambil dari users.name (sumber kebenaran)
  const users = ids.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, ids))
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const data = rows.map((r) => serializeSantri({ ...r, userName: nameById.get(r.userId) }));
  const from = rows.length ? (page - 1) * perPage + 1 : 0;
  const to = from + rows.length - 1;

  return {
    data,
    current_page: page,
    last_page: Math.max(1, Math.ceil(Number(total) / perPage)),
    per_page: perPage,
    total: Number(total),
    from: from || null,
    to: to > 0 ? to : null,
  };
}

async function create(
  ctx: Ctx,
  db: ReturnType<typeof getDb>,
  userId: number,
  role: any,
) {
  requireAdminOrSuper(role);
  const body = readBody(ctx);

  const nis = requireString(body, 'nis', { max: 20 });
  const nama = requireString(body, 'nama', { max: 100 });
  const kelas = requireString(body, 'kelas', { max: 30 });
  const asrama = optionalString(body, 'asrama') ?? null;
  const email = optionalString(body, 'email') ?? null;
  const givenPw = optionalString(body, 'default_password') ?? null;

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(422, 'Format email tidak valid.', { field: 'email' });
  }
  if (givenPw !== null && givenPw.length < 8) {
    throw new HttpError(422, 'default_password minimal 8 karakter.', {
      field: 'default_password',
    });
  }

  const nisTaken = await db.select().from(schema.santri).where(eq(schema.santri.nis, nis)).limit(1);
  if (nisTaken.length) {
    throw new HttpError(422, 'NIS sudah terdaftar.', { field: 'nis' });
  }
  if (email) {
    const mailTaken = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (mailTaken.length) {
      throw new HttpError(422, 'Email sudah terdaftar.', { field: 'email' });
    }
  }

  // Default password: SANTRI + 4 digit terakhir NIS (asli Laravel)
  const defaultPassword = givenPw ?? `SANTRI${nis.slice(-4)}`;
  const now = new Date();

  const [newUser] = await db
    .insert(schema.users)
    .values({
      email,
      name: nama,
      role: 'santri',
      password: await hashPassword(defaultPassword),
      // [v1.1] paksa ganti password di login pertama
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.users.id });

  const [santri] = await db
    .insert(schema.santri)
    .values({
      nis,
      userId: newUser.id,
      nama,
      kelas,
      asrama,
      currentPoin: 0, // [v2] mulai dari 0
      isBlocked: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Baris pembuka di poin_ledger (tanpa delta)
  await db.insert(schema.poinLedger).values({
    nis:santri.nis,
    sourceType: 'initial',
    sourceId: null,
    poinDelta: 0,
    saldoSebelum: 0,
    saldoSesudah: 0,
    waktu: now,
    createdAt: now,
    updatedAt: now,
  });

  await recordAudit('santri.create', { nis }, {
    userId, role, resourceType: 'santri', resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent,
  });

  return Created({
    santri: serializeSantri({ ...santri, userName: nama }),
    // Ditampilkan SEKALI saja di response — frontend wajib menyimpannya
    // (frontend menyimpannya lalu menampilkannya ke siswa).
    default_password: defaultPassword,
    message:
      'Siswa baru dibuat. Default password ditampilkan sekali — sampaikan ke siswa untuk force change at first login.',
  });
}

