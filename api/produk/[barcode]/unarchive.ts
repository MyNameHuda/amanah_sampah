/**
 * POST /api/produk/{barcode}/unarchive — restore produk.
 * HANYA super admin (sesuai PRD T3 intervensi).
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { recordAudit } from '../../../src/server/audit';
import { serializeProduk } from '../../../src/server/serialize';
import { isSuperAdmin } from '../../../src/server/auth/roles';
import { handler, HttpError, requireAuth, type Ctx } from '../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  const auth = await requireAuth(ctx);

  if (!isSuperAdmin(auth.role)) {
    throw new HttpError(422, 'Akses ditolak — super admin only.', { field: 'auth' });
  }

  const barcode = String(ctx.req.query.barcode ?? '').trim();
  if (!barcode) throw new HttpError(422, 'Barcode wajib diisi.', { field: 'barcode' });

  const db = getDb();
  const rows = await db.select().from(schema.produk).where(eq(schema.produk.barcode, barcode)).limit(1);
  const produk = rows[0];
  if (!produk) throw new HttpError(404, 'Produk tidak ditemukan.', { field: 'barcode' });
  if (!produk.archivedAt) {
    throw new HttpError(422, 'Produk tidak dalam keadaan archived.', { field: 'produk' });
  }

  const now = new Date();
  const [updated] = await db
    .update(schema.produk)
    .set({ archivedAt: null, archivedBy: null, updatedBy: auth.sub, updatedAt: now })
    .where(eq(schema.produk.barcode, barcode))
    .returning();

  await recordAudit(
    'produk.unarchive',
    { barcode, restored_by: auth.sub },
    { userId: auth.sub, role: auth.role, resourceType: 'produk', resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    message: `Produk '${produk.namaProduk}' sudah di-restore.`,
    produk: serializeProduk(updated),
  };
});
