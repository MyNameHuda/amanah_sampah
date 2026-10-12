/**
 * Dev server lokal untuk backend — tanpa akun Vercel.
 *
 * Kenapa file ini ada:
 *   CLI Vercel (v56) mensyaratkan login sebelum `vercel dev` bisa jalan.
 *   Untuk pengembangan backend yang tidak butuh deploy, itu hambatan yang
 *   tidak perlu ada. File ini menjalankan router + handler yang sama dengan
 *   produksi di atas `node:http`, dengan kontrak (req, res) milik Vercel.
 *
 * Cara pakai:
 *   Terminal 1:  npm run dev:api      -> API di http://127.0.0.1:3000
 *   Terminal 2:  npm run dev          -> Vite di :5173, proxy /api -> :3000
 *
 * Routing TIDAK diimplementasikan di sini. Dev server ini memanggil
 * `src/server/router.ts` — modul yang sama dengan `api/[[...slug]].ts`, jadi
 * lokal dan produksi tidak bisa berbeda.
 *
 * Yang TIDAK disimulasikan (jadi jangan dipakai menilai perilaku produksi):
 *   - Batas 30 detik per function (vercel.json -> functions.maxDuration)
 *   - Env var per environment Vercel (di sini semua dari .env lokal)
 *   - `process.env.VERCEL` — dipakai http.ts untuk menentukan apakah pesan
 *     error 500 dirahasiakan. Di sini tidak di-set, jadi pesan error asli
 *     tampil di response — persis yang desirable saat debugging.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchRoute, dispatch, ROUTE_COUNT } from '../src/server/router';
import { ROUTES } from '../src/server/routes.generated';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';

// ---------------------------------------------------------------------------
// .env — ditulis manual, tidak memakai dependensi tambahan.
// Urutan: nilai yang sudah ada di environment TIDAK ditimpa, supaya
// `PORT=4000 npm run dev:api` tetap menang.
// ---------------------------------------------------------------------------
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) {
    console.warn('! .env tidak ada. Salin dari .env.example lalu isi nilainya.');
    return;
  }
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// ---------------------------------------------------------------------------
// Routing — BUKAN lagi meniru aturan file-based routing Vercel.
//
// Dev server ini memakai `src/server/router.ts`, modul yang sama persis dengan
// `api/[[...slug]].ts` di produksi. Sebelumnya tiap sisi punya implementasi
// sendiri, dan keduanya bisa berbeda:
//
//   - Vercel menolak deploy karena `api/reset/[nis]/start.ts` dan
//     `api/reset/[reset_id]/apply.ts` memakai nama dynamic segment berbeda di
//     level yang sama. Aturan itu HANYA berlaku di Vercel.
//   - Vercel Hobby membatasi 12 function per deployment; app ini punya 58 route.
//
// Dengan satu router, apa yang lolos tes lokal = apa yang jalan di produksi.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Objek response mirip VercelResponse: yang dipakai seluruh handler adalah
// setHeader / status / json / end / send / writableEnded.
//
// PENTING: ini wrapper objek BARU, bukan ServerResponse yang dimutasi.
// Di Node 24 `writableEnded` dan `statusCode` di ServerResponse punya
// accessor yang tidak bisa di-assign dari luar, jadi menambah properti
// langsung ke `res` akan melempar TypeError. Karena itu semua state
// (`ended`) disimpan di wrapper, dan pemanggilan didelegasikan ke res asli.
// ---------------------------------------------------------------------------
function makeRes(res: http.ServerResponse) {
  let ended = false;

  const r: any = {
    get writableEnded() {
      return ended || res.writableEnded;
    },
    set writableEnded(v: boolean) {
      ended = v;
    },
    get headersSent() {
      return res.headersSent;
    },
    get statusCode() {
      return res.statusCode;
    },
    set statusCode(v: number) {
      res.statusCode = v;
    },

    setHeader: (k: string, v: string | number | string[]) => {
      res.setHeader(k, v as any);
      return r;
    },
    getHeader: (k: string) => res.getHeader(k),
    removeHeader: (k: string) => {
      res.removeHeader(k);
      return r;
    },
    writeHead: (...args: any[]) => {
      (res.writeHead as any)(...args);
      return r;
    },
    write: (chunk: any) => {
      res.write(chunk);
      return true;
    },

    status(code: number) {
      res.statusCode = code;
      return r;
    },
    json(body: unknown) {
      if (r.writableEnded) return r;
      const payload = JSON.stringify(body ?? null);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      ended = true;
      res.end(payload);
      return r;
    },
    send(body: unknown) {
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        if (r.writableEnded) return r;
        ended = true;
        res.end(body as any);
        return r;
      }
      return r.json(body);
    },
    end(...args: any[]) {
      if (r.writableEnded) return r;
      ended = true;
      res.end(...args);
      return r;
    },
    redirect(codeOrUrl: number | string, maybeUrl?: string) {
      const code = typeof codeOrUrl === 'number' ? codeOrUrl : 307;
      const url = typeof codeOrUrl === 'number' ? (maybeUrl ?? '/') : codeOrUrl;
      res.statusCode = code;
      res.setHeader('Location', url);
      ended = true;
      res.end();
      return r;
    },
  };

  return r;
}

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      // 12 MB: cukup jauh di atas payload JSON normal, dan cukup rendah
      // supaya request nakal tidak exhausting RAM dev server.
      if (size > 12 * 1024 * 1024) {
        reject(new Error('Body request terlalu besar.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      const type = String(req.headers['content-type'] ?? '');
      if (type.includes('application/json')) {
        try {
          resolve(JSON.parse(raw));
        } catch {
          // biarkan string apa adanya; readBody() di http.ts yang melempar 400
          resolve(raw);
        }
        return;
      }
      if (type.includes('application/x-www-form-urlencoded')) {
        resolve(Object.fromEntries(new URLSearchParams(raw)));
        return;
      }
      resolve(raw);
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
async function main() {
  loadEnv();

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    // Semua API hidup di bawah /api. Sisanya bukan urusan dev server ini —
    // frontend dilayani Vite di :5173.
    if (!pathname.startsWith('/api/') && pathname !== '/api') {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          message: 'Dev API server hanya melayani /api/*. Buka http://127.0.0.1:5173 untuk UI.',
        }),
      );
      return;
    }

    const route = matchRoute(pathname);

    if (!route) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          message: `Tidak ada handler untuk ${req.method} ${pathname}`,
          hint: 'Coba `npm run dev:api` ulang — daftar route dicetak saat server start.',
        }),
      );
      return;
    }

    // Query string + route param digabung, sama seperti Vercel: keduanya
    // sampai ke handler lewat req.query.
    const query: Record<string, string> = {};
    for (const [k, v] of url.searchParams) query[k] = v;

    let body: unknown;
    try {
      body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
    } catch (e) {
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ message: (e as Error).message }));
      return;
    }

    const vreq: any = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      query,
      body,
      cookies: parseCookies(req.headers.cookie),
      socket: req.socket,
    };

    const vres = makeRes(res);

    try {
      await dispatch(vreq, vres, pathname);
      if (!vres.writableEnded) vres.end();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      if (!res.writableEnded) res.end(JSON.stringify({ message: msg }));
      console.error(`[500] ${req.method} ${pathname} -> ${msg}`);
      if (e instanceof Error && e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
    }

    const ms = Date.now() - started;
    console.log(
      `${res.statusCode >= 400 ? '✗' : '✓'} ${String(res.statusCode)} ` +
        `${req.method?.padEnd(6)} ${pathname}  →  ${route.route.url}  (${ms}ms)`,
    );
  });

  server.listen(PORT, HOST, () => {
    console.log(`\nAPI dev server  http://${HOST}:${PORT}`);
    console.log(`Router          src/server/router.ts (${ROUTE_COUNT} route, sama dengan produksi)`);
    console.log(`DATABASE_URL   ${process.env.DATABASE_URL ? 'terisi' : 'KOSONG — login akan gagal'}`);
    console.log(`JWT_SECRET     ${process.env.JWT_SECRET ? 'terisi' : 'KOSONG — token tidak bisa diverifikasi'}`);
    console.log(`\nRoute terdaftar:`);
    for (const line of listRoutes()) console.log(`  ${line}`);
    console.log(`\nSekarang jalankan \`npm run dev\` di terminal lain untuk UI.\n`);
  });
}

/** Cetak semua route sebagai pola URL yang bisa dibaca manusia. */
function listRoutes(): string[] {
  return ROUTES.map((r) => `  ANY  ${r.url}`).sort();
}

main().catch((e) => {
  console.error('Gagal start:', e);
  process.exit(1);
});
