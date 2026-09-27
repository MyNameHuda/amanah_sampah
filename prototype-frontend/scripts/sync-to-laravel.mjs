/**
 * Salin hasil build Vite (`dist/`) ke `prototype/public/` supaya Laravel
 * menyajikan SPA dari domain yang sama dengan API.
 *
 * Kenapa single-origin:
 *  - `src/api/client.ts` memakai base URL relatif `/api`, jadi tidak ada CORS.
 *  - Frontend + API jadi satu deployment unit: satu server, satu domain,
 *    satu tempat rollback.
 *
 * Sifat penting: proses ini MENGHAPUS `public/` lebih dulu supaya asset lama
 * yang sudah renamed (Vite membakura hash ke nama file) tidak menumpuk dan
 * membocorkan file lama ke browser. Hapus dulu, baru salin.
 */
import { cp, rm, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(here, '..');
const laravelRoot = resolve(frontendRoot, '..', 'prototype');
const distDir = join(frontendRoot, 'dist');
const publicDir = join(laravelRoot, 'public');

function fail(message) {
  console.error(`\n[deploy:sync] GAGAL: ${message}\n`);
  process.exit(1);
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(distDir))) {
    fail(`Folder build tidak ditemukan: ${distDir}\nJalankan \`npm run build\` dulu.`);
  }

  const indexHtml = join(distDir, 'index.html');
  if (!(await exists(indexHtml))) {
    fail(`index.html tidak ada di ${distDir} — build-nya tidak lengkap.`);
  }

  // Jaga-Jaga: jangan sampai path public menunjuk ke root drive atau direktori
  // penting karena ada operasi rm -rf di bawah.
  if (!publicDir.startsWith(laravelRoot) || publicDir === laravelRoot) {
    fail(`Target ${publicDir} di luar proyek Laravel — refusing to delete.`);
  }

  console.log(`[deploy:sync] source : ${distDir}`);
  console.log(`[deploy:sync] target : ${publicDir}`);

  await rm(publicDir, { recursive: true, force: true });
  await mkdir(publicDir, { recursive: true });
  await cp(distDir, publicDir, { recursive: true });

  // Tanpa ini, `/storage/...` (foto bukti barcode) tidak bisa diakses.
  const storageLinkSrc = join(publicDir, 'storage');
  const laravelStorage = join(laravelRoot, 'storage', 'app', 'public');
  if (!(await exists(laravelStorage))) {
    await mkdir(laravelStorage, { recursive: true });
  }
  if (!(await exists(storageLinkSrc))) {
    try {
      const { symlink } = await import('node:fs/promises');
      await symlink(laravelStorage, storageLinkSrc, 'junction');
      console.log('[deploy:sync] symlink public/storage dibuat');
    } catch (e) {
      console.warn(`[deploy:sync] symlink public/storage gagal (${e.message}).`);
      console.warn('[deploy:sync] Jalankan manual: php artisan storage:link');
    }
  }

  // Tandai build supaya server bisa cepat membalas dengan cache header yang
  // benar untuk asset ber-hash, dan TIDAK cache untuk index.html.
  await writeFile(
    join(publicDir, '.deploy-manifest.json'),
    JSON.stringify(
      { built_at: new Date().toISOString(), entry: 'index.html' },
      null,
      2
    ) + '\n',
    'utf8'
  );

  const html = await readFile(indexHtml, 'utf8');
  console.log(`[deploy:sync] OK — index.html ${html.length} bytes, masuk ke public/`);
}

main().catch((e) => fail(e.stack || e.message));
