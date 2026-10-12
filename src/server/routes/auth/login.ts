/**
 * POST /api/auth/login
 *
 * Kontrak TIDAK BOLEH diubah — frontend `AuthContext.login()` sudah
 * kidnapping ke bentuk ini:
 *   request : { login, password }
 *   response: { token, token_expires_in, user: {...} }
 *
 * `login` bisa berupa email (semua role) atau NIS (khusus Siswa).
 */
import { eq, and, isNull } from 'drizzle-orm';
import { getDb, schema } from '../../db/index.ts';
import { verifyPassword } from '../../auth/password.ts';
import { signToken, recordToken } from '../../auth/jwt.ts';
import { recordAudit } from '../../audit.ts';
import {
  handler,
  HttpError,
  readBody,
  requireString,
  readBoolean,
  type Ctx,
} from '../../http.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Laravel default 60 menit; `remember_me` → 7 hari. */
const DEFAULT_TTL_MINUTES = Number(process.env.TOKEN_TTL_MINUTES ?? 60);
const REMEMBER_TTL_MINUTES = 7 * 24 * 60;

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') {
    throw new HttpError(405, 'Method not allowed.');
  }

  const body = readBody(ctx);
  const login = requireString(body, 'login', { max: 255 });
  const password = requireString(body, 'password', { max: 255 });
  const rememberMe = readBoolean(body, 'remember_me');

  const db = getDb();

  // --- Jalur NIS (khusus Siswa) -------------------------------------------
  // Laravel: kalau bukan format email DAN panjang <= 20, coba cari di
  // tabelSiswa lewat NIS.
  if (!EMAIL_RE.test(login) && login.length <= 20) {
    const rows = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.users.role,
        password: schema.users.password,
        suspendedAt: schema.users.suspendedAt,
        mustChangePassword: schema.users.mustChangePassword,
      })
      .from(schema.siswa)
      .innerJoin(schema.users, eq(schema.users.id, schema.siswa.userId))
      .where(and(eq(schema.siswa.nis, login), isNull(schema.siswa.archivedAt)))
      .limit(1);

    const found = rows[0];
    if (found && (await verifyPassword(password, found.password))) {
      if (found.suspendedAt) throw suspendedError();
      return issueToken(ctx, found, rememberMe);
    }
    // Kalau tidak cocok, jatuh ke cek email di bawah (Laravel juga begitu)
  }

  // --- Jalur email ----------------------------------------------------------
  const users = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      password: schema.users.password,
      suspendedAt: schema.users.suspendedAt,
      mustChangePassword: schema.users.mustChangePassword,
    })
    .from(schema.users)
    .where(eq(schema.users.email, login))
    .limit(1);

  const user = users[0];
  if (!user || !(await verifyPassword(password, user.password))) {
    // Pesan SAMA untuk "user tidak ada" dan "password salah" — kalau
    // dibedakan, penyerang bisa menebak email mana yang terdaftar.
    throw new HttpError(422, 'Kredensial salah.', { field: 'login' });
  }
  if (user.suspendedAt) throw suspendedError();

  return issueToken(ctx, user, rememberMe);
});

function suspendedError(): HttpError {
  return new HttpError(422, 'Akun di-suspend. Hubungi admin.', { field: 'login' });
}

interface AuthUserRow {
  id: number;
  email: string | null;
  name: string;
  role: any;
  password: string;
  suspendedAt: Date | null;
  mustChangePassword: boolean;
}

async function issueToken(
  ctx: Ctx,
  user: AuthUserRow,
  rememberMe: boolean,
) {
  const ttlMinutes = rememberMe ? REMEMBER_TTL_MINUTES : DEFAULT_TTL_MINUTES;
  const { token, expiresAt } = await signToken(
    {
      sub: user.id,
      email: user.email ?? '',
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
    ttlMinutes * 60,
  );

  // Catat token supaya bisa dicabut saat logout/suspend.
  // Multi-device allowed (B7) — token lama tidak dihapus.
  const tokenName = `auth-${user.role}${rememberMe ? '-remembered' : ''}`;
  await recordToken(user.id, token, expiresAt, tokenName);

  await recordAudit(
    'auth.login',
    { remember_me: rememberMe },
    { userId: user.id, role: user.role, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    token,
    token_expires_in: ttlMinutes,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      suspended_at: user.suspendedAt ? user.suspendedAt.toISOString() : null,
      must_change_password: Boolean(user.mustChangePassword),
    },
  };
}
