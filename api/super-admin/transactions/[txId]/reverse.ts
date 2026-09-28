/**
 * POST /api/super-admin/transactions/{txId}/reverse — T3.1: reverse transaksi.
 *
 * Ini operasi yang paling mudah merusak integritas buku besar, jadi
 * dijaga berlapis:
 *   1. WAJIB read-only mode aktif dulu (G-SU-03). Read-only membuat semua
 *     jalur tulis lain tertutup, jadi satu-satunya perubahan yang sedang
 *     berjalan adalah reverse ini sendiri.
 *   2. Alasan WAJIB min 30 karakter (lebih ketat dari 10 di endpoint lain).
 *   3. Password WAJIB diulang di body (field `password_reverify`).
 *   4. Saldo siswa dikunci (SELECT FOR UPDATE) supaya tidak bisa bentrok.
 *
 * Reverse tidak menghapus transaksi — dia menandai `cancelled` dan menulis
 * baris COMPENSATING di poin_ledger. Jejak aslinya tetap utuh, yang
 * dibutuhkan supaya audit bisa merekonstruksi apa yang terjadi.
 */
import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../../src/server/db/index';
import { recordAudit } from '../../../../src/server/audit';
import { isReadOnly, getNegativeLimit } from '../../../../src/server/config';
import { requireSuperAdmin } from '../../../../src/server/http-guards';
import {
  handler, HttpError, readBody, requireString, requireAuth, type Ctx,
} from '../../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST' && ctx.req.method !== 'PATCH') {
    throw new HttpError(405, 'Method not allowed.');
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);

  // [G-SU-03] read-only WAJIB aktif lebih dulu
  if (!(await isReadOnly())) {
    throw new HttpError(422, 'Read-only mode harus diaktifkan dulu sebelum reverse transactions (G-SU-03).', {
      field: 'mode',
    });
  }

  const txId = Number(ctx.req.query.txId);
  if (!Number.isInteger(txId)) {
    throw new HttpError(422, 'txId tidak valid.', { field: 'txId' });
  }

  const body = readBody(ctx);
  const alasan = requireString(body, 'alasan', { min: 30, max: 500 });
  const reverify = requireString(body, 'password_reverify', { min: 1, max: 255 });
  void reverify; // diverifikasi oleh helper T3 di bawah

  // Password diverifikasi di sini (bukan lewat helper T3) karena aslinya
  // memakai field `password_reverify`, bukan `password`.
  const { verifyPassword } = await import('../../../../src/server/auth/password');
  const db0 = getDb();
  const [me] = await db0
    .select({ password: schema.users.password })
    .from(schema.users)
    .where(eq(schema.users.id, auth.sub))
    .limit(1);
  if (!me || !(await verifyPassword(reverify, me.password))) {
    throw new HttpError(422, 'Password salah.', { field: 'password_reverify' });
  }

  const db = getDb();
  const [tx] = await db
    .select()
    .from(schema.transaksiPembelian)
    .where(eq(schema.transaksiPembelian.id, txId))
    .limit(1);
  if (!tx) throw new HttpError(404, 'Transaksi tidak ditemukan.', { field: 'txId' });
  if (tx.status === 'cancelled') {
    throw new HttpError(422, 'Transaksi sudah di-reverse.', { field: 'tx' });
  }

  const now = new Date();
  let before = 0;
  let after = 0;
  let isBlocked = false;
  // Compensating: kebalikan dari penalti. tx sebelumnya -1 per unit,
  // jadi reverse mengembalikan +1 per unit.
  const compDelta = -tx.penaltyPerUnit * tx.qty;

  await db.transaction(async (tx2) => {
    // Kunci baris siswa
    await tx2.execute(
      (await import('drizzle-orm')).sql`select current_poin from santri where nis = ${tx.nis} for update`,
    );
    const [santri] = await tx2
      .select()
      .from(schema.santri)
      .where(eq(schema.santri.nis, tx.nis))
      .limit(1);
    if (!santri) throw new HttpError(404, 'Data siswa tidak ditemukan.', { field: 'nis' });

    before = santri.currentPoin;
    after = before + compDelta;

    await tx2.insert(schema.poinLedger).values({
      nis: tx.nis,
      sourceType: 'admin_adjustment',
      sourceId: tx.id,
      poinDelta: compDelta,
      saldoSebelum: before,
      saldoSesudah: after,
      waktu: now,
      createdAt: now,
      updatedAt: now,
    });

    const limit = await getNegativeLimit();
    isBlocked = after <= limit;

    await tx2
      .update(schema.santri)
      .set({
        currentPoin: after,
        isBlocked,
        ...(isBlocked ? {} : { blockReason: null, blockAt: null }),
        updatedAt: now,
      })
      .where(eq(schema.santri.nis, tx.nis));

    await tx2
      .update(schema.transaksiPembelian)
      .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
      .where(eq(schema.transaksiPembelian.id, txId));
  });

  await recordAudit(
    'superadmin.reverse_transaction',
    { tx_id: tx.id, nis: tx.nis, compensating_poin_delta: compDelta },
    { userId: auth.sub, role: auth.role, resourceType: 'transaksi', resourceId: tx.id, adminAlasan: alasan, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    message: `Transaksi #${tx.id} di-reverse. Compensating poin: ${compDelta > 0 ? '+' : ''}${compDelta}`,
    tx: { id: tx.id, nis: tx.nis, barcode: tx.barcode, qty: tx.qty, status: 'cancelled', cancelled_at: now },
    santri: { nis: tx.nis, current_poin: after, is_blocked: isBlocked },
  };
});
