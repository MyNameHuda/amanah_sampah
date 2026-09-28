/**
 * Guard role — pengganti middleware `role:...` di routes/api.php.
 *
 * PENTING: daftar role di sini harus persis sama dengan yang tertulis di
 * routes/api.php Laravel.-access yang salah akan membuka akses yang tidak
 * seharusnya.
 */
import { HttpError } from './http';
import { hasCapability, isAdmin, isSuperAdmin, type Role } from './auth/roles';

/** Sama seperti `middleware('role:a,b,c')` Laravel. */
export function requireRole(actual: Role, allowed: readonly Role[]): void {
  if (!allowed.includes(actual)) {
    throw new HttpError(422, 'Akses ditolak.', { field: 'auth' });
  }
}

/** `isAdmin() || isSuperAdmin()` — dipakai banyak controller. */
export function requireAdminOrSuper(actual: Role): void {
  if (!isAdmin(actual) && !isSuperAdmin(actual)) {
    throw new HttpError(422, 'Akses ditolak.', { field: 'auth' });
  }
}

export function requireCapability(actual: Role, cap: Parameters<typeof hasCapability>[1]): void {
  if (!hasCapability(actual, cap)) {
    throw new HttpError(422, 'Akses ditolak.', { field: 'auth' });
  }
}

/**
 * Hanya Super Admin (tier 1 DAN tier 3).
 *
 * Beda dari `requireAdminOrSuper` yang juga menerima `admin_kesantrian`.
 * Dipakai untuk panel super-admin: config sistem, mode maintenance, dan
 * manajemen user. T3 boleh masuk, tapi operasi destruktifnya minta
 * re-verifikasi password (lihat auth/t3.ts).
 */
export function requireSuperAdmin(actual: Role): void {
  if (!isSuperAdmin(actual)) {
    throw new HttpError(422, 'Akses ditolak.', { field: 'auth' });
  }
}

/** Format ISO8601 atau null — kolom timestamp nullable. */
export function iso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

/** Ubah snake_case → camelCase, untuk map dari row Drizzle ke bentuk JSON API. */
export function snakeToCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out;
}

/** Bentuk JSON untuk objek `santri` — sama dengan atribut model Laravel. */
export function serializeSantri(s: Record<string, any>) {
  return {
    nis: s.nis,
    // `nama` di model Laravel selalu me-return users.name (sumber kebenaran),
    // bukan kolom DB. Lihat Santri::getNamaAttribute().
    nama: s.userName ?? s.nama,
    kelas: s.kelas,
    asrama: s.asrama ?? null,
    current_poin: s.currentPoin ?? 0,
    is_blocked: s.isBlocked ?? false,
    block_reason: s.blockReason ?? null,
    block_at: iso(s.blockAt),
    archived_at: iso(s.archivedAt),
    reset_at: iso(s.resetAt),
  };
}

/** Bentuk JSON untuk objek `produk`. */
export function serializeProduk(p: Record<string, any>) {
  return {
    barcode: p.barcode,
    nama_produk: p.namaProduk,
    id_kategori: p.idKategori,
    is_excluded_from_debit: p.isExcludedFromDebit ?? false,
    image_url: p.imageUrl ?? null,
    archived_at: iso(p.archivedAt),
  };
}

/** Bentuk JSON untuk `poin_ledger`. */
export function serializeLedger(l: Record<string, any>) {
  return {
    id: l.id,
    source_type: l.sourceType,
    source_id: l.sourceId ?? null,
    poin_delta: l.poinDelta,
    saldo_sebelum: l.saldoSebelum,
    saldo_sesudah: l.saldoSesudah,
    waktu: iso(l.waktu),
  };
}

/** Bentuk JSON untuk `transaksi_pembelian`. */
export function serializeTransaksi(t: Record<string, any>) {
  return {
    id: t.id,
    nis: t.nis,
    barcode: t.barcode,
    qty: t.qty,
    penalty_per_unit: t.penaltyPerUnit,
    status: t.status,
    staff_id: t.staffId,
    waktu: iso(t.waktu),
    settled_at: iso(t.settledAt),
    cancelled_at: iso(t.cancelledAt),
    catatan: t.catatan ?? null,
  };
}

/** Bentuk JSON untuk `reset_denda_log`. */
export function serializeReset(r: Record<string, any>) {
  return {
    id: r.id,
    nis: r.nis,
    admin_id: r.adminId,
    poin_sebelum: r.poinSebelum,
    poin_sesudah: r.poinSesudah,
    verifikasi_step_1: r.verifikasiStep1,
    verifikasi_step_2: r.verifikasiStep2,
    completed_at: iso(r.completedAt),
    catatan: r.catatan ?? null,
    created_at: iso(r.createdAt),
  };
}

/** Bentuk JSON untuk `reward`. */
export function serializeReward(r: Record<string, any>) {
  return {
    id_reward: r.idReward,
    nama_reward: r.namaReward,
    biaya_poin: r.biayaPoin,
    stok: r.stok,
    status_aktif: r.statusAktif,
    archived_at: iso(r.archivedAt),
    archived_by: r.archivedBy ?? null,
    created_by: r.createdBy ?? null,
    updated_by: r.updatedBy ?? null,
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
  };
}
