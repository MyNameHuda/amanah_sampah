/**
import { and, gte, isNull, inArray, like, count, desc } from 'drizzle-orm';
 *
 * Entry point utama Panel Super Admin: ukuran database, ukuran storage,
 * jumlah siswa/staff, error terbaru, mode aktif, dan config yang boleh
 * diedit dari UI.
 *
 * Catatan storage: kalau foto sudah di Supabase, "ukuran folder" lokal
 * tidak ada lagi. Menghitungnya berarti mendaftar semua objek di bucket,
 * yang mahal untuk request web. Jadi dikembalikan `null` — lebih jujur
 * daripada melaporkan 0 yang terlihat seperti "folder kosong".
 */
import { and, eq, gte, lte, isNull, inArray, like, count, desc, or } from 'drizzle-orm';
import { getDb, getSql, schema } from '../../src/server/db/index';
import { isReadOnly, isMaintenance, getConfig } from '../../src/server/config';
import { requireSuperAdmin } from '../../src/server/http-guards';
import { handler, requireAuth, type Ctx } from '../../src/server/http';

export default handler(async (ctx: Ctx) => {
  if (ctx.req.method !== 'GET') {
    return { message: 'Gunakan GET.', error: 'method_not_allowed' };
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const db = getDb();

  // Ukuran database. Query pg_database_size tidak gagal di Postgres;
  // kalau driver-nya lain, hasilnya 0 dan endpoint tetap jalan.
  let dbSizeKb = 0;
  try {
    const rows = await getSql()`select pg_database_size(current_database()) / 1024.0 as size_kb`;
    dbSizeKb = Math.round(Number((rows as any[])[0]?.size_kb ?? 0) * 10) / 10;
  } catch {
    dbSizeKb = 0;
  }

  // Ukuran storage foto: hanya bermakna kalau masih di disk lokal.
  const pakeS3 = !!process.env.AWS_ENDPOINT;
  let photoSizeKb: number | null = null;
  let photoNote = '';
  if (pakeS3) {
    photoNote = 'Foto disimpan di object storage (Supabase). Ukuran tidak dihitung — perlu mendaftar semua objek di bucket.';
  } else {
    photoSizeKb = 0;
    photoNote = 'Disimpan di disk lokal (development).';
  }

  const [santriRow] = await db
    .select({ n: count() })
    .from(schema.santri)
    .where(isNull(schema.santri.archivedAt));

  const [staffRow] = await db
    .select({ n: count() })
    .from(schema.users)
    .where(inArray(schema.users.role, ['staff_kantin', 'petugas_kesantrian']));

  // Error 1 jam terakhir — polanya "error" di action, sama seperti aslinya
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recentErrors = await db
    .select()
    .from(schema.auditLogs)
    .where(and(gte(schema.auditLogs.waktu, since), like(schema.auditLogs.action, '%error%')))
    .orderBy(desc(schema.auditLogs.waktu))
    .limit(10);

  const limitRaw = await getConfig('default_negative_limit');
  const targetRaw = await getConfig('reset_target_poin');

  return {
    db_size_kb: dbSizeKb,
    photo_storage_kb: photoSizeKb,
    photo_storage_note: photoNote,
    total_active_santri: Number(santriRow?.n ?? 0),
    total_staff: Number(staffRow?.n ?? 0),
    recent_error_logs_count: recentErrors.length,
    modes: {
      is_maintenance: await isMaintenance(),
      is_readonly: await isReadOnly(),
    },
    // Key yang boleh diedit dari UI, lengkap dengan batasnya
    config: [
      {
        key: 'default_negative_limit',
        label: 'Batas Minimum Poin',
        description: 'Santri otomatis di-block jika saldo turun ke nilai ini (default -50).',
        value: Number(limitRaw ?? -50),
        type: 'number',
        min: -1000,
        // Batas atas 0 bukan hiasan: kalau positif, siswa tidak pernah
        // terblokir dan mekanisme block mati tanpa error.
        max: 0,
      },
      {
        key: 'reset_target_poin',
        label: 'Target Poin saat Reset',
        description: 'Saldo poin target setelah reset (biasanya 0).',
        value: Number(targetRaw ?? 0),
        type: 'number',
        min: 0,
        max: 1000,
      },
    ],
    checked_at: new Date().toISOString(),
  };
});

