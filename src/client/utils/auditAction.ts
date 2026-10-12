/**
 * Label + warna untuk aksi audit log.
 *
 * Sumber kebenaran adalah NAMA yang di-record server lewat
 * `recordAudit(...)` di `src/server/routes/**`. Dulu daftar warna di
 * `UserAuditModal` diketik manual dan melenceng dari server:
 *
 *   client: superadmin.password_reset   server: superadmin.reset_password
 *   client: superadmin.toggle_suspend  server: superadmin.user_suspend
 *                                         server: superadmin.user_unsuspend
 *   client: superadmin.cron_manual_trigger / coverage / audit
 *                                         server: tidak pernah merekam
 *
 * Akibatnya aksi keamanan (reset password, suspend user) tampil dengan warna
 * Abu-abu yang sama dengan `auth.logout` — jadi tidak menonjol di audit log.
 * Sekalian, teks aksinya ditampilkan mentah (`superadmin.user_suspend`),
 * kelas masalah yang sama seperti label role.
 *
 * Kalau ada aksi baru di server, tambahkan di sini juga — test di
 * `scripts/audit-action-check.mts` akan menandai yang terlewat.
 */

export type AuditTone = 'green' | 'red' | 'yellow' | 'blue' | 'gray';

/** Nama aksi → warna badge. */
export const AUDIT_ACTION_TONE: Record<string, AuditTone> = {
  // Auth
  'auth.login': 'green',
  'auth.logout': 'gray',
  'auth.password_change': 'blue',
  'auth.password_change_first_login': 'blue',

  // POS & verifikasi
  'pembelian.create': 'green',
  'pembelian.batch_create': 'green',
  'verifikasi.open_sesi': 'blue',
  'verifikasi.commit': 'green',
  'verifikasi.cancel': 'yellow',
  'verifikasi.force_end': 'red',

  // Katalog
  'kategori.create': 'blue',
  'produk.create': 'blue',
  'produk.update': 'blue',
  'produk.archive': 'yellow',
  'produk.unarchive': 'blue',
  'produk.scan_hit': 'gray',
  'produk.scan_not_found': 'gray',

  // Reward
  'reward.create': 'blue',
  'reward.update': 'blue',
  'reward.redeem': 'green',
  'reward.archive': 'yellow',
  'reward.restore': 'blue',
  'reward.toggle_active': 'yellow',

  // Siswa, profil, reset
  'santri.create': 'blue',
  'profile.update_self': 'blue',
  'reset.start': 'yellow',
  'reset.step1': 'yellow',
  'reset.complete': 'red',

  // Super admin
  'super_admin.bootstrap': 'red',
  'superadmin.user_create': 'green',
  'superadmin.user_update': 'blue',
  'superadmin.user_delete': 'red',
  'superadmin.user_suspend': 'red',
  'superadmin.user_unsuspend': 'blue',
  'superadmin.reset_password': 'yellow',
  'superadmin.force_logout': 'yellow',
  'superadmin.config_update': 'yellow',
  'superadmin.mode_toggle': 'yellow',
  'superadmin.adjust_poin': 'yellow',
  'superadmin.recompute_saldo': 'yellow',
  'superadmin.reverse_transaction': 'red',
  'superadmin.destructive_reverified': 'gray',
};

/** Nama aksi → label bahasa manusia. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Login',
  'auth.logout': 'Logout',
  'auth.password_change': 'Ganti password',
  'auth.password_change_first_login': 'Ganti password (login pertama)',

  'pembelian.create': 'Pembelian di POS',
  'pembelian.batch_create': 'Pembelian batch di POS',
  'verifikasi.open_sesi': 'Buka sesi verifikasi',
  'verifikasi.commit': 'Sesi verifikasi di-commit',
  'verifikasi.cancel': 'Sesi verifikasi dibatalkan',
  'verifikasi.force_end': 'Sesi verifikasi di-force-end',

  'kategori.create': 'Buat kategori produk',
  'produk.create': 'Buat produk',
  'produk.update': 'Ubah produk',
  'produk.archive': 'Archive produk',
  'produk.unarchive': 'Pulihkan produk',
  'produk.scan_hit': 'Scan barcode (ditemukan)',
  'produk.scan_not_found': 'Scan barcode (tidak ditemukan)',

  'reward.create': 'Buat reward',
  'reward.update': 'Ubah reward',
  'reward.redeem': 'Reward ditukar',
  'reward.archive': 'Archive reward',
  'reward.restore': 'Pulihkan reward',
  'reward.toggle_active': 'Aktif/nonaktif reward',

  'santri.create': 'Buat data Siswa',
  'profile.update_self': 'Ubah profil sendiri',
  'reset.start': 'Mulai reset poin',
  'reset.step1': 'Konfirmasi terima pembayaran (step 1)',
  'reset.complete': 'Reset poin diselesaikan',

  'super_admin.bootstrap': 'Provision super admin pertama',
  'superadmin.user_create': 'Buat user',
  'superadmin.user_update': 'Ubah user',
  'superadmin.user_delete': 'Archive user',
  'superadmin.user_suspend': 'Suspend user',
  'superadmin.user_unsuspend': 'Unsuspend user',
  'superadmin.reset_password': 'Reset password user',
  'superadmin.force_logout': 'Paksa logout semua device',
  'superadmin.config_update': 'Ubah konfigurasi sistem',
  'superadmin.mode_toggle': 'Ubah mode (read-only/maintenance)',
  'superadmin.adjust_poin': 'Adjust poin manual',
  'superadmin.recompute_saldo': 'Hitung ulang saldo',
  'superadmin.reverse_transaction': 'Reverse transaksi',
  'superadmin.destructive_reverified': 'Re-verifikasi password (T3)',
};

export function auditActionTone(action: string): AuditTone {
  return AUDIT_ACTION_TONE[action] ?? 'gray';
}

/**
 * Label manusia untuk sebuah aksi.
 *
 * Fallback disengaja: aksi yang tidak dikenali (mis. ditambahkan di server
 * tanpa update frontend) tetap tampil terbaca — `some_new_action` diubah jadi
 * "Some New Action" — bukan string mentah yang tidak dimengerti user.
 */
export function auditActionLabel(action: string): string {
  const known = AUDIT_ACTION_LABEL[action];
  if (known) return known;
  const tail = action.includes('.') ? action.slice(action.indexOf('.') + 1) : action;
  return tail
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
