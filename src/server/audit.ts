/**
 * Audit log — port dari `App\Models\AuditLog::record()`.
 *
 * PENTING: kegagalan menulis audit log TIDAK boleh menggagalkan request
 * utama. Kalau insert-nya error, log ke console lalu lanjut. Menolak
 * transaksi hanya karena audit gagal akan jauh lebih berbahaya daripada
 * audit yang hilang satu baris.
 */
import { getDb, schema } from './db/index';
import type { Role } from './auth/roles';

export interface AuditOpts {
  /** Default: 'system'. Dipakai saat user belum tersedia (mis. gagal login). */
  role?: Role | 'system';
  userId?: number | null;
  resourceType?: string | null;
  resourceId?: number | null;
  adminAlasan?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(
  action: string,
  payload: Record<string, unknown> = {},
  opts: AuditOpts = {},
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(schema.auditLogs).values({
      userId: opts.userId ?? null,
      role: opts.role ?? 'system',
      action,
      resourceType: opts.resourceType ?? null,
      resourceId: opts.resourceId ?? null,
      payload,
      adminAlasan: opts.adminAlasan ?? null,
      // Truncate sesuai ukuran kolom
      ipAddress: opts.ip ? opts.ip.slice(0, 45) : null,
      userAgent: opts.userAgent ?? null,
      waktu: new Date(),
    });
  } catch (e) {
    console.error('[audit] gagal menulis', action, e instanceof Error ? e.message : e);
  }
}
