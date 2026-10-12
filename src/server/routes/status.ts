/**
 * GET /api/status
 *
 * Health check untuk UptimeRobot / monitoring. Endpoint ini menggantikan
 * `GET /api/status` Laravel yang dipanggil frontend untuk mendeteksi mode
 * maintenance.
 *
 * Tidak butuh auth. Jangan pernah membocorkan nilai env di sini.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pingDatabase, getDb, schema } from '../db/index.ts';
import { eq } from 'drizzle-orm';

const VERSION = '1.0.0-phase1';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const started = Date.now();

  // [Fix] `pingDatabase()` itu async. Dulu dipanggil TANPA await, jadi
  // `db` berisi objek Promise, dan `JSON.stringify(Promise)` = `{}`.
  // Akibatnya `database` selalu `{}` — endpoint health check tidak pernah
  // melaporkan kondisi database sama sekali.
  //
  // Yang lebih berbahaya: saat password database dirotasi, seluruh aplikasi
  // mati (semua query 500) tapi `/api/status` tetap balas 200 dengan
  // `"status":"running"`. Monitoring akan bilang aman sementara app mati
  // total. Sekarang `database.ok` benar-benar mencerminkan kondisi DB.
  const db = await pingDatabase();
  const storage = checkStorageEnv();
  const auth = checkAuthEnv();
  const maintenance = await checkMaintenanceMode();


  // Status keseluruhan juga mengikuti kondisi database: kalau DB mati, app
  // memang tidak bisa dipakai, jadi "running" itu berbohong.
  const healthy = db.ok && !maintenance.isMaintenance;
  const body = {
    status: maintenance.isMaintenance ? 'maintenance' : healthy ? 'running' : 'degraded',
    version: VERSION,
    time: new Date().toISOString(),
    region: process.env.VERCEL_REGION ?? 'unknown',
    // 'sin1' = Singapore. Kalau nilainya iad1 (US), Neon jadi sangat lambat.
    regionOk: (process.env.VERCEL_REGION ?? '').startsWith('sin'),
    maintenance: maintenance.isMaintenance,
    database: db,
    storage: storage.configured,
    auth: auth.configured,
    elapsedMs: Date.now() - started,
  };

  // 503 kalau app tidak bisa dipakai — supaya UptimeRobot/monitoring
  // langsung tahu, bukan diam-diam melihat 200.
  const code = maintenance.isMaintenance ? 503 : healthy ? 200 : 503;
  return res.status(code).json(body);
}

/** Env storage — hanya melaporkan ADA/TIDAK, tidak pernah nilainya. */
function checkStorageEnv() {
  const keys = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_ENDPOINT',
    'AWS_BUCKET',
    'AWS_URL',
    'AWS_DEFAULT_REGION',
  ] as const;
  const missing = keys.filter((k) => !process.env[k]);
  return { configured: missing.length === 0, missing };
}

function checkAuthEnv() {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  return { configured: missing.length === 0, missing };
}

/** Mode maintenance — di Laravel ini file `storage/framework/down`. */
async function checkMaintenanceMode() {
  try {
    const db = getDb();
    const rows = await db
      .select({ value: schema.configSettings.value })
      .from(schema.configSettings)
      .where(eq(schema.configSettings.key, 'is_maintenance'))
      .limit(1);
    return { isMaintenance: rows[0]?.value === 'true' || rows[0]?.value === '1' };
  } catch {
    // DB belum siap — jangan dianggap maintenance, biar status tetap terlihat hidup
    return { isMaintenance: false };
  }
}
