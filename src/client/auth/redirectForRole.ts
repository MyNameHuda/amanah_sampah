import type { Role } from '../api/client';

export function redirectForRole(role: Role): string {
  switch (role) {
    case 'santri':
      return '/santri';
    case 'staff_kantin':
      return '/staff';
    case 'petugas_kesantrian':
      return '/petugas';
    case 'admin_kesantrian':
      return '/admin';
    case 'super_admin':
    case 'super_admin_tier3':
      return '/super';
    default:
      return '/login';
  }
}
