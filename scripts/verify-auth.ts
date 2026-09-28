process.env.DATABASE_URL ??=
  'postgresql://neondb_owner:npg_VASQkM30fKyi@ep-summer-frost-b3k6birj-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
process.env.JWT_SECRET = 'verify-secret-minimal-32-byte-phase2';

const { getDb, schema } = await import('../src/server/db/index.ts');
const { inArray } = await import('drizzle-orm');
const { hashPassword, verifyPassword } = await import('../src/server/auth/password.ts');
const loginH = (await import('../api/auth/login.ts')).default;
const logoutH = (await import('../api/auth/logout.ts')).default;
const meH = (await import('../api/auth/me.ts')).default;
const changeH = (await import('../api/auth/change-password.ts')).default;

let cap: any = {};
const res = () => {
  cap = { status: 0, body: null };
  const r: any = {
    setHeader() {},
    status(s: number) { cap.status = s; return r; },
    json(b: any) { cap.body = b; return r; },
  };
  return r;
};
const req = (m: string, b?: any, t?: string): any => ({
  method: m, body: b,
  headers: { 'user-agent': 'vs', 'x-forwarded-for': '9.9.9.9', ...(t ? { authorization: `Bearer ${t}` } : {}) },
});

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => {
  console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`);
  c ? pass++ : fail++;
};

const db = getDb();
const NIS = '99887766';
const EM = { admin: 'v-admin@t.local', santri: 'v-santri@t.local', susp: 'v-susp@t.local' };
const PW = { admin: 'RahasiaAdmin2026', santri: 'RahasiaSantri2026', susp: 'RahasiaPetugas2026' };
const ACT = ['auth.login', 'auth.logout', 'auth.password_change'];

const clean = async () => {
  await db.delete(schema.personalAccessTokens).where(inArray(schema.personalAccessTokens.tokenableType, ['users']));
  await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.action, ACT));
  await db.delete(schema.transaksiPembelian).where(inArray(schema.transaksiPembelian.nis, [NIS]));
  await db.delete(schema.santri).where(inArray(schema.santri.nis, [NIS]));
  await db.delete(schema.users).where(inArray(schema.users.email, Object.values(EM)));
  await db.delete(schema.produk).where(inArray(schema.produk.barcode, ['8991234567890']));
  await db.delete(schema.kategoriProduk).where(inArray(schema.kategoriProduk.namaKategori, ['Plastik']));
};

await clean();
const now = new Date();
const [a] = await db.insert(schema.users).values({
  email: EM.admin, name: 'Admin Uji', role: 'admin_kesantrian',
  password: await hashPassword(PW.admin), mustChangePassword: false, createdAt: now, updatedAt: now,
}).returning({ id: schema.users.id });
const [s] = await db.insert(schema.users).values({
  email: EM.santri, name: 'Santri Uji', role: 'santri',
  password: await hashPassword(PW.santri), mustChangePassword: true, createdAt: now, updatedAt: now,
}).returning({ id: schema.users.id });
await db.insert(schema.users).values({
  email: EM.susp, name: 'Uji Suspend', role: 'petugas_kesantrian',
  password: await hashPassword(PW.susp), suspendedAt: now, createdAt: now, updatedAt: now,
});
await db.insert(schema.santri).values({
  nis: NIS, userId: s.id, nama: 'Santri Uji', kelas: '10-A', asrama: 'Putra 1',
  currentPoin: 150, isBlocked: false, createdAt: now, updatedAt: now,
});
// produk dulu — transaksi_pembelian punya FK ke produk.barcode
await db.insert(schema.kategoriProduk).values({
  namaKategori: 'Plastik', deskripsi: 'Botol & kemasan', createdAt: now, updatedAt: now,
});
await db.insert(schema.produk).values({
  barcode: '8991234567890', namaProduk: 'Botol Plastik 600ml', idKategori: 1,
  isExcludedFromDebit: false, createdAt: now, updatedAt: now,
});
await db.insert(schema.transaksiPembelian).values({
  nis: NIS, barcode: '8991234567890', qty: 2, penaltyPerUnit: -1,
  status: 'open', staffId: a.id, waktu: now, createdAt: now, updatedAt: now,
});
console.log('SEED: admin=%d simulators=%d\n', a.id, s.id);

console.log('=== 1. LOGIN email ===');
let r = res();
await loginH(req('POST', { login: EM.admin, password: PW.admin }), r);
ok('200', cap.status === 200, String(cap.status));
ok('token ada', typeof cap.body?.token === 'string' && cap.body.token.length > 40);
ok('expires 60 mnt', cap.body?.token_expires_in === 60, String(cap.body?.token_expires_in));
ok('role benar', cap.body?.user?.role === 'admin_kesantrian');
ok('tak bocor password', !JSON.stringify(cap.body).includes(PW.admin));
const adminTok = cap.body?.token;

console.log('\n=== 2. LOGIN NIS (Santri) ===');
r = res();
await loginH(req('POST', { login: NIS, password: PW.santri }), r);
ok('200', cap.status === 200, String(cap.status));
ok('role = santri', cap.body?.user?.role === 'santri');
ok('must_change_password true', cap.body?.user?.must_change_password === true);
const stuntingTok = cap.body?.token;

console.log('\n=== 3. LOGIN ditolak ===');
const bad: [string, string, number][] = [
  ['password salah', { login: EM.admin, password: 'SalahSekali123' }, 422],
  ['email tak ada', { login: 'hantu@t.local', password: PW.admin }, 422],
  ['NIS tak ada', { login: '00000000', password: PW.santri }, 422],
];
for (const [label, body, want] of bad) {
  r = res();
  await loginH(req('POST', body), r);
  ok(label, cap.status === want, `${cap.status} body=${cap.body?.login?.[0] ?? cap.body?.message ?? ''}`);
}
r = res();
await loginH(req('POST', { login: EM.susp, password: PW.susp }), r);
ok('user disuspend ditolak', cap.status === 422 && /suspend/i.test(JSON.stringify(cap.body)), String(cap.body?.login?.[0] ?? cap.body?.message));

console.log('\n=== 4. GET /me ===');
r = res();
await meH(req('GET', undefined, adminTok), r);
ok('200', cap.status === 200, String(cap.status));
ok('role admin', cap.body?.role === 'admin_kesantrian');
ok('tak ada keykei privilege', cap.body?.santri === undefined);

r = res();
await meH(req('GET', undefined, stuntingTok), r);
ok('200 Santri', cap.status === 200, String(cap.status));
ok('prior_open_count = 1', cap.body?.prior_open_count === 1, String(cap.body?.prior_open_count));
ok('penalty_tier = -1', cap.body?.penalty_tier === -1);
ok('santri.nama dari users.name', cap.body?.santri?.nama === 'Santri Uji', String(cap.body?.santri?.nama));
ok('current_poin 150', cap.body?.santri?.current_poin === 150);
ok('is_suspended false', cap.body?.santri?.is_suspended === false);

console.log('\n=== 5. auth guard ===');
r = res();
await meH(req('GET'), r);
ok('tanpa token 401', cap.status === 401, String(cap.status));
r = res();
await meH(req('GET', undefined, 'token.palsu.000'), r);
ok('token ngawur 401', cap.status === 401, String(cap.status));
r = res();
await meH(req('GET', undefined, stuntingTok), r);
ok('token-peerbeda tetap 200', cap.status === 200, String(cap.status));

console.log('\n=== 6. CHANGE PASSWORD ===');
r = res();
await changeH(req('POST', {
  new_password: 'PasswordBaru2026', new_password_confirmation: 'PasswordBaru2026',
  current_password: 'SalahSekali123',
}, adminTok), r);
ok('password lama salah ditolak', cap.status === 422, String(cap.status));
r = res();
await changeH(req('POST', {
  new_password: 'PasswordBaru2026', new_password_confirmation: 'BedaBanget123',
}, adminTok), r);
ok('konfirmasi beda ditolak', cap.status === 422, String(cap.status));
r = res();
await changeH(req('POST', {
  new_password: 'PasswordBaru2026', new_password_confirmation: 'PasswordBaru2026',
  for_first_login: true,
}, adminTok), r);
ok('for_first_login tanpa flag ditolak', cap.status === 422, String(cap.status));
r = res();
await changeH(req('POST', {
  new_password: 'pendek', new_password_confirmation: 'pendek',
  current_password: PW.admin,
}, adminTok), r);
ok('password < 8 ditolak', cap.status === 422, String(cap.status));

r = res();
await changeH(req('POST', {
  new_password: 'PasswordBaru2026', new_password_confirmation: 'PasswordBaru2026',
  current_password: PW.admin,
}, adminTok), r);
ok('ganti password sukses', cap.status === 200, String(cap.status));
ok('semua token dicabut', cap.body?.tokens_revoked >= 1, String(cap.body?.tokens_revoked));
const stored = await db.select().from(schema.users).where(inArray(schema.users.email, [EM.admin]));
ok('hash baru tersimpan', await verifyPassword('PasswordBaru2026', stored[0].password));
ok('must_change_password false', stored[0].mustChangePassword === false);
r = res();
await meH(req('GET', undefined, adminTok), r);
ok('token lama tidak berlaku lagi', cap.status === 401, String(cap.status));

console.log('\n=== 7. LOGOUT ===');
r = res();
await loginH(req('POST', { login: EM.admin, password: 'PasswordBaru2026' }), r);
ok('login ulang dengan password baru', cap.status === 200, String(cap.status));
const t2 = cap.body?.token;
r = res();
await logoutH(req('POST', undefined, t2), r);
ok('logout 200', cap.status === 200, String(cap.status));
r = res();
await meH(req('GET', undefined, t2), r);
ok('token setelah logout ditolak', cap.status === 401, String(cap.status));
r = res();
await logoutH(req('POST', undefined, t2), r);
ok('logout kedua 401', cap.status === 401, String(cap.status));

console.log('\n=== 8. AUDIT LOG ===');
const logs = await db.select().from(schema.auditLogs).where(inArray(schema.auditLogs.action, ACT));
ok('audit login tercatat', logs.some((l) => l.action === 'auth.login'));
ok('audit logout tercatat', logs.some((l) => l.action === 'auth.logout'));
ok('audit punya ip', logs.every((l) => l.ipAddress === '9.9.9.9'));
ok('audit punya role', logs.every((l) => !!l.role));

console.log('\n=== CLEANUP ===');
await clean();
const left = await db.select().from(schema.users);
ok('tak ada user tersisa', left.length === 0, String(left.length));
const lg = await db.select().from(schema.auditLogs);
ok('tak ada audit tersisa', lg.length === 0, String(lg.length));

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
