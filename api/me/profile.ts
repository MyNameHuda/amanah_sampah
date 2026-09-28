/**
 * GET  /api/me/profile — profil sendiri + biodata
 * PATCH /api/me/profile — update biodata sendiri
 *
 * Kontrak disalin dari ProfileController.php Laravel:
 *   { user: { id, name, email, role, suspended_at, created_at,
 *             updated_at, biodata: { phone, gender, birth_place,
 *                                    birth_date, address } },
 *     editable_fields: [...],
 *     role_data: {...} }
 */
import { eq, and, count } from 'drizzle-orm';
import { getDb, schema } from '../../src/server/db/index';
import { recordAudit } from '../../src/server/audit';
import { isSantri, ROLE_LABELS, type Role } from '../../src/server/auth/roles';
import { handler, HttpError, readBody, requireAuth, type Ctx } from '../../src/server/http';
import { iso } from '../../src/server/http-guards';

/** Sama persis dengan User::selfEditableFields(). */
const SELF_EDITABLE_FIELDS = ['name', 'phone', 'gender', 'birth_place', 'birth_date', 'address'];

const MAX: Record<string, number> = {
  name: 100, phone: 25, gender: 1, birth_place: 100, address: 500,
};

function biodataOf(u: Record<string, any>) {
  return {
    phone: u.phone ?? null,
    gender: u.gender ?? null,
    birth_place: u.birthPlace ?? null,
    // Laravel: $this->birth_date?->format('Y-m-d')
    birth_date: u.birthDate
      ? new Date(u.birthDate).toISOString().slice(0, 10)
      : null,
    address: u.address ?? null,
  };
}

export default handler(async (ctx: Ctx) => {
  const auth = await requireAuth(ctx);
  const db = getDb();

  const rows = await db.select().from(schema.users).where(eq(schema.users.id, auth.sub)).limit(1);
  const user = rows[0];
  if (!user) throw new HttpError(401, 'User tidak ditemukan.');
  const role = user.role as Role;

  if (ctx.req.method === 'GET') {
    const payload: Record<string, unknown> = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role,
        suspended_at: iso(user.suspendedAt),
        created_at: iso(user.createdAt),
        updated_at: iso(user.updatedAt),
        biodata: biodataOf(user),
      },
      editable_fields: SELF_EDITABLE_FIELDS,
    };

    if (isSantri(role)) {
      const s = await db.select().from(schema.santri).where(eq(schema.santri.userId, user.id)).limit(1);
      const row = s[0];
      if (row) {
        const [open] = await db
          .select({ n: count() })
          .from(schema.transaksiPembelian)
          .where(
            and(
              eq(schema.transaksiPembelian.nis, row.nis),
              eq(schema.transaksiPembelian.status, 'open'),
            ),
          );
        payload.role_data = {
          type: 'santri',
          nis: row.nis,
          kelas: row.kelas,
          asrama: row.asrama,
          current_poin: row.currentPoin,
          is_blocked: row.isBlocked,
          block_reason: row.blockReason,
          prior_open_count: Number(open?.n ?? 0),
          penalty_tier: -1,
        };
      }
    } else {
      payload.role_data = {
        type: role,
        label: ROLE_LABELS[role] ?? role,
      };
    }

    return payload;
  }

  if (ctx.req.method === 'PATCH' || ctx.req.method === 'PUT') {
    const body = readBody(ctx);
    const patch: Record<string, unknown> = {};

    // Hanya field yang ada di allowlist yang diproses. Field lain
    // (email, role, password) SENGAJA diabaikan supaya tidak bisa
    // di-eskalasi lewat endpoint ini.
    if ('name' in body) {
      const v = body.name;
      if (typeof v !== 'string' || v.trim() === '') {
        throw new HttpError(422, 'Kolom name wajib diisi.', { field: 'name' });
      }
      if (v.length > MAX.name) {
        throw new HttpError(422, `name maksimal ${MAX.name} karakter.`, { field: 'name' });
      }
      patch.name = v.trim();
    }
    for (const f of ['phone', 'gender', 'birth_place', 'address'] as const) {
      if (!(f in body)) continue;
      const v = body[f];
      if (v === null) { patch[f] = null; continue; }
      if (typeof v !== 'string') {
        throw new HttpError(422, `Kolom ${f} harus berupa teks.`, { field: f });
      }
      if (v.length > MAX[f]) {
        throw new HttpError(422, `${f} maksimal ${MAX[f]} karakter.`, { field: f });
      }
      patch[f] = v === '' ? null : v;
    }
    if ('gender' in patch && patch.gender !== null && !['L', 'P'].includes(patch.gender as string)) {
      throw new HttpError(422, 'gender harus L atau P.', { field: 'gender' });
    }
    if ('birth_date' in body) {
      const v = body.birth_date;
      if (v === null) { patch.birthDate = null; }
      else {
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          throw new HttpError(422, 'birth_date harus format YYYY-MM-DD.', { field: 'birth_date' });
        }
        if (Number.isNaN(Date.parse(v))) {
          throw new HttpError(422, 'birth_date bukan tanggal valid.', { field: 'birth_date' });
        }
        patch.birthDate = v;
      }
    }

    if (Object.keys(patch).length === 0) {
      throw new HttpError(422, 'Tidak ada field yang di-update.', { field: 'body' });
    }

    const before = biodataOf(user) as Record<string, unknown>;
    await db
      .update(schema.users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.users.id, auth.sub));

    // Sinkronkan ke tabel santri kalau user ini Santri (kolom duplikat legacy).
    // `users.name` tetap jadi sumber kebenaran saat baca.
    const newName = patch.name;
    if (isSantri(role) && typeof newName === 'string') {
      await db
        .update(schema.santri)
        .set({ nama: newName })
        .where(eq(schema.santri.userId, auth.sub));
    }

    await recordAudit(
      'profile.update_self',
      { user_id: auth.sub, fields_updated: Object.keys(patch) },
      { userId: auth.sub, role, ip: ctx.ip, userAgent: ctx.userAgent },
    );

    const fresh = await db.select().from(schema.users).where(eq(schema.users.id, auth.sub)).limit(1);
    const after = biodataOf(fresh[0]) as Record<string, unknown>;
    const diff: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) {
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) diff[k] = after[k];
    }

    return {
      message: 'Biodata berhasil diperbarui.',
      user: {
        id: user.id,
        name: fresh[0].name,
        email: fresh[0].email,
        role,
        biodata: after,
      },
      diff,
    };
  }

  throw new HttpError(405, 'Method not allowed.');
});
