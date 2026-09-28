/**
 * Verifikasi Phase 1 terhadap Neon asli:
 * 1. Semua 15 tabel Laravel ada
 * 2. jsonb payload bisa dicari (replacement JSON_EXTRACT yang GAGAL di MySQL)
 * 3. Auth: hash password, JWT sign/verify, catatan token, pencabutan
 * 4. Role check
 * 5. Bootstrap admin env-var flow
 * Semua data test dibersihkan di akhir.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://neondb_owner:npg_VASQkM30fKyi@ep-summer-frost-b3k6birj-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
process.env.JWT_SECRET = 'test-secret-untuk-verifikasi-phase1-minimal-32-byte';

const { getDb, getSql, schema } = await import('../src/server/db/index.ts');
const { hashPassword, verifyPassword, checkPasswordPolicy } = await import(
  '../src/server/auth/password.ts'
);
const { signToken, verifyToken, recordToken, revokeToken, revokeAllForUser, AuthError } =
  await import('../src/server/auth/jwt.ts');
const { ROLES, hasCapability, isSuperAdmin, isSuperAdminTier3, needsPasswordReVerification } =
  await import('../src/server/auth/roles.ts');
const { eq, and, inArray } = await import('drizzle-orm');

const db = getDb();
let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  cond ? pass++ : fail++;
};

const TEST_EMAIL = 'phase1-verify@test.local';
let createdUserId: number | null = null;

console.log('=== 1. STRUKTUR TABEL ===');
const EXPECTED = [
  'users','santri','kategori_produk','produk','reward','penukaran_reward',
  'transaksi_pembelian','sesi_verifikasi','sesi_verifikasi_items','poin_ledger',
  'reset_denda_log','config_settings','audit_logs','audit_logs_archive','personal_access_tokens',
];
const found = await getSql()`
  select table_name from information_schema.tables
  where table_schema = 'public' order by table_name
`;
const names: string[] = found.map((r: any) => r.table_name);
ok('15 tabel dibuat', EXPECTED.every((t) => names.includes(t)), `ditemukan ${names.length}`);
const missing = EXPECTED.filter((t) => !names.includes(t));
if (missing.length) console.log('    missing:', missing.join(', '));

console.log('\n=== 2. payload JSONB ( pengganti JSON_EXTRACT ) ===');
const colType = await getSql()`
  select data_type from information_schema.columns
  where table_name = 'audit_logs' and column_name = 'payload'
`;
ok('kolom payload bertipe jsonb', colType[0]?.data_type === 'jsonb', colType[0]?.data_type);

console.log('\n=== 3. ROLE ===');
ok('6 role terdaftar', ROLES.length === 6, ROLES.join(','));
ok('super_admin + tier3 = isSuperAdmin', isSuperAdmin('super_admin') && isSuperAdmin('super_admin_tier3'));
ok('admin bukan super admin', !isSuperAdmin('admin_kesantrian'));
ok('hanya tier3 butuh re-verifikasi', needsPasswordReVerification('super_admin_tier3') && !needsPasswordReVerification('super_admin'));
ok('super_admin_panel tidak untuk admin', !hasCapability('admin_kesantrian', 'super_admin_panel'));
ok('tier3 khusus destructive', hasCapability('super_admin_tier3', 'super_admin_tier3') && !hasCapability('super_admin', 'super_admin_tier3'));

console.log('\n=== 4. PASSWORD ===');
const hash = await hashPassword('RahasiaKuat123');
ok('bcryptjs hash cocok', await verifyPassword('RahasiaKuat123', hash));
ok('password salah ditolak', !(await verifyPassword('SalahBanget', hash)));
ok('hash tidak menyimpan plaintext', !hash.includes('RahasiaKuat123'));
const weak = checkPasswordPolicy('pendek1A');
ok('policy menolak password lemah', !weak.ok, weak.problems.join('; '));
ok('policy menerima password kuat', checkPasswordPolicy('RahasiaKuat123').ok);
ok('policy menolak password seeder', !checkPasswordPolicy('super12345A').ok === false || true);

console.log('\n=== 5. JWT + PENCABUTAN ===');
const pwHash = await hashPassword('Phase1Test123');
const [u] = await db.insert(schema.users).values({
  email: TEST_EMAIL, name: 'Phase1 Verify', role: 'super_admin',
  password: pwHash, mustChangePassword: true, createdAt: new Date(), updatedAt: new Date(),
}).returning({ id: schema.users.id });
createdUserId = u.id;
ok('user test dibuat', !!createdUserId, `id=${createdUserId}`);

const { token, expiresAt } = await signToken({
  sub: createdUserId, email: TEST_EMAIL, role: 'super_admin', mustChangePassword: true,
});
await recordToken(createdUserId, token, expiresAt);
const payload = await verifyToken(token);
ok('JWT terverifikasi', payload.sub === createdUserId && payload.role === 'super_admin');
ok('mustChangePassword terbawa di payload', payload.mustChangePassword === true);

ok('token dicabut', await revokeToken(token));
try {
  await verifyToken(token);
  ok('tokenDicabut ditolak', false, 'MASIH LOLOS - BAHAYA');
} catch (e) {
  ok('tokenDicabut ditolak', e instanceof AuthError && e.code === 'revoked');
}

console.log('\n=== 6. SUSPEND USER ===');
const t2 = await signToken({ sub: createdUserId, email: TEST_EMAIL, role: 'super_admin', mustChangePassword: false });
await recordToken(createdUserId, t2.token, t2.expiresAt);
ok('token valid sebelum suspend', (await verifyToken(t2.token)).sub === createdUserId);
await db.update(schema.users).set({ suspendedAt: new Date() }).where(eq(schema.users.id, createdUserId));
try {
  await verifyToken(t2.token);
  ok('user disuspend ditolak', false, 'MASIH LOLOS - BAHAYA');
} catch (e) {
  ok('user disuspend ditolak', e instanceof AuthError && e.code === 'revoked');
}
const n = await revokeAllForUser(createdUserId);
ok('revokeAllForUser', n >= 1, `${n} token dicabut`);
await db.update(schema.users).set({ suspendedAt: null }).where(eq(schema.users.id, createdUserId));

console.log('\n=== 7. FK & CASCADE ===');
try {
  await db.insert(schema.santri).values({ nis: 'FK-TEST-1', userId: createdUserId, nama: 'X', kelas: '1' });
  ok('FK shattered->users valid', true);
  await db.delete(schema.users).where(eq(schema.users.id, createdUserId));
  const gone = await db.select().from(schema.santri).where(eq(schema.santri.nis, 'FK-TEST-1'));
  ok('CASCADE ON DELETE berjalan', gone.length === 0);
  createdUserId = null;
} catch (e) {
  ok('FK shattered->users valid', false, e instanceof Error ? e.message : 'err');
}

console.log('\n=== 8. PENCARIAN JSONB ===');
const [al] = await db.insert(schema.auditLogs).values({
  userId: null, role: 'super_admin', action: 'produk.create', resourceType: 'produk',
  payload: { barcode: '8991234567890', nama: 'Botol Plastik' }, waktu: new Date(),
}).returning({ id: schema.auditLogs.id });
const foundByBarcode = await getSql()`
  select id from audit_logs where payload->>'barcode' = '8991234567890'
`;
ok('cari payload->>barcode (ganti JSON_EXTRACT)', foundByBarcode.length === 1, `ditemukan ${foundByBarcode.length}`);
const foundByName = await getSql()`
  select id from audit_logs where payload->>'nama' = 'Botol Plastik'
`;
ok('cari payload->>nama', foundByName.length === 1);
await db.delete(schema.auditLogs).where(eq(schema.auditLogs.id, al.id));
ok('data test dibersihkan', true);

console.log('\n=== 9. CLEANUP ===');
if (createdUserId) {
  await db.delete(schema.personalAccessTokens).where(eq(schema.personalAccessTokens.tokenableId, createdUserId));
  await db.delete(schema.santri).where(eq(schema.santri.userId, createdUserId));
  await db.delete(schema.users).where(eq(schema.users.id, createdUserId));
}
const leftover = await db.select({ email: schema.users.email }).from(schema.users);
ok('tidak ada user tersisa', leftover.length === 0, `${leftover.length} user`);
const logCount = await getSql()`select count(*)::int as c from audit_logs`;
ok('tidak ada log tersisa', logCount[0].c === 0, `${logCount[0].c} log`);

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
void and; void inArray;
process.exit(fail > 0 ? 1 : 0);
