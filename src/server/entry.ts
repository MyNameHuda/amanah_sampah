/**
 * SATU-SATUNYA serverless function di aplikasi ini.
 *
 * Kenapa satu function, bukan 58 file terpisah? Karena Vercel Hobby membatasi
 * 12 function per deployment, sedangkan aplikasi ini punya 58 route.
 *
 * Kenapa file-nya bernama `api/index.js`, bukan `api/[[...slug]].js`?
 * Nama kurung siku ternyata TIDAK bisa diandalkan. Dengan
 * `api/[[...slug]].js`, Vercel mendaftarkannya sebagai route SATU segmen —
 * `vercel inspect` menampilkannya `api/[[...slug]]`, tapi query yang masuk
 * hanya `{"[...slug]": "..."}` (skalar, bukan array), dan `/api/auth/me`
 * membalas NOT_FOUND padahal catch-all seharusnya cocok. Jadi approach-nya
 * dibalik: function diletakkan di `/api` (tanpa kurung) dan routing
 * dilakukan eksplisit lewat `vercel.json`:
 *
 *   { "source": "/api/:path*", "destination": "/api" }
 *
 * Vercel menyuntikkan query `path`, tetapi `req.url` tetap path ASLI yang
 * diminta klien — sudah diverifikasi lewat deployment, bukan asumsi.
 *
 * Handler aslinya tidak berubah sama sekali — semuanya masih default-export
 * di `src/server/routes/**` dan tetap punya file-nya masing-masing. Yang
 * berubah hanya cara route dipilih: `src/server/router.ts`.
 *
 * `scripts/dev-api.mts` memakai router yang sama persis, jadi apa yang
 * diuji lokal = apa yang jalan di produksi.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dispatch } from './router.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel menyUNTIKKAN query `path` dari rewrite `/api/:path*` -> `/api`,
  // tetapi `req.url` tetap path ASLI yang diminta klien — sudah diverifikasi
  // lewat deployment. Jadi pathname dibaca dari `req.url`, bukan dari query.
  const raw = String(req.url ?? '/');
  const pathname = raw.split('?')[0];

  // Normalisasi trailing slash supaya /api/status/ tetap ketemu.
  const clean = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  if (clean === '/' || clean === '') {
    res.status(404).json({ error: 'not_found', message: 'Not found.' });
    return;
  }

  try {
    await dispatch(req, res, clean);
  } catch (err: any) {
    // Handler sudah membungkus error-nya sendiri (src/server/http.ts).
    // Ini jaring pengaman terakhir supaya function tidak crash tanpa balasan.
    if (!res.writableEnded) {
      res.status(500).json({ error: 'internal_error', message: err?.message ?? 'Internal error.' });
    }
  }
}
