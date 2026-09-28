/**
 * Password hashing.
 *
 * PENTING: pakai `bcryptjs` (JavaScript murni), BUKAN `bcrypt` atau
 * `argon2` (native binding). Native module tidak bisa dibuild di Vercel
 * Functions — build akan gagal dengan "Could not detect platform".
 *
 * Cost 10 (bukan 12 seperti render.yaml) karena ini pure JS: cost 12
 * butuh ~400ms per hash di serverless yang dibatasi active CPU 4 jam/bulan.
 * Naikkan ke 12 nanti kalau sudah pindah ke paid plan.
 */
import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Aturan minimal password. Dipakai juga oleh endpoint bootstrap-admin
 * supaya env var yang tidak valid ketahuan lebih awal.
 */
export const PASSWORD_MIN_LENGTH = 12;

export interface PasswordPolicyResult {
  ok: boolean;
  problems: string[];
}

export function checkPasswordPolicy(pw: string): PasswordPolicyResult {
  const problems: string[] = [];
  if (!pw || pw.length < PASSWORD_MIN_LENGTH) {
    problems.push(`minimal ${PASSWORD_MIN_LENGTH} karakter`);
  }
  if (!/[a-z]/.test(pw)) problems.push('harus ada huruf kecil');
  if (!/[A-Z]/.test(pw)) problems.push('harus ada huruf besar');
  if (!/[0-9]/.test(pw)) problems.push('harus ada angka');
  return { ok: problems.length === 0, problems };
}
