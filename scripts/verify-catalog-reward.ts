process.env.DATABASE_URL ??=
  'postgresql://neondb_owner:npg_VASQkM30fKyi@ep-summer-frost-b3k6birj-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
process.env.JWT_SECRET = 'verify-secret-minimal-32-byte-phase2c';

const { getDb, schema } = await import('../src/server/db/index.ts');
const { inArray, eq, isNull } = await import('drizzle-orm');
const { hashPassword } = await import('../src/server/auth/password.ts');
const loginH = (await import('../api/auth/login.ts')).default;
const katH = (await import('../api/kategori/index.ts')).default;
const katCheckH = (await import('../api/kategori/check-name.ts')).default;
const prodH = (await import('../api/produk/index.ts')).default;
const scanH = (await import('../api/produk/scan/[barcode].ts')).default;
const cbH = (await import('../api/produk/check-barcode/[barcode].ts')).default;
const pShowH = (await import('../api/produk/[barcode]/index.ts')).default;
const pUnarcH = (await import('../api/produk/[barcode]/unarchive.ts')).default;
const pLogH = (await import('../api/produk/[barcode]/log.ts')).default;
const rwH = (await import('../api/reward/index.ts')).default;
const rwAdmH = (await import('../api/reward/admin.ts')).default;
const rwShowH = (await import('../api/reward/[id]/index.ts')).default;
const rwArcH = (await import('../api/reward/[id]/archive.ts')).default;
const rwResH = (await import('../api/reward/[id]/restore.ts')).default;
const rwTogH = (await import('../api/reward/[id]/toggle-active.ts')).default;
const rwRedH = (await import('../api/reward/[id]/redeem.ts')).default;

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
  method,
  body,
  query: query ?? {},
  headers: { 'user-agent': 'verify', 'x-forwarded-for': '9.9.9.9', ...(token ? { authorization: `Bearer ${token}` } : {}) },
});

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (cond) passed++;
  else failed++;
}

const db = getDb();
const KAT1 = 'Plastik Uji W';
const KAT2 = 'Kertas Uji W';
const BC1 = '8993333333333';
const BC2 = '8994444444444';
const NIS = '55443322';
const REWARD = 'Hadiah Uji W';
const MAIL = {
  admin: 'cw-admin@t.local',
  super: 'cw-super@t.local',
  staff: 'cw-staff@t.local',
  petugas: 'cw-petugas@t.local',
  santri: 'cw-santri@t.local',
};
const SEKRET = {
  admin: 'RahasiaAdmin2026',
  super: 'RahasiaSuper2026',
  staff: 'RahasiaKantin2026',
  petugas: 'RahasiaPetugas2026',
  sagranti: 'RahasiaSantri2026',
};
const LOG_ACTIONS = [
  'kategori.create', 'produk.create', 'produk.update', 'produk.archive',
  'produk.unarchive', 'produk.scan_hit', 'produk.scan_not_found',
  'reward.create', 'reward.update', 'reward.archive', 'reward.restore',
  'reward.toggle_active', 'reward.redeem', 'auth.login',
];

async function bersihkan() {
  await db.delete(schema.personalAccessTokens).where(inArray(schema.personalAccessTokens.tokenableType, ['users']));
  await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.action, LOG_ACTIONS));
  await db.delete(schema.penukaranReward).where(inArray(schema.penukaranReward.nis, [NIS]));
  await db.delete(schema.poinLedger).where(inArray(schema.poinLedger.nis, [NIS]));
  await db.delete(schema.transaksiPembelian).where(inArray(schema.transaksiPembelian.nis, [NIS]));
  await db.delete(schema.santri).where(inArray(schema.santri.nis, [NIS]));
  await db.delete(schema.users).where(inArray(schema.users.email, Object.values(MAIL)));
  await db.delete(schema.users).where(isNull(schema.users.email));
  await db.delete(schema.produk).where(inArray(schema.produk.barcode, [BC1, BC2]));
  await db.delete(schema.kategoriProduk).where(inArray(schema.kategoriProduk.namaKategori, [KAT1, KAT2]));
  await db.delete(schema.reward).where(eq(schema.reward.namaReward, REWARD));
}

await bersihkan();
const now = new Date();
const buatUser = async (email: string, name: string, role: string, pw: string) =>
  (await db.insert(schema.users).values({
    email, name, role, password: await hashPassword(pw), mustChangePassword: false,
    createdAt: now, updatedAt: now,
  }).returning({ id: schema.users.id }))[0].id;

