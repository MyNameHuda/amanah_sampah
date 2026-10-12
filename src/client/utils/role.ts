/**
 * Satu-satunya sumber penamaan role di frontend.
 *
 * Kenapa modul ini perlu: label role sebelumnya tersebar di tiga file dan
 * tidak sinkron satu sama lain.
 *
 *   - `components/Layout.tsx` punya ROLE_LABEL lengkap (6 role).
 *   - `pages/SuperAdminUsers.tsx` punya ROLE_OPTIONS — tapi `super_admin_tier3`
 *     TIDAK ada di sana, padahal role itu benar-benar ada di sistem dan bisa
 *     dipakai. Akibatnya role Tier 3 tidak bisa dipilih saat membuat user.
 *   - Hampir semua halaman lain menampilkan `user.role` mentah, jadi yang
 *     muncul di layar adalah `super_admin`, bukan "Super Admin".
 *
 * Nilai di `users.role` adalah kunci TEKNIAL — bahasa pemrograman, bukan
 * bahasa manusia. Yang tampil ke user harus punya kapitalisasi dan spasi
 * yang benar. Modul ini yang-mindahin keduanya.
 */

export const ROLE_LABEL: Record<string, string> = {
  'santri': 'Siswa',
  'staff_kantin': 'Staff Kantin',
  'petugas_kesantrian': 'Petugas Kesantrian',
  'admin_kesantrian': 'Admin Kesantrian',
  'super_admin': 'Super Admin',
  'super_admin_tier3': 'Super Admin (Tier 3)',
};

/** Warna badge per role. `super_admin` dan Tier 3 sengaja sama warnanya. */
export const ROLE_COLOR: Record<string, string> = {
  'santri': 'bg-blue-100 text-blue-700',
  'staff_kantin': 'bg-emerald-100 text-emerald-700',
  'petugas_kesantrian': 'bg-violet-100 text-violet-700',
  'admin_kesantrian': 'bg-amber-100 text-amber-700',
  'super_admin': 'bg-rose-100 text-rose-700',
  'super_admin_tier3': 'bg-rose-100 text-rose-700',
};

/** Urutan role sesuai alur kerja: dari yang paling sering sampai privileged. */
export const ROLE_ORDER: readonly string[] = [
  'santri',
  'staff_kantin',
  'petugas_kesantrian',
  'admin_kesantrian',
  'super_admin',
  'super_admin_tier3',
];

/**
 * Label manusia untuk sebuah nilai role.
 *
 * Fallback disengaja: kalau database berisi role yang belum dikenal (mis.
 * ditambahkan di kemudian hari tanpa update frontend), kita tetap menampilkan
 * sesuatu yang bisa dibaca — bukan `undefined` — dan bentukkan yang enak
 * dibaca: `some_new_role` -> `Some New Role`.
 */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return '—';
  const known = ROLE_LABEL[role];
  if (known) return known;
  return role
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Opsi untuk <select> form user — labelnya sudah manusia, value-nya teknis. */
export const ROLE_OPTIONS: { value: string; label: string }[] = ROLE_ORDER.map((value) => ({
  value,
  label: ROLE_LABEL[value],
}));
