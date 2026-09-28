/**
import { getSql } from '../../src/server/db/index';
import { requireAdminOrSuper } from '../../src/server/http-guards';
import { handler, requireAuth, type Ctx } from '../../src/server/http';
 * Tersedia untuk admin_kesantrian juga, bukan cuma super admin: admin
 * butuh ini untuk pemantauan harian.
 */
import { isNull, sql, asc, and, eq } from 'drizzle-orm';
import { getDb, getSql, schema } from '../../src/server/db/index';
import { requireAdminOrSuper } from '../../src/server/http-guards';
import { handler, requireAuth, type Ctx } from '../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET') {
    return { message: 'Gunakan GET.', error: 'method_not_allowed' };
  }
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);

  const db = getDb();

  // LEFT JOIN supaya siswa tanpa transaksi tetap muncul (coverage 0),
  // bukan hilang dari laporan.
  const rows = await getSql()`
    select
      s.nis,
      s.nama,
      s.current_poin,
      s.is_blocked,
      coalesce(sum(case when t.status = 'settled' then t.qty else 0 end), 0) as qty_settled,
      coalesce(sum(case when t.status = 'open' then t.qty else 0 end), 0) as qty_open,
      count(t.id) as total_tx
    from santri s
    left join transaksi_pembelian t on t.nis = s.nis
    where s.archived_at is null
    group by s.nis, s.nama, s.current_poin, s.is_blocked
    order by s.nama
  `;

  const data = (rows as any[]).map((r) => {
    const qtySettled = Number(r.qty_settled ?? 0);
    const qtyOpen = Number(r.qty_open ?? 0);
    const total = qtySettled + qtyOpen;
    return {
      nis: r.nis,
      // Nama dari kolom DB di sini disengaja: ini laporan agregat, bukan
      // tampilan profil, jadi tidak perlu accessor users.name.
      nama: r.nama,
      current_poin: Number(r.current_poin ?? 0),
      is_blocked: r.is_blocked,
      qty_settled: qtySettled,
      qty_open: qtyOpen,
      total_tx: Number(r.total_tx ?? 0),
      // Pembulatan 1 desimal; null kalau belum ada transaksi sama sekali
      coverage_pct: total > 0 ? Math.round((qtySettled / total) * 1000) / 10 : null,
    };
  });

  return { data };
});

void sql;
void asc;
void and;
void eq;
void getDb;
void schema;
