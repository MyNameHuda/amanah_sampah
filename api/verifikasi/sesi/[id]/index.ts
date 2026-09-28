/**
 * GET /api/verifikasi/sesi/{id} — lihat sesi + items.
 *
 * Ini juga endpoint RESUME. Response-nya sengaja dibuat sama persis dengan
 * response openSesi (sesi + open_debts + santri) supaya frontend bisa
 * melanjutkan sesi yang terputus (browser di-close, halaman di-refresh, HP
 * masuk sleep) tanpa endpoint tambahan.
 *
 * Tanpa ini, petugas yang refresh di tengah sesi terkunci: tidak bisa lanjut,
 * tidak bisa mulai ulang, dan item yang sudah dikerjakan tidak bisa di-commit.
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../../src/server/db/index';
import { isAdmin, isSuperAdmin } from '../../../../src/server/auth/roles';
import {
  openDebtsFor, presentSantri, presentSesi, productNameMap,
} from '../../../../src/server/verifikasi';
import { handler, HttpError, requireAuth, type Ctx } from '../../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
  const auth = await requireAuth(ctx);

  const id = Number(ctx.req.query.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, 'id sesi tidak valid.', { field: 'id' });
  }

  const db = getDb();
  const [sesi] = await db.select().from(schema.sesiVerifikasi).where(eq(schema.sesiVerifikasi.id, id)).limit(1);
  if (!sesi) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan.', { field: 'id' });

  // Pemilik sesi, admin, atau super admin
  if (sesi.petugasId !== auth.sub && !isAdmin(auth.role) && !isSuperAdmin(auth.role)) {
    throw new HttpError(422, 'Akses ditolak.', { field: 'sesi' });
  }

  const items = await db
    .select()
    .from(schema.sesiVerifikasiItems)
    .where(eq(schema.sesiVerifikasiItems.idSesi, id));

  const nameMap = await productNameMap(items.map((i) => i.barcode));

  return {
    sesi: presentSesi(sesi, items, nameMap),
    open_debts: await openDebtsFor(sesi.nis),
    santri: await presentSantri(sesi.nis),
  };
});
