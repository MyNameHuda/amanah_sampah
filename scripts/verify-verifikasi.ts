process.env.DATABASE_URL ??=
  'postgresql://neondb_owner:npg_VASQkM30fKyi@ep-summer-frost-b3k6birj-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
process.env.JWT_SECRET = 'verify-secret-minimal-32-byte-phase2d';
process.env.AWS_BUCKET = 'amanah-bukti';
process.env.AWS_URL = 'https://amanah-bukti.test.r2.dev';
process.env.AWS_ENDPOINT = 'https://akun.r2.cloudflarestorage.com';
process.env.AWS_ACCESS_KEY_ID = 'x';
process.env.AWS_SECRET_ACCESS_KEY = 'y';
process.env.AWS_DEFAULT_REGION = 'auto';

const { getDb, schema } = await import('../src/server/db/index.ts');
const { inArray, eq, and, isNull } = await import('drizzle-orm');
const { hashPassword } = await import('../src/server/auth/password.ts');
const loginH = (await import('../api/auth/login.ts')).default;
const terbukaH = (await import('../api/verifikasi/sesi-terbuka.ts')).default;
const openH = (await import('../api/verifikasi/sesi/index.ts')).default;
const showH = (await import('../api/verifikasi/sesi/[id]/index.ts')).default;
const itemsH = (await import('../api/verifikasi/sesi/[id]/items.ts')).default;
const commitH = (await import('../api/verifikasi/sesi/[id]/commit.ts')).default;
const cancelH = (await import('../api/verifikasi/sesi/[id]/cancel.ts')).default;
const presignH = (await import('../api/verifikasi/foto-bukti/presign.ts')).default;

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
const NIS = '77889900';
const NIS2 = '77889901';
const KAT = 'Kat Verif Uji';
const BC1 = '8996666666666';
const BC2 = '8997777777777';
const MAIL = { petugas: 'vf-petugas@t.local', petugas2: 'vf-petugas2@t.local', admin: 'vf-admin@t.local', super: 'vf-super@t.local', santri: 'vf-santri@t.local', susc: 'vf-susp@t.local' };
const KUNCI = { petugas: 'RahasiaPetugas2026', petugas2: 'RahasiaPetugas22026', admin: 'RahasiaAdmin2026', super: 'RahasiaSuper2026', santri: 'RahasiaSantri2026', susc: 'RahasiaSuspend2026' };
const ACT = ['verifikasi.open_sesi', 'verifikasi.commit', 'verifikasi.cancel', 'auth.login'];

async function bersihkan() {
  await db.delete(schema.personalAccessTokens).where(inArray(schema.personalAccessTokens.tokenableType, ['users']));
  await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.action, ACT));
  await db.delete(schema.sesiVerifikasiItems).where(inArray(schema.sesiVerifikasiItems.barcode, [BC1, BC2]));
  await db.delete(schema.sesiVerifikasi).where(inArray(schema.sesiVerifikasi.nis, [NIS, NIS2]));
  await db.delete(schema.poinLedger).where(inArray(schema.poinLedger.nis, [NIS, NIS2]));
  await db.delete(schema.transaksiPembelian).where(inArray(schema.transaksiPembelian.nis, [NIS, NIS2]));
  await db.delete(schema.santri).where(inArray(schema.santri.nis, [NIS, NIS2]));
  await db.delete(schema.users).where(inArray(schema.users.email, Object.values(MAIL)));
  // eq(col, null) menghasilkan SQL '= NULL' yang SELALU false. Harus isNull().
  await db.delete(schema.users).where(isNull(schema.users.email));
  await db.delete(schema.produk).where(inArray(schema.produk.barcode, [BC1, BC2]));
  await db.delete(schema.kategoriProduk).where(eq(schema.kategoriProduk.namaKategori, KAT));
  await db.delete(schema.configSettings).where(eq(schema.configSettings.key, 'default_negative_limit'));
}

await bersihkan();
const now = new Date();
const buatUser = async (email: string, name: string, role: string, pw: string, suspend = false) =>
  (await db.insert(schema.users).values({
    email, name, role, password: await hashPassword(pw), mustChangePassword: false,
    suspendedAt: suspend ? new Date() : null, createdAt: now, updatedAt: now,
  }).returning({ id: schema.users.id }))[0].id;

