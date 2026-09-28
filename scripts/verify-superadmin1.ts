process.env.DATABASE_URL ??=
  'postgresql://neondb_owner:npg_VASQkM30fKyi@ep-summer-frost-b3k6birj-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
process.env.JWT_SECRET = 'verify-secret-minimal-32-byte-super1';
process.env.AWS_URL = 'https://amanah-bukti.test.r2.dev';

const { getDb, schema } = await import('../src/server/db/index.ts');
const { inArray, eq, and, isNull } = await import('drizzle-orm');
const { hashPassword } = await import('../src/server/auth/password.ts');
const loginH = (await import('../api/auth/login.ts')).default;
const openH = (await import('../api/verifikasi/sesi/index.ts')).default;
const itemsH = (await import('../api/verifikasi/sesi/[id]/items.ts')).default;
const commitH = (await import('../api/verifikasi/sesi/[id]/commit.ts')).default;
const activeH = (await import('../api/verifikasi/active.ts')).default;
const logH = (await import('../api/verifikasi/[id]/log.ts')).default;
const forceH = (await import('../api/verifikasi/[id]/force-end.ts')).default;

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
const NIS = '44556677';
const KAT = 'Kat Super Uji';
const BC1 = '8998888888888';
const MAIL = { admin: 's1-admin@t.local', super: 's1-super@t.local', petugas: 's1-petugas@t.local',DariPetugas: 's1-petugas2@t.local', santri: 's1-santri@t.local' };
const KUNCI = { admin: 'RahasiaAdmin2026', super: 'RahasiaSuper2026', petugas: 'RahasiaPetugas2026', petugas2: 'RahasiaPetugas22026', santri: 'RahasiaSantri2026' };
const ACT = ['verifikasi.open_sesi', 'verifikasi.commit', 'verifikasi.force_end', 'auth.login'];

async function bersihkan() {
  await db.delete(schema.personalAccessTokens).where(inArray(schema.personalAccessTokens.tokenableType, ['users']));
  await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.action, ACT));
  await db.delete(schema.sesiVerifikasiItems).where(inArray(schema.sesiVerifikasiItems.barcode, [BC1]));
  await db.delete(schema.sesiVerifikasi).where(inArray(schema.sesiVerifikasi.nis, [NIS]));
  await db.delete(schema.poinLedger).where(inArray(schema.poinLedger.nis, [NIS]));
  await db.delete(schema.transaksiPembelian).where(inArray(schema.transaksiPembelian.nis, [NIS]));
  await db.delete(schema.santri).where(inArray(schema.santri.nis, [NIS]));
  await db.delete(schema.users).where(inArray(schema.users.email, Object.values(MAIL)));
  await db.delete(schema.users).where(isNull(schema.users.email));
  await db.delete(schema.produk).where(inArray(schema.produk.barcode, [BC1]));
  await db.delete(schema.kategoriProduk).where(eq(schema.kategoriProduk.namaKategori, KAT));
}

await bersihkan();
const now = new Date();
const buatUser = async (email: string, name: string, role: string, pw: string) =>
  (await db.insert(schema.users).values({
    email, name, role, password: await hashPassword(pw), mustChangePassword: false,
    createdAt: now, updatedAt: now,
  }).returning({ id: schema.users.id }))[0].id;

await buatUser(MAIL.admin, 'Admin Uji', 'admin_kesantrian', KUNCI.admin);
await buatUser(MAIL.super, 'Super Uji', 'super_admin', KUNCI.super);
const idPetugas = await buatUser(MAIL.petugas, 'Petugas Uji', 'petugas_kesantrian', KUNCI.petugas);
const uS2 = await buatUser(MAIL.DariPetugas, 'Petugas Dua', 'petugas_kesantrian', KUNCI.petugas2);
const uSantri = await buatUser(MAIL.santri, 'Santri Uji', 'santri', KUNCI.santri);
await db.insert(schema.santri).values({ nis: NIS, userId: uSantri, nama: 'Santri Uji', kelas: '10-X', currentPoin: 60, isBlocked: false, createdAt: now, updatedAt: now });
const [kat] = await db.insert(schema.kategoriProduk).values({ namaKategori: KAT, createdAt: now, updatedAt: now }).returning({ id: schema.kategoriProduk.id });
await db.insert(schema.produk).values({ barcode: BC1, namaProduk: 'Super Botol', idKategori: kat.id, createdAt: now, updatedAt: now });
console.log('SEED OK');

async function token(login: string, pw: string) {
  const r = mockRes();
  await loginH(call('POST', { login, password: pw }), r);
  if (cap.status !== 200) console.log('   LOGIN GAGAL', login, cap.status);
  return cap.body?.token as string;
}
const tAdmin = await token(MAIL.admin, KUNCI.admin);
const tSuper = await token(MAIL.super, KUNCI.super);
const tPetugas = await token(MAIL.petugas, KUNCI.petugas);
const tSantri = await token(NIS, KUNCI.santri);
console.log('');

