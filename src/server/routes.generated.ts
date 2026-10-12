/* eslint-disable */
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

import h0 from './routes/auth/change-password.ts';
import h1 from './routes/auth/login.ts';
import h2 from './routes/auth/logout.ts';
import h3 from './routes/auth/me.ts';
import h4 from './routes/cron/archive-audit.ts';
import h5 from './routes/cron/purge-tokens.ts';
import h6 from './routes/kategori/check-name.ts';
import h7 from './routes/kategori/index.ts';
import h8 from './routes/me/profile.ts';
import h9 from './routes/pembelian/index.ts';
import h10 from './routes/produk/[barcode]/index.ts';
import h11 from './routes/produk/[barcode]/log.ts';
import h12 from './routes/produk/[barcode]/unarchive.ts';
import h13 from './routes/produk/check-barcode/[barcode].ts';
import h14 from './routes/produk/index.ts';
import h15 from './routes/produk/scan/[barcode].ts';
import h16 from './routes/reset/[reset_id]/apply.ts';
import h17 from './routes/reset/[reset_id]/start.ts';
import h18 from './routes/reset/[reset_id]/step1.ts';
import h19 from './routes/reward/[id]/archive.ts';
import h20 from './routes/reward/[id]/index.ts';
import h21 from './routes/reward/[id]/redeem.ts';
import h22 from './routes/reward/[id]/restore.ts';
import h23 from './routes/reward/[id]/toggle-active.ts';
import h24 from './routes/reward/admin.ts';
import h25 from './routes/reward/index.ts';
import h26 from './routes/setup/bootstrap-admin.ts';
import h27 from './routes/siswa/[nis]/index.ts';
import h28 from './routes/siswa/[nis]/pembelian.ts';
import h29 from './routes/siswa/index.ts';
import h30 from './routes/siswa/me.ts';
import h31 from './routes/status.ts';
import h32 from './routes/super-admin/audit/search.ts';
import h33 from './routes/super-admin/config.ts';
import h34 from './routes/super-admin/coverage.ts';
import h35 from './routes/super-admin/cron.ts';
import h36 from './routes/super-admin/mode.ts';
import h37 from './routes/super-admin/recompute-saldo.ts';
import h38 from './routes/super-admin/siswa/[nis]/adjust-poin.ts';
import h39 from './routes/super-admin/siswa/[nis]/timeline.ts';
import h40 from './routes/super-admin/system-health.ts';
import h41 from './routes/super-admin/transactions/[txId]/reverse.ts';
import h42 from './routes/super-admin/users/[userId]/delete.ts';
import h43 from './routes/super-admin/users/[userId]/force-logout.ts';
import h44 from './routes/super-admin/users/[userId]/index.ts';
import h45 from './routes/super-admin/users/[userId]/reset-password.ts';
import h46 from './routes/super-admin/users/[userId]/suspend.ts';
import h47 from './routes/super-admin/users/index.ts';
import h48 from './routes/verifikasi/[id]/force-end.ts';
import h49 from './routes/verifikasi/[id]/log.ts';
import h50 from './routes/verifikasi/active.ts';
import h51 from './routes/verifikasi/foto-bukti/presign.ts';
import h52 from './routes/verifikasi/sesi-terbuka.ts';
import h53 from './routes/verifikasi/sesi/[id]/cancel.ts';
import h54 from './routes/verifikasi/sesi/[id]/commit.ts';
import h55 from './routes/verifikasi/sesi/[id]/index.ts';
import h56 from './routes/verifikasi/sesi/[id]/items.ts';
import h57 from './routes/verifikasi/sesi/index.ts';

export type RouteHandler = (req: any, res: any, ...args: any[]) => any;

export interface RouteDef {
  url: string;
  segs: string[];
  handler: RouteHandler;
}

