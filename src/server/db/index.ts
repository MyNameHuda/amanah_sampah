/**
 * Koneksi database ke Neon via driver HTTP (bukan TCP).
 *
 * Kenapa wajib HTTP: Vercel Functions tidak punya koneksi TCP persisten ke
 * luar. `@neondatabase/serverless` memakai HTTP sehingga aman di serverless.
 * Membuka socket TCP biasa akan timeout atau gagal.
 */
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type Database = NeonHttpDatabase<typeof schema>;
export type Sql = NeonQueryFunction<boolean, boolean>;

function requireUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL belum di-set. Isi di Vercel → Settings → Environment Variables.',
    );
  }
  return url;
}

let cachedSql: Sql | undefined;
let cachedDb: Database | undefined;

/** Klien Neon mentah — untuk query SQL berparameter. */
export function getSql(): Sql {
  if (!cachedSql) cachedSql = neon(requireUrl());
  return cachedSql;
}

/**
 * Instance Drizzle. Disimpan di module scope supaya warm start memakai
 * koneksi yang sama — ini menghemat active CPU yang hanya 4 jam/bulan
 * di Vercel Hobby.
 */
export function getDb(): Database {
  if (!cachedDb) cachedDb = drizzle(getSql(), { schema });
  return cachedDb;
}

/** Cek koneksi hidup/mati. Dipakai /api/status. */
export async function pingDatabase(): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
}> {
  const started = Date.now();
  try {
    await getSql()`select 1`;
    return { ok: true, latencyMs: Date.now() - started };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: e instanceof Error ? e.message : 'unknown error',
    };
  }
}

export { schema };
