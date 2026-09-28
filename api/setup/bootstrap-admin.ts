/**
 * POST/GET /api/setup/bootstrap-admin
 *
 * Membuat akun Super Admin pertama dari environment variable Vercel:
 *   BOOTSTRAP_ADMIN_NAME     (opsional, default "Super Admin Sekolah")
 *   BOOTSTRAP_ADMIN_EMAIL
 *   BOOTSTRAP_ADMIN_PASSWORD
 *
 * Kenapa perlu endpoint ini:
 *   Di Render ada shell + entrypoint yang menjalankan
 *   `php artisan amanah:bootstrap-admin` tiap container boot. Di Vercel
 *   TIDAK ada shell dan TIDAK ada artisan, jadi env var itu tidak akan
 *   pernah dieksekusi sendiri.
 *
 * Sifat endpoint ini:
 *   - IDEMPOTENT: kalau sudah ada super admin, dia tidak melakukan apa-apa
 *     dan akan menolak dengan 409 selamanya.
 *   - SELF-DISABLING: begitu berhasil, mustahil dipanggil lagi.
 *   - Password TIDAK pernah dikembalikan di response.
 *
 * Keamanan:
 *   - Password wajib memenuhi policy (min 12, upper+lower+angka)
 *   - Password default/lengkap dari DatabaseSeeder DITOLAK
 *   - Setelah provisioning, hapus BOOTSTRAP_ADMIN_* dari Vercel
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { hashPassword, checkPasswordPolicy } from '../../src/server/auth/password';

const SUPER_ADMIN_ROLES = ['super_admin', 'super_admin_tier3'] as const;

/**
 * Password yang ada di DatabaseSeeder.php dan sudah PUBLIK di repo GitHub.
 *
 * PENTING: dicek dengan SUBSTRING, bukan persis. Kalau hanya persis,
 * `Petugas12345A` lolos padahal `petugas12345` ada di repo publik —
 * menambah satu karakter sudah cukup untuk lolos. Dan semua entri aslinya
 * < 12 karakter, jadi cek persis hanya akan selalu kalah oleh aturan
 * panjang dan tidak pernah tereksekusi.
 *
 * Ini defense-in-depth, BUKAN jaminan. Perlindungan sebenarnya adalah:
 *   1. endpoint ini self-disabling setelah berhasil sekali
 *   2. env var dihapus dari Vercel setelah provisioning
 */
const PUBLIC_PASSWORD_STEMS = [
  'super12345',
  'admin12345',
  'staff12345',
  'petugas12345',
  'demo12345',
  'amanah1234',
  'admin1234',
  'password',
];

/** True kalau password mengandung salah satu stem publik. */
function containsPublicPasswordStem(pw: string): string | null {
  const lower = pw.toLowerCase();
  for (const stem of PUBLIC_PASSWORD_STEMS) {
    if (lower.includes(stem)) return stem;
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'POST, GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const rawPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '';
  const name = (process.env.BOOTSTRAP_ADMIN_NAME ?? 'Super Admin Sekolah').trim();

  // 1. env var harus lengkap
  const missing: string[] = [];
  if (!email) missing.push('BOOTSTRAP_ADMIN_EMAIL');
  if (!rawPassword) missing.push('BOOTSTRAP_ADMIN_PASSWORD');
  if (missing.length > 0) {
    return res.status(503).json({
      status: 'not_configured',
      message: 'Env var belum lengkap. Isi di Vercel → Settings → Environment Variables.',
      missing,
    });
  }

  // 2. validasi format email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      status: 'invalid_email',
      message: 'BOOTSTRAP_ADMIN_EMAIL bukan format email yang valid.',
    });
  }

  // 3. tolak password turunan yang publik (dicek SEBELUM policy, supaya
  //    cek ini benar-benar tereksekusi)
  const publicStem = containsPublicPasswordStem(rawPassword);
  if (publicStem) {
    return res.status(400).json({
      status: 'public_password_rejected',
      message:
        'Password ini mengandung pola yang ada di DatabaseSeeder.php dan publik di repo GitHub. Pilih yang lain.',
      matched: publicStem,
    });
  }

  // 4. policy password
  const policy = checkPasswordPolicy(rawPassword);
  if (!policy.ok) {
    return res.status(400).json({
      status: 'weak_password',
      message: 'Password tidak memenuhi syarat.',
      problems: policy.problems,
    });
  }

  const db = getDb();

  try {
    // 5. Guard: kalau sudah ada super admin, JANGAN pernah jalan lagi.
    const existingAdmins = await db
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(inArray(schema.users.role, [...SUPER_ADMIN_ROLES]))
      .limit(1);

    if (existingAdmins.length > 0) {
      return res.status(409).json({
        status: 'already_bootstrapped',
        message:
          'Super admin sudah ada. Endpoint ini dinonaktifkan selamanya. Hapus BOOTSTRAP_ADMIN_* dari Vercel.',
        existing: { email: existingAdmins[0].email },
      });
    }

    // 6. email dipakai user lain? (mis. admin non-super)
    const emailTaken = await db
      .select({ id: schema.users.id, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (emailTaken.length > 0) {
      return res.status(409).json({
        status: 'email_taken',
        message: 'Email itu sudah dipakai user lain dengan role berbeda.',
        existingRole: emailTaken[0].role,
      });
    }

    // 7. buat akun
    const passwordHash = await hashPassword(rawPassword);
    const now = new Date();

    const inserted = await db
      .insert(schema.users)
      .values({
        email,
        name,
        role: 'super_admin',
        password: passwordHash,
        mustChangePassword: true, // wajib ganti password di login pertama
        suspendedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.users.id, email: schema.users.email, role: schema.users.role });

    const created = inserted[0];
    if (!created) {
      return res.status(500).json({ status: 'insert_failed' });
    }

    // 8. audit log
    await db.insert(schema.auditLogs).values({
      userId: created.id,
      role: 'super_admin',
      action: 'super_admin.bootstrap',
      resourceType: 'user',
      resourceId: created.id,
      payload: { via: 'env', email },
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      waktu: now,
    });

    return res.status(201).json({
      status: 'created',
      message:
        'Super admin dibuat. Login lalu GANTI PASSWORD, lalu HAPUS BOOTSTRAP_ADMIN_* dari Vercel.',
      user: { id: created.id, email: created.email, role: created.role },
      nextSteps: [
        '1. Buka /login dan masuk dengan email + password di atas',
        '2. Ganti password dari menu profil',
        '3. Di Vercel hapus BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_NAME',
        '4. Menjalankan ulang endpoint ini akan selalu membalas 409',
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return res.status(500).json({ status: 'error', message });
  }
}
