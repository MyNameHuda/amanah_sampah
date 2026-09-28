process.env.DATABASE_URL ??=
  'postgresql://neondb_owner:npg_VASQkM30fKyi@ep-summer-frost-b3k6birj-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
process.env.JWT_SECRET = 'verify-secret-minimal-32-byte-super2';

const { getDb, schema } = await import('../src/server/db/index.ts');
const { inArray, eq } = await import('drizzle-orm');
const { hashPassword } = await import('../src/server/auth/password.ts');
const { signToken, recordToken } = await import('../src/server/auth/jwt.ts');
const loginH = (await import('../api/auth/login.ts')).default;
const configH = (await import('../api/super-admin/config.ts')).default;
const modeH = (await import('../api/super-admin/mode.ts')).default;
const usersH = (await import('../api/super-admin/users/index.ts')).default;
const userH = (await import('../api/super-admin/users/[userId]/index.ts')).default;
const suspH = (await import('../api/super-admin/users/[userId]/suspend.ts')).default;
const delH = (await import('../api/super-admin/users/[userId]/delete.ts')).default;

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
const call = (method: string, body?: any, token?: string, query?: any, headers?: any): any => ({
  method, body, query: query ?? {}, headers: { 'user-agent': 'verify', ...(headers ?? {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
});

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (cond) passed++;
  else failed++;
}

const db = getDb();
const NAMA = 'S2 Target';
const NAMA2 = 'S2 Target 2';
const N2IS = '80001111';
const MAIL = { t1: 's2-t1@t.local', t3: 's2-t3@t.local', admin: 's2-admin@t.local', petugas: 's2-petugas@t.local',Fusion: 's2-fusion@t.local' };
const PWD = { t1: 'RahasiaTierSatu2026', t3: 'RahasiaTierTiga2026', admin: 'RahasiaAdmin2026', petugas: 'RahasiaPetugas2026', fusion: 'RahasiaFusi2026' };
const ACT = ['superadmin.config_update', 'superadmin.mode_toggle', 'superadmin.user_create', 'superadmin.user_update', 'superadmin.user_suspend', 'superadmin.user_unsuspend', 'superadmin.user_delete', 'superadmin.destructive_reverified', 'auth.login'];
const CONFIG_KEYS = ['default_negative_limit', 'reset_target_poin', 'is_maintenance', 'is_readonly'];
const ALASAN_OK = 'Alasan yang cukup panjang untuk lolos validasi minimal 10 karakter.';
const PW_T3 = 'TierTigaRahasia2026';
const PW_T1 = 'TierSatuRahasia2026';

async function bersihkan() {
  await db.delete(schema.personalAccessTokens).where(inArray(schema.personalAccessTokens.tokenableType, ['users']));
  await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.action, ACT));
  await db.delete(schema.poinLedger).where(eq(schema.poinLedger.nis, N2IS));
  await db.delete(schema.santri).where(eq(schema.santri.nis, N2IS));
  await db.delete(schema.users).where(inArray(schema.users.email, Object.values(MAIL)));
  await db.delete(schema.users).where(eq(schema.users.email, null));
  // pastikan key config ada
  for (const k of CONFIG_KEYS) {
    const have = await db.select().from(schema.configSettings).where(eq(schema.configSettings.key, k)).limit(1);
    if (have.length === 0) {
      await db.insert(schema.configSettings).values({ key: k, value: k.startsWith('is_') ? 'false' : k === 'default_negative_limit' ? '-50' : '0', updatedAt: new Date() });
    }
  }
}

await bersihkan();
const now = new Date();
const buat = async (email: string, name: string, role: string, pw: string) =>
  (await db.insert(schema.users).values({
    email, name, role, password: await hashPassword(pw), mustChangePassword: false, createdAt: now, updatedAt: now,
  }).returning({ id: schema.users.id }))[0].id;

const idT1 = await buat(MAIL.t1, 'Super Tier 1', 'super_admin', PW_T1);
const idT3 = await buat(MAIL.t3, 'Super Tier 3', 'super_admin_tier3', PW_T3);
await buat(MAIL.admin, 'Admin Uji', 'admin_kesantrian', PWD.admin);
await buat(MAIL.petugas, 'Petugas Uji', 'petugas_kesantrian', PWD.petugas);
const idFusi = await buat(MAIL.Fusion, 'Super Fusi', 'super_admin', PWD.fusion);
await db.insert(schema.santri).values({ nis: N2IS, userId: idFusi, nama: 'Siswa Uji', kelas: '9-A', currentPoin: 0, isBlocked: false, createdAt: now, updatedAt: now });
console.log('SEED OK  (T1=%d, T3=%d)', idT1, idT3);

