/**
 * POST /api/verifikasi/sesi — buka sesi verifikasi baru.
 *
 * Error 422 saat sesi sudah ada sengaja informatif: menyebut NAMA petugas
 * yang memegang sesi. Kalau cuma "ID: 7", petugas bingung harus cari siapa,
 * padahal solusinya cuma satu: tanya yang memegang sesi itu.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { recordAudit } from '../../../src/server/audit';
import { requireCapability } from '../../../src/server/http-guards';
import { openDebtsFor, presentSantri, assertSantriNotSuspended } from '../../../src/server/verifikasi';
import { handler, HttpError, Created, readBody, requireString, requireAuth, type Ctx } from '../../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  const auth = await requireAuth(ctx);
  requireCapability(auth.role, 'input_verifikasi');

  const body = readBody(ctx);
  const nis = requireString(body, 'nis', { max: 20 });

  const db = getDb();

  const [santri] = await db.select().from(schema.santri).where(eq(schema.santri.nis, nis)).limit(1);
  if (!santri) {
    throw new HttpError(422, `Santri dengan NIS '${nis}' tidak ditemukan.`, { field: 'nis' });
  }

  // Guard akun SISWA (subjek), bukan petugas yang login.
  await assertSantriNotSuspended(nis, auth.role);

  // Cegah multi-session per NIS: satu siswa hanya boleh punya satu sesi terbuka.
  const [bentrok] = await db
    .select()
    .from(schema.sesiVerifikasi)
    .where(and(eq(schema.sesiVerifikasi.nis, nis), isNull(schema.sesiVerifikasi.waktuSelesai)))
    .limit(1);

  if (bentrok) {
    const [holder] = await db
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, bentrok.petugasId))
      .limit(1);
    const pemegang = holder?.name ?? 'petugas lain';
    const milikSendiri = bentrok.petugasId === auth.sub;
    throw new HttpError(
      422,
      milikSendiri
        ? `Kamu masih punya sesi terbuka untuk siswa ini (Sesi #${bentrok.id}). Lanjutkan atau batalkan dulu dari notifikasi di atas.`
        : `Sesi verifikasi untuk siswa ini sedang dipegang oleh ${pemegang} (Sesi #${bentrok.id}). Minta dia menyelesaikan atau membatalkan dulu.`,
      { field: 'nis' },
    );
  }

  const now = new Date();
  const [sesi] = await db
    .insert(schema.sesiVerifikasi)
    .values({ nis, petugasId: auth.sub, waktuMulai: now, createdAt: now, updatedAt: now })
    .returning();

  const debts = await openDebtsFor(nis);
  const dataSantri = await presentSantri(nis);

  await recordAudit('verifikasi.open_sesi', { sesi_id: sesi.id, nis }, {
    userId: auth.sub, role: auth.role, resourceType: 'sesi', resourceId: sesi.id,
    ip: ctx.ip, userAgent: ctx.userAgent,
  });

  return Created({
    sesi: {
      id: sesi.id,
      nis: sesi.nis,
      petugas_id: sesi.petugasId,
      waktu_mulai: sesi.waktuMulai,
      waktu_selesai: null,
      total_poin_change: 0,
      items: [],
    },
    open_debts: debts,
    santri: dataSantri,
  });
});
