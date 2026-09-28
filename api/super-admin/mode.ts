/**
 * POST /api/super-admin/mode — T1.8/T1.9: toggle maintenance / readonly mode.
 *
 * Dua mode ini yang memblokir seluruh aktivitas aplikasi kecuali login:
 *   is_maintenance : aplikasi dimatikan total
 *   is_readonly    : hanya baca, tidak ada perubahan data
 *
 * DILARANG memakai key lain lewat endpoint ini — hanya dua key itu yang
 * diterima, supaya tidak bisa dipakai menyetel `default_negative_limit`
 * atau key sensitif lain lewat jalur yang tidak diaudit.
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { recordAudit } from '../../src/server/audit';
import { requireSuperAdmin, iso } from '../../src/server/http-guards';
import { handler, HttpError, readBody, requireString, requireAuth, type Ctx } from '../../src/server/http';

const ALLOWED_KEYS = ['is_maintenance', 'is_readonly'] as const;
type ModeKey = (typeof ALLOWED_KEYS)[number];

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST' && ctx.req.method !== 'PATCH') {
    throw new HttpError(405, 'Method not allowed.');
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);

  const body = readBody(ctx);
  const key = requireString(body, 'key', { max: 50 });
  if (!ALLOWED_KEYS.includes(key as ModeKey)) {
    throw new HttpError(422, `Key '${key}' bukan mode toggle. Pilih: ${ALLOWED_KEYS.join(' atau ')}.`, {
      field: 'key',
    });
  }

  // WAJIB boolean eksplisit. Kalau tidak, `value: "false"` (string) akan
  // terbaca true dan mematikan aplikasi — jadi ini sengaja ketat.
  if (typeof body.value !== 'boolean') {
    throw new HttpError(422, 'value harus boolean (true/false).', { field: 'value' });
  }
  const value = body.value as boolean;

  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.configSettings)
    .where(eq(schema.configSettings.key, key))
    .limit(1);
  if (!existing) {
    throw new HttpError(422, `Config '${key}' belum ada di database.`, { field: 'key' });
  }

  const [updated] = await db
    .update(schema.configSettings)
    .set({ value: value ? 'true' : 'false', updatedBy: auth.sub, updatedAt: new Date() })
    .where(eq(schema.configSettings.key, key))
    .returning();

  await recordAudit(
    'superadmin.mode_toggle',
    { key, value },
    { userId: auth.sub, role: auth.role, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    config: {
      key: updated.key,
      value: updated.value,
      description: updated.description ?? null,
      updated_by: updated.updatedBy,
      updated_at: iso(updated.updatedAt),
    },
    message:
      key === 'is_maintenance'
        ? value
          ? 'Mode maintenance AKTIF. Aplikasi hanya bisa diakses untuk login.'
          : 'Mode maintenance nonaktif. Aplikasi kembali normal.'
        : value
          ? 'Mode read-only AKTIF. Tidak ada perubahan data yang bisa dilakukan.'
          : 'Mode read-only nonaktif.',
  };
});
