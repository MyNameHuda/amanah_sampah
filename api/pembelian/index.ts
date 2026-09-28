/**
 * POST /api/pembelian        — buat transaksi pembelian (single atau batch)
 * GET  /api/pembelian/history — riwayat transaksi milik staff yang login
 *
 * Kontrak dari PembelianController.php. Bedanya dari aslinya: memakai
 * db.transaction() SQL sungguhan supaya tidak ada kondisi setengah jadi,
 * setara DB::transaction() di Laravel.
 */
import { eq, desc, inArray } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { recordAudit } from '../../src/server/audit';
import { isSuperAdmin } from '../../src/server/auth/roles';
import { handler, HttpError, Created, readBody, requireString, requireAuth, type Ctx } from '../../src/server/http';
import { serializeTransaksi, serializeProduk } from '../../src/server/http-guards';

interface Item { barcode: string; qty: number }

/** [F-change] flat penalty: -1 poin per unit, tanpa escalation. */
const PENALTY_PER_UNIT = -1;

export default handler(async (ctx: Ctx) => {
  const auth = await requireAuth(ctx);
  if (ctx.req.method === 'POST') return store(ctx, auth);
  if (ctx.req.method === 'GET') return history(ctx, auth);
  throw new HttpError(405, 'Method not allowed.');
});

function readItems(body: Record<string, unknown>): { items: Item[]; isBatch: boolean } {
  const raw = body.items;
  if (Array.isArray(raw) && raw.length > 0) {
    return {
      isBatch: true,
      items: raw.map((it: any) => {
        if (typeof it?.barcode !== 'string' || it.barcode.trim() === '') {
          throw new HttpError(422, 'items.*.barcode wajib diisi.', { field: 'barcode' });
        }
        const qty = Number(it?.qty);
        if (!Number.isInteger(qty) || qty < 1) {
          throw new HttpError(422, 'items.*.qty harus integer >= 1.', { field: 'qty' });
        }
        return { barcode: it.barcode.trim(), qty };
      }),
    };
  }
  const barcode = requireString(body, 'barcode', { max: 50 });
  const qty = Number(body.qty);
  if (!Number.isInteger(qty) || qty < 1) {
    throw new HttpError(422, 'qty harus integer >= 1.', { field: 'qty' });
  }
  return { items: [{ barcode, qty }], isBatch: false };
}

