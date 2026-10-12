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

/* Aturan password TIDAK didefinisikan di sini — semuanya ada di
 * `src/shared/password-policy.ts` supaya backend dan frontend memakai angka
 * yang sama. Dulu aturan hanya hidup di file ini, sementara frontend
 * menulis ulang "minimal 8 karakter" sendiri-sendiri, dan keduanya berbeda
 * dari apa yang benar-benar divalidasi server. */
export {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_SELF,
  PASSWORD_RULES,
  checkPasswordPolicy,
  checkPasswordLength,
  describeProblems,
} from '../../shared/password-policy.ts';
export type { PasswordPolicyResult } from '../../shared/password-policy.ts';
