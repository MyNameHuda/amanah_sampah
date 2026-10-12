/**
 * Aturan password — SATU sumber untuk backend dan frontend.
 *
 * Modul ini murni (tanpa bcrypt, tanpa import server), jadi aman di-import
 * dari React. Aturan ini sebelumnya HANYA ada di `src/server/auth/password.ts`,
 * sementara frontend mengetik ulang angkanya sendiri di 4 tempat. Akibatnya UI
 * menulis "minimal 8 karakter" padahal endpoint yang dipanggil butuh 12 +
 * huruf besar + huruf kecil + angka. User mengetik password 8 karakter yang
 * secara visual memenuhi syarat di layar, lalu ditolak tanpa penjelasan.
 *
 * Dua policy, dan memang berbeda karena konteksnya berbeda:
 *
 *  - SELF-SERVICE  — user mengganti password-nya sendiri. Minimal 8, tanpa
 *    syarat komposisi huruf. Ini mengikuti perilaku Laravel asli.
 *  - ADMIN-SET    — admin yang menetapkan password orang lain lewat
 *    "buat user" / "reset password". Lebih ketat: 12 karakter + komposisi
 *    huruf, karena password ini datang dari orang lain, bukan dari pemiliknya.
 */

/** Panjang minimum saat user mengganti password-nya sendiri. */
export const PASSWORD_MIN_SELF = 8;

/** Panjang minimum saat admin menetapkan password untuk orang lain. */
export const PASSWORD_MIN_LENGTH = 12;

export interface PasswordPolicyResult {
  ok: boolean;
  /** Daftar alasan kegagalan, dalam bahasa manusia. */
  problems: string[];
}

/** Syarat admin-set, ditulis untuk ditampilkan di UI. */
export const PASSWORD_RULES: string[] = [
  `Minimal ${PASSWORD_MIN_LENGTH} karakter`,
  'Mengandung huruf besar (A–Z)',
  'Mengandung huruf kecil (a–z)',
  'Mengandung angka (0–9)',
];

/**
 * Policy ketat — dipakai saat admin membuat atau me-reset password user.
 *
 * "Hudz2904" (8 karakter) GAGAL di sini karena kurang dari 12 karakter,
 * meskipun sudah punya huruf besar, huruf kecil, dan angka.
 */
export function checkPasswordPolicy(pw: string | null | undefined): PasswordPolicyResult {
  const problems: string[] = [];
  const value = pw ?? '';
  if (value.length < PASSWORD_MIN_LENGTH) {
    problems.push(`minimal ${PASSWORD_MIN_LENGTH} karakter`);
  }
  if (!/[a-z]/.test(value)) problems.push('harus ada huruf kecil');
  if (!/[A-Z]/.test(value)) problems.push('harus ada huruf besar');
  if (!/[0-9]/.test(value)) problems.push('harus ada angka');
  return { ok: problems.length === 0, problems };
}

/** Policy longgar — dipakai saat user mengganti password-nya sendiri. */
export function checkPasswordLength(
  pw: string | null | undefined,
  min: number = PASSWORD_MIN_SELF,
): PasswordPolicyResult {
  const problems: string[] = [];
  if (!pw || pw.length < min) problems.push(`minimal ${min} karakter`);
  return { ok: problems.length === 0, problems };
}

/** Gabungan beberapa masalah jadi satu kalimat yang enak dibaca. */
export function describeProblems(problems: string[]): string {
  if (problems.length === 0) return '';
  if (problems.length === 1) return problems[0];
  return `${problems.slice(0, -1).join(', ')}, dan ${problems[problems.length - 1]}`;
}
