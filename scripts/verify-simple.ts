process.env.DATABASE_URL ??=
  'postgresql://neondb_owner:npg_VASQkM30fKyi@ep-summer-frost-b3k6birj-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
process.env.JWT_SECRET = 'verify-secret-minimal-32-byte-phase2b';

const { getDb, schema } = await import('../src/server/db/index.ts');
const { inArray, eq, and, isNull } = await import('drizzle-orm');
const { hashPassword } = await import('../src/server/auth/password.ts');
const loginH = (await import('../api/auth/login.ts')).default;
const profH = (await import('../api/me/profile.ts')).default;
const sIdxH = (await import('../api/santri/index.ts')).default;
const sMeH = (await import('../api/santri/me.ts')).default;
const sShowH = (await import('../api/santri/[nis]/index.ts')).default;
const sBelH = (await import('../api/santri/[nis]/pembelian.ts')).default;
const belH = (await import('../api/pembelian/index.ts')).default;
const rStartH = (await import('../api/reset/[nis]/start.ts')).default;
const rStep1H = (await import('../api/reset/[reset_id]/step1.ts')).default;
const rApplyH = (await import('../api/reset/[reset_id]/apply.ts')).default;

let cap: any = {};
const res = () => {
  cap = { status: 0, body: null };
  const r: any = {
    setHeader() {},
    status(s: number) { cap.status = s; return r; },
    json(b: any) { cap.body = b; if (cap.status >= 500) console.log('   [HTTP ' + cap.status + '] ' + JSON.stringify(b)); return r; },
  };
  return r;
};
const req = (m: string, b?: any, t?: string, q?: any): any => ({
  method: m, body: b, query: q ?? {},
  headers: { 'user-agent': 'vs', 'x-forwarded-for': '9.9.9.9', ...(t ? { authorization: `Bearer ${t}` } : {}) },
});

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => {
  console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`);
  c ? pass++ : fail++;
};

const db = getDb();
const NIS = '77665544';
const PWA = 'PasswordSantri2026';
const PWP = 'PasswordPetugas2026';
const PWC = 'PasswordKantin2026';
const EMAILS = ['a-k@t.local', 'p-k@t.local', 'c-k@t.local', 's-k@t.local'];
const BC1 = '8991111111111';
const BC2 = '8992222222222';
const ACTIONS = [
  'santri.create', 'profile.update_self', 'pembelian.create', 'pembelian.batch_create',
  'reset.start', 'reset.step1', 'reset.complete', 'auth.login',
];

const TEST_NIS = [NIS, '11223344', '22334455'];

const clean = async () => {
  await db.delete(schema.personalAccessTokens).where(inArray(schema.personalAccessTokens.tokenableType, ['users']));
  await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.action, ACTIONS));
  // urutan penting: anak dulu (ledger/transaksi/reset), baru induknya (santri, produk)
  await db.delete(schema.transaksiPembelian).where(inArray(schema.transaksiPembelian.nis, TEST_NIS));
  await db.delete(schema.resetDendaLog).where(inArray(schema.resetDendaLog.nis, TEST_NIS));
  await db.delete(schema.poinLedger).where(inArray(schema.poinLedger.nis, TEST_NIS));
  await db.delete(schema.santri).where(inArray(schema.santri.nis, TEST_NIS));
  await db.delete(schema.users).where(inArray(schema.users.email, EMAILS));
  await db.delete(schema.users).where(isNull(schema.users.email));
  await db.delete(schema.produk).where(inArray(schema.produk.barcode, [BC1, BC2]));
  await db.delete(schema.kategoriProduk).where(inArray(schema.kategoriProduk.namaKategori, ['Plastik Uji']));
  await db.delete(schema.configSettings).where(inArray(schema.configSettings.key, ['default_negative_limit']));
};

const login = async (login: string, password: string) => {
  const r = res();
  await loginH(req('POST', { login, password }), r);
  if (cap.status !== 200) console.log('   LOGIN GAGAL', login, cap.status, JSON.stringify(cap.body));
  return cap.body as any;
};

await clean();
const now = new Date();
const mk = async (email: string, name: string, role: string, pw: string) =>
  (await db.insert(schema.users).values({
    email, name, role, password: await hashPassword(pw),
    mustChangePassword: false, createdAt: now, updatedAt: now,
  }).returning({ id: schema.users.id }))[0].id;

const idStaff = await mk(EMAILS[0], 'Staff Uji', 'staff_kantin', PWC);
const idPetugas = await mk(EMAILS[1], 'Petugas Uji', 'petugas_kesantrian', PWP);
const idAdmin = await mk(EMAILS[2], 'Admin Uji', 'admin_kesantrian', PWA);
const idSantri = await mk(EMAILS[3], 'Santri Uji', 'santri', PWA);

const [kat] = await db.insert(schema.kategoriProduk).values({ namaKategori: 'Plastik Uji', createdAt: now, updatedAt: now }).returning({ id: schema.kategoriProduk.id });
await db.insert(schema.produk).values([
  { barcode: BC1, namaProduk: 'Botol 600ml', idKategori: kat.id, isExcludedFromDebit: false, createdAt: now, updatedAt: now },
  { barcode: BC2, namaProduk: 'Tisu', idKategori: kat.id, isExcludedFromDebit: true, createdAt: now, updatedAt: now },
]);
await db.insert(schema.santri).values({
  nis: NIS, userId: idSantri, nama: 'Santri Uji', kelas: '11-B', asrama: 'Putri 2',
  currentPoin: 10, isBlocked: false, createdAt: now, updatedAt: now,
});
await db.insert(schema.configSettings).values({ key: 'default_negative_limit', value: '-5', updatedAt: now });
console.log('SEED OK\n');

const tokStaff = (await login(EMAILS[0], PWC)).token;
const tokPetugas = (await login(EMAILS[1], PWP)).token;
const tokAdmin = (await login(EMAILS[2], PWA)).token;
const tokSantri = (await login(NIS, PWA)).token;

console.log('=== 1. PROFIL (GET /me/profile) ===');
let r = res(); await profH(req('GET', undefined, tokAdmin), r);
ok('200', cap.status === 200, String(cap.status));
ok('editable_fields 6', cap.body?.editable_fields?.length === 6);
ok('role_data label', cap.body?.role_data?.type === 'admin_kesantrian', cap.body?.role_data?.label);
ok('biodata ada', typeof cap.body?.user?.biodata === 'object');
r = res(); await profH(req('GET', undefined, tokSantri), r);
ok('Santri punya role_data', cap.body?.role_data?.type === 'santri', String(cap.body?.role_data?.nis));

console.log('\n=== 2. PROFIL UPDATE (PATCH) ===');
r = res(); await profH(req('PATCH', { phone: '0812345', gender: 'L', address: 'Jl. Merdeka 1' }, tokAdmin), r);
ok('200', cap.status === 200, String(cap.status));
ok('phone tersimpan', cap.body?.user?.biodata?.phone === '0812345');
ok('gender tersimpan', cap.body?.user?.biodata?.gender === 'L');
r = res(); await profH(req('PATCH', { gender: 'X' }, tokAdmin), r);
ok('gender X ditolak', cap.status === 422, String(cap.status));
r = res(); await profH(req('PATCH', { birth_date: 'bukan-tanggal' }, tokAdmin), r);
ok('birth_date salah format ditolak', cap.status === 422, String(cap.status));
r = res(); await profH(req('PATCH', {}, tokAdmin), r);
ok('body kosong ditolak', cap.status === 422, String(cap.status));
r = res(); await profH(req('PATCH', { email: 'evil@t.local', role: 'super_admin' }, tokAdmin), r);
ok('email/role di luar allowlist DITOLAK 422 (tidak bisa eskalasi)', cap.status === 422, String(cap.status));
r = res(); await profH(req('PATCH', { name: 'Santri Baru' }, tokSantri), r);
ok('update nama Santri disinkron ke tabel santri', cap.body?.user?.name === 'Santri Baru');
await db.update(schema.santri).set({ nama: 'Santri Uji' }).where(eq(schema.santri.nis, NIS));
await db.update(schema.users).set({ name: 'Santri Uji' }).where(eq(schema.users.id, idSantri));

console.log('\n=== 3. SANTRI LIST + CREATE ===');
r = res(); await sIdxH(req('GET', undefined, tokAdmin, { page: '1' }), r);
ok('200', cap.status === 200, String(cap.status));
ok('ada 1旦那', cap.body?.total === 1, String(cap.body?.total));
ok('paginate shape', cap.body?.current_page === 1 && cap.body?.per_page === 50);
ok('nama dari users.name', cap.body?.data?.[0]?.nama === 'Santri Uji', String(cap.body?.data?.[0]?.nama));
r = res(); await sIdxH(req('GET', undefined, tokAdmin, { q: '11-B' }), r);
ok('filter q ketemu', cap.body?.total === 1, String(cap.body?.total));
r = res(); await sIdxH(req('GET', undefined, tokAdmin, { q: 'TidakAda' }), r);
ok('filter q nihil', cap.body?.total === 0, String(cap.body?.total));
r = res(); await sIdxH(req('GET', undefined, tokStaff), r);
ok('staff DITOLAK akses list', cap.status === 422, String(cap.status));
r = res(); await sIdxH(req('POST', { nis: NIS, nama: 'Dobel', kelas: '1' }, tokAdmin), r);
ok('NIS kembar ditolak', cap.status === 422, String(cap.status));
r = res(); await sIdxH(req('POST', { nis: '11223344', nama: 'Siswa Baru', kelas: '12-A' }, tokAdmin), r);
ok('create 201', cap.status === 201, String(cap.status));
ok('default password SANTRI+4', /^SANTRI\d{4}$/.test(cap.body?.default_password ?? ''), cap.body?.default_password);
ok('poin mulai 0', cap.body?.santri?.current_poin === 0);
ok('pesan ada', /dibuat/.test(cap.body?.message ?? ''));
const newNis = cap.body?.santri?.nis;
r = res(); await sIdxH(req('POST', { nis: '22334455', nama: 'Tanpa Password', kelas: '1' }, tokStaff), r);
ok('staff tidak boleh create', cap.status === 422, String(cap.status));

console.log('\n=== 4. SANTRI SHOW / ME / PEMBELIAN ===');
r = res(); await sShowH(req('GET', undefined, tokAdmin, { nis: NIS }), r);
ok('200', cap.status === 200, String(cap.status));
ok('open_debts array', Array.isArray(cap.body?.open_debts));
ok('recent_ledger 20 max', (cap.body?.recent_ledger?.length ?? 0) <= 20);
ok('is_suspended field ada', 'is_suspended' in (cap.body ?? {}));
r = res(); await sShowH(req('GET', undefined, tokSantri, { nis: '99999999' }), r);
ok('Santri cuma boleh NIS sendiri', cap.status === 422, String(cap.status));
r = res(); await sShowH(req('GET', undefined, tokSantri, { nis: NIS }), r);
ok('Santri boleh NIS sendiri', cap.status === 200, String(cap.status));
r = res(); await sMeH(req('GET', undefined, tokStaff), r);
ok('/santri/me non-Santri ditolak', cap.status === 422, String(cap.status));
r = res(); await sMeH(req('GET', undefined, tokSantri), r);
ok('/santri/me 200', cap.status === 200, String(cap.status));
ok('nis benar', cap.body?.santri?.nis === NIS, String(cap.body?.santri?.nis));
r = res(); await sBelH(req('GET', undefined, tokAdmin, { nis: NIS }), r);
ok('pembelian 200', cap.status === 200, String(cap.status));
r = res(); await sBelH(req('GET', undefined, tokSantri, { nis: newNis }), r);
ok('Santri ditolak NIS orang lain', cap.status === 422, String(cap.status));

console.log('\n=== 5. PEMBELIAN (single + batch) ===');
r = res(); await belH(req('POST', { nis: NIS, barcode: BC1, qty: 3 }, tokStaff), r);
ok('201', cap.status === 201, String(cap.status));
ok('mode single', cap.body?.mode === 'single');
ok('total delta -3', cap.body?.total_poin_delta === -3, String(cap.body?.total_poin_delta));
ok('poin 10 -> 7', cap.body?.santri?.current_poin === 7, String(cap.body?.santri?.current_poin));
ok('transaksi tercatat', cap.body?.transactions?.length === 1);
r = res(); await belH(req('POST', { nis: NIS, items: [{ barcode: BC1, qty: 1 }, { barcode: BC2, qty: 4 }] }, tokStaff), r);
ok('batch 201', cap.status === 201, String(cap.status));
ok('mode batch', cap.body?.mode === 'batch');
ok('delta -1 + -4 = -5', cap.body?.total_poin_delta === -5, String(cap.body?.total_poin_delta));
ok('poin 7 -> 2', cap.body?.santri?.current_poin === 2, String(cap.body?.santri?.current_poin));
r = res(); await belH(req('POST', { nis: NIS, barcode: BC1, qty: 1 }, tokStaff), r);
ok('poin 2 -> 1', cap.body?.santri?.current_poin === 1, String(cap.body?.santri?.current_poin));
r = res(); await belH(req('POST', { nis: NIS, barcode: BC1, qty: 0 }, tokStaff), r);
ok('qty 0 ditolak', cap.status === 422, String(cap.status));
r = res(); await belH(req('POST', { nis: NIS, barcode: '0000000000', qty: 1 }, tokStaff), r);
ok('barcode tak ada ditolak', cap.status === 422, String(cap.status));
r = res(); await belH(req('POST', { barcode: BC1, qty: 1 }, tokStaff), r);
ok('nis top-level wajib', cap.status === 422, String(cap.status));

console.log('\n=== 6. AMBANG BLOCK OTOMATIS ===');
await db.update(schema.santri).set({ currentPoin: -4, isBlocked: false }).where(eq(schema.santri.nis, NIS));
r = res(); await belH(req('POST', { nis: NIS, barcode: BC1, qty: 1 }, tokStaff), r);
ok('poin -4 -> -5 = ambang, jadi BLOCKED', cap.body?.santri?.is_blocked === true, String(cap.body?.santri?.is_blocked));
r = res(); await belH(req('POST', { nis: NIS, barcode: BC1, qty: 1 }, tokStaff), r);
ok('blocked + plastik DITOLAK', cap.status === 422 && cap.body?.blocked, String(cap.status));
r = res(); await belH(req('POST', { nis: NIS, barcode: BC2, qty: 1 }, tokStaff), r);
ok('blocked + non-plastik BOLEH', cap.status === 201, String(cap.status));

console.log('\n=== 7. RESET DENDA (2 langkah) ===');
r = res(); await rStartH(req('POST', undefined, tokStaff, { nis: NIS }), r);
ok('staff tidak boleh start', cap.status === 422, String(cap.status));
r = res(); await rStartH(req('POST', undefined, tokAdmin, { nis: NIS }), r);
ok('start 200', cap.status === 200, String(cap.status));
ok('poin_sesudah 0', cap.body?.reset?.poin_sesudah === 0);
ok('step1 masih false', cap.body?.reset?.verifikasi_step_1 === false);
const resetId = cap.body?.reset?.id;
r = res(); await rApplyH(req('POST', undefined, tokAdmin, { reset_id: resetId }), r);
ok('apply tanpa step1 DITOLAK', cap.status === 422, String(cap.status));
r = res(); await rStep1H(req('POST', undefined, tokAdmin, { reset_id: resetId }), r);
ok('step1 200', cap.status === 200, String(cap.status));
ok('step1 true', cap.body?.reset?.verifikasi_step_1 === true);
r = res(); await rApplyH(req('POST', undefined, tokAdmin, { reset_id: resetId }), r);
ok('apply 200', cap.status === 200, String(cap.status));
ok('poin -> 0', cap.body?.santri?.current_poin === 0, String(cap.body?.santri?.current_poin));
ok('tak jadi blocked', cap.body?.santri?.is_blocked === false);
ok('pesan sebut debts tetap OPEN', /TETAP OPEN/i.test(cap.body?.message ?? ''));
r = res(); await rApplyH(req('POST', undefined, tokAdmin, { reset_id: resetId }), r);
ok('apply kedua DITOLAK', cap.status === 422, String(cap.status));
const debtsAfter = await db.select().from(schema.transaksiPembelian)
  .where(and(eq(schema.transaksiPembelian.nis, NIS), eq(schema.transaksiPembelian.status, 'open')));
ok('DEBTS TETAP OPEN setelah reset (D11)', debtsAfter.length > 0, String(debtsAfter.length) + ' transaksi open');

console.log('\n=== 8. HISTORY + AUDIT ===');
r = res(); await belH(req('GET', undefined, tokStaff), r);
ok('history 200', cap.status === 200, String(cap.status));
ok('history punya data', (cap.body?.data?.length ?? 0) > 0, String(cap.body?.data?.length));
const logs = await db.select().from(schema.auditLogs).where(inArray(schema.auditLogs.action, ACTIONS));
ok('audit Purchasing tercatat', logs.some((l) => l.action === 'pembelian.create'));
ok('audit batch tercatat', logs.some((l) => l.action === 'pembelian.batch_create'));
ok('audit reset.complete', logs.some((l) => l.action === 'reset.complete'));
ok('audit profile.update_self', logs.some((l) => l.action === 'profile.update_self'));

console.log('\n=== CLEANUP ===');
if (newNis) {
  await db.delete(schema.poinLedger).where(inArray(schema.poinLedger.nis, [newNis]));
  await db.delete(schema.santri).where(inArray(schema.santri.nis, [newNis]));
  const u = await db.select().from(schema.users).where(inArray(schema.users.email, EMAILS));
  void u;
}
await clean();
const leftU = await db.select().from(schema.users);
ok('tak ada user tersisa', leftU.length === 0, String(leftU.length));
const leftL = await db.select().from(schema.auditLogs);
ok('tak ada audit tersisa', leftL.length === 0, String(leftL.length));

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);

