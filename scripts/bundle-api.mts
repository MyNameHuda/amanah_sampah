/**
 * Bundel backend menjadi SATU file JavaScript untuk Vercel.
 *
 * Kenapa ini perlu? `@vercel/node` hanya meng-transpile file TypeScript yang
 * berada DI DALAM folder `api/`. File di `src/server/**` ikut ter-serta lewat
 * file tracing, tapi TANPA di-transpile — sehingga import `.ts` berakhir
 * seperti ini di runtime:
 *
 *   ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/src/server/router.ts'
 *   imported from /var/task/api/[[...slug]].js
 *
 * TypeScript lokal dan `vite build` tidak pernah menangkap ini.
 *
 * Kenapa output-nya `api/index.js`, bukan `api/[[...slug]].js`?
 * Karena nama kurung siku TIDAK bisa diandalkan: Vercel mem-parse nama file
 * sebagai route dan hanya segmentsatu yang cocok. Terbukti lewat debug —
 * `api/[[...slug]].js` terdaftar sebagai `api/[...slug]` (satu segmen), query
 *-nya `{"[...slug]": "__debug"}` skalar, dan `/api/auth/me` membalas NOT_FOUND
 * padahal catch-all seharusnya maksudi. Nama tanpa kurung + rewrite eksplisit
 * di vercel.json tidak punya masalah ini sama sekali.
 *
 * `--packages=external` membuat semua import dari node_modules tetap dipakai
 * dari `node_modules` (tidak di-inline), jadi bundle tetap kecil.
 */
import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENTRY = path.join(ROOT, 'src', 'server', 'entry.ts');
const OUT = path.join(ROOT, 'api', 'index.js');

fs.mkdirSync(path.dirname(OUT), { recursive: true });

const result = await build({
  entryPoints: [ENTRY],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
  metafile: true,
});

const bytes = fs.statSync(OUT).size;
const inputs = Object.keys(result.metafile?.inputs ?? {}).length;
console.log(`  ✓ ${path.relative(ROOT, OUT).replace(/\\/g, '/')}  ${(bytes / 1024).toFixed(1)} KB  (${inputs} file di-bundle)`);

// Sanity check: output harus ESM dan meng-export default.
// Catatan: esbuild menaruh statement export di AKHIR file, jadi seluruh
// isi file harus diperiksa — bukan hanya Awal.
const out = fs.readFileSync(OUT, 'utf8');
const hasDefault = /export\s*\{[^}]*\bas default\b[^}]*\}/s.test(out) || /export\s+default\b/.test(out);
if (!hasDefault) {
  console.error('  ✗ output tidak punya default export — Vercel tidak akan menemukan entrypoint');
  process.exit(1);
}
const hasRelativeImport = /from\s*"\.{1,2}\//.test(out);
if (hasRelativeImport) {
  console.error('  ✗ masih ada import relatif di output — bundle tidak tuntas');
  process.exit(1);
}
console.log('  ✓ default export terdeteksi, tidak ada import relatif tersisa');
