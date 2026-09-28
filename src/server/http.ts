/**
 * Helper HTTP untuk Vercel Functions.
 *
 * Menggantikan yang biasanya dilakukan Laravel: parsing body otomatis,
 * validasi, exception handler, dan middleware `auth:sanctum`.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken, AuthError, type TokenPayload } from './auth/jwt';

export interface Ctx {
  req: VercelRequest;
  res: VercelResponse;
  ip: string | null;
  userAgent: string | null;
}

/** Error dengan status HTTP + pesan yang aman ditampilkan ke user. */
export class HttpError extends Error {
  readonly status: number;
  readonly field: string | null;
  /** Marker `suspended` dibaca client.ts untuk redirect ke /login?suspended=1 */
  readonly suspended: boolean;

  constructor(
    status: number,
    message: string,
    opts: { field?: string; suspended?: boolean } = {},
  ) {
    super(message);
    this.status = status;
    this.field = opts.field ?? null;
    this.suspended = opts.suspended ?? false;
  }

  /** Bentuk error Laravel ValidationException: { login: ["Kredensial salah."] } */
  toBody(): Record<string, unknown> {
    const body: Record<string, unknown> = { message: this.message };
    if (this.field) body[this.field] = [this.message];
    if (this.suspended) body.suspended = true;
    return body;
  }
}

export function makeCtx(req: VercelRequest, res: VercelResponse): Ctx {
  const fwd = req.headers['x-forwarded-for'];
  const ip =
    (typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : undefined) ??
    req.headers['x-real-ip'] ??
    null;
  const ua = req.headers['user-agent'];
  return { req, res, ip: typeof ip === 'string' ? ip : null, userAgent: typeof ua === 'string' ? ua : null };
}

/**
 * Body request sudah di-parse otomatis oleh Vercel kalau Content-Type
 * application/json. Kalau tidak (mis. form-encoded), parse manual.
 */
export function readBody(ctx: Ctx): Record<string, unknown> {
  const b = ctx.req.body;
  if (b == null) return {};
  if (typeof b === 'string') {
    if (b === '') return {};
    try {
      return JSON.parse(b) as Record<string, unknown>;
    } catch {
      throw new HttpError(400, 'Body bukan JSON yang valid.');
    }
  }
  if (typeof b === 'object') return b as Record<string, unknown>;
  return {};
}

/** Ambil string wajib; lempar 422 kalau kosong. */
export function requireString(
  body: Record<string, unknown>,
  key: string,
  opts: { min?: number; max?: number } = {},
): string {
  const v = body[key];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new HttpError(422, `Kolom ${key} wajib diisi.`, { field: key });
  }
  const s = v.trim();
  if (opts.min && s.length < opts.min) {
    throw new HttpError(422, `${key} minimal ${opts.min} karakter.`, { field: key });
  }
  if (opts.max && s.length > opts.max) {
    throw new HttpError(422, `${key} maksimal ${opts.max} karakter.`, { field: key });
  }
  return s;
}

export function optionalString(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = body[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

/** Boolean seperti `request()->boolean()` Laravel. */
export function readBoolean(body: Record<string, unknown>, key: string): boolean {
  const v = body[key];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
  return false;
}

/**
 * Middleware `auth:sanctum`. Gagal dengan 401 (bukan 403) supaya client.ts
 * memicu auto-logout.
 */
export async function requireAuth(ctx: Ctx): Promise<TokenPayload> {
  const header = ctx.req.headers.authorization;
  const bearer = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : null;
  if (!bearer) {
    throw new HttpError(401, 'Unauthenticated.');
  }
  try {
    return await verifyToken(bearer);
  } catch (e) {
    if (e instanceof AuthError && e.code === 'revoked' && /suspend/i.test(e.message)) {
      throw new HttpError(403, e.message, { suspended: true });
    }
    throw new HttpError(401, e instanceof Error ? e.message : 'Unauthenticated.');
  }
}

/** Bungkus body dengan status HTTP tertentu (mis. 201 Created). */
export class JsonResult {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {}
}

export const Created = (body: unknown) => new JsonResult(201, body);
export const NoContent = () => new JsonResult(204, null);

/** Pembungkus handler:ubah exception apa pun jadi response JSON. */
export function handler<Args extends unknown[]>(
  fn: (ctx: Ctx, ...args: Args) => Promise<unknown>,
) {
  return async (req: VercelRequest, res: VercelResponse, ...args: Args) => {
    const ctx = makeCtx(req, res);
    try {
      const body = await fn(ctx, ...args);
      if (res.writableEnded) return;
      if (body instanceof JsonResult) {
        if (body.status === 204) return res.status(204).end();
        return res.status(body.status).json(body.body);
      }
      res.status(200).json(body ?? { message: 'OK.' });
    } catch (e) {
      if (res.writableEnded) return;
      if (e instanceof HttpError) {
        return res.status(e.status).json(e.toBody());
      }
      const message = e instanceof Error ? e.message : 'Internal server error';
      // Jangan bocorkan stack trace ke production
      const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
      if (isProd) console.error('[500]', message);
      return res.status(500).json({
        message: isProd ? 'Terjadi kesalahan di server.' : message,
      });
    }
  };
}

/** Batasi method HTTP. */
export function allowMethods(res: VercelResponse, methods: string[]): boolean {
  res.setHeader('Allow', methods.join(', '));
  return false;
}
