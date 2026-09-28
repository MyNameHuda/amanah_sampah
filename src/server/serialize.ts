/**
 * Serializer untuk katalog & reward.
 *
 * Bentuk field WAJIB sama dengan yang dikembalikan model Laravel asli,
 * karena frontend sudah membaca key tersebut secara langsung.
 */
import { iso } from './http-guards';
import type { Role } from './auth/roles';
import { isAdmin, isPetugas, isStaffKantin, isSuperAdmin } from './auth/roles';

export function serializeKategori(k: Record<string, any>) {
  return {
    id: k.id,
    nama_kategori: k.namaKategori,
    deskripsi: k.deskripsi ?? null,
    is_default_excluded: k.isDefaultExcluded ?? false,
    created_at: iso(k.createdAt),
    updated_at: iso(k.updatedAt),
  };
}

export function serializeProduk(p: Record<string, any>, kategori?: Record<string, any> | null) {
  const out: Record<string, unknown> = {
    barcode: p.barcode,
    nama_produk: p.namaProduk,
    id_kategori: p.idKategori,
    is_excluded_from_debit: p.isExcludedFromDebit ?? false,
    image_url: p.imageUrl ?? null,
    created_by: p.createdBy ?? null,
    updated_by: p.updatedBy ?? null,
    archived_at: iso(p.archivedAt),
    archived_by: p.archivedBy ?? null,
    created_at: iso(p.createdAt),
    updated_at: iso(p.updatedAt),
  };
  // with('kategori') — null kalau produknya yatim (kategori dihapus)
  out.kategori = kategori ? serializeKategori(kategori) : null;
  return out;
}

/** Bentuk reward ringkas untuk list;.
 *  `is_archived` ditambahkan hanya di listing admin (lihat indexAdmin). */
export function serializeReward(r: Record<string, any>, extra?: Record<string, unknown>) {
  return {
    id_reward: r.idReward,
    nama_reward: r.namaReward,
    biaya_poin: r.biayaPoin,
    stok: r.stok,
    status_aktif: r.statusAktif ?? false,
    archived_at: iso(r.archivedAt),
    archived_by: r.archivedBy ?? null,
    created_by: r.createdBy ?? null,
    updated_by: r.updatedBy ?? null,
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
    ...(extra ?? {}),
  };
}

export function serializePenukaran(p: Record<string, any>) {
  return {
    id: p.id,
    nis: p.nis,
    id_reward: p.idReward,
    poin_used: p.poinUsed,
    status: p.status,
    waktu: iso(p.waktu),
    created_at: iso(p.createdAt),
    updated_at: iso(p.updatedAt),
  };
}

/** Reward::hasStock(1) — aktif, tidak archived, stok >= 1. */
export function hasStock(r: Record<string, any>, qty = 1): boolean {
  return !!r.statusAktif && !r.archivedAt && r.stok >= qty;
}

/* ------------------------------------------------------------------ *
 * Otorisasi katalog — disalin dari CatalogController.php
 * ------------------------------------------------------------------ */

/** canManageProduk(): staff kantin, petugas, admin, super admin. */
export function canManageProduk(role: Role): boolean {
  return isStaffKantin(role) || isAdmin(role) || isSuperAdmin(role) || isPetugas(role);
}

/** canEditProduk(): petugas, admin, super admin. Staff kantin hanya bisa add. */
export function canEditProduk(role: Role): boolean {
  return isAdmin(role) || isSuperAdmin(role) || isPetugas(role);
}
