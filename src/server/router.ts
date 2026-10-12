/**
 * Router bersama untuk seluruh backend.
 *
 * SEBELUMNYA routing dilakukan oleh filesystem:
 *   - produksi  → Vercel, dari nama file di `api/**`
 *   - lokal     → scripts/dev-api.mts, dari nama file di `api/**`
 *
 * Itu duplicasi logika, dan hasilnya tidak selalu sama. Contoh nyata: Vercel
 * menolak deploy karena `api/reset/[nis]/start.ts` dan
 * `api/reset/[reset_id]/apply.ts` memakai nama dynamic segment berbeda di level
 * yang sama — sebuah aturan yang HANYA berlaku di Vercel, tidak di dev server.
 * Vercel juga membatasi 12 function per deployment di Hobby, sedangkan app ini
 * punya 58 route.
 *
 * Sekarang keduanya memakai modul ini: satu sumber kebenaran, satu serverless
 * function, dan dev server ikut menguji jalur yang sama dengan produksi.
 */
import { ROUTES, type RouteDef, type RouteHandler } from './routes.generated.ts';

/** Skor sebuah pola segmen: statis menang atas dinamis, kiri lebih penting. */
function segScore(seg: string): number {
  return seg.startsWith(':') ? 0 : 1;
}

const RANKED: { route: RouteDef; score: number[] }[] = ROUTES.map((route) => ({
  route,
  score: route.segs.map(segScore),
}));

// Static sebelum dynamic. Contoh: /api/siswa/me harus menang atas
// /api/siswa/:nis, dan /api/produk/scan/:bc atas /api/produk/:barcode.
RANKED.sort((a, b) => {
  const len = Math.max(a.score.length, b.score.length);
  for (let i = 0; i < len; i++) {
    const x = a.score[i] ?? -1;
    const y = b.score[i] ?? -1;
    if (x !== y) return y - x; // skor lebih tinggi dulu
  }
  return 0;
});

export interface RouteMatch {
  route: RouteDef;
  params: Record<string, string>;
}

/**
 * `segs` di tabel route TIDAK termasuk prefiks `/api`, sedangkan `url` yang
 * dipakai manusia SEDANG memakainya. Jadi `/api` dilepas di sini — pemanggil
 * cukup memberi pathname lengkap.
 */
export function matchRoute(pathname: string): RouteMatch | null {
  let p = pathname.split('?')[0];
  if (p === '/api') p = '/';
  else if (p.startsWith('/api/')) p = p.slice(4);
  const parts = p.split('/').filter(Boolean);
  for (const { route } of RANKED) {
    if (route.segs.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < route.segs.length; i++) {
      const seg = route.segs[i];
      if (seg.startsWith(':')) {
        params[seg.slice(1)] = decodeURIComponent(parts[i]);
      } else if (seg !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

/**
 * Panggil handler yang cocok. Path param disuntik ke `req.query`, persis seperti
 * yang Vercel lakukan pada routing berbasis file — banyak handler membacanya
 * dari `ctx.req.query.<nama>`, bukan dari `ctx.req.params`.
 */
export async function dispatch(
  req: any,
  res: any,
  pathname: string,
): Promise<boolean> {
  const m = matchRoute(pathname);
  if (!m) {
    res.status(404).json({
      error: 'not_found',
      message: `Route tidak ditemukan: ${pathname}`,
    });
    return false;
  }
  req.query = { ...(req.query ?? {}), ...m.params };
  await (m.route.handler as RouteHandler as any)(req, res);
  return true;
}

export const ROUTE_COUNT = ROUTES.length;
