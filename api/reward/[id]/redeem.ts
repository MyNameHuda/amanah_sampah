/**
 * POST /api/reward/{id}/redeem - tukar reward oleh Santri.
 *
 * ATOMIK WAJIB: dua Santri yang redeem bersamaan pada reward dengan stok 1
 * bisa membuat stok minus. Semua penulisan dibungkus db.transaction().
 * Baris reward dikunci dengan SELECT ... FOR UPDATE.
 */
import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../src/server/db/index';
import { recordAudit } from '../../../src/server/audit';
import { serializeReward, serializePenukaran } from '../../../src/server/serialize';
import { isSantri } from '../../../src/server/auth/roles';
import { handler, HttpError, requireAuth, type Ctx } from '../../../src/server/http';

function rowsOf(raw: unknown): Record<string, any>[] {
  if (Array.isArray(raw)) return raw as Record<string, any>[];
  const r = (raw as { rows?: unknown })?.rows;
  return Array.isArray(r) ? (r as Record<string, any>[]) : [];
}

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  const auth = await requireAuth(ctx);
  if (!isSantri(auth.role)) {
    throw new HttpError(422, 'Hanya Santri yang bisa redeem reward.', { field: 'auth' });
  }

  const id = String(ctx.req.query.id ?? '').trim();
  if (!id) throw new HttpError(422, 'id_reward wajib diisi.', { field: 'id_reward' });

  const db = getDb();
  const now = new Date();

  const [santri] = await db
    .select()
    .from(schema.santri)
    .where(eq(schema.santri.userId, auth.sub))
    .limit(1);
  if (!santri) throw new HttpError(404, 'Data santri tidak ditemukan.');

  const [rewardRow] = await db
    .select()
    .from(schema.reward)
    .where(eq(schema.reward.idReward, id))
    .limit(1);
  if (!rewardRow) throw new HttpError(404, 'Reward tidak ditemukan.');
  if (rewardRow.archivedAt) throw new HttpError(422, 'Reward sudah di-archive.');
  if (!rewardRow.statusAktif) throw new HttpError(422, 'Reward sedang nonaktif.');
  if (rewardRow.stok < 1) throw new HttpError(422, 'Stok reward habis.');
  if (santri.currentPoin < rewardRow.biayaPoin) {
    throw new HttpError(
      422,
      `Poin tidak cukup. Dibutuhkan ${rewardRow.biayaPoin} poin, kamu punya ${santri.currentPoin}.`,
      { field: 'poin' },
    );
  }

  const biaya = rewardRow.biayaPoin;
  const saldoSebelum = santri.currentPoin;
  const saldoSesudah = santri.currentPoin - biaya;
  const namaReward = rewardRow.namaReward;
  const stokSisa = rewardRow.stok - 1;

  let penukaranId = 0;

  await db.transaction(async (tx) => {
    // Kunci baris reward lalu baca ulang: mencegah redeem bersamaan.
    const raw = await tx.execute(
      sql`select stok, status_aktif, archived_at from reward where id_reward = ${id} for update`,
    );
    const locked = rowsOf(raw)[0];
    if (!locked) throw new HttpError(404, 'Reward tidak ditemukan.');
    if (locked.archived_at) throw new HttpError(422, 'Reward sudah di-archive.');
    if (!locked.status_aktif) throw new HttpError(422, 'Reward sedang nonaktif.');
    if (Number(locked.stok) < 1) throw new HttpError(422, 'Stok reward habis.');

    const [px] = await tx
      .insert(schema.penukaranReward)
      .values({
        nis: santri.nis,
        idReward: id,
        poinUsed: biaya,
        status: 'redeemed',
        waktu: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.penukaranReward.id });
    penukaranId = px.id;

    await tx
      .update(schema.reward)
      .set({ stok: stokSisa, updatedBy: auth.sub, updatedAt: now })
      .where(eq(schema.reward.idReward, id));

    await tx
      .update(schema.santri)
      .set({ currentPoin: saldoSesudah, updatedAt: now })
      .where(eq(schema.santri.nis, santri.nis));

    await tx.insert(schema.poinLedger).values({
      nis: santri.nis,
      sourceType: 'redeem',
      sourceId: penukaranId,
      poinDelta: -biaya,
      saldoSebelum,
      saldoSesudah,
      waktu: now,
      createdAt: now,
      updatedAt: now,
    });
  });

  const [fresh] = await db
    .select()
    .from(schema.reward)
    .where(eq(schema.reward.idReward, id))
    .limit(1);
  const [px] = await db
    .select()
    .from(schema.penukaranReward)
    .where(eq(schema.penukaranReward.id, penukaranId))
    .limit(1);

  await recordAudit(
    'reward.redeem',
    { reward_id: id, poin_used: biaya, saldo_before: saldoSebelum, saldo_after: saldoSesudah },
    { userId: auth.sub, role: auth.role, resourceType: 'reward', resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  return {
    message: `Berhasil redeem '${namaReward}'. Poin berkurang ${biaya}.`,
    reward: serializeReward(fresh),
    penukaran: serializePenukaran(px),
  };
});
