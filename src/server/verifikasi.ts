/**
 * Helper khusus alur verifikasi.
 *
 * Berisi aturan bisnis yang dipakai di beberapa endpoint:
 *  - DUTASI_IDLE_MENIT: ambang sesi menggantung
 *  - openDebtsFor(): utang terbuka per barcode
 *  - assertSantriNotSuspended(): guard akun siswa
 *  - photoUrl(): menyusun URL foto bukti dari bucket Supabase
 */
import { and, eq, isNull, sum, min } from 'drizzle-orm';
import { getDb, schema, type Database } from './db/index';
import { HttpError } from './http';
import { iso } from './http-guards';
import { isSuperAdmin, type Role } from './auth/roles';

/**
 * Sesi dianggap "menggantung" setelah tidak ada aktivitas selama ini.
 *
 * 15 menit: satu verifikasi normal selesai 2-5 menit. Sesi idle tidak
 * cuma "kotor" — sesi itu MEMBLOKIR opening sesi baru untuk NIS yang sama,
 * jadi tanpa ada yang menyelesaikan, siswa terkunci.
 */
export const DURASI_IDLE_MENIT = 15;

/** Utang terbuka (transaksi status 'open') untuk satu NIS, digabung per barcode. */
export async function openDebtsFor(nis: string) {
  const db = getDb();
  const rows = await db
    .select({
      barcode: schema.transaksiPembelian.barcode,
      qty: sum(schema.transaksiPembelian.qty),
      // MIN(waktu) = transaksi open terlama, sama seperti di Laravel
      oldest: min(schema.transaksiPembelian.waktu),
    })
    .from(schema.transaksiPembelian)
    .where(
      and(
        eq(schema.transaksiPembelian.nis, nis),
        eq(schema.transaksiPembelian.status, 'open'),
      ),
    )
    .groupBy(schema.transaksiPembelian.barcode);

  if (rows.length === 0) return [];

  const prods = await db
    .select({ barcode: schema.produk.barcode, nama: schema.produk.namaProduk })
    .from(schema.produk);
  const nameByBc = new Map(prods.map((p) => [p.barcode, p.nama]));

  return rows.map((r) => ({
    barcode: r.barcode,
    nama_produk: nameByBc.get(r.barcode) ?? null,
    qty: Number(r.qty),
    oldest: iso(r.oldest),
  }));
}

/**
 * Tolak aktivitas bila akun SISWA target sedang di-suspend.
 *
 * Dipakai di 3 titik (openSesi, addItem, commitSesi) karena sesi bisa
 * sudah dibuka sebelum siswa di-suspend. Hanya guarding di openSesi tidak
 * cukup — commit tetap akan mengubah poin.
 *
 * Super admin dilewati: dia jalur pemulihan untuk koreksi.
 */
export async function assertSantriNotSuspended(nis: string, actorRole: Role): Promise<void> {
  if (isSuperAdmin(actorRole)) return;

  const db = getDb();
  const rows = await db
    .select({
      nama: schema.users.name,
      suspendedAt: schema.users.suspendedAt,
    })
    .from(schema.santri)
    .innerJoin(schema.users, eq(schema.users.id, schema.santri.userId))
    .where(eq(schema.santri.nis, nis))
    .limit(1);

  if (rows[0]?.suspendedAt) {
    throw new HttpError(
      422,
      `Akun ${rows[0].nama} (NIS ${nis}) sedang di-suspend. Verifikasi pembuangan tidak bisa dicatat. Hubungi admin untuk membuka akses.`,
      { field: 'nis' },
    );
  }
}

/**
 * Susun URL foto bukti.
 *
 * Kenapa server yang menyusun, bukan frontend: lokasi file berbeda
 * tergantung disk aktif. Kalau frontend menyusun URL, begitu pindah hosting
 * semua foto busted tanpa error yang jelas — cuma gambar kosong.
 *
 * Kalau konfigurasi storage belum lengkap, kembalikan null (bukan 500)
 * supaya frontend tetap bisa menampilkan path-nya.
 */
export function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.AWS_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** Bentuk item + foto_bukti_url untuk API. */
export function presentItem(i: Record<string, any>, namaProduk?: string | null) {
  return {
    id: i.id,
    id_sesi: i.idSesi,
    barcode: i.barcode,
    qty_in: i.qtyIn,
    qty_open_at_time: i.qtyOpenAtTime,
    qty_matched: i.qtyMatched,
    qty_excess: i.qtyExcess,
    qty_shortfall: i.qtyShortfall,
    poin_delta: i.poinDelta,
    foto_bukti_path: i.fotoBuktiPath ?? null,
    foto_bukti_url: photoUrl(i.fotoBuktiPath),
    nama_produk: namaProduk ?? null,
    catatan: i.catatan ?? null,
    created_at: iso(i.createdAt),
    updated_at: iso(i.updatedAt),
  };
}

/** Bentuk sesi untuk API (sudah termasuk items). */
export function presentSesi(
  s: Record<string, any>,
  items: Record<string, any>[],
  namaProdukByBarcode: Map<string, string>,
) {
  return {
    id: s.id,
    nis: s.nis,
    petugas_id: s.petugasId,
    waktu_mulai: iso(s.waktuMulai),
    waktu_selesai: iso(s.waktuSelesai),
    total_poin_change: s.totalPoinChange ?? 0,
    created_at: iso(s.createdAt),
    updated_at: iso(s.updatedAt),
    items: items.map((i) => presentItem(i, namaProdukByBarcode.get(i.barcode) ?? null)),
  };
}

/** Bentuk ringkas siswa untuk response verifikasi. */
export async function presentSantri(nis: string) {
  const db = getDb();
  const rows = await db
    .select({
      nis: schema.santri.nis,
      nama: schema.users.name,
      currentPoin: schema.santri.currentPoin,
      isBlocked: schema.santri.isBlocked,
    })
    .from(schema.santri)
    .innerJoin(schema.users, eq(schema.users.id, schema.santri.userId))
    .where(eq(schema.santri.nis, nis))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    nis: r.nis,
    nama: r.nama,
    current_poin: r.currentPoin,
    is_blocked: r.isBlocked,
  };
}

/** Cari nama produk untuk daftar barcode (dipakai presentSesi). */
export async function productNameMap(barcodes: string[]): Promise<Map<string, string>> {
  if (barcodes.length === 0) return new Map();
  const db = getDb();
  const { inArray } = await import('drizzle-orm');
  const prods = await db
    .select({ barcode: schema.produk.barcode, nama: schema.produk.namaProduk })
    .from(schema.produk)
    .where(inArray(schema.produk.barcode, [...new Set(barcodes)]));
  return new Map(prods.map((p) => [p.barcode, p.nama]));
}

/** Sesi masih terbuka? */
export async function findOpenSession(nis: string, excludeId?: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.sesiVerifikasi)
    .where(and(eq(schema.sesiVerifikasi.nis, nis), isNull(schema.sesiVerifikasi.waktuSelesai)))
    .limit(1);
  const s = rows[0];
  if (!s) return null;
  if (excludeId !== undefined && s.id === excludeId) return null;
  return s;
}

export type { Database };
