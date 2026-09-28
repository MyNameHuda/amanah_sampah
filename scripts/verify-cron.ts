process.env.DATABASE_URL ??=
  'postgresql://neondb_owner:npg_VASQkM30fKyi@ep-summer-frost-b3k6birj-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
process.env.JWT_SECRET = 'verify-secret-minimal-32-byte-cron';

const { getDb, schema } = await import('../src/server/db/index.ts');
const { inArray, eq, isNotNull } = await import('drizzle-orm');
const { hashPassword } = await import('../src/server/auth/password.ts');
const loginH = (await import('../api/auth/login.ts')).default;
const cronH = (await import('../api/super-admin/cron.ts')).default;
const purgeH = (await import('../api/cron/purge-tokens.ts')).default;
const archiveH = (await import('../api/cron/archive-audit.ts')).default;

let cap: any = {};
const mockRes = () => {
  cap = { status: 0, body: null };
  const r: any = {
    setHeader() {},
    status(s: number) { cap.status = s; return r; },
    json(b: any) {
      cap.body = b;
      if (cap.status >= 500) console.log('   [HTTP ' + cap.status + '] ' + JSON.stringify(b));
      return r;
    },
  };
  return r;
};
const call = (method: string, body?: any, token?: string, query?: any): any => ({
  method, body, query: query ?? {},
  headers: { 'user-agent': 'verify', ...(token ? { authorization: `Bearer ${token}` } : {}) },
});