console.log('=== 1. OTORISASI ===');
let r = mockRes(); await activeH(call('GET', undefined, tPetugas), r);
check('petugas DITOLAK /active', cap.status === 422, String(cap.status));
r = mockRes(); await activeH(call('GET', undefined, tSantri), r);
check('santri DITOLAK /active', cap.status === 422, String(cap.status));
r = mockRes(); await activeH(call('GET', undefined, tAdmin), r);
check('admin BOLEH /active', cap.status === 200, String(cap.status));
r = mockRes(); await activeH(call('GET', undefined, tSuper), r);
check('super BOLEH /active', cap.status === 200, String(cap.status));

console.log('');
console.log('=== 2. BUKA SESI + ISI ITEM (oleh petugas) ===');
r = mockRes(); await openH(call('POST', { nis: NIS }, tPetugas), r);
const sesiA = cap.body?.sesi?.id;
check('sesi dibuat', Number.isInteger(sesiA), String(sesiA));
await db.insert(schema.transaksiPembelian).values({ nis: NIS, barcode: BC1, qty: 4, penaltyPerUnit: -1, status: 'open', staffId: idPetugas, waktu: now, createdAt: now, updatedAt: now });
r = mockRes(); await itemsH(call('POST', { barcode: BC1, qty_in: 2, catatan: 'Botol penyok' }, tPetugas, { id: sesiA }), r);
check('item 1 (2 dari 4)', cap.status === 201 && cap.body?.item?.qty_matched === 2, String(cap.status));
r = mockRes(); await itemsH(call('POST', { barcode: BC1, qty_in: 1, foto_bukti_path: 'barcode-evidence/2026-09/abc.jpg' }, tPetugas, { id: sesiA }), r);
check('item 2 dengan foto', cap.status === 201, String(cap.status));
check('foto_bukti_url disusun server', /r2\.dev/.test(cap.body?.item?.foto_bukti_url ?? ''), String(cap.body?.item?.foto_bukti_url));

console.log('');
console.log('=== 3. MONITORING /verifikasi/active ===');
r = mockRes(); await activeH(call('GET', undefined, tAdmin), r);
check('count 1', cap.body?.count === 1, String(cap.body?.count));
const s0 = cap.body?.data?.[0];
check('ada nama_siswa (dari users.name)', s0?.nama_siswa === 'Santri Uji', String(s0?.nama_siswa));
check('ada kelas', s0?.kelas_siswa === '10-X', String(s0?.kelas_siswa));
check('ada current_poin_siswa', s0?.current_poin_siswa === 60, String(s0?.current_poin_siswa));
check('ada nama_petugas', s0?.nama_petugas === 'Petugas Uji', String(s0?.nama_petugas));
check('items_count 2', s0?.items_count === 2, String(s0?.items_count));
check('total_poin_uncommitted = 4+2 = 6', s0?.total_poin_change_uncommitted === 6, String(s0?.total_poin_change_uncommitted));
check('ada last_item_at', s0?.last_item_at !== null);
check('TIDAK ada flag is_mine (sudut pandang admin)', s0?.is_mine === undefined);

console.log('');
console.log('=== 4. SESI LOG (admin bisa lihat sesi orang lain) ===');
r = mockRes(); await logH(call('GET', undefined, tAdmin, { id: sesiA }), r);
check('log 200', cap.status === 200, String(cap.status));
check('status open', cap.body?.sesi?.status === 'open', String(cap.body?.sesi?.status));
check('items ada 2', cap.body?.items?.length === 2, String(cap.body?.items?.length));
check('item punya nama_produk', cap.body?.items?.[0]?.nama_produk === 'Super Botol', String(cap.body?.items?.[0]?.nama_produk));
check('item punya foto_bukti_url', /r2\.dev/.test(cap.body?.items?.[1]?.foto_bukti_url ?? ''), String(cap.body?.items?.[1]?.foto_bukti_url));
check('item punya catatan', cap.body?.items?.[0]?.catatan === 'Botol penyok', String(cap.body?.items?.[0]?.catatan));
r = mockRes(); await logH(call('GET', undefined, tPetugas, { id: sesiA }), r);
check('petugas DITOLAK log', cap.status === 422, String(cap.status));
r = mockRes(); await logH(call('GET', undefined, tAdmin, { id: 999999 }), r);
check('sesi tak ada 404', cap.status === 404, String(cap.status));

