/**
 * GET /api/auth/me
 *
 * Dipanggil AuthContext saat restore sesi. Bentuk response WAJIB sama
 * dengan yang dipakai frontend:
 *   { id, name, email, role, suspended_at, must_change_password, ... }
 * Plus untuk Santri: { santri, prior_open_count, penalty_tier }
 */
import { eq, and, count } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { isSantri } from '../../src/server/auth/roles';
import { handler, HttpError, requireAuth, type Ctx } from '../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET' && ctx.req.method !== 'POST') {
    throw new HttpError(405, 'Method not allowed.');
  }

  const auth = await requireAuth(ctx);
  const db = getDb();

  // Selalu baca user terbaru dari DB — jangan percaya klaim di JWT,
  // supaya suspend / ganti role langsung berlaku tanpa perlu login ulang.
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      suspendedAt: schema.users.suspendedAt,
      mustChangePassword: schema.users.mustChangePassword,
    })
    .from(schema.users)
    .where(eq(schema.users.id, auth.sub))
    .limit(1);

  const user = rows[0];
  if (!user) throw new HttpError(401, 'User tidak ditemukan.');

  const base: Record<string, unknown> = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    suspended_at: user.suspendedAt ? user.suspendedAt.toISOString() : null,
    must_change_password: Boolean(user.mustChangePassword),
  };

  // --- Tambahan khusus Santri ---------------------------------------------
  if (isSantri(user.role)) {
    const rows2 = await db
      .select({
        nis: schema.santri.nis,
        kelas: schema.santri.kelas,
        asrama: schema.santri.asrama,
        currentPoin: schema.santri.currentPoin,
        isBlocked: schema.santri.isBlocked,
        blockReason: schema.santri.blockReason,
        blockAt: schema.santri.blockAt,
        archivedAt: schema.santri.archivedAt,
      })
      .from(schema.santri)
      .where(eq(schema.santri.userId, user.id))
      .limit(1);

    const row = rows2[0];
    if (row) {
      // `nama` accessor di Laravel me-return SELALU dari users.name
      // (sumber kebenaran), bukan dari kolomDB. Lihat
      // Santri::getNamaAttribute() di model aslinya.
      base.santri = {
        nis: row.nis,
        nama: user.name,
        kelas: row.kelas,
        asrama: row.asrama,
        current_poin: row.currentPoin,
        is_blocked: row.isBlocked,
        block_reason: row.blockReason,
        block_at: row.blockAt ? row.blockAt.toISOString() : null,
        archived_at: row.archivedAt ? row.archivedAt.toISOString() : null,
        // `is_suspended` = keputusan admin (users.suspended_at), BEDA dari
        // `is_blocked` yang berbasis saldo poin.
        // Lihat Santri::isAccountSuspended() di model aslinya.
        is_suspended: Boolean(user.suspendedAt),
      };

      // prior_open_count = jumlah transaksi_pembelian status 'open' untuk
      // NIS ini, GLOBAL lintas semua produk (DECISION-LOG §D5).
      const [openRow] = await db
        .select({ n: count() })
        .from(schema.transaksiPembelian)
        .where(
          and(
            eq(schema.transaksiPembelian.nis, row.nis),
            eq(schema.transaksiPembelian.status, 'open'),
          ),
        );
      base.prior_open_count = Number(openRow?.n ?? 0);

      // Penalty tier dihapus (F-change): tiap unit plastik = -1 poin FLAT.
      // Field ini dipertahankan karena frontend masih membacanya.
      base.penalty_tier = -1;
    }
  }

  return base;
});