async function token(login: string, pw: string) {
  const r = mockRes();
  await loginH(call('POST', { login, password: pw }), r);
  if (cap.status !== 200) console.log('   LOGIN GAGAL', login, cap.status);
  return cap.body?.token as string;
}
const tT1 = await token(MAIL.t1, PW_T1);
const tT3 = await token(MAIL.t3, PW_T3);
const tAdmin = await token(MAIL.admin, PWD.admin);
const tPetugas = await token(MAIL.petugas, PWD.petugas);
console.log('');

console.log('=== 1. AKSES PANEL SUPER-ADMIN ===');
let r = mockRes(); await configH(call('GET', undefined, tAdmin), r);
check('admin_kesantrian DITOLAK (bukan super)', cap.status === 422, String(cap.status));
r = mockRes(); await configH(call('GET', undefined, tPetugas), r);
check('petugas DITOLAK', cap.status === 422, String(cap.status));
r = mockRes(); await configH(call('GET', undefined, tT1), r);
check('super_admin T1 BOLEH', cap.status === 200, String(cap.status));
r = mockRes(); await configH(call('GET', undefined, tT3), r);
check('super_admin T3 BOLEH', cap.status === 200, String(cap.status));
check('data config ada', (cap.body?.data?.length ?? 0) >= 4, String(cap.body?.data?.length));

