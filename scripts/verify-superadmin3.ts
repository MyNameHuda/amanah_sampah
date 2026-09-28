process.env.DATABASE_URL ??=
  'postgresql://neondb_owner:npg_VASQkM30fKyi@ep-summer-frost-b3k6birj-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
process.env.JWT_SECRET = 'verify-secret-minimal-32-byte-super3';

const { getDb, schema } = await import('../src/server/db/index.ts');
const { inArray, eq, and } = await import('drizzle-orm');
const { hashPassword } = await import('../src/server/auth/password.ts');
const loginH = (await import('../api/auth/login.ts')).default;
const modeH = (await import('../api/super-admin/mode.ts')).default;
const revH = (await import('../api/super-admin/transactions/[txId]/reverse.ts')).default;
const adjH = (await import('../api/super-admin/santri/[nis]/adjust-poin.ts')).default;
const rcH = (await import('../api/super-admin/recompute-saldo.ts')).default;

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
const NIS = '90007777';
const NIS2 = '90008888';
const BC = '8990001234567';
const PW_SUPER = 'RahasiaSuperTiga2026';
const PW_T1 = 'RahasiaSuperSatu2026';
const ALASAN = 'Alasan koreksi yang cukup panjang untuk lolos batas minimum tiga puluh karakter.';
const MAIL = { t1: 's3-t1@t.local', t3: 's3-t3@t.local', admin: 's3-admin@t.local' };
const ACT = ['superadmin.reverse_transaction', 'superadmin.adjust_poin', 'superadmin.recompute_saldo', 'superadmin.mode_toggle', 'auth.login'];

async function bersihkan() {
  await db.delete(schema.personalAccessTokens).where(inArray(schema.personalAccessTokens.tokenableType, ['users']));
  await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.action, ACT));
  await db.delete(schema.poinLedger).where(inArray(schema.poinLedger.nis, [NIS, NIS2]));
  await db.delete(schema.transaksiPembelian).where(inArray(schema.transaksiPembelian.nis, [NIS, NIS2]));
  await db.delete(schema.santri).where(inArray(schema.santri.nis, [NIS, NIS2]));
  await db.delete(schema.users).where(inArray(schema.users.email, Object.values(MAIL)));
  await db.delete(schema.produk).where(eq(schema.produk.barcode, BC));
  await db.delete(schema.kategoriProduk).where(eq(schema.kategoriProduk.namaKategori, 'Kat S3'));
  for (const k of ['default_negative_limit', 'is_maintenance', 'is_readonly']) {
    const have = await db.select().from(schema.configSettings).where(eq(schema.configSettings.key, k)).limit(1);
    if (have.length === 0) {
      await db.insert(schema.configSettings).values({ key: k, value: k === 'default_negative_limit' ? '-50' : 'false', updatedAt: new Date() });
    }
  }
  await setConfig('default_negative_limit', '-50');
  await setConfig('is_readonly', 'false');
  await setConfig('is_maintenance', 'false');
}

async function setConfig(key: string, value: string) {
  await db.update(schema.configSettings).set({ value, updatedAt: new Date() }).where(eq(schema.configSettings.key, key));
}

const setReadOnly = (v: boolean) => setConfig('is_readonly', v ? 'true' : 'false');

await bersihkan();
const now = new Date();
const buat = async (email: string, name: string, role: string, pw: string) =>
  (await db.insert(schema.users).values({
    email, name, role, password: await hashPassword(pw), mustChangePassword: false, createdAt: now, updatedAt: now,
  }).returning({ id: schema.users.id }))[0].id;

