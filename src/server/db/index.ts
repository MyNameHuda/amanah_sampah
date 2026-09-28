/**
 * Koneksi database ke Neon.
 *
 * DRIVER: WebSocket (`neon-serverless`), BUKAN HTTP.
 *
 * Kenapa bukan HTTP: `drizzle-orm/neon-http` TIDAK mendukung transaksi
 * interaktif sama sekali — `db.transaction()` melempar
 * "No transactions support in neon-http driver". Padahal endpoint
 * /api/pembelian dan /api/reset WAJIB atomic: kalau insert transaksi
 * berhasil tapi update saldo gagal, poin siswa jadi tidak sinkron dengan
 * buku besar. Driver WebSocket mendukung `db.transaction()` sungguhan.
 */
import { Pool, neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

export type Database = NeonDatabase<typeof schema>;
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

let cachedPool: Pool | undefined;
let cachedDb: Database | undefined;
let cachedSql: Sql | undefined;

/**
 * Klien Neon HTTP — hanya untuk query yang tidak butuh transaksi.
 * Dipakai /api/status supaya ping tidak memakai koneksi WebSocket.
 */
export function getSql(): Sql {
  if (!cachedSql) cachedSql = neon(requireUrl());
  return cachedSql;
}

/**
 * Instance Drizzle + Pool WebSocket. Disimpan di module scope supaya warm
 * start memakai koneksi yang sama — ini menghemat active CPU yang hanya
 * 4 jam/bulan di Vercel Hobby.
 */
export function getDb(): Database {
  if (!cachedDb) {
    cachedPool = new Pool({ connectionString: requireUrl() });
    cachedDb = drizzle(cachedPool, { schema });
  }
  return cachedDb;
}

export function getPool(): Pool {
  getDb();
  if (!cachedPool) throw new Error('Pool belum diinisialisasi.');
  return cachedPool;
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
