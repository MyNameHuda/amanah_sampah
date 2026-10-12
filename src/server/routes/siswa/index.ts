/**
 * GET  /api/siswa  — daftar siswa (admin)
 * POST /api/siswa  — buat siswa baru (admin)
 *
 * Kontrak dari SiswaController.php. `index` memakai paginate(50) Laravel
 * dengan bentuk: { data, current_page, last_page, per_page, total, from, to }
 */
import { and, or, eq, ilike, isNull, count, asc, inArray } from 'drizzle-orm';
import { getDb, schema } from '../../db/index.ts';
import { hashPassword } from '../../auth/password.ts';
import { recordAudit } from '../../audit.ts';
import { requireAdminOrSuper } from '../../http-guards.ts';
import {
  handler, HttpError, Created, readBody, requireString, optionalString, requireAuth, type Ctx,
} from '../../http.ts';
import { serializeSiswa } from '../../http-guards.ts';

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
        ilike(schema.siswa.nis, pat),
        ilike(schema.siswa.nama, pat),
        ilike(schema.siswa.kelas, pat),
      ),
    );
  }
  if (blocked) conds.push(eq(schema.siswa.isBlocked, true));
  if (active) conds.push(isNull(schema.siswa.archivedAt));
  const where = conds.length ? and(...conds) : undefined;

  const [{ n: total }] = await db
    .select({ n: count() })
    .from(schema.siswa)
    .where(where);

  const rows = await db
    .select()
    .from(schema.siswa)
    .where(where)
    .orderBy(asc(schema.siswa.nama))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const ids = rows.map((r) => r.userId);
  // Siswa with user - nama diambil dari users.name (sumber kebenaran)
  const users = ids.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, ids))
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const data = rows.map((r) => serializeSiswa({ ...r, userName: nameById.get(r.userId) }));
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

  const nisTaken = await db.select().from(schema.siswa).where(eq(schema.siswa.nis, nis)).limit(1);
  if (nisTaken.length) {
    throw new HttpError(422, 'NIS sudah terdaftar.', { field: 'nis' });
  }
  if (email) {
    const mailTaken = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (mailTaken.length) {
      throw new HttpError(422, 'Email sudah terdaftar.', { field: 'email' });
    }
  }

  // Default password: SISWA + 4 digit terakhir NIS (asli Laravel)
  const defaultPassword = givenPw ?? `SISWA${nis.slice(-4)}`;
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

  const [siswa] = await db
    .insert(schema.siswa)
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
    nis:siswa.nis,
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
    siswa: serializeSiswa({ ...siswa, userName: nama }),
    // Ditampilkan SEKALI saja di response — frontend wajib menyimpannya
    // (frontend menyimpannya lalu menampilkannya ke siswa).
    default_password: defaultPassword,
    message:
      'Siswa baru dibuat. Default password ditampilkan sekali — sampaikan ke siswa untuk force change at first login.',
  });
}

