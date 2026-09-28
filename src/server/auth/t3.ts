/**
 * [R5] Password re-verification untuk operasi destruktif.
 *
 * Berlaku untuk super_admin_tier3 saja. super_admin (tier 1) bypass.
 * Port dari App\Http\Middleware\RequirePasswordForDestructive.php.
 *
 * Panggil di awal handler SEBELUM melakukan apa pun:
 *   await requireT3Reverify(ctx, auth);
 *
 * Kalau lolos, lanjut. Kalau tidak, lempar HttpError yang sudah membawa
 * `action_required: 'password_reverify'` supaya frontend tahu harus
 * menampilkan dialog password — bukan sekadar menampilkan pesan error.
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index';
import { recordAudit } from '../audit';
import { verifyPassword } from './password';
import { isSuperAdmin, isSuperAdminTier1, isSuperAdminTier3, type Role } from './roles';
import { HttpError, type Ctx } from '../http';

export interface Actor {
  sub: number;
  role: Role;
}

export async function requireT3Reverify(ctx: Ctx, auth: Actor): Promise<void> {
  // Tier 1 bypass total
  if (isSuperAdminTier1(auth.role)) return;

  // Selain T3 juga bypass (admin biasa, petugas, dll) — middleware ini
  // hanya menambah syarat untuk T3, bukan membatasi siapa boleh masuk.
  if (!isSuperAdminTier3(auth.role)) return;
  if (!isSuperAdmin(auth.role)) return;

  const body = (ctx.req.body ?? {}) as Record<string, unknown>;
  const fromHeader = ctx.req.headers['x-re-verified-password'];
  const password =
    (typeof body.password === 'string' && body.password !== '' ? body.password : undefined) ??
    (typeof fromHeader === 'string' ? fromHeader : undefined);

  if (!password) {
    throw new HttpError(403, 'Tier 3 admin harus re-verify password untuk aksi ini.', {
      // Ditandai supaya frontend menampilkan dialog password, bukan pesan biasa
      field: 'password',
      actionRequired: 'password_reverify',
    });
  }

  const db = getDb();
  const [row] = await db
    .select({ password: schema.users.password })
    .from(schema.users)
    .where(eq(schema.users.id, auth.sub))
    .limit(1);

  if (!row || !(await verifyPassword(password, row.password))) {
    throw new HttpError(403, 'Password re-verifikasi gagal.');
  }

  await recordAudit(
    'superadmin.destructive_reverified',
    { path: `/${ctx.req.url ?? ''}`, method: ctx.req.method },
    { userId: auth.sub, role: auth.role, ip: ctx.ip, userAgent: ctx.userAgent },
  );
}
