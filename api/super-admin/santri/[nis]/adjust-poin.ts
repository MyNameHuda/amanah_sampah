/**
 * Berbeda dari reverse, ini boleh untuk alasan apa pun (koreksi input petugas,
 * transaksi terlewat, dan lain-lain). Yang mengunci integritas bukan tujuannya,
 * tapi: alasan wajib, password diulang, saldo terkunci, dan selalu ada
 * baris `admin_adjustment` di poin_ledger.
 * tapi: alasan wajib, password diulang, saldo terkunci, dan selalu ada
 * `poin_delta` boleh negatif ATAU positif, tapi nol ditolak — delta 0
 * cuma menghasilkan baris ledger tanpa efek.
 * `poin_delta` boleh negatif ATAU positif, tapi nol ditolak — delta 0
 * cuma menghasilkan baris ledger tanpa efek daniniontet.
 */
import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../../src/server/db/index';
import { recordAudit } from '../../../../src/server/audit';
import { getNegativeLimit } from '../../../../src/server/config';
import { verifyPassword } from '../../../../src/server/auth/password';
import { requireSuperAdmin } from '../../../../src/server/http-guards';
import {
  handler, HttpError, readBody, requireString, requireAuth, type Ctx,
} from '../../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST' && ctx.req.method !== 'PATCH') {
    throw new HttpError(405, 'Method not allowed.');
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);

  const nis = String(ctx.req.query.nis ?? '').trim();
  if (!nis) throw new HttpError(422, 'NIS wajib diisi.', { field: 'nis' });

  const body = readBody(ctx);
  const delta = Number(body.poin_delta);
  if (!Number.isInteger(delta)) {
    throw new HttpError(422, 'poin_delta harus bilangan bulat.', { field: 'poin_delta' });
  }
  if (delta === 0) {
    throw new HttpError(422, 'poin_delta tidak boleh 0.', { field: 'poin_delta' });
  }
  const alasan = requireString(body, 'alasan', { min: 30, max: 500 });
  const reverify = requireString(body, 'password_reverify', { min: 1, max: 255 });

  const db = getDb();
  const [me] = await db
    .select({ password: schema.users.password })
    .from(schema.users)
    .where(eq(schema.users.id, auth.sub))
    .limit(1);
  if (!me || !(await verifyPassword(reverify, me.password))) {
    throw new HttpError(422, 'Password salah.', { field: 'password_reverify' });
  }

  const now = new Date();
  let before = 0;
  let after = 0;
  let isBlocked = false;

  await db.transaction(async (tx2) => {
    await tx2.execute(sql`select current_poin from santri where nis = ${nis} for update`);
    const rows = await tx2.select().from(schema.santri).where(eq(schema.santri.nis, nis)).limit(1);
    const target = rows[0];
    if (!target) throw new HttpError(404, 'Siswa tidak ditemukan.', { field: 'nis' });

    before = target.currentPoin;
    after = before + delta;

    await tx2.insert(schema.poinLedger).values({
      nis,
      sourceType: 'admin_adjustment',
      sourceId: null,
      poinDelta: delta,
      saldoSebelum: before,
      saldoSesudah: after,
      waktu: now,
      createdAt: now,
      updatedAt: now,
    });

    const limit = await getNegativeLimit();
    isBlocked = after <= limit;

    await tx2
      .update(schema.santri)
      .set({
        currentPoin: after,
        isBlocked,
        ...(isBlocked ? {} : { blockReason: null, blockAt: null }),
        updatedAt: now,
      })
      .where(eq(schema.santri.nis, nis));
  });

  await recordAudit(
    'superadmin.adjust_poin',
    { nis, delta, saldo_after: after },
    { userId: auth.sub, role: auth.role, resourceType: 'santri', resourceId: null, adminAlasan: alasan, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    santri: { nis, current_poin: after, is_blocked: isBlocked },
  };
});
