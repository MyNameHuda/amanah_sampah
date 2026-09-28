process.env.DATABASE_URL ??=
  'postgresql://neondb_owner:npg_VASQkM30fKyi@ep-summer-frost-b3k6birj-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
process.env.JWT_SECRET = 'verify-secret-minimal-32-byte-super4';
process.env.AWS_ENDPOINT = 'https://akun.r2.cloudflarestorage.com';
process.env.AWS_BUCKET = 'amanah-bukti';

const { getDb, schema } = await import('../src/server/db/index.ts');
const { inArray, eq, and, like } = await import('drizzle-orm');
const { hashPassword, verifyPassword } = await import('../src/server/auth/password.ts');
const loginH = (await import('../api/auth/login.ts')).default;
const healthH = (await import('../api/super-admin/system-health.ts')).default;
const auditH = (await import('../api/super-admin/audit/search.ts')).default;
const covH = (await import('../api/super-admin/coverage.ts')).default;
const tlH = (await import('../api/super-admin/santri/[nis]/timeline.ts')).default;
const foH = (await import('../api/super-admin/users/[userId]/force-logout.ts')).default;
const rpH = (await import('../api/super-admin/users/[userId]/reset-password.ts')).default;
const modeH = (await import('../api/super-admin/mode.ts')).default;
const meH = (await import('../api/auth/me.ts')).default;

let cap: any = {};
const mockRes = () => {
  cap = { status: 0, body: null };
  const r: any = {
    setHeader() {},
    status(s: number) { cap.status = s; return r; },
    json(b: any) { cap.body = b; if (cap.status >= 500) console.log('   [HTTP ' + cap.status + '] ' + JSON.stringify(b)); return r; },
  };
  return r;
};
const call = (method: string, body?: any, token?: string, query?: any): any => ({
  method, body, query: query ?? {},
  headers: { 'user-agent': 'verify', ...(token ? { authorization: `Bearer ${token}` } : {}) },
});