await buatUser(MAIL.admin, 'Admin Uji', 'admin_kesantrian', SEKRET.admin);
await buatUser(MAIL.super, 'Super Uji', 'super_admin', SEKRET.super);
await buatUser(MAIL.staff, 'Staff Uji', 'staff_kantin', SEKRET.staff);
await buatUser(MAIL.petugas, 'Petugas Uji', 'petugas_kesantrian', SEKRET.petugas);
const SantriUser = await buatUser(MAIL.santri, 'Santri Uji', 'santri', SEKRET.sagranti);
await db.insert(schema.santri).values({
  nis: NIS, userId: SantriUser, nama: 'Santri Uji', kelas: '12-C',
  currentPoin: 500, isBlocked: false, createdAt: now, updatedAt: now,
});
console.log('SEED OK');

async function tokenUntuk(login: string, pw: string) {
  const r = mockRes();
  await loginH(call('POST', { login, password: pw }), r);
  if (cap.status !== 200) console.log('   LOGIN GAGAL', login, cap.status, JSON.stringify(cap.body));
  return cap.body?.token as string;
}
const tokAdmin = await tokenUntuk(MAIL.admin, SEKRET.admin);
const tokSuper = await tokenUntuk(MAIL.super, SEKRET.super);
const tokStaff = await tokenUntuk(MAIL.staff, SEKRET.staff);
const tokPetugas = await tokenUntuk(MAIL.petugas, SEKRET.petugas);
const tokSantri = await tokenUntuk(NIS, SEKRET.sagranti);
console.log('');

