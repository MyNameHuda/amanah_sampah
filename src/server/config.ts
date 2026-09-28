/**
 * Pembacaan config_settings.
 *
 * Nilainya TIDAK di-cache di sini. Di Laravel ada `Cache::forget()` dengan
 * TTL 60 detik — akibatnya admin bisa melihat mode yang sudah dimatikan
 * selama hampir sejam, dan careless toggle terasa "tidakjlaku". Membaca
 * langsung dari DB menambah satu query kecil per halaman, dan menghindari
 * sumber kebingungan itu sepenuhnya.
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from './db/index';

export async function getConfig(key: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ value: schema.configSettings.value })
    .from(schema.configSettings)
    .where(eq(schema.configSettings.key, key))
    .limit(1);
  return row?.value ?? null;
}

function truthy(v: string | null): boolean {
  return v === 'true' || v === '1';
}

/** Mode read-only: tidak boleh ada perubahan data sama sekali. */
export async function isReadOnly(): Promise<boolean> {
  return truthy(await getConfig('is_readonly'));
}

/** Mode maintenance: aplikasi mati total kecuali login. */
export async function isMaintenance(): Promise<boolean> {
  return truthy(await getConfig('is_maintenance'));
}

/** Batas minimum poin. Default 0 kalau key belum ada. */
export async function getNegativeLimit(): Promise<number> {
  const n = Number((await getConfig('default_negative_limit')) ?? 0);
  return Number.isFinite(n) ? n : 0;
}