const idT1 = await buat(MAIL.t1, 'Super T1', 'super_admin', PW_T1);
const idT3 = await buat(MAIL.t3, 'Super T3', 'super_admin_tier3', PW_SUPER);
await buat(MAIL.admin, 'Admin', 'admin_kesantrian', 'RahasiaAdmin2026');
const u1 = (await db.insert(schema.users).values({
  email: null, name: 'Siswa Satu', role: 'santri', password: await hashPassword('SANTRI1234'),
  mustChangePassword: false, createdAt: now, updatedAt: now,
}).returning({ id: schema.users.id }))[0].id;
const u2 = (await db.insert(schema.users).values({
  email: null, name: 'Siswa Dua', role: 'santri', password: await hashPassword('SANTRI1234'),
  mustChangePassword: false, createdAt: now, updatedAt: now,
}).returning({ id: schema.users.id }))[0].id;
await db.insert(schema.santri).values([
  { nis: NIS, userId: u1, nama: 'Siswa Satu', kelas: '8-A', currentPoin: -40, isBlocked: false, createdAt: now, updatedAt: now },
  { nis: NIS2, userId: u2, nama: 'Siswa Dua', kelas: '8-B', currentPoin: 25, isBlocked: false, createdAt: now, updatedAt: now },
]);
const [kat] = await db.insert(schema.kategoriProduk).values({ namaKategori: 'Kat S3', createdAt: now, updatedAt: now }).returning({ id: schema.kategoriProduk.id });
await db.insert(schema.produk).values({ barcode: BC, namaProduk: 'S3 Botol', idKategori: kat.id, createdAt: now, updatedAt: now });
// utang 3 unit -> -3 poin saat pembelian
const [tx] = await db.insert(schema.transaksiPembelian).values({
  nis: NIS, barcode: BC, qty: 3, penaltyPerUnit: -1, status: 'open',
  staffId: idT1, waktu: now, createdAt: now, updatedAt: now,
}).returning({ id: schema.transaksiPembelian.id });
// ledger historis supaya recompute punya bahan uji
await db.insert(schema.poinLedger).values([
  { nis: NIS, sourceType: 'purchase', sourceId: tx.id, poinDelta: -3, saldoSebelum: -37, saldoSesudah: -40, waktu: now, createdAt: now, updatedAt: now },
  { nis: NIS2, sourceType: 'initial', sourceId: null, poinDelta: 0, saldoSebelum: 0, saldoSesudah: 0, waktu: now, createdAt: now, updatedAt: now },
  { nis: NIS2, sourceType: 'redeem', sourceId: null, poinDelta: 25, saldoSebelum: 0, saldoSesudah: 25, waktu: now, createdAt: now, updatedAt: now },
]);
console.log('SEED OK  tx=%d', tx.id);

async function token(login: string, pw: string) {
  const r = mockRes();
  await loginH(call('POST', { login, password: pw }), r);
  if (cap.status !== 200) console.log('   LOGIN GAGAL', login, cap.status);
  return cap.body?.token as string;
}
const tT1 = await token(MAIL.t1, PW_T1);
const tT3 = await token(MAIL.t3, PW_SUPER);
const tAdmin = await token(MAIL.admin, 'RahasiaAdmin2026');
console.log('');

const poin = async (nis: string) => (await db.select().from(schema.santri).where(eq(schema.santri.nis, nis)))[0];
const ledger = async (nis: string) => await db.select().from(schema.poinLedger).where(eq(schema.poinLedger.nis, nis));

console.log('=== 1. REVERSE: WAJIB read-only mode (G-SU-03) ===');
let r = mockRes(); await revH(call('POST', { alasan: ALASAN, password_reverify: PW_SUPER }, tT3, { txId: tx.id }), r);
check('read-only OFF -> DITOLAK', cap.status === 422, String(cap.status));
check('pesan menyebut G-SU-03', /G-SU-03/.test(cap.body?.message ?? ''), cap.body?.message?.slice(0, 60));
await setReadOnly(true);

