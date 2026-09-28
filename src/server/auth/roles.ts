/**
 * Role & permission — port dari app/Models/User.php
 *
 * WAJIB: nama string role di sini harus persis sama dengan nilai di
 * kolom `users.role` (lihat schema.ts → roleEnum). Mengubah salah satu
 * tanpa yang lain akan membuat user lama tidak bisa login.
 */

export const ROLES = [
  'santri',
  'staff_kantin',
  'petugas_kesantrian',
  'admin_kesantrian',
  'super_admin',
  'super_admin_tier3',
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  santri: 'Santri',
  staff_kantin: 'Staff Kantin',
  petugas_kesantrian: 'Petugas Kesantrian',
  admin_kesantrian: 'Admin Kesantrian',
  super_admin: 'Super Admin (Tier 1)',
  super_admin_tier3: 'Super Admin (Tier 3)',
};

export const isRole = (v: unknown): v is Role =>
  typeof v === 'string' && (ROLES as readonly string[]).includes(v);

export const isSantri = (role: Role) => role === 'santri';
export const isStaffKantin = (role: Role) => role === 'staff_kantin';
export const isPetugas = (role: Role) => role === 'petugas_kesantrian';
export const isAdmin = (role: Role) => role === 'admin_kesantrian';
export const isSuperAdmin = (role: Role) => role === 'super_admin' || role === 'super_admin_tier3';
export const isSuperAdminTier1 = (role: Role) => role === 'super_admin';
export const isSuperAdminTier3 = (role: Role) => role === 'super_admin_tier3';

/**
 * T3 = role paling berkuasa. Operation destructive (reset denda, maintenance
 * mode, hapus user) butuh re-verifikasi password khusus T3.
 * Port dari User::needsPasswordReVerificationForDestructive().
 */
export const needsPasswordReVerification = (role: Role) => isSuperAdminTier3(role);

/* ------------------------------------------------------------------ *
 * Ringkasan kapabilitas per role — dipakai middleware `requireRole`.
 * ------------------------------------------------------------------ */
export const CAPABILITIES = {
  input_verifikasi: ['petugas_kesantrian', 'admin_kesantrian', 'super_admin', 'super_admin_tier3'],
  kelola_katalog: ['admin_kesantrian', 'super_admin', 'super_admin_tier3'],
  kelola_reward: ['admin_kesantrian', 'super_admin', 'super_admin_tier3'],
  kelola_pembelian: ['staff_kantin', 'admin_kesantrian', 'super_admin', 'super_admin_tier3'],
  kelola_santri: ['petugas_kesantrian', 'admin_kesantrian', 'super_admin', 'super_admin_tier3'],
  super_admin_panel: ['super_admin', 'super_admin_tier3'],
  /** hanya T3 — destructive */
  super_admin_tier3: ['super_admin_tier3'],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export const hasCapability = (role: Role, cap: Capability): boolean =>
  (CAPABILITIES[cap] as readonly Role[]).includes(role);
