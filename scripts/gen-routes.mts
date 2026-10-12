/**
 * GENERATOR route table.
 *
 * Di dalam serverless function Vercel, `fs.readdir` tidak bisa dipakai untuk
 * mencari handler — filesystem sudah dibundle. Jadi tabel route harus STATIS:
 * semua handler di-import eksplisit di sini.
 *
 * Jalankan setiap kali ada file baru di `src/server/routes/`:
 *     npm run gen:routes
 *
 * File `src/server/routes.generated.ts` dibuat oleh script ini — jangan diedit manual.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ROUTES = path.join(ROOT, 'src', 'server', 'routes');
const OUT = path.join(ROOT, 'src', 'server', 'routes.generated.ts');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

interface Entry { file: string; url: string; segs: string[] }

const entries: Entry[] = [];
for (const abs of walk(ROUTES)) {
  const rel = path.relative(ROUTES, abs).replace(/\\/g, '/'); // auth/login.ts | auth/index.ts | index.ts
  const parts = rel.replace(/\.ts$/, '').split('/');
  // `index.ts` MEWAKILI direktorinya sendiri (konvensi Vercel):
  //   index.ts            -> /api
  //   auth/index.ts       -> /api/auth
  //   produk/index.ts     -> /api/produk
  //   auth/login.ts       -> /api/auth/login
  const segs = parts[parts.length - 1] === 'index' ? parts.slice(0, -1) : parts;
  const url = '/api' + (segs.length ? '/' + segs.join('/') : '');
  entries.push({
    file: rel,
    url,
    segs: segs.map((s) => (s.startsWith('[') && s.endsWith(']') ? `:${s.slice(1, -1)}` : s)),
  });
}

entries.sort((a, b) => a.file.localeCompare(b.file));

const importLines = entries.map((e, i) => `import h${i} from './routes/${e.file.replace(/\.ts$/, '')}.ts';`);

const body = `/* eslint-disable */
/**
 * DIBUANG OTOMATIS oleh scripts/gen-routes.mts — jangan diedit manual.
 * Sumber kebenaran: isi folder src/server/routes/
 *
 * Dipakai oleh src/server/router.ts untuk pencocokan path, dan hanya itu.
 * Seluruh 58 handler jadi SATU serverless function lewat api/[[...slug]].ts
 * karena Vercel Hobby hanya mengizinkan 12 function per deployment.
 *
 * PENTING: import wajib ber-ekstensi .ts. package.json memakai
 * "type": "module", jadi Vercel menjalankan function sebagai ESM native yang
 * menolak specifier tanpa ekstensi (ERR_MODULE_NOT_FOUND).
 */

${importLines.join('\n')}

export type RouteHandler = (req: any, res: any, ...args: any[]) => any;

export interface RouteDef {
  url: string;
  segs: string[];
  handler: RouteHandler;
}

export const ROUTES: RouteDef[] = [
${entries.map((e, i) => `  { url: '${e.url}', segs: ${JSON.stringify(e.segs)}, handler: h${i} },`).join('\n')}
];
`;

fs.writeFileSync(OUT, body, 'utf8');
console.log(`  ✓ ${entries.length} route ditulis ke src/server/routes.generated.ts`);
console.log(`  URL unik: ${new Set(entries.map((e) => e.url)).size}/${entries.length}`);