const idPetugas = await buatUser(MAIL.petugas, 'Petugas Uji', 'petugas_kesantrian', KUNCI.petugas);
await buatUser(MAIL.petugas2, 'Petugas Dua', 'petugas_kesantrian', KUNCI.petugas2);
await buatUser(MAIL.admin, 'Admin Uji', 'admin_kesantrian', KUNCI.admin);
await buatUser(MAIL.super, 'Super Uji', 'super_admin', KUNCI.super);
const uSantri = await buatUser(MAIL.santri, 'Santri Uji', 'santri', KUNCI.santri);
const uSusp = await buatUser(MAIL.susp, 'Santri Susp', 'santri', KUNCI.susc, true);
await db.insert(schema.santri).values([
  { nis: NIS, userId: uSantri, nama: 'Santri Uji', kelas: '11-A', currentPoin: 20, isBlocked: false, createdAt: now, updatedAt: now },
  { nis: NIS2, userId: uSusp, nama: 'Santri Susp', kelas: '11-B', currentPoin: 5, isBlocked: false, createdAt: now, updatedAt: now },
]);
const [katV] = await db.insert(schema.kategoriProduk).values({ namaKategori: KAT, createdAt: now, updatedAt: now }).returning({ id: schema.kategoriProduk.id });
await db.insert(schema.produk).values([
  { barcode: BC1, namaProduk: 'Botol V Uji', idKategori: katV.id, createdAt: now, updatedAt: now },
  { barcode: BC2, namaProduk: 'Tisu V Uji', idKategori: katV.id, createdAt: now, updatedAt: now },
]);
await db.insert(schema.configSettings).values({ key: 'default_negative_limit', value: '-50', updatedAt: now });
console.log('SEED OK');

async function token(login: string, pw: string) {
  const r = mockRes();
  await loginH(call('POST', { login, password: pw }), r);
  if (cap.status !== 200) console.log('   LOGIN GAGAL', login, cap.status);
  return cap.body?.token as string;
}
const tPetugas = await token(MAIL.petugas, KUNCI.petugas);
const tPetugas2 = await token(MAIL.petugas2, KUNCI.petugas2);
const tAdmin = await token(MAIL.admin, KUNCI.admin);
const tSuper = await token(MAIL.super, KUNCI.super);
const tSantri = await token(NIS, KUNCI.santri);
console.log('');

console.log('=== 1. AKSES & OPEN SESI ===');
let r = mockRes(); await terbukaH(call('GET', undefined, tSantri), r);
check('santri DITOLAK akses sesi-terbuka', cap.status === 422, String(cap.status));
r = mockRes(); await terbukaH(call('GET', undefined, tPetugas), r);
check('petugas boleh', cap.status === 200, String(cap.status));
check('idle_threshold 15', cap.body?.idle_threshold_menit === 15, String(cap.body?.idle_threshold_menit));