console.log('');
console.log('=== 2. UPDATE CONFIG (validasi per-key) ===');
r = mockRes(); await configH(call('POST', { key: 'default_negative_limit', value: '-75' }, tT1), r);
check('batas poin diubah', cap.status === 200 && cap.body?.config?.value === '-75', String(cap.body?.config?.value));
r = mockRes(); await configH(call('POST', { key: 'default_negative_limit', value: 'positif' }, tT1), r);
check('nilai non-angka ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await configH(call('POST', { key: 'default_negative_limit', value: '10' }, tT1), r);
check('batas poin positif ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await configH(call('POST', { key: 'tidak_ada', value: 'x' }, tT1), r);
check('key tak dikenal ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await configH(call('POST', { key: 'reset_target_poin', value: 25 }, tT1), r);
check('key numerik Accept angka', cap.status === 200 && cap.body?.config?.value === '25', String(cap.body?.config?.value));
r = mockRes(); await configH(call('POST', { key: 'reset_target_poin', value: 'abc' }, tT1), r);
check('key numerik tolak teks', cap.status === 422, String(cap.status));

console.log('');
console.log('=== 3. MAINTENANCE / READONLY MODE ===');
r = mockRes(); await modeH(call('POST', { key: 'is_maintenance', value: true }, tT1), r);
check('maintenance aktif', cap.status === 200 && cap.body?.config?.value === 'true', String(cap.body?.config?.value));
check('pesan jelas', /maintenance AKTIF/i.test(cap.body?.message ?? ''), cap.body?.message);
r = mockRes(); await modeH(call('POST', { key: 'is_readonly', value: 'false' }, tT1), r);
check('string "false" DITOLAK (harus boolean)', cap.status === 422, String(cap.status));
r = mockRes(); await modeH(call('POST', { key: 'default_negative_limit', value: true }, tT1), r);
check('key non-mode ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await modeH(call('POST', { key: 'is_maintenance', value: false }, tT1), r);
check('maintenance nonaktif', cap.body?.config?.value === 'false', String(cap.body?.config?.value));
r = mockRes(); await modeH(call('POST', { key: 'is_readonly', value: true }, tT1), r);
check('readonly aktif', cap.body?.config?.value === 'true', String(cap.body?.config?.value));
await modeH(call('POST', { key: 'is_readonly', value: false }, tT1), r);

console.log('');
console.log('=== 4. T3 RE-VERIFY (inti bagian ini) ===');
r = mockRes(); await suspH(call('POST', { suspended: true, alasan: ALASAN_OK }, tT3, { userId: idFusi }), r);
check('T3 tanpa password DITOLAK', cap.status === 403, String(cap.status));
check('ada action_required=password_reverify', cap.body?.action_required === 'password_reverify', String(cap.body?.action_required));
check('ada field=password', cap.body?.field === 'password', String(cap.body?.field));
r = mockRes(); await suspH(call('POST', { suspended: true, alasan: ALASAN_OK, password: 'salah' }, tT3, { userId: idFusi }), r);
check('T3 password salah DITOLAK', cap.status === 403, String(cap.status));
r = mockRes(); await suspH(call('POST', { suspended: true, alasan: ALASAN_OK }, tT1, { userId: idFusi }), r);
check('T1 BYPASS re-verify', cap.status === 200, String(cap.status));
await suspH(call('POST', { suspended: false, alasan: ALASAN_OK }, tT1, { userId: idFusi }), r);
r = mockRes(); await suspH(call('POST', { suspended: true, alasan: ALASAN_OK, password: PW_T3 }, tT3, { userId: idFusi }), r);
check('T3 dengan password benar LOLOS', cap.status === 200, String(cap.status));
const revLog = (await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'superadmin.destructive_reverified')))[0];
check('re-verifikasi tercatat di audit', !!revLog, revLog ? 'ada' : 'tidak');
r = mockRes(); await suspH(call('POST', { suspended: true, alasan: ALASAN_OK }, tT3, { userId: idFusi }, { 'x-re-verified-password': PW_T3 }), r);
check('password lewat header X-Re-Verified-Password juga bisa', cap.status === 200, String(cap.status));

console.log('');
console.log('=== 5. SUSPEND / UNSUSPEND ===');
r = mockRes(); await suspH(call('POST', { suspended: true, alasan: 'pendek' }, tT1, { userId: idFusi }), r);
check('alasan < 10 char ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await suspH(call('POST', { suspended: true, alasan: ALASAN_OK }, tT1, { userId: idT1 }), r);
check('tidak bisa suspend akun sendiri', cap.status === 422, String(cap.status));
r = mockRes(); await suspH(call('POST', { suspended: true, alasan: ALASAN_OK }, tT1, { userId: idFusi }), r);
check('suspend berhasil', cap.status === 200 && cap.body?.user?.is_suspended === true, String(cap.status));
const susLog = (await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'superadmin.user_suspend')))[0];
check('audit suspend ada', !!susLog);
check('audit punya admin_alasan', susLog?.adminAlasan === ALASAN_OK, String(susLog?.adminAlasan)?.slice(0, 40));
r = mockRes(); await suspH(call('POST', { suspended: false, alasan: ALASAN_OK }, tT1, { userId: idFusi }), r);
check('un-suspend berhasil', cap.status === 200 && cap.body?.user?.is_suspended === false, String(cap.status));
const opened = (await db.select().from(schema.users).where(eq(schema.users.id, idFusi)))[0];
check('un-suspend set must_change_password', opened?.mustChangePassword === true, String(opened?.mustChangePassword));

console.log('');
console.log('=== 6. MANAJEMEN USER ===');
r = mockRes(); await usersH(call('GET', undefined, tT1), r);
check('list user 200', cap.status === 200, String(cap.status));
check('ada field nis untuk Santri', (cap.body?.data ?? []).some((u: any) => u.nis), 'ada');
r = mockRes(); await usersH(call('GET', undefined, tT1, { role: 'santri' }), r);
check('filter role', (cap.body?.data ?? []).every((u: any) => u.role === 'santri'), 'semuaockey');
r = mockRes(); await usersH(call('POST', { name: NAMA, role: 'petugas_kesantrian', password: 'RahasiaPetugas2026' }, tT3), r);
check('T3 create tanpa password DITOLAK', cap.status === 403, String(cap.status));
r = mockRes(); await usersH(call('POST', { name: NAMA, role: 'peran_ngawur', password: 'RahasiaPetugas2026' }, tT1), r);
check('role tak dikenal ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await usersH(call('POST', { name: NAMA, role: 'petugas_kesantrian', password: 'pendek1A' }, tT1), r);
check('password lemah ditolak (role non-santri)', cap.status === 422, String(cap.status));
r = mockRes(); await usersH(call('POST', { name: NAMA, role: 'petugas_kesantrian', password: PWD.petugas }, tT1), r);
check('create user 201', cap.status === 201, String(cap.status));
const targetId = cap.body?.user?.id;
r = mockRes(); await usersH(call('POST', { name: NAMA, role: 'santri', email: 'dupe@t.local', password: 'SANTRI1234' }, tT1), r);
check('santri boleh password lemah', cap.status === 201, String(cap.status));
const idSantriBaru = cap.body?.user?.id;
await db.delete(schema.users).where(eq(schema.users.email, 'dupe@t.local'));
r = mockRes(); await usersH(call('POST', { name: NAMA, role: 'petugas_kesantrian', email: MAIL.t1, password: PWD.petugas }, tT1), r);
check('email kembar ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await usersH(call('POST', { name: NAMA, role: 'santri', nis: N2IS, password: 'SANTRI1234' }, tT1), r);
check('NIS kembar ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await usersH(call('POST', { name: NAMA, role: 'petugas_kesantrian', nis: '123', password: PWD.petugas }, tT1), r);
check('NIS untuk role non-santri ditolak', cap.status === 422, String(cap.status));

console.log('');
console.log('=== 7. UPDATE USER ===');
r = mockRes(); await userH(call('PATCH', { name: NAMA2 }, tT1, { userId: targetId }), r);
check('update nama 200', cap.status === 200 && cap.body?.user?.name === NAMA2, String(cap.body?.user?.name));
r = mockRes(); await userH(call('PATCH', { role: 'admin_kesantrian' }, tT1, { userId: targetId }), r);
check('update role 200', cap.body?.user?.role === 'admin_kesantrian', String(cap.body?.user?.role));
r = mockRes(); await userH(call('PATCH', { role: 'nonsense' }, tT1, { userId: targetId }), r);
check('role ngawur ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await userH(call('PATCH', { role: 'admin_kesantrian' }, tT1, { userId: idT1 }), r);
check('ubah role sendiri ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await userH(call('PATCH', {}, tT1, { userId: targetId }), r);
check('patch kosong ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await userH(call('GET', undefined, tT1, { userId: targetId }), r);
check('detail user 200', cap.status === 200, String(cap.status));

console.log('');
console.log('=== 8. HAPUS USER (soft, wajib alasan) ===');
r = mockRes(); await delH(call('DELETE', { alasan: 'pendek' }, tT1, { userId: targetId }), r);
check('alasan pendek ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await delH(call('DELETE', { alasan: ALASAN_OK }, tT1, { userId: idT1 }), r);
check('hapus akun sendiri ditolak', cap.status === 422, String(cap.status));
r = mockRes(); await delH(call('DELETE', { alasan: ALASAN_OK }, tT1, { userId: idFusi }), r);
check('hapus super admin lain DITOLAK (punya histori)', cap.status === 422, String(cap.status));
r = mockRes(); await delH(call('DELETE', { alasan: ALASAN_OK }, tT1, { userId: targetId }), r);
check('hapus user biasa berhasil', cap.status === 200, String(cap.status));
check('ditandai nonaktif, bukan hilang', cap.body?.user?.is_suspended === true);
const masihAda = (await db.select().from(schema.users).where(eq(schema.users.id, targetId)))[0];
check('baris user MASIH ADA (soft delete)', !!masihAda, masihAda ? 'ada' : 'hilang');

console.log('');
console.log('=== 9. T3 PADA SETIAP OPERASI DESTRUKTIF ===');
for (const [label, invoke] of [
  ['create user', () => usersH(call('POST', { name: 'X', role: 'petugas_kesantrian', password: PWD.petugas }, tT3), mockRes())],
  ['update user', () => userH(call('PATCH', { name: 'X' }, tT3, { userId: idT3 }), mockRes())],
  ['suspend user', () => suspH(call('POST', { suspended: true, alasan: ALASAN_OK }, tT3, { userId: idT3 }), mockRes())],
  ['delete user', () => delH(call('DELETE', { alasan: ALASAN_OK }, tT3, { userId: idT3 }), mockRes())],
] as [string, () => void][]) {
  await invoke();
  check('T3 tanpa password: ' + label, cap.status === 403, String(cap.status));
}

console.log('');
console.log('=== CLEANUP ===');
await db.delete(schema.personalAccessTokens).where(inArray(schema.personalAccessTokens.tokenableType, ['users']));
await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.action, ACT));
await db.delete(schema.poinLedger).where(eq(schema.poinLedger.nis, N2IS));
await db.delete(schema.santri).where(eq(schema.santri.nis, N2IS));
await db.delete(schema.users).where(inArray(schema.users.email, [...Object.values(MAIL), 'dupe@t.local']));
const lu = await db.select().from(schema.users);
check('tak ada user test tersisa', lu.filter((u) => (u.email ?? '').includes('@t.local')).length === 0, String(lu.length));
const la = await db.select().from(schema.auditLogs);
check('tak ada audit test tersisa', la.length === 0, String(la.length));

console.log(`\n=== HASIL: ${passed} PASS, ${failed} FAIL ===`);
process.exit(failed > 0 ? 1 : 0);
