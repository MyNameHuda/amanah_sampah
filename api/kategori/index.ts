/**
 * GET  /api/kategori - daftar kategori + produknya
 * POST /api/kategori - buat kategori baru (staff/petugas/admin/super)
 */
import { eq, asc, inArray } from 'drizzle-orm';

import { getDb, schema } from '../../src/server/db/index';

import { recordAudit } from '../../src/server/audit';

import { serializeKategori, serializeProduk, canManageProduk } from '../../src/server/serialize';

import {

  handler, HttpError, Created, readBody, requireString, optionalString, requireAuth, type Ctx,

} from '../../src/server/http';



export default handler(async (ctx: Ctx) => {

  const auth = await requireAuth(ctx);

  const db = getDb();



  if (ctx.req.method === 'GET') {

    // KategoriProduk::with('produk') - tiap kategori membawa produknya

    const cats = await db

      .select()

      .from(schema.kategoriProduk)

      .orderBy(asc(schema.kategoriProduk.namaKategori));



    const ids = cats.map((c) => c.id);

    const prods = ids.length

      ? await db

          .select()

          .from(schema.produk)

          .where(inArray(schema.produk.idKategori, ids))

          .orderBy(asc(schema.produk.namaProduk))

      : [];

    void prods;



    const data = cats.map((c) => ({

      ...serializeKategori(c),

      produk: prods.filter((p) => p.idKategori === c.id).map((p) => serializeProduk(p)),

    }));

    return { data };

  }



  if (ctx.req.method === 'POST') {

    if (!canManageProduk(auth.role)) {

      throw new HttpError(422, 'Akses ditolak.', { field: 'auth' });

    }

    const body = readBody(ctx);

    const nama = requireString(body, 'nama_kategori', { max: 50 });

    const deskripsi = optionalString(body, 'deskripsi') ?? null;

    const isDefaultExcluded =

      body.is_default_excluded === true || body.is_default_excluded === 1 ||

      body.is_default_excluded === '1' || body.is_default_excluded === 'true';



    if (deskripsi !== null && deskripsi.length > 500) {

      throw new HttpError(422, 'deskripsi maksimal 500 karakter.', { field: 'deskripsi' });

    }



    const dup = await db

      .select()

      .from(schema.kategoriProduk)

      .where(eq(schema.kategoriProduk.namaKategori, nama))

      .limit(1);

    if (dup.length) {

      throw new HttpError(422, 'Nama kategori sudah dipakai.', { field: 'nama_kategori' });

    }



    const now = new Date();

    const [kat] = await db

      .insert(schema.kategoriProduk)

      .values({ namaKategori: nama, deskripsi, isDefaultExcluded, createdAt: now, updatedAt: now })

      .returning();



    await recordAudit(

      'kategori.create',

      { id: kat.id, name: kat.namaKategori, is_default_excluded: kat.isDefaultExcluded, created_by: auth.sub, role: auth.role },

      { userId: auth.sub, role: auth.role, resourceType: 'kategori', resourceId: kat.id, ip: ctx.ip, userAgent: ctx.userAgent },

    );



    return Created({ kategori: serializeKategori(kat) });

  }



  throw new HttpError(405, 'Method not allowed.');

});


