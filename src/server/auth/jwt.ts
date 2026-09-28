/**
 * JWT stateless + daftar pencabutan token.
 *
 * Menggantikan Sanctum: Sanctum menyimpan token opaque di tabel
 * `personal_access_tokens`. Di sini JWTandatangani token supaya verifikasi
 * tidak perlu query DB tiap request (hemat active CPU Vercel yang cuma
 * 4 jam/bulan), TAPI tetap simpan SHA-256 token-nya supaya bisa dicabut.
 *
 * Trade-off yang sama seperti Sanctum: token hanya bisa dicabut lewat
 * scheduled task atau cek per-request.
 */
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { getDb, getSql, schema } from '../db/index';
import type { Role } from './roles';

const JWT_ISSUER = 'amanah-sampah';
const DEFAULT_TTL_SECONDS = 60 * 60 * 12; // 12 jam, sama dengan SESSION_LIFETIME di Laravel

export interface TokenPayload {
  /** id user di tabel users */
  sub: number;
  email: string;
  role: Role;
  /** hash token, dipakai untuk pencabutan */
  jti: string;
  /** apakah user wajib ganti password (bisa masuk tapi hanya ke halaman itu) */
  mustChangePassword: boolean;
}

function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    throw new Error(
      'JWT_SECRET belum di-set. Generate dengan: openssl rand -base64 32 atau node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  return new TextEncoder().encode(raw);
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export async function signToken(
  input: Omit<TokenPayload, 'jti'>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const jti = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const token = await new SignJWT({
    email: input.email,
    role: input.role,
    jti,
    mustChangePassword: input.mustChangePassword,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(input.sub))
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecret());

  return { token, jti, expiresAt };
}

export class AuthError extends Error {
  readonly code: 'missing' | 'invalid' | 'expired' | 'revoked';
  constructor(code: AuthError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Verifikasi signature + cek bahwa token belum dicabut.
 * Query ke DB hanya terjadi kalau tokendicabut/disuspend perlu dicek —
 * tapi untuk keamanan, revocation dicek di sini.
 */
export async function verifyToken(token: string): Promise<TokenPayload> {
  let payload: TokenPayload;
  try {
    const { payload: verified } = await jwtVerify(token, getSecret(), {
      issuer: JWT_ISSUER,
    });
    payload = {
      sub: Number(verified.sub),
      email: String(verified.email),
      role: verified.role as Role,
      jti: String(verified.jti),
      mustChangePassword: Boolean(verified.mustChangePassword),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('expired')) throw new AuthError('expired', 'Token kedaluwarsa');
    throw new AuthError('invalid', 'Token tidak valid');
  }

  // cek pencabutan + status suspend user
  const db = getDb();
  const rows = await db
    .select({
      id: schema.personalAccessTokens.id,
      userId: schema.users.id,
      suspendedAt: schema.users.suspendedAt,
    })
    .from(schema.personalAccessTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.personalAccessTokens.tokenableId))
    .where(
      and(
        eq(schema.personalAccessTokens.token, hashToken(token)),
        eq(schema.personalAccessTokens.tokenableType, 'users'),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) throw new AuthError('revoked', 'Token sudah dicabut (logout)');
  if (row.suspendedAt) throw new AuthError('revoked', 'Akun sedang disuspend');

  return payload;
}

/** Catat token yang baru diterbitkan supaya bisa diverifikasi & dicabut. */
export async function recordToken(
  userId: number,
  token: string,
  expiresAt: Date,
  name = 'access',
): Promise<void> {
  const db = getDb();
  await db.insert(schema.personalAccessTokens).values({
    tokenableType: 'users',
    tokenableId: userId,
    name,
    token: hashToken(token),
    expiresAt,
  });
}

/** Cabut satu token (logout). */
export async function revokeToken(token: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(schema.personalAccessTokens)
    .where(eq(schema.personalAccessTokens.token, hashToken(token)))
    .returning({ id: schema.personalAccessTokens.id });
  return deleted.length > 0;
}

/**
 * Cabut semua token milik satu user (dipakai saat suspend, ganti role,
 * atau reset password).
 */
export async function revokeAllForUser(userId: number): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(schema.personalAccessTokens)
    .where(
      and(
        eq(schema.personalAccessTokens.tokenableType, 'users'),
        eq(schema.personalAccessTokens.tokenableId, userId),
      ),
    )
    .returning({ id: schema.personalAccessTokens.id });
  return deleted.length;
}

/**
 * Bersihkan token yang sudah kedaluwarsa.
 * Pengganti `php artisan amanah:purge-expired-tokens --days=30`.
 *
 * PENTING: filter HARUS ada di SQL. Kalau hanya dihapus lewat
 * `.where(isNull(purgedAt))`, semua token aktif ikut terhapus dan
 * setiap user langsung logout.
 *
 * Pakai tagged template Neon (bukan `db.execute(sql, params)`) supaya
 * parameter ter-escape dengan benar.
 */
export async function purgeExpiredTokens(retentionDays = 30): Promise<number> {
  const sql = getSql();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const rows = await sql`
    delete from personal_access_tokens
    where expires_at is not null
      and expires_at < now()
      and updated_at < ${cutoff.toISOString()}
    returning id
  `;
  return Array.isArray(rows) ? rows.length : 0;
}

/** Tandai token sebagai "dipakai" (dipanggil throttled, bukan tiap request). */
export async function touchToken(token: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.personalAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.personalAccessTokens.token, hashToken(token)));
}