export const ROUTES: RouteDef[] = [
  { url: '/api/auth/change-password', segs: ["auth","change-password"], handler: h0 },
  { url: '/api/auth/login', segs: ["auth","login"], handler: h1 },
  { url: '/api/auth/logout', segs: ["auth","logout"], handler: h2 },
  { url: '/api/auth/me', segs: ["auth","me"], handler: h3 },
  { url: '/api/cron/archive-audit', segs: ["cron","archive-audit"], handler: h4 },
  { url: '/api/cron/purge-tokens', segs: ["cron","purge-tokens"], handler: h5 },
  { url: '/api/kategori/check-name', segs: ["kategori","check-name"], handler: h6 },
  { url: '/api/kategori', segs: ["kategori"], handler: h7 },
  { url: '/api/me/profile', segs: ["me","profile"], handler: h8 },
  { url: '/api/pembelian', segs: ["pembelian"], handler: h9 },
  { url: '/api/produk/[barcode]', segs: ["produk",":barcode"], handler: h10 },
  { url: '/api/produk/[barcode]/log', segs: ["produk",":barcode","log"], handler: h11 },
  { url: '/api/produk/[barcode]/unarchive', segs: ["produk",":barcode","unarchive"], handler: h12 },
  { url: '/api/produk/check-barcode/[barcode]', segs: ["produk","check-barcode",":barcode"], handler: h13 },
  { url: '/api/produk', segs: ["produk"], handler: h14 },
  { url: '/api/produk/scan/[barcode]', segs: ["produk","scan",":barcode"], handler: h15 },
  { url: '/api/reset/[reset_id]/apply', segs: ["reset",":reset_id","apply"], handler: h16 },
  { url: '/api/reset/[reset_id]/start', segs: ["reset",":reset_id","start"], handler: h17 },
  { url: '/api/reset/[reset_id]/step1', segs: ["reset",":reset_id","step1"], handler: h18 },
  { url: '/api/reward/[id]/archive', segs: ["reward",":id","archive"], handler: h19 },
  { url: '/api/reward/[id]', segs: ["reward",":id"], handler: h20 },
  { url: '/api/reward/[id]/redeem', segs: ["reward",":id","redeem"], handler: h21 },
  { url: '/api/reward/[id]/restore', segs: ["reward",":id","restore"], handler: h22 },
  { url: '/api/reward/[id]/toggle-active', segs: ["reward",":id","toggle-active"], handler: h23 },
  { url: '/api/reward/admin', segs: ["reward","admin"], handler: h24 },
  { url: '/api/reward', segs: ["reward"], handler: h25 },
  { url: '/api/setup/bootstrap-admin', segs: ["setup","bootstrap-admin"], handler: h26 },
  { url: '/api/siswa/[nis]', segs: ["siswa",":nis"], handler: h27 },
  { url: '/api/siswa/[nis]/pembelian', segs: ["siswa",":nis","pembelian"], handler: h28 },
  { url: '/api/siswa', segs: ["siswa"], handler: h29 },
  { url: '/api/siswa/me', segs: ["siswa","me"], handler: h30 },
  { url: '/api/status', segs: ["status"], handler: h31 },
  { url: '/api/super-admin/audit/search', segs: ["super-admin","audit","search"], handler: h32 },
  { url: '/api/super-admin/config', segs: ["super-admin","config"], handler: h33 },
  { url: '/api/super-admin/coverage', segs: ["super-admin","coverage"], handler: h34 },
  { url: '/api/super-admin/cron', segs: ["super-admin","cron"], handler: h35 },
  { url: '/api/super-admin/mode', segs: ["super-admin","mode"], handler: h36 },
  { url: '/api/super-admin/recompute-saldo', segs: ["super-admin","recompute-saldo"], handler: h37 },
  { url: '/api/super-admin/siswa/[nis]/adjust-poin', segs: ["super-admin","siswa",":nis","adjust-poin"], handler: h38 },
  { url: '/api/super-admin/siswa/[nis]/timeline', segs: ["super-admin","siswa",":nis","timeline"], handler: h39 },
  { url: '/api/super-admin/system-health', segs: ["super-admin","system-health"], handler: h40 },
  { url: '/api/super-admin/transactions/[txId]/reverse', segs: ["super-admin","transactions",":txId","reverse"], handler: h41 },
  { url: '/api/super-admin/users/[userId]/delete', segs: ["super-admin","users",":userId","delete"], handler: h42 },
  { url: '/api/super-admin/users/[userId]/force-logout', segs: ["super-admin","users",":userId","force-logout"], handler: h43 },
  { url: '/api/super-admin/users/[userId]', segs: ["super-admin","users",":userId"], handler: h44 },
  { url: '/api/super-admin/users/[userId]/reset-password', segs: ["super-admin","users",":userId","reset-password"], handler: h45 },
  { url: '/api/super-admin/users/[userId]/suspend', segs: ["super-admin","users",":userId","suspend"], handler: h46 },
  { url: '/api/super-admin/users', segs: ["super-admin","users"], handler: h47 },
  { url: '/api/verifikasi/[id]/force-end', segs: ["verifikasi",":id","force-end"], handler: h48 },
  { url: '/api/verifikasi/[id]/log', segs: ["verifikasi",":id","log"], handler: h49 },
  { url: '/api/verifikasi/active', segs: ["verifikasi","active"], handler: h50 },
  { url: '/api/verifikasi/foto-bukti/presign', segs: ["verifikasi","foto-bukti","presign"], handler: h51 },
  { url: '/api/verifikasi/sesi-terbuka', segs: ["verifikasi","sesi-terbuka"], handler: h52 },
  { url: '/api/verifikasi/sesi/[id]/cancel', segs: ["verifikasi","sesi",":id","cancel"], handler: h53 },
  { url: '/api/verifikasi/sesi/[id]/commit', segs: ["verifikasi","sesi",":id","commit"], handler: h54 },
  { url: '/api/verifikasi/sesi/[id]', segs: ["verifikasi","sesi",":id"], handler: h55 },
  { url: '/api/verifikasi/sesi/[id]/items', segs: ["verifikasi","sesi",":id","items"], handler: h56 },
  { url: '/api/verifikasi/sesi', segs: ["verifikasi","sesi"], handler: h57 },
];
