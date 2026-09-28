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
import { pingDatabase, getDb, schema } from '../src/server/db/index';
import { eq } from 'drizzle-orm';

const VERSION = '1.0.0-phase1';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const started = Date.now();

  const db = pingDatabase();
  const storage = checkStorageEnv();
  const auth = checkAuthEnv();
  const maintenance = await checkMaintenanceMode();

  const body = {
    status: maintenance.isMaintenance ? 'maintenance' : 'running',
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

  return res.status(maintenance.isMaintenance ? 503 : 200).json(body);
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
