import axios from 'axios';

/**
 * Base URL API.
 *
 * Default `/api` = single-origin: SPA dan backend dilayani dari domain yang
 * sama. Ini konfigurasi yang dipakai deployment produksi (Laravel menyajikan
 * hasil build Vite dari `public/`), jadi relatif dan bebas CORS.
 *
 * `VITE_API_BASE_URL` hanya perlu diisi kalau SPA dan API dipisah (misalnya
 * frontend di Vercel dan backend di tempat lain). Kalau diisi ke URL
 * absolut, `config/cors.php` di backend harus mengizinkan domain tersebut.
 */
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { Accept: 'application/json' },
});

// Inject token + log requests (dev convenience)
api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('amanah_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Alasan logout paksa, dibaca sekali oleh halaman Login lalu dibersihkan.
// Dipakai supaya halaman login bisa menampilkan "Akun Anda di-suspend" alih-alih
// form login kosong yang tidak menjelaskan kenapa sesi berakhir.
let lastLogoutReason: string | null = null;

export const REASON_SUSPENDED = 'suspended';
export const REASON_EXPIRED = 'expired';

export function consumeLogoutReason(): string | null {
  const v = lastLogoutReason;
  lastLogoutReason = null;
  return v;
}

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err.response?.status;
    const url: string = err.config?.url ?? '';

    // Jangan proses kalau request-nya dari /auth/login: 401/403 di sana
    // adalah jawaban login yang gagal, harus tampil sebagai pesan form,
    // bukan memicu redirect ke halaman yang sedang tampil.
    const onLoginPage = url.startsWith('/auth/login');
    const isMeRestore = url.startsWith('/auth/me');
    if (onLoginPage) return Promise.reject(err);

    // 403 dengan marker `suspended` = backend menolak user yang di-suspend.
    // Mayoritas kasus sebenarnya sudah tertangani sebagai 401 karena token
    // ikut di-revoke saat suspend, tapi cabang ini menutup kasus di mana
    // `suspended_at` diubah tanpa lewat toggleSuspend (mis. migrasi manual),
    // sehingga token masih hidup tapi user tidak boleh melakukan apa pun.
    if (status === 403 && err.response?.data?.suspended) {
      lastLogoutReason = REASON_SUSPENDED;
      localStorage.removeItem('amanah_token');
      localStorage.removeItem('amanah_user');
      if (typeof window !== 'undefined') {
        window.location.href = '/login?suspended=1';
      }
      return Promise.reject(err);
    }

    // Auto-logout kalau 401. `isMeRestore` dikecualikan karena
    // AuthContext yang memanggil /auth/me dan yang akan membersihkan
    // state-nya sendiri — redirect dari sini cuma membuat fight.
    if (status === 401 && !isMeRestore) {
      lastLogoutReason = REASON_EXPIRED;
      localStorage.removeItem('amanah_token');
      localStorage.removeItem('amanah_user');
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?expired=1';
      }
    }

    return Promise.reject(err);
  }
);

export default api;

// Type definitions
export type Role =
  | 'santri'
  | 'staff_kantin'
  | 'petugas_kesantrian'
  | 'admin_kesantrian'
  | 'super_admin'
  | 'super_admin_tier3';

export interface User {
  id: number;
  name: string;
  email: string | null;
  role: Role;
  suspended_at: string | null;
}

export interface Santri {
  nis: string;
  nama: string;
  kelas: string;
  asrama: string | null;
  current_poin: number;
  is_blocked: boolean;
  block_reason: string | null;
  archived_at?: string | null;
  prior_open_count?: number;
  /**
   * Akun siswa di-suspend oleh admin. BEDA dari `is_blocked` (itu control
   * poin <= -50, siswa masih boleh Beli non-plastik).
   * Kalau true, staff kantin & petugas tidak boleh mencatat transaksi
   * maupun pembuangan untuk NIS ini — backend menolak dengan 422.
   */
  is_suspended?: boolean;
  penalty_tier?: number;
}

export interface Produk {
  barcode: string;
  nama_produk: string;
  id_kategori: number;
  is_excluded_from_debit: boolean;
  kategori?: KategoriProduk;
}

export interface KategoriProduk {
  id: number;
  nama_kategori: string;
  deskripsi: string | null;
  is_default_excluded: boolean;
}

export interface Reward {
  id_reward: string;
  nama_reward: string;
  biaya_poin: number;
  stok: number;
  status_aktif: boolean;
  archived_at?: string | null;
  archived_by?: number | null;
  created_by?: number | null;
  updated_by?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_archived?: boolean;
  redeemed_count?: number;
}

export type RewardFilter = 'all' | 'active' | 'archived' | 'inactive';

export interface TransaksiPembelian {
  id: number;
  nis: string;
  barcode: string;
  qty: number;
  penalty_per_unit: number;
  status: 'open' | 'settled' | 'cancelled';
  waktu: string;
  settled_at: string | null;
  produk?: Produk;
}

export interface PoinLedgerEntry {
  id: number;
  source_type: string;
  source_id: number | null;
  poin_delta: number;
  saldo_sebelum: number;
  saldo_sesudah: number;
  waktu: string;
}
