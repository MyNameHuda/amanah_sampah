/**
 * POST /api/verifikasi/sesi/{id}/commit — finalisasi sesi.
 *
 * Ini endpoint yang BENAR-BENAR mengubah saldo poin, jadi dua hal dijaga:
 *
 * 1. ATOMIK. Semua (FIFO allocation, ledger, update saldo, tutup sesi)
 *    dalam satu db.transaction(). Kalau update saldo gagal setelah
 *    transaksi sudah di-settle, siswa kehilangan utang DAN poinnya.
 *
 * 2. FIFO PER ITEM dengan split row.
 *    Versi lama (v1.0) melakukan bulk update "mark all open as settled"
 *    untuk NIS itu. Akibatnya utang produk LAIN ikut ter-clear walaupun
 *    tidak di-match. Sekarang: iterate per item, settle hanya transaksi
 *    dengan barcode yang cocok (FIFO, urut waktu lalu id), dan kalau
 *    partial match, baris di-SPLIT supaya jejaknya tetap utuh.
 */
import { and, eq, asc, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../../src/server/db/index';
import { recordAudit } from '../../../../src/server/audit';
import { assertSantriNotSuspended } from '../../../../src/server/verifikasi';
import { handler, HttpError, requireAuth, type Ctx } from '../../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  const auth = await requireAuth(ctx);

  const id = Number(ctx.req.query.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, 'id sesi tidak valid.', { field: 'id' });
  }

  const db = getDb();

  const [sesi] = await db
    .select()
    .from(schema.sesiVerifikasi)
    .where(eq(schema.sesiVerifikasi.id, id))
    .limit(1);
  if (!sesi) throw new HttpError(404, 'Sesi verifikasi tidak ditemukan.', { field: 'id' });
  if (sesi.waktuSelesai) {
    throw new HttpError(422, 'Sesi sudah di-commit.', { field: 'sesi' });
  }

  await assertSantriNotSuspended(sesi.nis, auth.role);

  const items = await db
    .select()
    .from(schema.sesiVerifikasiItems)
    .where(eq(schema.sesiVerifikasiItems.idSesi, id));

  const now = new Date();
  let saldoAkhir = 0;
  let saldoSebelum = 0;
  let totalDelta = 0;
  const matched: { tx_id: number; barcode: string; qty: number }[] = [];

  await db.transaction(async (tx) => {
    // Kunci baris siswa: mencegah dua commit bersamaan mengubah saldo baris sama
    await tx.execute(
      sql`select current_poin from santri where nis = ${sesi.nis} for update`,
    );
    const [row] = await tx
      .select()
      .from(schema.santri)
      .where(eq(schema.santri.nis, sesi.nis))
      .limit(1);
    if (!row) throw new HttpError(404, 'Data siswa tidak ditemukan.', { field: 'nis' });

    saldoSebelum = row.currentPoin;
    totalDelta = items.reduce((a, b) => a + b.poinDelta, 0);
    saldoAkhir = saldoSebelum + totalDelta;

    // --- FIFO per item ---
    for (const item of items) {
      let remaining = item.qtyMatched;
      if (remaining <= 0) continue;

      const openTx = await tx
        .select()
        .from(schema.transaksiPembelian)
        .where(
          and(
            eq(schema.transaksiPembelian.nis, sesi.nis),
            eq(schema.transaksiPembelian.barcode, item.barcode),
            eq(schema.transaksiPembelian.status, 'open'),
          ),
        )
        .orderBy(asc(schema.transaksiPembelian.waktu), asc(schema.transaksiPembelian.id))
        .limit(50);

      for (const t of openTx) {
        if (remaining <= 0) break;

        if (t.qty <= remaining) {
          // seluruh baris lunas
          await tx
            .update(schema.transaksiPembelian)
            .set({ status: 'settled', settledAt: now, updatedAt: now })
            .where(eq(schema.transaksiPembelian.id, t.id));
          remaining -= t.qty;
        } else {
          // partial: pecah baris, sisanya tetap open
          const sisa = t.qty - remaining;
          await tx
            .update(schema.transaksiPembelian)
            .set({ qty: remaining, status: 'settled', settledAt: now, updatedAt: now })
            .where(eq(schema.transaksiPembelian.id, t.id));
          await tx.insert(schema.transaksiPembelian).values({
            nis: t.nis,
            barcode: t.barcode,
            qty: sisa,
            penaltyPerUnit: t.penaltyPerUnit,
            status: 'open',
            staffId: t.staffId,
            waktu: t.waktu, // waktu asli dipertahankan
            catatan: `Split remainder from transaksi #${t.id}`,
            createdAt: now,
            updatedAt: now,
          });
          remaining = 0;
        }
        matched.push({ tx_id: t.id, barcode: item.barcode, qty: t.qty });
      }
    }

    // --- Ledger dengan saldo RUNNING (bukan before/after sesi) ---
    let running = saldoSebelum;
    for (const item of items) {
      if (item.poinDelta === 0) continue;
      await tx.insert(schema.poinLedger).values({
        nis: sesi.nis,
        sourceType: 'return_match',
        sourceId: item.id,
        poinDelta: item.poinDelta,
        saldoSebelum: running,
        saldoSesudah: running + item.poinDelta,
        waktu: now,
        createdAt: now,
        updatedAt: now,
      });
      running += item.poinDelta;
    }

    // --- Update saldo + hitung ulang state blokir ---
    const [limitRow] = await tx
      .select()
      .from(schema.configSettings)
      .where(eq(schema.configSettings.key, 'default_negative_limit'))
      .limit(1);
    const negativeLimit = Number(limitRow?.value ?? 0);
    const isBlocked = saldoAkhir <= negativeLimit;

    await tx
      .update(schema.santri)
      .set({
        currentPoin: saldoAkhir,
        isBlocked,
        // Kalau sudah tidak blocked, bersihkan alasan block-nya
        ...(isBlocked ? {} : { blockReason: null, blockAt: null }),
        updatedAt: now,
      })
      .where(eq(schema.santri.nis, sesi.nis));

    await tx
      .update(schema.sesiVerifikasi)
      .set({ waktuSelesai: now, totalPoinChange: totalDelta, updatedAt: now })
      .where(eq(schema.sesiVerifikasi.id, id));
  });

  await recordAudit('verifikasi.commit', {
    sesi_id: id,
    nis: sesi.nis,
    item_count: items.length,
    total_poin_change: totalDelta,
    saldo_after: saldoAkhir,
    matched_tx_count: matched.length,
  }, {
    userId: auth.sub, role: auth.role, resourceType: 'sesi', resourceId: id,
    ip: ctx.ip, userAgent: ctx.userAgent,
  });

  const [row2] = await db
    .select({ isBlocked: schema.santri.isBlocked })
    .from(schema.santri)
    .where(eq(schema.santri.nis, sesi.nis))
    .limit(1);

  return {
    sesi: {
      id,
      nis: sesi.nis,
      petugas_id: sesi.petugasId,
      waktu_mulai: sesi.waktuMulai,
      waktu_selesai: now,
      total_poin_change: totalDelta,
    },
    santri: { nis: sesi.nis, current_poin: saldoAkhir, is_blocked: row2?.isBlocked ?? false },
    saldo_change: totalDelta,
    matched_tx_count: matched.length,
  };
});
