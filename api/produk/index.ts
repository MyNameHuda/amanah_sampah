/**
 * GET  /api/produk — daftar produk (semua role ter-auth).
 * POST /api/produk — buat produk baru (staff/petugas/admin/super).
 *
 * Filter: include_archived (admin/super saja), barcode, nama, kategori, archived.
 */
import { and, eq, ilike, isNull, isNotNull } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { recordAudit } from '../../src/server/audit';
import { serializeProduk, canManageProduk } from '../../src/server/serialize';
import { isAdmin, isSuperAdmin } from '../../src/server/auth/roles';
import {
  handler, HttpError, Created, readBody, requireString, requireAuth, type Ctx,
} from '../../src/server/http';

export default handler(async (ctx: Ctx) => {
  const auth = await requireAuth(ctx);
  const db = getDb();

  if (ctx.req.method === 'GET') return list(ctx, db, auth.role);
  if (ctx.req.method === 'POST') return create(ctx, db, auth);
  throw new HttpError(405, 'Method not allowed.');
});

function flag(v: unknown): boolean {
  return v === '1' || v === 'true' || v === true;
}

async function list(ctx: Ctx, db: ReturnType<typeof getDb>, role: any) {
  const conds = [];

  // Filter archived by default (POS hanya lihat aktif).
  // include_archived hanya berlaku untuk admin/super.
  if (!(flag(ctx.req.query.include_archived) && (isAdmin(role) || isSuperAdmin(role)))) {
    conds.push(isNull(schema.produk.archivedAt));
  }
  const archived = ctx.req.query.archived;
  if (archived === 'only') conds.push(isNotNull(schema.produk.archivedAt));
  else if (archived === 'no') conds.push(isNull(schema.produk.archivedAt));

  if (ctx.req.query.barcode) conds.push(ilike(schema.produk.barcode, `%${ctx.req.query.barcode}%`));
  if (ctx.req.query.nama) conds.push(ilike(schema.produk.namaProduk, `%${ctx.req.query.nama}%`));
  if (ctx.req.query.kategori) {
    const cats = await db
      .select()
      .from(schema.kategoriProduk)
      .where(eq(schema.kategoriProduk.namaKategori, String(ctx.req.query.kategori)))
      .limit(1);
    if (cats[0]) conds.push(eq(schema.produk.idKategori, cats[0].id));
  }

  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select()
    .from(schema.produk)
    .where(where)
    .limit(200);

  const cats = await db.select().from(schema.kategoriProduk);
  const byId = new Map(cats.map((c) => [c.id, c]));

  return { data: rows.map((p) => serializeProduk(p, byId.get(p.idKategori) ?? null)) };
}

async function create(ctx: Ctx, db: ReturnType<typeof getDb>, auth: { sub: number; role: any }) {
  if (!canManageProduk(auth.role)) {
    throw new HttpError(422, 'Akses ditolak.', { field: 'auth' });
  }
  const body = readBody(ctx);
  const barcode = requireString(body, 'barcode', { max: 50 });
  const namaProduk = requireString(body, 'nama_produk', { max: 100 });
  const idKategori = Number(body.id_kategori);
  if (!Number.isInteger(idKategori)) {
    throw new HttpError(422, 'Kolom id_kategori wajib diisi.', { field: 'id_kategori' });
  }
  const isExcluded =
    body.is_excluded_from_debit === true || body.is_excluded_from_debit === 1 ||
    body.is_excluded_from_debit === '1' || body.is_excluded_from_debit === 'true';

  const dup = await db.select().from(schema.produk).where(eq(schema.produk.barcode, barcode)).limit(1);
  if (dup.length) {
    throw new HttpError(422, 'Barcode sudah dipakai.', { field: 'barcode' });
  }
  const cat = await db
    .select()
    .from(schema.kategoriProduk)
    .where(eq(schema.kategoriProduk.id, idKategori))
    .limit(1);
  if (!cat.length) {
    throw new HttpError(422, 'Kategori tidak ditemukan.', { field: 'id_kategori' });
  }

  const now = new Date();
  const [produk] = await db
    .insert(schema.produk)
    .values({
      barcode,
      namaProduk,
      idKategori,
      isExcludedFromDebit: isExcluded,
      createdBy: auth.sub,
      updatedBy: auth.sub,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await recordAudit(
    'produk.create',
    { barcode, nama_produk: namaProduk, created_by: auth.sub, role: auth.role },
    { userId: auth.sub, role: auth.role, resourceType: 'produk', resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return Created({ produk: serializeProduk(produk, cat[0]) });
}

