/**
 * GET /api/produk/{barcode}/log — log barang MASUK dan KELUAR.
 *
 * MASUK  = admin katalog mengubah produk (dari audit_log)
 * KELUAR = siswa membeli produk (dari transaksi_pembelian)
 *
 * CATATAN PENTING: di Laravel asli query ini pakai
 * `whereRaw("JSON_EXTRACT(payload, '$.barcode') = ?")` — itu sintaks
 * MySQL dan GAGAL di PostgreSQL ("function json_extract does not exist").
 * Di sini pakai operator ->> native Postgres, hasilnya sama.
 *
 * Otorisasi: admin atau super admin.
 */
import { eq, asc } from 'drizzle-orm';
import { getDb, schema, getSql } from '../../../src/server/db/index';
import { iso } from '../../../src/server/http-guards';
import { requireAdminOrSuper } from '../../../src/server/http-guards';
import { handler, HttpError, requireAuth, type Ctx } from '../../../src/server/http';

const ACTION_LABELS: Record<string, string> = {
  'produk.create': 'Produk ditambah ke katalog',
  'produk.update': 'Produk di-update',
  'produk.archive': 'Produk di-archive',
  'produk.unarchive': 'Produk di-restore',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Hutang (belum setor)',
  settled: 'Disetor (matched)',
  cancelled: 'Dibatalkan',
};

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);

  const barcode = String(ctx.req.query.barcode ?? '').trim();
  if (!barcode) throw new HttpError(422, 'Barcode wajib diisi.', { field: 'barcode' });

  const db = getDb();
  const rows = await db.select().from(schema.produk).where(eq(schema.produk.barcode, barcode)).limit(1);
  const produk = rows[0];
  if (!produk) throw new HttpError(404, 'Produk tidak ditemukan.', { field: 'barcode' });

  // === Events: MASUK (perubahan katalog) ===
  const logs = await getSql()`
    select id, role, action, payload, waktu
    from audit_logs
    where action in ('produk.create','produk.update','produk.archive','produk.unarchive')
      and payload->>'barcode' = ${barcode}
    order by waktu asc
    limit 200
  `;
  const incoming = (logs as any[]).map((l) => ({
    event_type: 'masuk',
    subtype: l.action as string,
    label: ACTION_LABELS[l.action as string] ?? (l.action as string),
    waktu: iso(l.waktu),
    actor_name: l.payload?.created_by ?? l.payload?.updated_by ?? null,
    actor_role: l.role as string,
    payload: l.payload ?? null,
  }));

  // === Events: KELUAR (siswa membeli) ===
  const buys = await db
    .select({
      id: schema.transaksiPembelian.id,
      nis: schema.transaksiPembelian.nis,
      qty: schema.transaksiPembelian.qty,
      penaltyPerUnit: schema.transaksiPembelian.penaltyPerUnit,
      status: schema.transaksiPembelian.status,
      waktu: schema.transaksiPembelian.waktu,
      namaSantri: schema.santri.nama,
    })
    .from(schema.transaksiPembelian)
    .innerJoin(schema.santri, eq(schema.santri.nis, schema.transaksiPembelian.nis))
    .where(eq(schema.transaksiPembelian.barcode, barcode))
    .orderBy(asc(schema.transaksiPembelian.waktu))
    .limit(200);

  const purchasing = buys.map((r) => ({
    event_type: 'keluar',
    subtype: 'transaksi_pembelian',
    label: `Dibeli ${r.qty} unit oleh ${r.namaSantri} (NIS ${r.nis}) — ${STATUS_LABELS[r.status] ?? r.status}`,
    waktu: iso(r.waktu),
    // nama siswa dari users.name (sumber kebenaran)
    actor_name: r.namaSantri,
    actor_role: 'santri',
    nis: r.nis,
    qty: r.qty,
    penalty_per_unit: r.penaltyPerUnit,
    status: r.status,
  }));

  // === Statistik ===
  const stat = await getSql()`
    select
      count(*) as tx_count,
      coalesce(sum(case when status = 'settled' then qty else 0 end), 0) as qty_settled,
      coalesce(sum(case when status = 'open' then qty else 0 end), 0) as qty_open,
      coalesce(sum(case when status = 'cancelled' then qty else 0 end), 0) as qty_cancelled
    from transaksi_pembelian
    where barcode = ${barcode}
  `;
  const s = (stat as any[])[0] ?? {};

  const events = [...incoming, ...purchasing].sort((a, b) => {
    const ta = a.waktu ? Date.parse(a.waktu) : 0;
    const tb = b.waktu ? Date.parse(b.waktu) : 0;
    return tb - ta;
  });

  return {
    produk,
    summary: {
      created_at: iso(produk.createdAt),
      created_by: produk.createdBy,
      updated_at: iso(produk.updatedAt),
      updated_by: produk.updatedBy,
      archived_at: iso(produk.archivedAt),
      archived_by: produk.archivedBy,
      purchases: {
        total_tx: Number(s.tx_count ?? 0),
        qty_settled: Number(s.qty_settled ?? 0),
        qty_open: Number(s.qty_open ?? 0),
        qty_cancelled: Number(s.qty_cancelled ?? 0),
      },
    },
    events,
  };
});
