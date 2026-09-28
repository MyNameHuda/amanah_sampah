/**
 * PATCH  /api/produk/{barcode} — update nama / kategori / flag debit
 * DELETE /api/produk/{barcode} — archive (soft-delete)
 *
 * Otorisasi: canEditProduk() = petugas, admin, super admin.
 * Staff kantin hanya bisa tambah (POST), tidak bisa edit/archive.
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { recordAudit } from '../../../src/server/audit';
import { serializeProduk, canEditProduk } from '../../../src/server/serialize';
import { handler, HttpError, readBody, requireAuth, type Ctx } from '../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  const auth = await requireAuth(ctx);
  const barcode = String(ctx.req.query.barcode ?? '').trim();
  if (!barcode) throw new HttpError(422, 'Barcode wajib diisi.', { field: 'barcode' });

  if (ctx.req.method === 'PATCH') return update(ctx, barcode, auth);
  if (ctx.req.method === 'DELETE') return archive(ctx, barcode, auth);
  throw new HttpError(405, 'Method not allowed.');
});

function flag(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true';
}

async function load(db: ReturnType<typeof getDb>, barcode: string) {
  const rows = await db.select().from(schema.produk).where(eq(schema.produk.barcode, barcode)).limit(1);
  if (!rows[0]) throw new HttpError(404, 'Produk tidak ditemukan.', { field: 'barcode' });
  const cat = await db
    .select()
    .from(schema.kategoriProduk)
    .where(eq(schema.kategoriProduk.id, rows[0].idKategori))
    .limit(1);
  return { produk: rows[0], kategori: cat[0] ?? null };
}

async function update(ctx: Ctx, barcode: string, auth: { sub: number; role: any }) {
  if (!canEditProduk(auth.role)) {
    throw new HttpError(422, 'Akses ditolak.', { field: 'auth' });
  }
  const db = getDb();
  const { produk, kategori } = await load(db, barcode);

  if (produk.archivedAt) {
    throw new HttpError(422, 'Produk sudah di-archive. Unarchive dulu untuk edit.', {
      field: 'produk',
    });
  }

  const body = readBody(ctx);
  const patch: Record<string, unknown> = {};
  if ('nama_produk' in body) {
    const v = body.nama_produk;
    if (typeof v !== 'string' || v.trim() === '') {
      throw new HttpError(422, 'Kolom nama_produk wajib diisi.', { field: 'nama_produk' });
    }
    if (v.length > 100) {
      throw new HttpError(422, 'nama_produk maksimal 100 karakter.', { field: 'nama_produk' });
    }
    patch.namaProduk = v.trim();
  }
  if ('id_kategori' in body) {
    const id = Number(body.id_kategori);
    if (!Number.isInteger(id)) {
      throw new HttpError(422, 'id_kategori tidak valid.', { field: 'id_kategori' });
    }
    const cat = await db
      .select()
      .from(schema.kategoriProduk)
      .where(eq(schema.kategoriProduk.id, id))
      .limit(1);
    if (!cat.length) {
      throw new HttpError(422, 'Kategori tidak ditemukan.', { field: 'id_kategori' });
    }
    patch.idKategori = id;
  }
  if ('is_excluded_from_debit' in body) {
    patch.isExcludedFromDebit = flag(body.is_excluded_from_debit);
  }
  if (Object.keys(patch).length === 0) {
    throw new HttpError(422, 'Tidak ada field yang di-update.', { field: 'body' });
  }

  const before = {
    nama_produk: produk.namaProduk,
    id_kategori: produk.idKategori,
    is_excluded_from_debit: produk.isExcludedFromDebit,
  };

  const [updated] = await db
    .update(schema.produk)
    .set({ ...patch, updatedBy: auth.sub, updatedAt: new Date() })
    .where(eq(schema.produk.barcode, barcode))
    .returning();

  const catAfter = await db
    .select()
    .from(schema.kategoriProduk)
    .where(eq(schema.kategoriProduk.id, updated.idKategori))
    .limit(1);

  await recordAudit(
    'produk.update',
    {
      barcode,
      before,
      after: {
        nama_produk: updated.namaProduk,
        id_kategori: updated.idKategori,
        is_excluded_from_debit: updated.isExcludedFromDebit,
      },
      updated_by: auth.sub,
    },
    { userId: auth.sub, role: auth.role, resourceType: 'produk', resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return { produk: serializeProduk(updated, catAfter[0] ?? kategori) };
}

async function archive(ctx: Ctx, barcode: string, auth: { sub: number; role: any }) {
  if (!canEditProduk(auth.role)) {
    throw new HttpError(422, 'Akses ditolak.', { field: 'auth' });
  }
  const db = getDb();
  const { produk } = await load(db, barcode);
  const now = new Date();

  const [updated] = await db
    .update(schema.produk)
    .set({ archivedAt: now, archivedBy: auth.sub, updatedBy: auth.sub, updatedAt: now })
    .where(eq(schema.produk.barcode, barcode))
    .returning();

  await recordAudit(
    'produk.archive',
    { barcode, nama_produk: produk.namaProduk, archived_by: auth.sub },
    { userId: auth.sub, role: auth.role, resourceType: 'produk', resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    message: `Produk '${produk.namaProduk}' sudah di-archive. Tidak akan muncul di POS lagi.`,
    produk: serializeProduk(updated),
  };
}