console.log('');
console.log('=== 5. FORCE-END (WAJIB alasan) ===');
r = mockRes(); await forceH(call('POST', {}, tAdmin, { id: sesiA }), r);
check('tanpa alasan ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await forceH(call('POST', { alasan: 'pendek' }, tAdmin, { id: sesiA }), r);
check('alasan < 10 char ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await forceH(call('POST', { alasan: 'ok' }, tPetugas, { id: sesiA }), r);
check('petugas DITOLAK force-end', cap.status === 422, String(cap.status));

const poinSebelum = (await db.select().from(schema.santri).where(eq(schema.santri.nis, NIS)))[0]?.currentPoin;
const UTGAS = (await db.select().from(schema.transaksiPembelian)
  .where(and(eq(schema.transaksiPembelian.nis, NIS), eq(schema.transaksiPembelian.status, 'open'))));
const alasanForce = 'Petugaseree gone to mosque, student left the counter, close the session.';

r = mockRes(); await forceH(call('POST', { alasan: alasanForce }, tAdmin, { id: sesiA }), r);
check('force-end 200', cap.status === 200, String(cap.status));
check('pesan tegas items TIDAK diproses', /TIDAK diproses/.test(cap.body?.message ?? ''), cap.body?.message?.slice(0, 70));
check('items_dropped count 2', cap.body?.items_dropped?.count === 2, String(cap.body?.items_dropped?.count));
check('poin uncommitted dilaporkan 6', cap.body?.items_dropped?.total_poin_uncommitted === 6, String(cap.body?.items_dropped?.total_poin_uncommitted));
check('sesi punya waktu_selesai', cap.body?.sesi?.waktuSelesai !== null);

const poinSesudah = (await db.select().from(schema.santri).where(eq(schema.santri.nis, NIS)))[0]?.currentPoin;
check('POIN SISWA TIDAK BERUBAH', poinSebelum === poinSesudah, `${poinSebelum} -> ${poinSesudah}`);
const UTGAS2 = (await db.select().from(schema.transaksiPembelian)
  .where(and(eq(schema.transaksiPembelian.nis, NIS), eq(schema.transaksiPembelian.status, 'open'))));
check('UTANG TIDAK BERUBAH (tidak di-settle)', UTGAS.length === UTGAS2.length && UTGAS2[0]?.qty === 4, JSON.stringify(UTGAS2.map((t) => t.qty)));
const ledger = await db.select().from(schema.poinLedger).where(eq(schema.poinLedger.nis, NIS));
check('tidak ada ledger return_match', !ledger.some((l) => l.sourceType === 'return_match'), String(ledger.length));

r = mockRes(); await forceH(call('POST', { alasan: 'coba lagi untuk sesi yang sama' }, tAdmin, { id: sesiA }), r);
check('force-end kedua DITOLAK (sudah ditutup)', cap.status === 422, String(cap.status));
r = mockRes(); await activeH(call('GET', undefined, tAdmin), r);
check('sesi hilang dari /active', cap.body?.count === 0, String(cap.body?.count));

console.log('');
console.log('=== 6. AUDIT force-end ===');
const audit = (await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'verifikasi.force_end')))[0];
check('audit force_end tercatat', !!audit);
check('admin_alasan tersimpan', audit?.adminAlasan === alasanForce, String(audit?.adminAlasan)?.slice(0, 50));
check('payload punya items_dropped_count', audit?.payload?.items_dropped_count === 2, String(audit?.payload?.items_dropped_count));
check('payload punya total_poin_dropped', audit?.payload?.total_poin_dropped === 6, String(audit?.payload?.total_poin_dropped));
check('audit punya petugas_id', audit?.payload?.petugas_id === idPetugas, String(audit?.payload?.petugas_id));

console.log('');
console.log('=== 7. SETELAH FORCE-END, SISWA BISA VERIFIKASI LAGI ===');
r = mockRes(); await openH(call('POST', { nis: NIS }, tPetugas), r);
check('buka sesi lagi berhasil', cap.status === 201, String(cap.status));
const sesiB = cap.body?.sesi?.id;
r = mockRes(); await commitH(call('POST', undefined, tPetugas, { id: sesiB }), r);
check('commit sesi kosong 200', cap.status === 200, String(cap.status));
const poinAkhir = (await db.select().from(schema.santri).where(eq(schema.santri.nis, NIS)))[0]?.currentPoin;
check('poin tetap 60 (tidak ada yang dikredit)', poinAkhir === 60, String(poinAkhir));
void uS2;

console.log('');
console.log('=== CLEANUP ===');
await bersihkan();
const lu = await db.select().from(schema.users);
check('tak ada user tersisa', lu.length === 0, String(lu.length));
const ls = await db.select().from(schema.sesiVerifikasi);
check('tak ada sesi tersisa', ls.length === 0, String(ls.length));
const ll = await db.select().from(schema.auditLogs);
check('tak ada audit tersisa', ll.length === 0, String(ll.length));

console.log(`\n=== HASIL: ${passed} PASS, ${failed} FAIL ===`);
process.exit(failed > 0 ? 1 : 0);
