/**
 * POST /api/reset/{id}/start — mulai reset denda (admin/super admin).
 *
 * CATATAN NAMA PARAMETER: nilai di URL bersifat posisional dan polymorphic.
 * Untuk `/start` nilainya adalah **NIS**, sedangkan untuk `/step1` dan `/apply`
 * nilainya adalah **reset_id** — keduanya menempati segment yang sama.
 * Vercel mewajibkan semua dynamic segment di satu level memakai nama yang
 * sama, jadi foldernya `[reset_id]` dan nilai NIS dibaca dari situ.
 *
 * Kontrak dari ResetController.php. Aturan penting (D10/D11):
 *   - target reset = 0 poin
 *   - debts TETAP OPEN; siswa harus return sampah secara bertahap
 *   - butuh 2 langkah verifikasi (step1 = admin konfirmasi terima pembayaran)
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../db/index.ts';
import { recordAudit } from '../../../audit.ts';
import { requireAdminOrSuper } from '../../../http-guards.ts';
import { handler, HttpError, requireAuth, type Ctx } from '../../../http.ts';
import { serializeReset } from '../../../http-guards.ts';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');

  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);

  // [Fix Vercel] param segment-nya bernama `reset_id`, tapi untuk `/start`
  // nilainya adalah NIS. `nis` dari query string tetap diterima agar
  // panggilan lama tidak ikut rusak.
  const nis = String(ctx.req.query.reset_id ?? ctx.req.query.nis ?? '').trim();
  if (!nis) throw new HttpError(422, 'NIS wajib diisi.', { field: 'nis' });

  const db = getDb();
  const [siswa] = await db.select().from(schema.siswa).where(eq(schema.siswa.nis, nis)).limit(1);
  if (!siswa) throw new HttpError(404, 'Siswa tidak ditemukan.');
  if (!siswa.isBlocked) {
    throw new HttpError(422, 'Siswa tidak dalam keadaan blocked.', { field: 'nis' });
  }

  const now = new Date();
  const [log] = await db
    .insert(schema.resetDendaLog)
    .values({
      nis,
      adminId: auth.sub,
      poinSebelum: siswa.currentPoin,
      poinSesudah: 0, // [v1.1] target = 0
      verifikasiStep1: false,
      verifikasiStep2: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await recordAudit(
    'reset.start',
    { reset_id: log.id, nis, poin_before: siswa.currentPoin },
    { userId: auth.sub, role: auth.role, resourceType: 'reset', resourceId: log.id, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return { reset: serializeReset(log) };
});