let passed = 0, failed = 0;
function check(n: string, c: boolean, x = '') {
  console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`);
  c ? passed++ : failed++;
}

const db = getDb();
const NIS = '70007777';
const BC = '8990007654321';
const PW_SUPER = 'RahasiaSuperSatu2026';
const ALASAN = 'Alasan yang panjang sekali supaya lolos validasi minimum tiga puluh karakter di sini.';
const MAIL = { super: 's4-super@t.local', admin: 's4-admin@t.local', petugas: 's4-petugas@t.local' };
const CFG = ['default_negative_limit', 'reset_target_poin', 'is_maintenance', 'is_readonly'];
const ACT = ['superadmin.force_logout', 'superadmin.reset_password', 'superadmin.mode_toggle', 'auth.login', 'error.something'];

async function setCfg(k: string, v: string) {
  await db.update(schema.configSettings).set({ value: v, updatedAt: new Date() }).where(eq(schema.configSettings.key, k));
}

async function bersihkan() {
  await db.delete(schema.personalAccessTokens).where(inArray(schema.personalAccessTokens.tokenableType, ['users']));
  await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.action, ACT));
  await db.delete(schema.auditLogs).where(like(schema.auditLogs.action, 'test.%'));
  await db.delete(schema.poinLedger).where(eq(schema.poinLedger.nis, NIS));
  await db.delete(schema.transaksiPembelian).where(eq(schema.transaksiPembelian.nis, NIS));
  await db.delete(schema.santri).where(eq(schema.santri.nis, NIS));
  await db.delete(schema.users).where(inArray(schema.users.email, Object.values(MAIL)));
  await db.delete(schema.users).where(eq(schema.users.email, null));
  await db.delete(schema.produk).where(eq(schema.produk.barcode, BC));
  await db.delete(schema.kategoriProduk).where(eq(schema.kategoriProduk.namaKategori, 'Kat S4'));
  for (const k of CFG) {
    const have = await db.select().from(schema.configSettings).where(eq(schema.configSettings.key, k)).limit(1);
    if (have.length === 0) {
      await db.insert(schema.configSettings).values({ key: k, value: k === 'default_negative_limit' ? '-50' : 'false', updatedAt: new Date() });
    }
  }
  await setCfg('default_negative_limit', '-50');
  await setCfg('reset_target_poin', '0');
  await setCfg('is_maintenance', 'false');
  await setCfg('is_readonly', 'false');
}

await bersihkan();
const now = new Date();
const buat = async (email: string, name: string, role: string, pw: string) =>
  (await db.insert(schema.users).values({
    email, name, role, password: await hashPassword(pw), mustChangePassword: false, createdAt: now, updatedAt: now,
  }).returning({ id: schema.users.id }))[0].id;

const idSuper = await buat(MAIL.super, 'Super Uji', 'super_admin', PW_SUPER);
await buat(MAIL.admin, 'Admin Uji', 'admin_kesantrian', 'RahasiaAdmin2026');
const idPetugas = await buat(MAIL.petugas, 'Petugas Uji', 'petugas_kesantrian', 'RahasiaPetugas2026');
const uS = (await db.insert(schema.users).values({
  email: null, name: 'Siswa Empat', role: 'santri', password: await hashPassword('SANTRI1234'),
  mustChangePassword: false, createdAt: now, updatedAt: now,
}).returning({ id: schema.users.id }))[0].id;
await db.insert(schema.santri).values({ nis: NIS, userId: uS, nama: 'Siswa Empat', kelas: '7-C', currentPoin: 10, isBlocked: false, createdAt: now, updatedAt: now });
const [kat] = await db.insert(schema.kategoriProduk).values({ namaKategori: 'Kat S4', createdAt: now, updatedAt: now }).returning({ id: schema.kategoriProduk.id });
await db.insert(schema.produk).values({ barcode: BC, namaProduk: 'S4 Botol', idKategori: kat.id, createdAt: now, updatedAt: now });
await db.insert(schema.transaksiPembelian).values({ nis: NIS, barcode: BC, qty: 2, penaltyPerUnit: -1, status: 'settled', staffId: idSuper, waktu: now, settledAt: now, createdAt: now, updatedAt: now });
await db.insert(schema.poinLedger).values({ nis: NIS, sourceType: 'purchase', sourceId: null, poinDelta: -2, saldoSebelum: 12, saldoSesudah: 10, waktu: now, createdAt: now, updatedAt: now });
console.log('SEED OK');

async function token(login: string, pw: string) {
  const r = mockRes();
  await loginH(call('POST', { login, password: pw }), r);
  if (cap.status !== 200) console.log('   LOGIN GAGAL', login, cap.status);
  return cap.body?.token as string;
}
const tSuper = await token(MAIL.super, PW_SUPER);
const tAdmin = await token(MAIL.admin, 'RahasiaAdmin2026');
const tPetugas = await token(MAIL.petugas, 'RahasiaPetugas2026');
console.log('');

console.log('=== 1. SYSTEM HEALTH ===');
let r = mockRes(); await healthH(call('GET', undefined, tAdmin), r);
check('admin DITOLAK (super only)', cap.status === 422, String(cap.status));
r = mockRes(); await healthH(call('GET', undefined, tSuper), r);
check('super BOLEH', cap.status === 200, String(cap.status));
check('db_size_kb > 0', cap.body?.db_size_kb > 0, String(cap.body?.db_size_kb));
check('photo_storage_kb null saat pakai S3', cap.body?.photo_storage_kb === null, String(cap.body?.photo_storage_kb));
check('ada catatan storage', /object storage/i.test(cap.body?.photo_storage_note ?? ''), cap.body?.photo_storage_note?.slice(0, 40));
check('total_active_santri 1', cap.body?.total_active_santri === 1, String(cap.body?.total_active_santri));
check('total_staff 1', cap.body?.total_staff === 1, String(cap.body?.total_staff));
check('modes terisi', cap.body?.modes?.is_maintenance === false && cap.body?.modes?.is_readonly === false);
check('config punya 2 key editable', cap.body?.config?.length === 2, String(cap.body?.config?.length));
check('batas poin max = 0', cap.body?.config?.[0]?.max === 0, String(cap.body?.config?.[0]?.max));
check('batas poin min = -1000', cap.body?.config?.[0]?.min === -1000);
check('label config ada', /Batas Minimum Poin/.test(cap.body?.config?.[0]?.label ?? ''));
await modeH(call('POST', { key: 'is_readonly', value: true }, tSuper), r);
r = mockRes(); await healthH(call('GET', undefined, tSuper), r);
check('mode readonly terbaca', cap.body?.modes?.is_readonly === true, String(cap.body?.modes?.is_readonly));
await modeH(call('POST', { key: 'is_readonly', value: false }, tSuper), r);

console.log('');
console.log('=== 2. AUDIT SEARCH (dengan filter NIS) ===');
r = mockRes(); await auditH(call('GET', undefined, tSuper), r);
check('search 200', cap.status === 200, String(cap.status));
check('paginator shape', cap.body?.current_page === 1 && cap.body?.per_page === 50, `${cap.body?.current_page}/${cap.body?.per_page}`);
check('ada total', typeof cap.body?.total === 'number', String(cap.body?.total));
check('log terisi', (cap.body?.data?.length ?? 0) > 0, String(cap.body?.data?.length));
// sisipkan log ber-payload nis untuk menguji filter ->> yang dulu JSON_EXTRACT
await db.insert(schema.auditLogs).values([
  { userId: idSuper, role: 'super_admin', action: 'test.siswa', payload: { nis: NIS }, waktu: now },
  { userId: idSuper, role: 'super_admin', action: 'test.target', payload: { target_nis: NIS }, waktu: now },
  { userId: idSuper, role: 'super_admin', action: 'test.lain', payload: { nis: '00000000' }, waktu: now },
]);
r = mockRes(); await auditH(call('GET', undefined, tSuper, { nis: NIS }), r);
check('filter nis cocok 2 (nis + target_nis)', cap.body?.total === 2, String(cap.body?.total));
r = mockRes(); await auditH(call('GET', undefined, tSuper, { nis: NIS, action: 'test' }), r);
check('filter nis + action ketemu 2', cap.body?.total === 2, String(cap.body?.total));
r = mockRes(); await auditH(call('GET', undefined, tSuper, { action: 'test.lain' }), r);
check('filter action ketemu 1', cap.body?.total === 1, String(cap.body?.total));
r = mockRes(); await auditH(call('GET', undefined, tSuper, { role: 'super_admin' }), r);
check('filter role jalan', cap.body?.total >= 3, String(cap.body?.total));
r = mockRes(); await auditH(call('GET', undefined, tSuper, { from: new Date(now.getTime() + 60000).toISOString() }), r);
check('filter from =::-_- tidak ada', cap.body?.total === 0, String(cap.body?.total));
r = mockRes(); await auditH(call('GET', undefined, tSuper, { user_id: String(idSuper) }), r);
check('filter user_id jalan', cap.body?.total >= 3, String(cap.body?.total));
r = mockRes(); await auditH(call('GET', undefined, tPetugas), r);
check('petugas DITOLAK', cap.status === 422, String(cap.status));

console.log('');
console.log('=== 3. COVERAGE BREAKDOWN ===');
r = mockRes(); await covH(call('GET', undefined, tAdmin), r);
check('admin BOLEH (bukan super only)', cap.status === 200, String(cap.status));
check('data 1 siswa', cap.body?.data?.length === 1, String(cap.body?.data?.length));
const cov = cap.body?.data?.[0];
check('qty_settled 2', cov?.qty_settled === 2, String(cov?.qty_settled));
check('qty_open 0', cov?.qty_open === 0, String(cov?.qty_open));
check('coverage 100%', cov?.coverage_pct === 100, String(cov?.coverage_pct));
r = mockRes(); await covH(call('GET', undefined, tPetugas), r);
check('petugas DITOLAK', cap.status === 422, String(cap.status));
// siswa tanpa transaksi harus muncul dengan coverage null
const uKosong = (await db.insert(schema.users).values({
  email: null, name: 'Siswa Kosong', role: 'santri', password: await hashPassword('SANTRI1234'),
  createdAt: now, updatedAt: now,
}).returning({ id: schema.users.id }))[0].id;
await db.insert(schema.santri).values({ nis: '70008888', userId: uKosong, nama: 'Siswa Kosong', kelas: '7-D', currentPoin: 0, isBlocked: false, createdAt: now, updatedAt: now });
r = mockRes(); await covH(call('GET', undefined, tAdmin), r);
check('siswa tanpa transaksi tetap muncul', cap.body?.data?.length === 2, String(cap.body?.data?.length));
const kosong = (cap.body?.data ?? []).find((d: any) => d.nis === '70008888');
check('coverage null (bukan 0)', kosong?.coverage_pct === null, String(kosong?.coverage_pct));
await db.delete(schema.santri).where(eq(schema.santri.nis, '70008888'));
await db.delete(schema.users).where(eq(schema.users.id, uKosong));

console.log('');
console.log('=== 4. TIMELINE SISWA ===');
r = mockRes(); await tlH(call('GET', undefined, tSuper, { nis: NIS }), r);
check('timeline 200', cap.status === 200, String(cap.status));
check('ada 2 event', cap.body?.timeline?.length === 2, String(cap.body?.timeline?.length));
check('terurut terbaru dulu', cap.body?.timeline?.[0]?.waktu >= cap.body?.timeline?.[1]?.waktu);
check('ada tipe pembelian', (cap.body?.timeline ?? []).some((e: any) => e.type === 'pembelian'));
check('ada tipe poin_ledger', (cap.body?.timeline ?? []).some((e: any) => e.type === 'poin_ledger'));
r = mockRes(); await tlH(call('GET', undefined, tSuper, { nis: '99999999' }), r);
check('NIS tak ada 404', cap.status === 404, String(cap.status));
r = mockRes(); await tlH(call('GET', undefined, tAdmin), r);
check('admin DITOLAK timeline', cap.status === 422, String(cap.status));

console.log('');
console.log('=== 5. FORCE LOGOUT ===');
r = mockRes(); await foH(call('POST', {}, tSuper, { userId: idSuper }), r);
check('force-logout diri sendiri DITOLAK', cap.status === 422, String(cap.status));
r = mockRes(); await foH(call('POST', {}, tSuper, { userId: idPetugas }), r);
check('petugas: 1 sesi dicabut', cap.status === 200 && cap.body?.user?.tokens_revoked === 1, String(cap.body?.user?.tokens_revoked));
// buat sesi untuk petugas lalu logout
const tPetugas2 = await token(MAIL.petugas, 'RahasiaPetugas2026');
r = mockRes(); await foH(call('POST', {}, tSuper, { userId: idPetugas }), r);
check('sesi berikutnya juga dicabut', cap.body?.user?.tokens_revoked === 1, String(cap.body?.user?.tokens_revoked));
r = mockRes(); await meH(call('GET', undefined, tPetugas2, {}), r);
check('token lama mati setelah force-logout', cap.status === 401, String(cap.status));
const foLog = (await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'superadmin.force_logout')))[0];
check('audit force_logout ada', !!foLog);
check('audit punya tokens_revoked', typeof foLog?.payload?.tokens_revoked === 'number', String(foLog?.payload?.tokens_revoked));

console.log('');
console.log('=== 6. RESET PASSWORD ===');
r = mockRes(); await rpH(call('POST', { new_password: 'pendek1A' }, tSuper, { userId: idPetugas }), r);
check('password lemah DITOLAK', cap.status === 422, String(cap.status));
r = mockRes(); await rpH(call('POST', { new_password: 'PasswordBaruKuat2026' }, tSuper, { userId: idPetugas }), r);
check('reset 200', cap.status === 200, String(cap.status));
check('wajib ganti password', cap.body?.user?.must_change_password === true, String(cap.body?.user?.must_change_password));
const row = (await db.select().from(schema.users).where(eq(schema.users.id, idPetugas)))[0];
check('password baru tersimpan', await verifyPassword('PasswordBaruKuat2026', row.password));
check('password lama tidak berlaku', !(await verifyPassword('RahasiaPetugas2026', row.password)));
r = mockRes(); await loginH(call('POST', { login: MAIL.petugas, password: 'PasswordBaruKuat2026' }), r);
check('login dengan password baru jalan', cap.status === 200, String(cap.status));
check('flag must_change_password ikut', cap.body?.user?.must_change_password === true, String(cap.body?.user?.must_change_password));

console.log('');
console.log('=== CLEANUP ===');
await bersihkan();
const lu = await db.select().from(schema.users);
check('tak ada user test tersisa', lu.filter((u) => (u.email ?? '').includes('@t.local')).length === 0, String(lu.length));
const la = await db.select().from(schema.auditLogs);
check('tak ada audit test tersisa', la.length === 0, String(la.length));
const ls = await db.select().from(schema.santri);
check('tak ada siswa test tersisa', ls.length === 0, String(ls.length));
const lc = await db.select().from(schema.kategoriProduk).where(eq(schema.kategoriProduk.namaKategori, 'Kat S4'));
check('tak ada kategori test tersisa', lc.length === 0, String(lc.length));

console.log(`\n=== HASIL: ${passed} PASS, ${failed} FAIL ===`);
process.exit(failed > 0 ? 1 : 0);