console.log('=== 1. KATEGORI ===');
let r = mockRes();
await katH(call('POST', { nama_kategori: KAT1, deskripsi: 'Botol', is_default_excluded: false }, tokStaff), r);
check('staff boleh buat kategori', cap.status === 201, String(cap.status));
const katId = cap.body?.kategori?.id;
check('id kategori dikembalikan', Number.isInteger(katId), String(katId));
r = mockRes(); await katH(call('POST', { nama_kategori: KAT1 }, tokAdmin), r);
check('nama kembar ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await katH(call('POST', { nama_kategori: KAT2 }, tokSantri), r);
check('santri tidak boleh buat', cap.status === 422, String(cap.status));
r = mockRes(); await katCheckH(call('GET', undefined, tokAdmin, { nama: KAT1 }), r);
check('check-name duplikat 409', cap.status === 409, String(cap.status));
check('reason duplicate', cap.body?.reason === 'duplicate');
r = mockRes(); await katCheckH(call('GET', undefined, tokAdmin, { nama: 'Bebas' }), r);
check('check-name tersedia 200', cap.status === 200 && cap.body?.available === true);
r = mockRes(); await katCheckH(call('GET', undefined, tokAdmin, { nama: '' }), r);
check('check-name format invalid 422', cap.status === 422, String(cap.status));
r = mockRes(); await katH(call('GET', undefined, tokStaff), r);
check('GET kategori 200', cap.status === 200, String(cap.status));
check('kategori punya array produk', Array.isArray(cap.body?.data?.[0]?.produk));

console.log('');
console.log('=== 2. PRODUK ===');
r = mockRes();
await prodH(call('POST', { barcode: BC1, nama_produk: 'Botol 1L', id_kategori: katId, is_excluded_from_debit: false }, tokStaff), r);
check('staff boleh buat produk', cap.status === 201, String(cap.status));
r = mockRes(); await prodH(call('POST', { barcode: BC1, nama_produk: 'Kembar', id_kategori: katId }, tokAdmin), r);
check('barcode kembar ditolak', cap.status === 422, String(cap.status));
r = mockRes();
await prodH(call('POST', { barcode: BC2, nama_produk: 'Tisu', id_kategori: katId, is_excluded_from_debit: true }, tokStaff), r);
check('produk kedua dibuat', cap.status === 201, String(cap.status));
r = mockRes(); await cbH(call('GET', undefined, tokStaff, { barcode: BC1 }), r);
check('check-barcode duplikat 409', cap.status === 409, String(cap.status));
check('ada info existing', cap.body?.existing?.nama_produk === 'Botol 1L', String(cap.body?.existing?.nama_produk));
r = mockRes(); await cbH(call('GET', undefined, tokStaff, { barcode: '8990000000000' }), r);
check('check-barcode tersedia 200', cap.status === 200 && cap.body?.available === true);

r = mockRes(); await scanH(call('GET', undefined, tokStaff, { barcode: BC1 }), r);
check('scan produk ketemu', cap.status === 200 && cap.body?.found === true, String(cap.status));
check('scan punya kategori', typeof cap.body?.produk?.kategori === 'string', String(cap.body?.produk?.kategori));
check('scan is_active true', cap.body?.produk?.is_active === true);
r = mockRes(); await scanH(call('GET', undefined, tokStaff, { barcode: '0000000000' }), r);
check('scan tak ketemu 404', cap.status === 404, String(cap.status));

r = mockRes(); await pShowH(call('PATCH', { nama_produk: 'X' }, tokStaff, { barcode: BC1 }), r);
check('staff TIDAK boleh edit', cap.status === 422, String(cap.status));
r = mockRes(); await pShowH(call('PATCH', { nama_produk: 'Botol 1L Revisi' }, tokPetugas, { barcode: BC1 }), r);
check('petugas boleh edit', cap.status === 200, String(cap.status));
check('nama terupdate', cap.body?.produk?.nama_produk === 'Botol 1L Revisi', String(cap.body?.produk?.nama_produk));
r = mockRes(); await pShowH(call('PATCH', { is_excluded_from_debit: true }, tokPetugas, { barcode: BC1 }), r);
check('flag debit bisa diubah', cap.body?.produk?.is_excluded_from_debit === true);
r = mockRes(); await pShowH(call('PATCH', {}, tokPetugas, { barcode: BC1 }), r);
check('patch kosong ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await scanH(call('GET', undefined, tokStaff, { barcode: BC2 }), r);
check('produk nonaktif masih bisa discan', cap.status === 200 && cap.body?.found === true);

r = mockRes(); await pShowH(call('DELETE', undefined, tokPetugas, { barcode: BC2 }), r);
check('archive 200', cap.status === 200, String(cap.status));
check('ada archived_at', cap.body?.produk?.archived_at !== null);
r = mockRes(); await prodH(call('GET', undefined, tokStaff), r);
check('archived hilang dari list default', !(cap.body?.data ?? []).some((p: any) => p.barcode === BC2));
r = mockRes(); await prodH(call('GET', undefined, tokAdmin, { include_archived: '1' }), r);
check('admin bisa lihat archived', (cap.body?.data ?? []).some((p: any) => p.barcode === BC2));
r = mockRes(); await pShowH(call('PATCH', { nama_produk: 'X' }, tokPetugas, { barcode: BC2 }), r);
check('edit archived DITOLAK', cap.status === 422, String(cap.status));
r = mockRes(); await pUnarcH(call('POST', undefined, tokAdmin, { barcode: BC2 }), r);
check('admin TIDAK bisa unarchive', cap.status === 422, String(cap.status));
r = mockRes(); await pUnarcH(call('POST', undefined, tokSuper, { barcode: BC2 }), r);
check('super admin bisa unarchive', cap.status === 200, String(cap.status));
check('archived_at null lagi', cap.body?.produk?.archived_at === null);

console.log('');
console.log('=== 3. PRODUK LOG (pengganti JSON_EXTRACT) ===');
r = mockRes(); await pLogH(call('GET', undefined, tokAdmin, { barcode: BC1 }), r);
check('log 200', cap.status === 200, String(cap.status));
check('punya summary', typeof cap.body?.summary === 'object');
check('punya events', Array.isArray(cap.body?.events));
check('ada event produk.create', (cap.body?.events ?? []).some((e: any) => e.subtype === 'produk.create'));
check('ada event produk.update', (cap.body?.events ?? []).some((e: any) => e.subtype === 'produk.update'));
r = mockRes(); await pLogH(call('GET', undefined, tokStaff, { barcode: BC1 }), r);
check('staff DITOLAK akses log', cap.status === 422, String(cap.status));

console.log('');
console.log('=== 4. REWARD CRUD ===');
r = mockRes(); await rwH(call('POST', { nama_reward: REWARD, biaya_poin: 50, stok: 3 }, tokAdmin), r);
check('create reward 201', cap.status === 201, String(cap.status));
const rewardId = cap.body?.reward?.id_reward;
check('id_reward uuid', typeof rewardId === 'string' && rewardId.length === 36, String(rewardId));
r = mockRes(); await rwH(call('POST', { nama_reward: 'hadiah uji w', biaya_poin: 50, stok: 1 }, tokAdmin), r);
check('nama kembar (case-insens) ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await rwH(call('POST', { nama_reward: 'X', biaya_poin: 0, stok: 1 }, tokAdmin), r);
check('biaya 0 ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await rwH(call('GET', undefined, tokSantri), r);
check('santri bisa lihat reward aktif', cap.status === 200 && (cap.body?.data ?? []).length === 1, String(cap.body?.data?.length));
r = mockRes(); await rwShowH(call('GET', undefined, tokAdmin, { id: rewardId }), r);
check('detail reward 200', cap.status === 200, String(cap.status));
r = mockRes();
await rwShowH(call('PATCH', { nama_reward: REWARD, biaya_poin: 60, stok: 3, status_aktif: true }, tokAdmin, { id: rewardId }), r);
check('update reward 200', cap.status === 200, String(cap.status));
check('biaya jadi 60', cap.body?.reward?.biaya_poin === 60, String(cap.body?.reward?.biaya_poin));
r = mockRes();
await rwShowH(call('PATCH', { nama_reward: 'X', biaya_poin: 60, stok: 3 }, tokAdmin, { id: rewardId }), r);
check('status_aktif wajib ada', cap.status === 422, String(cap.status));
r = mockRes(); await rwTogH(call('POST', undefined, tokAdmin, { id: rewardId }), r);
check('toggle jadi nonaktif', cap.body?.reward?.status_aktif === false, String(cap.body?.reward?.status_aktif));
r = mockRes(); await rwH(call('GET', undefined, tokSantri), r);
check('nonaktif hilang dari list public', (cap.body?.data ?? []).length === 0, String(cap.body?.data?.length));
r = mockRes(); await rwTogH(call('POST', undefined, tokAdmin, { id: rewardId }), r);
check('toggle balik aktif', cap.body?.reward?.status_aktif === true);
r = mockRes(); await rwArcH(call('POST', undefined, tokAdmin, { id: rewardId }), r);
check('archive 200', cap.status === 200, String(cap.status));
check('archive set nonaktif', cap.body?.reward?.status_aktif === false);
r = mockRes(); await rwArcH(call('POST', undefined, tokAdmin, { id: rewardId }), r);
check('archive kedua idempotent', cap.status === 200, String(cap.status));
r = mockRes(); await rwResH(call('POST', undefined, tokAdmin, { id: rewardId }), r);
check('admin TIDAK bisa restore', cap.status === 422, String(cap.status));
r = mockRes(); await rwResH(call('POST', undefined, tokSuper, { id: rewardId }), r);
check('super admin bisa restore', cap.status === 200, String(cap.status));
check('restore aktifkan lagi', cap.body?.reward?.status_aktif === true);
r = mockRes(); await rwAdmH(call('GET', undefined, tokAdmin, { status: 'all' }), r);
check('admin listing 200', cap.status === 200, String(cap.status));
check('ada redeemed_count', typeof cap.body?.data?.[0]?.redeemed_count === 'number');
check('ada is_archived', typeof cap.body?.data?.[0]?.is_archived === 'boolean');
r = mockRes(); await rwAdmH(call('GET', undefined, tokSantri), r);
check('santri DITOLAK listing admin', cap.status === 422, String(cap.status));

console.log('');
console.log('=== 5. REDEEM ===');
r = mockRes(); await rwRedH(call('POST', undefined, tokAdmin, { id: rewardId }), r);
check('admin DITOLAK redeem', cap.status === 422, String(cap.status));
r = mockRes(); await rwRedH(call('POST', undefined, tokSantri, { id: rewardId }), r);
check('redeem sukses', cap.status === 200, String(cap.status));
check('pesan sebut nama reward', /Hadiah Uji W/.test(cap.body?.message ?? ''), cap.body?.message);
check('poin terpakai 60', cap.body?.penukaran?.poin_used === 60, String(cap.body?.penukaran?.poin_used));
const row1 = await db.select().from(schema.santri).where(eq(schema.santri.nis, NIS));
check('saldo 500 -> 440', row1[0]?.currentPoin === 440, String(row1[0]?.currentPoin));
const rw1 = await db.select().from(schema.reward).where(eq(schema.reward.idReward, rewardId));
check('stok 3 -> 2', rw1[0]?.stok === 2, String(rw1[0]?.stok));
const led1 = await db.select().from(schema.poinLedger).where(eq(schema.poinLedger.nis, NIS));
check('ledger redeem tercatat', led1.some((l) => l.sourceType === 'redeem' && l.poinDelta === -60));
check('ledger saldo 500 -> 440', led1.some((l) => l.sourceType === 'redeem' && l.saldoSebelum === 500 && l.saldoSesudah === 440));
const pen1 = await db.select().from(schema.penukaranReward).where(eq(schema.penukaranReward.nis, NIS));
check('penukaran tercatat', pen1.length === 1, String(pen1.length));

await db.update(schema.santri).set({ currentPoin: 10 }).where(eq(schema.santri.nis, NIS));
r = mockRes(); await rwRedH(call('POST', undefined, tokSantri, { id: rewardId }), r);
check('poin kurang ditolak', cap.status === 422 && /Poin tidak cukup/.test(cap.body?.message ?? ''), String(cap.status));
await db.update(schema.santri).set({ currentPoin: 100 }).where(eq(schema.santri.nis, NIS));
await db.update(schema.reward).set({ stok: 0 }).where(eq(schema.reward.idReward, rewardId));
r = mockRes(); await rwRedH(call('POST', undefined, tokSantri, { id: rewardId }), r);
check('stok habis ditolak', cap.status === 422 && /habis/i.test(cap.body?.message ?? ''), String(cap.status));
await db.update(schema.reward).set({ stok: 1, statusAktif: false }).where(eq(schema.reward.idReward, rewardId));
r = mockRes(); await rwRedH(call('POST', undefined, tokSantri, { id: rewardId }), r);
check('nonaktif ditolak', cap.status === 422, String(cap.status));
await db.update(schema.reward).set({ statusAktif: true, archivedAt: new Date() }).where(eq(schema.reward.idReward, rewardId));
r = mockRes(); await rwRedH(call('POST', undefined, tokSantri, { id: rewardId }), r);
check('archived ditolak', cap.status === 422, String(cap.status));

await db.update(schema.reward).set({ stok: 1, archivedAt: null }).where(eq(schema.reward.idReward, rewardId));
await db.update(schema.santri).set({ currentPoin: 100 }).where(eq(schema.santri.nis, NIS));
r = mockRes(); await rwRedH(call('POST', undefined, tokSantri, { id: rewardId }), r);
check('redeem kedua sukses (stok 1)', cap.status === 200, String(cap.status));
const rw2 = await db.select().from(schema.reward).where(eq(schema.reward.idReward, rewardId));
check('stok habis setelah redeem terakhir', rw2[0]?.stok === 0, String(rw2[0]?.stok));
const row2 = await db.select().from(schema.santri).where(eq(schema.santri.nis, NIS));
check('saldo 100 -> 40', row2[0]?.currentPoin === 40, String(row2[0]?.currentPoin));

console.log('');
console.log('=== 6. AUDIT LOG ===');
const logs = await db.select().from(schema.auditLogs).where(inArray(schema.auditLogs.action, LOG_ACTIONS));
for (const a of ['kategori.create','produk.create','produk.update','produk.archive','produk.unarchive','scan_hit','scan_not_found','reward.redeem','reward.toggle_active']) {
  const needle = a === 'scan_hit' ? 'produk.scan_hit' : a === 'scan_not_found' ? 'produk.scan_not_found' : a;
  check('audit ' + needle, logs.some((l) => l.action === needle));
}
check('audit punya ip', logs.every((l) => l.ipAddress === '9.9.9.9'));

console.log('');
console.log('=== CLEANUP ===');
await bersihkan();
const leftUser = await db.select().from(schema.users);
check('tak ada user tersisa', leftUser.length === 0, String(leftUser.length));
const leftLog = await db.select().from(schema.auditLogs);
check('tak ada audit tersisa', leftLog.length === 0, String(leftLog.length));
const leftKat = await db.select().from(schema.kategoriProduk).where(inArray(schema.kategoriProduk.namaKategori, [KAT1, KAT2]));
check('tak ada kategori tersisa', leftKat.length === 0, String(leftKat.length));
const leftProd = await db.select().from(schema.produk).where(inArray(schema.produk.barcode, [BC1, BC2]));
check('tak ada produk tersisa', leftProd.length === 0, String(leftProd.length));

console.log(`\n=== HASIL: ${passed} PASS, ${failed} FAIL ===`);
process.exit(failed > 0 ? 1 : 0);
