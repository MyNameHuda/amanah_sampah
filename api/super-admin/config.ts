/**
 * GET  /api/super-admin/config — semua config setting
 * POST /api/super-admin/config — ubah satu config
 *
 * Validasi per-key: config_settings punya key dengan tipe berbeda.
 * Key numerik (batas poin, target reset) WAJIB integer; key string bebas.
 *
 * Destructive (perlu T3 re-verify): TIDAK. Mengubah config bukan operasi
 * destruktif data, jadi tidak diberi middleware require.password — sama
 * seperti di routes/api.php aslinya.
 */
import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { recordAudit } from '../../src/server/audit';
import { requireSuperAdmin, iso } from '../../src/server/http-guards';
import { handler, HttpError, readBody, requireString, requireAuth, type Ctx } from '../../src/server/http';

/** Key yang HARUS berupa angka. */
const NUMERIC_KEYS = [
  'default_negative_limit', // batas minimum poin (mis. -50)
  'reset_target_poin', // target poin saat reset (biasanya 0)
];

const present = (c: Record<string, any>) => ({
  key: c.key,
  value: c.value,
  description: c.description ?? null,
  updated_by: c.updatedBy ?? null,
  updated_at: iso(c.updatedAt),
});

export default handler(async (ctx: Ctx) => {
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const db = getDb();

  if (ctx.req.method === 'GET') {
    const rows = await db
      .select()
      .from(schema.configSettings)
      .orderBy(asc(schema.configSettings.key));
    return { data: rows.map(present) };
  }

  if (ctx.req.method === 'POST' || ctx.req.method === 'PATCH') {
    const body = readBody(ctx);
    const key = requireString(body, 'key', { max: 50 });
    if (body.value === undefined || body.value === null) {
      throw new HttpError(422, 'Kolom value wajib diisi.', { field: 'value' });
    }

    const [existing] = await db
      .select()
      .from(schema.configSettings)
      .where(eq(schema.configSettings.key, key))
      .limit(1);
    if (!existing) {
      throw new HttpError(422, `Config '${key}' tidak ada.`, { field: 'key' });
    }

    let value: string;
    if (NUMERIC_KEYS.includes(key)) {
      const raw = String(body.value);
      if (!/^-?\d+$/.test(raw.trim())) {
        throw new HttpError(422, `Config '${key}' harus berupa angka.`, { field: 'value' });
      }
      const n = Number(raw.trim());
      // Batas minimum poin harus <= 0. Kalau positif, siswa tidak pernah
      // terblokir dan seluruh mekanisme block jadi tidak berfungsi.
      if (key === 'default_negative_limit' && n > 0) {
        throw new HttpError(422, 'Batas minimum poin harus <= 0 (negatif atau nol).', {
          field: 'value',
        });
      }
      value = String(n);
    } else {
      value = String(body.value);
    }

    const [updated] = await db
      .update(schema.configSettings)
      .set({ value, updatedBy: auth.sub, updatedAt: new Date() })
      .where(eq(schema.configSettings.key, key))
      .returning();

    await recordAudit(
      'superadmin.config_update',
      {
        key,
        new_value: value,
        admin_alasan:
          typeof body.alasan === 'string' && body.alasan ? body.alasan : 'config tweak',
      },
      { userId: auth.sub, role: auth.role, ip: ctx.ip, userAgent: ctx.userAgent },
    );

    return { config: present(updated) };
  }

  throw new HttpError(405, 'Method not allowed.');
});
