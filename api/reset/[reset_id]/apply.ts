/**
 * POST /api/reset/{reset_id}/apply — terapkan reset (final).
 *
 * Wajib: step1 sudah dikonfirmasi dan belum pernah di-apply.
 * Efek: poin -> 0, is_blocked -> false. Debts TETAP OPEN (D11).
 *
 * Memakai SELECT ... FOR UPDATE supaya dua admin yang menekan tombol
 * bersamaan tidak bisa menerapkan reset dua kali.
 */
import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { recordAudit } from '../../../src/server/audit';
import { requireAdminOrSuper } from '../../../src/server/http-guards';
import { handler, HttpError, requireAuth, type Ctx } from '../../../src/server/http';
import { serializeReset } from '../../../src/server/http-guards';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');

  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);

  const resetId = Number(ctx.req.query.reset_id ?? ctx.req.query.resetId);
  if (!Number.isInteger(resetId)) {
    throw new HttpError(422, 'reset_id tidak valid.', { field: 'reset_id' });
  }

  const db = getDb();
  const now = new Date();
  let poinSebelum = 0;
  let nis = '';

  await db.transaction(async (tx) => {
    // Lock baris log supaya apply tidak bisa dobel.
    // Raw query dipakai karena Drizzle belum punya select-for-update.
    const raw = await tx.execute(
      sql`select * from reset_denda_log where id = ${resetId} for update`,
    );
    // Bentuk hasil execute berbeda antar versi driver: bisa array langsung
    // atau objek { rows }. Dua-duanya dicoba supaya tidak salah baca.
    const rows = (Array.isArray(raw) ? raw : ((raw as any)?.rows ?? [])) as Record<string, any>[];
    const log = rows[0];
    if (!log) throw new HttpError(404, 'Data reset tidak ditemukan.');

    if (!log.verifikasi_step_1) {
      throw new HttpError(422, 'Step 1 belum dikonfirmasi.', { field: 'reset' });
    }
    if (log.completed_at) {
      throw new HttpError(422, 'Reset sudah di-apply sebelumnya.', { field: 'reset' });
    }

    nis = log.nis as string;
    const [santri] = await tx
      .select()
      .from(schema.santri)
      .where(eq(schema.santri.nis, nis))
      .limit(1);
    if (!santri) throw new HttpError(404, 'Santri tidak ditemukan.');
    poinSebelum = santri.currentPoin;

    await tx
      .update(schema.santri)
      .set({
        currentPoin: 0,
        isBlocked: false,
        blockReason: null,
        blockAt: null,
        resetAt: now,
        updatedAt: now,
      })
      .where(eq(schema.santri.nis, nis));

    await tx.insert(schema.poinLedger).values({
      nis,
      sourceType: 'reset',
      sourceId: resetId,
      poinDelta: -poinSebelum,
      saldoSebelum: poinSebelum,
      saldoSesudah: 0,
      waktu: now,
      createdAt: now,
      updatedAt: now,
    });

    await tx
      .update(schema.resetDendaLog)
      .set({
        verifikasiStep2: true,
        poinSesudah: 0,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.resetDendaLog.id, resetId));
  });

  const [finalLog] = await db
    .select()
    .from(schema.resetDendaLog)
    .where(eq(schema.resetDendaLog.id, resetId))
    .limit(1);

  await recordAudit(
    'reset.complete',
    { reset_id: resetId, nis, poin_before: poinSebelum, poin_after: 0 },
    { userId: auth.sub, role: auth.role, resourceType: 'reset', resourceId: resetId, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    reset: serializeReset(finalLog),
    santri: { nis, current_poin: 0, is_blocked: false },
    message:
      'Reset poin selesai. Poin kembali ke 0. Debts TETAP OPEN — siswa harus return sampah secara bertahap.',
  };
});