async function store(ctx: Ctx, auth: { sub: number; role: any }) {
  const db = getDb();
  const body = readBody(ctx);

  // [Fix S4] nis SELALU di top-level, baik mode single maupun batch.
  // Field nis di dalam items sengaja diabaikan.
  if (typeof body.nis !== 'string' || body.nis.trim() === '') {
    throw new HttpError(422, 'Field nis wajib diisi di top-level request.', { field: 'nis' });
  }
  const nis = body.nis.trim();
  const { items, isBatch } = readItems(body);

  // --- Validasi siswa ---
  const [santri] = await db.select().from(schema.santri).where(eq(schema.santri.nis, nis)).limit(1);
  if (!santri) {
    throw new HttpError(422, `Santri dengan NIS '${nis}' tidak ditemukan.`, { field: 'nis' });
  }
  if (santri.archivedAt) {
    throw new HttpError(422, 'Santri sudah archived.', { field: 'nis' });
  }

  // Guard: status akun SUBJEK transaksi, bukan staff yang login.
  // Super admin tetap boleh — dia satu-satunya jalur pemulihan untuk
  // siswa yang ter-suspend.
  const [subjectUser] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, santri.userId))
    .limit(1);
  if (!isSuperAdmin(auth.role) && subjectUser?.suspendedAt) {
    throw new HttpError(
      422,
      `Akun ${santri.nama} (NIS ${nis}) sedang di-suspend. Transaksi tidak bisa dicatat. Hubungi admin untuk membuka akses.`,
      { field: 'nis' },
    );
  }

  // --- Validasi produk ---
  const barcodes = [...new Set(items.map((i) => i.barcode))];
  const prods = await db
    .select()
    .from(schema.produk)
    .where(inArray(schema.produk.barcode, barcodes));
  const produkByBarcode = new Map(prods.map((p) => [p.barcode, p]));

  for (const bc of barcodes) {
    const p = produkByBarcode.get(bc);
    if (!p) throw new HttpError(422, `Produk '${bc}' tidak ditemukan.`, { field: 'barcode' });
    if (p.archivedAt) {
      throw new HttpError(422, `Produk '${p.namaProduk}' sudah di-archive. Tidak bisa dijual.`, {
        field: 'barcode',
      });
    }
  }

  // Siswa blocked tidak boleh beli plastik (produk yang tidak di-exclude)
  const hasPlastik = items.some((i) => !produkByBarcode.get(i.barcode)!.isExcludedFromDebit);
  if (santri.isBlocked && hasPlastik) {
    throw new HttpError(
      422,
      `Santri ${santri.nama} sedang di-block (poin: ${santri.currentPoin}). Tidak boleh beli plastik.`,
      { field: 'blocked' },
    );
  }

  // --- Hitung plan (di luar transaksi, supaya tidak ada query sia-sia) ---
  const now = new Date();
  const saldoSebelum = santri.currentPoin;
  let running = saldoSebelum;
  let totalDelta = 0;
  const plan = items.map((it) => {
    const poinDelta = PENALTY_PER_UNIT * it.qty;
    totalDelta += poinDelta;
    running += poinDelta;
    return {
      barcode: it.barcode,
      nama_produk: produkByBarcode.get(it.barcode)!.namaProduk,
      qty: it.qty,
      penalty_per_unit: PENALTY_PER_UNIT,
      poin_delta: poinDelta,
      saldo_sebelum: running - poinDelta,
      saldo_sesudah: running,
    };
  });
  const saldoAkhir = running;

  const [limitRow] = await db
    .select()
    .from(schema.configSettings)
    .where(eq(schema.configSettings.key, 'default_negative_limit'))
    .limit(1);
  const ambang = Number(limitRow?.value ?? 0);
  const jadiBlocked = saldoAkhir <= ambang;

  // --- Tulis dalam satu transaksi DB ---
  const txIds: number[] = [];
  await db.transaction(async (tx) => {
    for (const p of plan) {
      const [ins] = await tx
        .insert(schema.transaksiPembelian)
        .values({
          nis,
          barcode: p.barcode,
          qty: p.qty,
          penaltyPerUnit: p.penalty_per_unit,
          status: 'open',
          staffId: auth.sub,
          waktu: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: schema.transaksiPembelian.id });
      txIds.push(ins.id);

      await tx.insert(schema.poinLedger).values({
        nis,
        sourceType: 'purchase',
        sourceId: ins.id,
        poinDelta: p.poin_delta,
        saldoSebelum: p.saldo_sebelum,
        saldoSesudah: p.saldo_sesudah,
        waktu: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    await tx
      .update(schema.santri)
      .set({
        currentPoin: saldoAkhir,
        isBlocked: jadiBlocked,
        ...(jadiBlocked && !santri.blockAt
          ? { blockAt: now, blockReason: 'Melewati ambang minus 50 poin' }
          : {}),
        updatedAt: now,
      })
      .where(eq(schema.santri.nis, nis));
  });

  await recordAudit(
    isBatch ? 'pembelian.batch_create' : 'pembelian.create',
    { tx_ids: txIds, nis, items: plan, total_poin_delta: totalDelta, saldo_after: saldoAkhir },
    { userId: auth.sub, role: auth.role, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return Created({
    mode: isBatch ? 'batch' : 'single',
    transactions: plan.map((p, i) => ({
      id: txIds[i],
      nis,
      barcode: p.barcode,
      qty: p.qty,
      penalty_per_unit: p.penalty_per_unit,
      status: 'open',
      staff_id: auth.sub,
    })),
    items: plan.map((p, i) => ({ tx_id: txIds[i], ...p })),
    santri: { nis, current_poin: saldoAkhir, is_blocked: jadiBlocked },
    total_poin_delta: totalDelta,
  });
}

async function history(ctx: Ctx, auth: { sub: number; role: any }) {
  void ctx;
  void auth;
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.transaksiPembelian)
    .where(eq(schema.transaksiPembelian.staffId, auth.sub))
    .orderBy(desc(schema.transaksiPembelian.waktu))
    .limit(100);
  return { data: await withProduk(db, rows) };
}

/** Lampirkan produk ke tiap transaksi (setara with('produk')). */
export async function withProduk(db: ReturnType<typeof getDb>, rows: Record<string, any>[]) {
  const out = rows.map((t) => ({ ...serializeTransaksi(t) })) as Record<string, unknown>[];
  if (rows.length === 0) return out;

  const prods = await db
    .select()
    .from(schema.produk)
    .where(inArray(schema.produk.barcode, [...new Set(rows.map((t) => t.barcode))]));
  const byBc = new Map(prods.map((p) => [p.barcode, serializeProduk(p)]));
  for (const item of out) {
    item.produk = byBc.get(item.barcode as string) ?? null;
  }
  return out;
}