r = mockRes(); await openH(call('POST', { nis: '00000000' }, tPetugas), r);
check('NIS tak ada ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await openH(call('POST', { nis: NIS2 }, tPetugas), r);
check('siswa suspended DITOLAK', cap.status === 422 && /suspend/i.test(cap.body?.nis?.[0] ?? ''), String(cap.status));
r = mockRes(); await openH(call('POST', { nis: NIS }, tSuper), r);
check('super admin BOLEH untuk siswa suspended', cap.status === 201, String(cap.status));
const sesiSusp = cap.body?.sesi?.id;
if (sesiSusp) {
  r = mockRes(); await cancelH(call('POST', undefined, tSuper, { id: sesiSusp }), r);
}

r = mockRes(); await openH(call('POST', { nis: NIS }, tPetugas), r);
check('open sesi 201', cap.status === 201, String(cap.status));
const sesiId = cap.body?.sesi?.id;
check('sesi punya id', Number.isInteger(sesiId), String(sesiId));
check('open_debts array', Array.isArray(cap.body?.open_debts));
check('santeri dibalas', cap.body?.santri?.nis === NIS, String(cap.body?.santri?.nis));

r = mockRes(); await openH(call('POST', { nis: NIS }, tPetugas2), r);
check('sesi dikunci (petugas lain) 422', cap.status === 422, String(cap.status));
check('pesan menyebut NAMA pemegang', /Petugas Uji/.test(cap.body?.nis?.[0] ?? ''), cap.body?.nis?.[0]?.slice(0, 60));
r = mockRes(); await openH(call('POST', { nis: NIS }, tPetugas), r);
check('sesi milik sendiri (pesan berbeda)', cap.status === 422 && /Kamu masih punya/.test(cap.body?.nis?.[0] ?? ''));

console.log('');
console.log('=== 2. RESUME SESI ===');
r = mockRes(); await showH(call('GET', undefined, tPetugas, { id: sesiId }), r);
check('show sesi 200', cap.status === 200, String(cap.status));
check('bentuk sama dgn open (punya open_debts)', Array.isArray(cap.body?.open_debts));
check('punya array items', Array.isArray(cap.body?.sesi?.items));
r = mockRes(); await showH(call('GET', undefined, tPetugas2, { id: sesiId }), r);
check('petugas lain DITOLAK show', cap.status === 422, String(cap.status));
r = mockRes(); await showH(call('GET', undefined, tAdmin, { id: sesiId }), r);
check('admin boleh show', cap.status === 200, String(cap.status));

console.log('');
console.log('=== 3. TAMBAH ITEM (perhitungan poin) ===');
// hutang: 5 unit BC1 -> poin -5 sudah dipotong saat pembelian
await db.insert(schema.transaksiPembelian).values({
  nis: NIS, barcode: BC1, qty: 5, penaltyPerUnit: -1, status: 'open',
  staffId: idPetugas, waktu: now, createdAt: now, updatedAt: now,
});
r = mockRes(); await itemsH(call('POST', { barcode: BC1, qty_in: 3, catatan: 'Baris kotak penyok' }, tPetugas, { id: sesiId }), r);
check('tambah item 201', cap.status === 201, String(cap.status));
check('qty_matched = 3', cap.body?.item?.qty_matched === 3, String(cap.body?.item?.qty_matched));
check('qty_open_at_time = 5', cap.body?.item?.qty_open_at_time === 5, String(cap.body?.item?.qty_open_at_time));
check('poin_delta = 3 x 2 = 6', cap.body?.item?.poin_delta === 6, String(cap.body?.item?.poin_delta));
check('excess = 0', cap.body?.item?.qty_excess === 0);
check('shortfall = 5 - 3 = 2', cap.body?.item?.qty_shortfall === 2, String(cap.body?.item?.qty_shortfall));
check('catatan TERSIMPAN (dulu dibuang diam-diam)', cap.body?.item?.catatan === 'Baris kotak penyok', String(cap.body?.item?.catatan));
check('nama_produk ikut', cap.body?.item?.nama_produk === 'Botol V Uji', String(cap.body?.item?.nama_produk));

r = mockRes(); await itemsH(call('POST', { barcode: BC2, qty_in: 2 }, tPetugas, { id: sesiId }), r);
check('produk tanpa utang: matched 0', cap.body?.item?.qty_matched === 0, String(cap.body?.item?.qty_matched));
check('excess = 2', cap.body?.item?.qty_excess === 2, String(cap.body?.item?.qty_excess));
check('poin_delta 0', cap.body?.item?.poin_delta === 0);

r = mockRes(); await itemsH(call('POST', { barcode: BC1, qty_in: 0 }, tPetugas, { id: sesiId }), r);
check('pure-shortfall: shortfall 5', cap.body?.item?.qty_shortfall === 5, String(cap.body?.item?.qty_shortfall));
check('ada note penjelas', /Pure-shortfall/.test(cap.body?.note ?? ''), cap.body?.note?.slice(0, 50));
check('poin_delta 0 (tidak dapat poin)', cap.body?.item?.poin_delta === 0);

r = mockRes(); await itemsH(call('POST', { barcode: '0000000000', qty_in: 1 }, tPetugas, { id: sesiId }), r);
check('barcode tak ada ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await itemsH(call('POST', { barcode: BC1, qty_in: -1 }, tPetugas, { id: sesiId }), r);
check('qty negatif ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await itemsH(call('POST', { barcode: BC1, qty_in: 1, catatan: 'x'.repeat(600) }, tPetugas, { id: sesiId }), r);
check('catatan > 500 ditolak', cap.status === 422, String(cap.status));

console.log('');
console.log('=== 4. PRESIGN (batas 4,5 MB Vercel) ===');
r = mockRes(); await presignH(call('POST', { content_type: 'image/jpeg', size: 1024 }, tPetugas), r);
check('presign 200', cap.status === 200, String(cap.status));
check('ada upload_url', typeof cap.body?.upload_url === 'string' && cap.body.upload_url.length > 50);
check('path format YYYY-MM', /barcode-evidence\/\d{4}-\d{2}\/[a-f0-9]{32}\.jpg/.test(cap.body?.path ?? ''), String(cap.body?.path));
check('method PUT', cap.body?.method === 'PUT');
r = mockRes(); await presignH(call('POST', { content_type: 'application/pdf', size: 100 }, tPetugas), r);
check('tipe file selain gambar DITOLAK', cap.status === 422, String(cap.status));
r = mockRes(); await presignH(call('POST', { content_type: 'image/jpeg', size: 6 * 1024 * 1024 }, tPetugas), r);
check('file > 5MB ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await presignH(call('POST', { content_type: 'image/jpeg', size: 100 }, tSantri), r);
check('santri DITOLAK presign', cap.status === 422, String(cap.status));

console.log('');
console.log('=== 5. NOTIFIKASI SESI TERBUKA ===');
r = mockRes(); await terbukaH(call('GET', undefined, tPetugas), r);
check('sesi muncul di list', cap.body?.count === 1, String(cap.body?.count));
check('count_mine 1', cap.body?.count_mine === 1, String(cap.body?.count_mine));
check('is_mine true', cap.body?.data?.[0]?.is_mine === true);
check('items_count 3 (qty -1 ditolak)', cap.body?.data?.[0]?.items_count === 3, String(cap.body?.data?.[0]?.items_count));
check('poin_belum_tercatat 6', cap.body?.data?.[0]?.poin_belum_tercatat === 6, String(cap.body?.data?.[0]?.poin_belum_tercatat));
check('idle_menit dihitung >= 0', cap.body?.data?.[0]?.idle_menit >= 0, String(cap.body?.data?.[0]?.idle_menit));
check('is_idle false (baru dibuat)', cap.body?.data?.[0]?.is_idle === false);
r = mockRes(); await terbukaH(call('GET', undefined, tPetugas2), r);
check('petugas lain melihat is_mine=false', cap.body?.data?.[0]?.is_mine === false);
check('count_mine 0 untuk dia', cap.body?.count_mine === 0, String(cap.body?.count_mine));

// paksa jadi idle untuk menguji ambang
await db.execute((await import('drizzle-orm')).sql`update sesi_verifikasi_items set created_at = now() - interval '30 minutes' where id_sesi = ${sesiId}`);
r = mockRes(); await terbukaH(call('GET', undefined, tPetugas), r);
check('idle 30 menit -> is_idle true', cap.body?.data?.[0]?.is_idle === true, String(cap.body?.data?.[0]?.idle_menit));
check('count_idle_mine 1', cap.body?.count_idle_mine === 1, String(cap.body?.count_idle_mine));

console.log('');
console.log('=== 6. COMMIT (FIFO + split row) ===');
r = mockRes(); await commitH(call('POST', undefined, tPetugas, { id: sesiId }), r);
check('commit 200', cap.status === 200, String(cap.status));
check('saldo 20 + 6 = 26', cap.body?.santri?.current_poin === 26, String(cap.body?.santri?.current_poin));
check('saldo_change 6', cap.body?.saldo_change === 6, String(cap.body?.saldo_change));
check('matched_tx_count 1', cap.body?.matched_tx_count === 1, String(cap.body?.matched_tx_count));

const openLeft = await db.select().from(schema.transaksiPembelian)
  .where(and(eq(schema.transaksiPembelian.nis, NIS), eq(schema.transaksiPembelian.barcode, BC1), eq(schema.transaksiPembelian.status, 'open')));
check('utang tersisa 2 (dari 5)', openLeft[0]?.qty === 2, String(openLeft[0]?.qty));
const led = await db.select().from(schema.poinLedger).where(and(eq(schema.poinLedger.nis, NIS), eq(schema.poinLedger.sourceType, 'return_match')));
check('ledger return_match tercatat', led.length === 1, String(led.length));
check('ledger delta +6', led[0]?.poinDelta === 6, String(led[0]?.poinDelta));
check('ledger saldo 20 -> 26', led[0]?.saldoSebelum === 20 && led[0]?.saldoSesudah === 26, `${led[0]?.saldoSebelum}->${led[0]?.saldoSesudah}`);

r = mockRes(); await commitH(call('POST', undefined, tPetugas, { id: sesiId }), r);
check('commit kedua DITOLAK', cap.status === 422, String(cap.status));
r = mockRes(); await terbukaH(call('GET', undefined, tPetugas), r);
check('sesi hilang dari list terbuka', cap.body?.count === 0, String(cap.body?.count));

console.log('');
console.log('=== 7. PARTIAL MATCH = SPLIT ROW ===');
// utang 4, setor 1 -> harus split: 1 settled + 3 open (sisa baris baru)
await db.insert(schema.transaksiPembelian).values({
  nis: NIS, barcode: BC2, qty: 4, penaltyPerUnit: -1, status: 'open',
  staffId: idPetugas, waktu: now, createdAt: now, updatedAt: now,
});
r = mockRes(); await openH(call('POST', { nis: NIS }, tPetugas), r);
const sesi2 = cap.body?.sesi?.id;
r = mockRes(); await itemsH(call('POST', { barcode: BC2, qty_in: 1 }, tPetugas, { id: sesi2 }), r);
check('matched 1 dari utang 4', cap.body?.item?.qty_matched === 1, String(cap.body?.item?.qty_matched));
r = mockRes(); await commitH(call('POST', undefined, tPetugas, { id: sesi2 }), r);
check('commit partial 200', cap.status === 200, String(cap.status));
const bc2rows = await db.select().from(schema.transaksiPembelian)
  .where(and(eq(schema.transaksiPembelian.nis, NIS), eq(schema.transaksiPembelian.barcode, BC2)));
const settled = bc2rows.filter((t) => t.status === 'settled');
const stillOpen = bc2rows.filter((t) => t.status === 'open');
check('ada 1 baris settled', settled.length === 1, String(settled.length));
check('baris settled qty 1', settled[0]?.qty === 1, String(settled[0]?.qty));
check('ada 1 baris open sisa 3', stillOpen.length === 1 && stillOpen[0].qty === 3, JSON.stringify(stillOpen.map((t) => t.qty)));
check('baris baru punya catatan split', /Split remainder/.test(stillOpen[0]?.catatan ?? ''), String(stillOpen[0]?.catatan));

console.log('');
console.log('=== 8. CANCEL ===');
r = mockRes(); await openH(call('POST', { nis: NIS }, tPetugas), r);
const sesi3 = cap.body?.sesi?.id;
await itemsH(call('POST', { barcode: BC1, qty_in: 2 }, tPetugas, { id: sesi3 }), r);
const poinSebelum = (await db.select().from(schema.santri).where(eq(schema.santri.nis, NIS)))[0]?.currentPoin;
r = mockRes(); await cancelH(call('POST', { reason: 'Siswa cancel datang' }, tPetugas, { id: sesi3 }), r);
check('cancel 200', cap.status === 200, String(cap.status));
check('pesan', /di-cancel/.test(cap.body?.message ?? ''), cap.body?.message);
const poinSesudah = (await db.select().from(schema.santri).where(eq(schema.santri.nis, NIS)))[0]?.currentPoin;
check('poin TIDAK berubah saat cancel', poinSebelum === poinSesudah, `${poinSebelum} -> ${poinSesudah}`);
r = mockRes(); await cancelH(call('POST', undefined, tPetugas, { id: sesi3 }), r);
check('cancel kedua idempotent', cap.status === 200 && /Already closed/.test(cap.body?.message ?? ''), String(cap.status));

console.log('');
console.log('=== 9. AUDIT ===');
const logs = await db.select().from(schema.auditLogs).where(inArray(schema.auditLogs.action, ACT));
check('audit open_sesi', logs.some((l) => l.action === 'verifikasi.open_sesi'));
check('audit commit', logs.some((l) => l.action === 'verifikasi.commit'));
check('audit cancel', logs.some((l) => l.action === 'verifikasi.cancel'));
const commitLog = logs.find((l) => l.action === 'verifikasi.commit');
check('commit log punya saldo_after', typeof commitLog?.payload?.saldo_after === 'number', String(commitLog?.payload?.saldo_after));
check('commit log punya matched_tx_count', typeof commitLog?.payload?.matched_tx_count === 'number', String(commitLog?.payload?.matched_tx_count));

console.log('');
console.log('=== CLEANUP ===');
await bersihkan();
const lu = await db.select().from(schema.users);
console.log('   sisa email: ' + lu.map((u) => u.email).join(', '));
check('tak ada user tersisa', lu.length === 0, String(lu.length));
const ls = await db.select().from(schema.sesiVerifikasi);
check('tak ada sesi tersisa', ls.length === 0, String(ls.length));
const ll = await db.select().from(schema.auditLogs);
check('tak ada audit tersisa', ll.length === 0, String(ll.length));
const lp = await db.select().from(schema.produk).where(inArray(schema.produk.barcode, [BC1, BC2]));
check('tak ada produk tersisa', lp.length === 0, String(lp.length));

console.log(`\n=== HASIL: ${passed} PASS, ${failed} FAIL ===`);
process.exit(failed > 0 ? 1 : 0);
