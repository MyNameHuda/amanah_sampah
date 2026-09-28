/**
 * Uji endpoint /api/setup/bootstrap-admin dengan memanggil handler-nya
 * langsung memakai mock req/res. Menguji alur env-var yang Anda minta.
 * Semua data yang dibuat dibersihkan di akhir.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://neondb_owner:npg_VASQkM30fKyi@ep-summer-frost-b3k6birj-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const { getDb, schema } = await import('../src/server/db/index.ts');
const { eq, inArray } = await import('drizzle-orm');
const { default: handler } = await import('../api/setup/bootstrap-admin.ts');

type Captured = { status: number; body: any };

function mockRes(): { res: any; captured: () => Captured } {
  const cap: Captured = { status: 0, body: null };
  const res: any = {
    setHeader() {},
    status(s: number) {
      cap.status = s;
      return res;
    },
    json(b: any) {
      cap.body = b;
      return res;
    },
  };
  return { res, captured: () => cap };
}

const mockReq = (method = 'POST') =>
  ({ method, headers: { 'x-forwarded-for': '1.2.3.4', 'user-agent': 'verify-script' } }) as any;

let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, x = '') => {
  console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`);
  c ? pass++ : fail++;
};

const db = getDb();
const TEST_EMAIL = 'phase1-bootstrap@test.local';
const GOOD_PW = 'RahasiaSuperAdmin2026';

async function cleanup() {
  await db.delete(schema.auditLogs).where(eq(schema.auditLogs.action, 'super_admin.bootstrap'));
  await db.delete(schema.personalAccessTokens).where(eq(schema.personalAccessTokens.tokenableType, 'users'));
  await db.delete(schema.users).where(eq(schema.users.email, TEST_EMAIL));
}

console.log('=== KASUS 1: env var belum lengkap ===');
delete process.env.BOOTSTRAP_ADMIN_EMAIL;
delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
let { res, captured } = mockRes();
await handler(mockReq(), res);
ok('status 503 not_configured', captured().status === 503, captured().body?.status);
ok('menyebutkan env yang kurang', Array.isArray(captured().body?.missing) && captured().body.missing.length === 2);

console.log('\n=== KASUS 2: email tidak valid ===');
process.env.BOOTSTRAP_ADMIN_EMAIL = 'bukan-email';
process.env.BOOTSTRAP_ADMIN_PASSWORD = GOOD_PW;
({ res, captured } = mockRes());
await handler(mockReq(), res);
ok('status 400 invalid_email', captured().status === 400, captured().body?.status);

console.log('\n=== KASUS 3: password lemah ===');
process.env.BOOTSTRAP_ADMIN_EMAIL = TEST_EMAIL;
process.env.BOOTSTRAP_ADMIN_PASSWORD = 'pendek';
({ res, captured } = mockRes());
await handler(mockReq(), res);
ok('status 400 weak_password', captured().status === 400, captured().body?.status);

console.log('\n=== KASUS 4: password turunan yang PUBLIK di repo GitHub ===');
// Semuanya ditolak karena mengandung stem publik (bukan karena panjang):
for (const pw of ['Super12345A', 'Petugas12345A', 'super12345!X', 'admin12345LONG']) {
  process.env.BOOTSTRAP_ADMIN_PASSWORD = pw;
  ({ res, captured } = mockRes());
  await handler(mockReq(), res);
  ok(`ditolak: ${pw}`, captured().body?.status === 'public_password_rejected', captured().body?.status);
}

console.log('\n=== KASUS 5: method tidak diizinkan ===');
process.env.BOOTSTRAP_ADMIN_PASSWORD = GOOD_PW;
({ res, captured } = mockRes());
await handler(mockReq('DELETE'), res);
ok('status 405', captured().status === 405, captured().body?.error);

console.log('\n=== KASUS 5b: password lemah (kurang dari 12 karakter) ===');
process.env.BOOTSTRAP_ADMIN_PASSWORD = 'pendek';
({ res, captured } = mockRes());
await handler(mockReq(), res);
ok('status 400 weak_password', captured().status === 400, captured().body?.status);
process.env.BOOTSTRAP_ADMIN_PASSWORD = GOOD_PW;

console.log('\n=== KASUS 6: sukses membuat super admin ===');
await cleanup();
({ res, captured } = mockRes());
await handler(mockReq(), res);
const created = captured();
ok('status 201 created', created.status === 201, created.body?.status);
ok('role super_admin', created.body?.user?.role === 'super_admin');
ok('mustChangePassword = true', (await db.select({ m: schema.users.mustChangePassword })
  .from(schema.users).where(eq(schema.users.email, TEST_EMAIL)))[0]?.m === true);
ok('password ter-hash (bukan plaintext)', (async () => {
  const u = await db.select({ p: schema.users.password }).from(schema.users)
    .where(eq(schema.users.email, TEST_EMAIL));
  return !!u[0]?.p && !u[0].p.includes(GOOD_PW) && u[0].p.startsWith('$2');
})());
ok('audit log tercatat', (await db.select().from(schema.auditLogs)
  .where(eq(schema.auditLogs.action, 'super_admin.bootstrap'))).length === 1);
ok('response TIDAK membocorkan password',
  !JSON.stringify(created.body).includes(GOOD_PW) && !JSON.stringify(created.body).includes('$2'));

console.log('\n=== KASUS 7: idempoten — panggil kedua kali ===');
({ res, captured } = mockRes());
await handler(mockReq(), res);
ok('status 409 already_bootstrapped', captured().status === 409, captured().body?.status);
ok('tidak membuat user kedua',
  (await db.select().from(schema.users).where(eq(schema.users.email, TEST_EMAIL))).length === 1);

console.log('\n=== KASUS 8: guard juga menolak kalau super admin lain sudah ada ===');
const [{ id: other }] = await db.insert(schema.users).values({
  email: 'phase1-other@test.local', name: 'Super Lain', role: 'super_admin_tier3',
  password: '$2$dummy', createdAt: new Date(), updatedAt: new Date(),
}).returning({ id: schema.users.id });
process.env.BOOTSTRAP_ADMIN_EMAIL = 'phase1-baru@test.local';
({ res, captured } = mockRes());
await handler(mockReq(), res);
ok('ditolak walau email berbeda', captured().status === 409, captured().body?.status);
ok('user baru TIDAK dibuat', (await db.select().from(schema.users)
  .where(eq(schema.users.email, 'phase1-baru@test.local'))).length === 0);

console.log('\n=== CLEANUP ===');
await db.delete(schema.personalAccessTokens).where(inArray(schema.personalAccessTokens.tokenableId, [other]));
await db.delete(schema.users).where(inArray(schema.users.email, [TEST_EMAIL, 'phase1-other@test.local']));
await db.delete(schema.auditLogs).where(eq(schema.auditLogs.action, 'super_admin.bootstrap'));
const left = await db.select().from(schema.users);
ok('tidak ada user tersisa', left.length === 0, `${left.length} user`);

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