console.log('');
console.log('=== 2. REVERSE: validasi ===');
r = mockRes(); await revH(call('POST', { alasan: 'pendek', password_reverify: PW_SUPER }, tT3, { txId: tx.id }), r);
check('alasan < 30 char DITOLAK', cap.status === 422, String(cap.status));
r = mockRes(); await revH(call('POST', { alasan: ALASAN, password_reverify: 'salah' }, tT3, { txId: tx.id }), r);
check('password salah DITOLAK', cap.status === 422, String(cap.status));
r = mockRes(); await revH(call('POST', { alasan: ALASAN, password_reverify: PW_SUPER }, tAdmin, { txId: tx.id }), r);
check('admin biasa DITOLAK', cap.status === 422, String(cap.status));
r = mockRes(); await revH(call('POST', { alasan: ALASAN, password_reverify: PW_SUPER }, tT3, { txId: 999999 }), r);
check('tx tak ada 404', cap.status === 404, String(cap.status));

console.log('');
console.log('=== 3. REVERSE: eksekusi ===');
r = mockRes(); await revH(call('POST', { alasan: ALASAN, password_reverify: PW_T1 }, tT1, { txId: tx.id }), r);
check('reverse 200', cap.status === 200, String(cap.status));
check('poin -40 -> -37 (kembalikan +3)', cap.body?.santri?.current_poin === -37, String(cap.body?.santri?.current_poin));
check('pesan menyebut +3', /\+3/.test(cap.body?.message ?? ''), cap.body?.message);
check('tx jadi cancelled', cap.body?.tx?.status === 'cancelled', String(cap.body?.tx?.status));
const p1 = await poin(NIS);
check('saldo di DB benar', p1?.currentPoin === -37, String(p1?.currentPoin));
check('blocked dihitung ulang', p1?.isBlocked === false, String(p1?.isBlocked));
const led1 = await ledger(NIS);
const comp = led1.find((l) => l.sourceType === 'admin_adjustment');
check('baris compensating tercatat', !!comp, String(led1.length));
check('comp delta +3', comp?.poinDelta === 3, String(comp?.poinDelta));
check('comp saldo -40 -> -37', comp?.saldoSebelum === -40 && comp?.saldoSesudah === -37, `${comp?.saldoSebelum}->${comp?.saldoSesudah}`);
check('poin_ledger LAMA tidak dihapus', led1.length === 2, String(led1.length));
const txRow = (await db.select().from(schema.transaksiPembelian).where(eq(schema.transaksiPembelian.id, tx.id)))[0];
check('baris transaksi TETAP ADA (soft)', !!txRow, txRow ? 'ada' : 'hilang');
check('transaksi punya cancelled_at', txRow?.cancelledAt !== null);
r = mockRes(); await revH(call('POST', { alasan: ALASAN, password_reverify: PW_T1 }, tT1, { txId: tx.id }), r);
check('reverse kedua DITOLAK', cap.status === 422, String(cap.status));
const auditRev = (await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'superadmin.reverse_transaction')))[0];
check('audit reverse ada', !!auditRev);
check('audit admin_alasan tersimpan', auditRev?.adminAlasan === ALASAN, String(auditRev?.adminAlasan)?.slice(0, 40));
check('audit punya compensating delta', auditRev?.payload?.compensating_poin_delta === 3, String(auditRev?.payload?.compensating_poin_delta));
await setReadOnly(false);