let passed = 0;
let failed = 0;
function check(n: string, c: boolean, x = '') {
  console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`);
  if (c) passed++;
  else failed++;
}

const db = getDb();
const NIS = '65001111';
const MAIL = { super: 'cr-super@t.local', petugas: 'cr-petugas@t.local' };
const PW_SUPER = 'RahasiaSuperSatu2026';

// Tanggal realistis. Log 6 bulan lalu akan disalin lalu LANGSUNG dipurge
// (itu memang perilaku aslinya); log 2 bulan lalu disalin dan bertahan.
function monthsAgo(n: number, day: number): Date {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  d.setUTCDate(day);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}
const BULAN_LALU = monthsAgo(1, 15);
const JAUH = monthsAgo(4, 10);

let idSuper = 0;

async function bersihkan() {
  await db.delete(schema.personalAccessTokens).where(inArray(schema.personalAccessTokens.tokenableType, ['users']));
  await db.delete(schema.auditLogsArchive).where(isNotNull(schema.auditLogsArchive.originalLogId));
  if (idSuper) await db.delete(schema.auditLogs).where(eq(schema.auditLogs.userId, idSuper));
  await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.action, ['cron.test', 'error.x']));
  await db.delete(schema.santri).where(eq(schema.santri.nis, NIS));
  await db.delete(schema.users).where(inArray(schema.users.email, Object.values(MAIL)));
}

await bersihkan();
const now = new Date();

const superRow = await db.insert(schema.users).values({
  email: MAIL.super, name: 'Super Cron', role: 'super_admin',
  password: await hashPassword(PW_SUPER), mustChangePassword: false, createdAt: now, updatedAt: now,
}).returning({ id: schema.users.id });
idSuper = superRow[0].id;

const petugasRow = await db.insert(schema.users).values({
  email: MAIL.petugas, name: 'Petugas Cron', role: 'petugas_kesantrian',
  password: await hashPassword('RahasiaPetugas2026'), mustChangePassword: false, createdAt: now, updatedAt: now,
}).returning({ id: schema.users.id });
const idPetugas = petugasRow[0].id;

const siswaRow = await db.insert(schema.users).values({
  email: null, name: 'Siswa Cron', role: 'santri', password: await hashPassword('SANTRI1234'),
  createdAt: now, updatedAt: now,
}).returning({ id: schema.users.id });
await db.insert(schema.santri).values({
  nis: NIS, userId: siswaRow[0].id, nama: 'Siswa Cron', kelas: '6-A',
  currentPoin: 0, isBlocked: false, createdAt: now, updatedAt: now,
});

let r = mockRes();
await loginH(call('POST', { login: MAIL.super, password: PW_SUPER }), r);
const tSuper = cap.body?.token;
console.log('SEED OK\n');

console.log('=== 1. STATUS CRON ===');
r = mockRes(); await cronH(call('GET', undefined, tSuper), r);
check('GET status 200', cap.status === 200, String(cap.status));
check('fungsi SQL terpasang', cap.body?.installed === true, JSON.stringify(cap.body?.health));
check('mekanisme = Vercel Cron', /Vercel Cron/.test(cap.body?.schedule?.mechanism ?? ''), cap.body?.schedule?.mechanism?.slice(0, 38));
check('2 job terdaftar', cap.body?.schedule?.jobs?.length === 2, String(cap.body?.schedule?.jobs?.length));
check('ada status CRON_SECRET', 'cron_secret_set' in (cap.body?.schedule ?? {}), String(cap.body?.schedule?.cron_secret_set));
r = mockRes(); await cronH(call('GET', undefined, 'token.palsu.000'), r);
check('tanpa auth ditolak', cap.status === 401, String(cap.status));

console.log('\n=== 2. PURGE TOKEN (dipanggil Vercel Cron) ===');
await db.insert(schema.personalAccessTokens).values([
  { tokenableType: 'users', tokenableId: idPetugas, name: 'kedaluwarsa', token: 'a'.repeat(64), expiresAt: JAUH, lastUsedAt: JAUH, createdAt: JAUH, updatedAt: JAUH },
  { tokenableType: 'users', tokenableId: idPetugas, name: 'tidak-dipakai-lama', token: 'b'.repeat(64), expiresAt: new Date(Date.now() + 86400000), lastUsedAt: JAUH, createdAt: now, updatedAt: now },
  { tokenableType: 'users', tokenableId: idPetugas, name: 'masih-aktif', token: 'c'.repeat(64), expiresAt: new Date(Date.now() + 86400000), lastUsedAt: now, createdAt: now, updatedAt: now },
]);
r = mockRes(); await purgeH(call('GET'), r);
check('purge 200', cap.status === 200, String(cap.status));
check('job name benar', cap.body?.job === 'purge-expired-tokens', String(cap.body?.job));
check('2 token dihapus (expired + lama tak dipakai)', cap.body?.purged === 2, String(cap.body?.purged));
check('cutoff 30 hari', cap.body?.cutoff_days === 30, String(cap.body?.cutoff_days));
const leftToken = await db.select().from(schema.personalAccessTokens).where(eq(schema.personalAccessTokens.tokenableId, idPetugas));
check('token aktif TIDAK dihapus', leftToken.length === 1 && leftToken[0].name === 'masih-aktif', JSON.stringify(leftToken.map((t) => t.name)));

console.log('\n=== 3. ARCHIVE AUDIT ===');
await db.insert(schema.auditLogs).values([
  { userId: idSuper, role: 'super_admin', action: 'cron.test', payload: { n: 1 }, waktu: BULAN_LALU, createdAt: BULAN_LALU, updatedAt: BULAN_LALU },
  { userId: idSuper, role: 'super_admin', action: 'cron.test', payload: { n: 2 }, waktu: JAUH, createdAt: JAUH, updatedAt: JAUH },
  { userId: idSuper, role: 'super_admin', action: 'error.x', payload: { n: 3 }, waktu: now, createdAt: now, updatedAt: now },
]);
r = mockRes(); await archiveH(call('GET'), r);
check('archive 200', cap.status === 200, String(cap.status));
check('ok true', cap.body?.ok === true, String(cap.body?.ok));
check('2 log lama ditandai', cap.body?.marked === 2, String(cap.body?.marked));
check('2 disalin ke arsip', cap.body?.copied === 2, String(cap.body?.copied));
check('arsip lama (4 bulan) dipurge', cap.body?.deleted === 1, String(cap.body?.deleted));
check('audit_logs lama dibersihkan', cap.body?.cleaned === 2, String(cap.body?.cleaned));
const arsip = await db.select().from(schema.auditLogsArchive);
check('arsip menyisakan 1 baris (bulan lalu)', arsip.length === 1, String(arsip.length));
check('arsip punya original_log_id', arsip[0]?.originalLogId !== null && arsip[0]?.originalLogId !== undefined);
check('arsip punya archived_to_table_at', arsip[0]?.archivedToTableAt !== null);
check('payload tersalin utuh', (arsip[0]?.payload as any)?.n === 1, JSON.stringify(arsip[0]?.payload));
const sisaCron = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'cron.test'));
check('cron.test terhapus dari audit_logs', sisaCron.length === 0, String(sisaCron.length));
const logBaru = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'error.x'));
check('log hari INI tetap ada', logBaru.length === 1, String(logBaru.length));

console.log('\n=== 4. IDEMPOTENSI ===');
r = mockRes(); await archiveH(call('GET'), r);
check('jalankan 2x: tidak ada duplikat', cap.body?.copied === 0, String(cap.body?.copied));
check('2x: tidak ada yang baru ditandai', cap.body?.marked === 0, String(cap.body?.marked));
const arsip2 = await db.select().from(schema.auditLogsArchive);
check('jumlah arsip tidak bertambah', arsip2.length === 1, String(arsip2.length));
r = mockRes(); await purgeH(call('GET'), r);
check('purge 2x: nihil', cap.body?.purged === 0, String(cap.body?.purged));

console.log('\n=== 5. MANUAL TRIGGER DARI PANEL ===');
r = mockRes(); await cronH(call('POST', { job: 'purge-tokens' }, tSuper), r);
check('POST 200', cap.status === 200, String(cap.status));
check('ran = purge-tokens', cap.body?.ran === 'purge-tokens', String(cap.body?.ran));
check('hasil ok true', cap.body?.results?.purge_tokens?.ok === true, JSON.stringify(cap.body?.results?.purge_tokens));
check('ada ringkasan tabel', typeof cap.body?.tables?.audit_logs === 'number', JSON.stringify(cap.body?.tables));
r = mockRes(); await cronH(call('POST', { job: 'all' }, tSuper), r);
check('POST all menjalankan keduanya',
  !!cap.body?.results?.purge_tokens && !!cap.body?.results?.archive_audit,
  Object.keys(cap.body?.results ?? {}).join(','));

console.log('\n=== CLEANUP ===');
await bersihkan();
const la = await db.select().from(schema.auditLogs);
check('tak ada audit test tersisa', la.length === 0, String(la.length));
const lar = await db.select().from(schema.auditLogsArchive);
check('tak ada arsip test tersisa', lar.length === 0, String(lar.length));
const lu = await db.select().from(schema.users);
check('tak ada user test tersisa', lu.filter((u) => (u.email ?? '').includes('@t.local')).length === 0, String(lu.length));
const ls = await db.select().from(schema.santri);
check('tak ada siswa test tersisa', ls.length === 0, String(ls.length));

console.log(`\n=== HASIL: ${passed} PASS, ${failed} FAIL ===`);
process.exit(failed > 0 ? 1 : 0);