console.log('');
console.log('=== 4. ADJUST POIN ===');
r = mockRes(); await adjH(call('POST', { poin_delta: 0, alasan: ALASAN, password_reverify: PW_T1 }, tT1, { nis: NIS }), r);
check('delta 0 DITOLAK', cap.status === 422, String(cap.status));
r = mockRes(); await adjH(call('POST', { poin_delta: 1.5, alasan: ALASAN, password_reverify: PW_T1 }, tT1, { nis: NIS }), r);
check('delta desimal DITOLAK', cap.status === 422, String(cap.status));
r = mockRes(); await adjH(call('POST', { poin_delta: -5, alasan: ALASAN, password_reverify: 'x' }, tT1, { nis: NIS }), r);
check('password salah DITOLAK', cap.status === 422, String(cap.status));
r = mockRes(); await adjH(call('POST', { poin_delta: -5, alasan: ALASAN, password_reverify: PW_T1 }, tT1, { nis: '99999999' }), r);
check('NIS tak ada 404', cap.status === 404, String(cap.status));
r = mockRes(); await adjH(call('POST', { poin_delta: -5, alasan: ALASAN, password_reverify: PW_T1 }, tT1, { nis: NIS }), r);
check('adjust 200', cap.status === 200, String(cap.status));
check('saldo -37 -> -42', cap.body?.santri?.current_poin === -42, String(cap.body?.santri?.current_poin));
const p2 = await poin(NIS);
check('blokir aktif saat <= -50', p2?.isBlocked === false, String(p2?.isBlocked));
r = mockRes(); await adjH(call('POST', { poin_delta: -20, alasan: ALASAN, password_reverify: PW_T1 }, tT1, { nis: NIS }), r);
check('saldo -42 -> -62 (lewat ambang)', cap.body?.santri?.current_poin === -62, String(cap.body?.santri?.current_poin));
check('jadi BLOCKED (limit -50)', cap.body?.santri?.is_blocked === true, String(cap.body?.santri?.is_blocked));
const auditAdj = (await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'superadmin.adjust_poin'))).at(-1) as any;
check('audit adjust ada', !!auditAdj);
check('audit punya saldo_after', auditAdj?.payload?.saldo_after === -62, String(auditAdj?.payload?.saldo_after));

console.log('');
console.log('=== 5. RECOMPUTE SALDO dari ledger ===');
r = mockRes(); await rcH(call('POST', { alasan: 'pendek' }, tT1), r);
check('alasan < 30 DITOLAK', cap.status === 422, String(cap.status));
// sengaja rusakin current_poin supaya recompute punya yang dibetulkan
await db.update(schema.santri).set({ currentPoin: 9999 }).where(eq(schema.santri.nis, NIS));
r = mockRes(); await rcH(call('POST', { alasan: ALASAN }, tT1, { nis: NIS }), r);
check('recompute 200', cap.status === 200, String(cap.status));
const p3 = await poin(NIS);
check('saldo kembali ke JUMLAH ledger (-25)', p3?.currentPoin === -25, String(p3?.currentPoin));
check('blokir dihitung ulang juga', p3?.isBlocked === false, String(p3?.isBlocked));
check('poin_ledger TIDAK diubah (4 baris tetap)', (await ledger(NIS)).length === 4, String((await ledger(NIS)).length));
r = mockRes(); await rcH(call('POST', { alasan: ALASAN }, tT1, { nis: '99999999' }), r);
check('NIS tak ada 404', cap.status === 404, String(cap.status));
r = mockRes(); await rcH(call('POST', { alasan: ALASAN }, tT1), r);
check('recompute semua siswa 200', cap.status === 200, String(cap.status));
check('ada laporan changed/unchanged', typeof cap.body?.changed_count === 'number', `${cap.body?.changed_count} berubah / ${cap.body?.unchanged_count} sama`);
const auditRc = (await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'superadmin.recompute_saldo')))[0];
check('audit recompute ada', !!auditRc);

console.log('');
console.log('=== CLEANUP ===');
await bersihkan();
const lu = await db.select().from(schema.users);
check('tak ada user test tersisa', lu.filter((u) => (u.email ?? '').includes('@t.local')).length === 0, String(lu.length));
const la = await db.select().from(schema.auditLogs);
check('tak ada audit test tersisa', la.length === 0, String(la.length));
const ls = await db.select().from(schema.santri).where(inArray(schema.santri.nis, [NIS, NIS2]));
check('tak ada siswa test tersisa', ls.length === 0, String(ls.length));
const lp = await db.select().from(schema.kategoriProduk).where(eq(schema.kategoriProduk.namaKategori, 'Kat S3'));
check('tak ada kategori test tersisa', lp.length === 0, String(lp.length));

console.log(`\n=== HASIL: ${passed} PASS, ${failed} FAIL ===`);
process.exit(failed > 0 ? 1 : 0);
