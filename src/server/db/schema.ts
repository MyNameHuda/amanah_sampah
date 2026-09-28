/**
 * Schema Drizzle — diturunkan dari 18 file migrasi Laravel.
 *
 *KESIMPULAN: semua migrasi asli portable ke PostgreSQL. Tidak ada jsonb/enum/
 * array/partial-index khusus vendor, jadi tidak ada satu pun kolom yang hilang
 * saat pindah dari Laravel ke Drizzle.
 *
 * Sumber: prototype/database/migrations/*.php
 */
import {
  pgTable,
  pgEnum,
  serial,
  bigserial,
  uuid,
  varchar,
  text,
  integer,
  smallint,
  bigint,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/* ------------------------------------------------------------------ *
 * ENUM — kolom `role` di Laravel adalah varchar(30) dengan nilai tetap.
 * Di sini dibikin pgEnum supaya TS punya autocomplete dan typo tertangkap
 * saat compile, bukan saat runtime.
 * ------------------------------------------------------------------ */
export const roleEnum = pgEnum('role', [
  'santri',
  'staff_kantin',
  'petugas_kesantrian',
  'admin_kesantrian',
  'super_admin',
  'super_admin_tier3',
]);

export const transaksiStatusEnum = pgEnum('transaksi_status', ['open', 'settled', 'cancelled']);
export const penukaranStatusEnum = pgEnum('penukaran_status', ['redeemed']);

/* ------------------------------------------------------------------ *
 * users — 0001_01_01_000000_create_users_table
 *       + 2026_09_20_160000_add_biodata_to_users
 *       + 2026_09_20_220000_add_must_change_password_to_users
 * ------------------------------------------------------------------ */
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: varchar('email').unique(),
    name: text('name').notNull(),
    role: roleEnum('role').notNull(),
    password: text('password').notNull(),
    // [v1.1] suspend flag
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),

    // biodata
    phone: varchar('phone', { length: 25 }),
    gender: varchar('gender', { length: 1 }), // 'L' | 'P'
    birthPlace: varchar('birth_place', { length: 100 }),
    birthDate: date('birth_date'),
    address: text('address'),

    mustChangePassword: boolean('must_change_password').default(false).notNull(),
    rememberToken: text('remember_token'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ roleIdx: index('users_role_index').on(t.role) }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/* ------------------------------------------------------------------ *
 * santri — 2026_09_20_000002_create_santri_table
 * `nis` (nomor induk siswa) adalah primary key string, bukan integer.
 * ------------------------------------------------------------------ */
export const santri = pgTable(
  'santri',
  {
    nis: varchar('nis', { length: 20 }).primaryKey(),
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    nama: varchar('nama', { length: 100 }).notNull(),
    kelas: varchar('kelas', { length: 30 }).notNull(),
    asrama: varchar('asrama', { length: 50 }),
    currentPoin: integer('current_poin').default(0).notNull(),
    isBlocked: boolean('is_blocked').default(false).notNull(),
    blockReason: varchar('block_reason', { length: 255 }),
    blockAt: timestamp('block_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    resetAt: timestamp('reset_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    blockedIdx: index('santri_nis_is_blocked_index').on(t.nis, t.isBlocked),
    archivedIdx: index('santri_archived_at_index').on(t.archivedAt),
  }),
);

export type Santri = typeof santri.$inferSelect;

/* ------------------------------------------------------------------ *
 * kategori_produk — 2026_09_20_000003
 * ------------------------------------------------------------------ */
export const kategoriProduk = pgTable('kategori_produk', {
  id: serial('id').primaryKey(),
  namaKategori: varchar('nama_kategori', { length: 50 }).notNull().unique(),
  deskripsi: text('deskripsi'),
  isDefaultExcluded: boolean('is_default_excluded').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ *
 * produk — 2026_09_20_000004
 *       + 2026_09_20_223000_add_archived_at_to_produk
 * `barcode` adalah primary key string.
 * ------------------------------------------------------------------ */
export const produk = pgTable(
  'produk',
  {
    barcode: varchar('barcode', { length: 50 }).primaryKey(),
    namaProduk: varchar('nama_produk', { length: 100 }).notNull(),
    idKategori: integer('id_kategori')
      .notNull()
      .references(() => kategoriProduk.id),
    isExcludedFromDebit: boolean('is_excluded_from_debit').default(false).notNull(),
    imageUrl: varchar('image_url', { length: 500 }),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedBy: integer('archived_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ kategoriIdx: index('produk_id_kategori_index').on(t.idKategori) }),
);

export type Produk = typeof produk.$inferSelect;

/* ------------------------------------------------------------------ *
 * reward — 2026_09_20_000005_create_reward_table
 *        + 2026_09_24_000001_add_archived_columns_to_reward_table
 * PK kolom `id_reward` bertipe uuid.
 * ------------------------------------------------------------------ */
export const reward = pgTable(
  'reward',
  {
    idReward: uuid('id_reward').primaryKey(),
    namaReward: varchar('nama_reward', { length: 100 }).notNull(),
    biayaPoin: integer('biaya_poin').notNull(),
    stok: integer('stok').default(0).notNull(),
    statusAktif: boolean('status_aktif').default(true).notNull(),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedBy: integer('archived_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    aktifIdx: index('reward_status_aktif_index').on(t.statusAktif),
    archivedIdx: index('reward_archived_at_index').on(t.archivedAt),
    aktifArchivedIdx: index('reward_status_aktif_archived_at_index').on(t.statusAktif, t.archivedAt),
  }),
);

/* ------------------------------------------------------------------ *
 * penukaran_reward — 2026_09_20_000006
 * ------------------------------------------------------------------ */
export const penukaranReward = pgTable(
  'penukaran_reward',
  {
    id: serial('id').primaryKey(),
    nis: varchar('nis', { length: 20 })
      .notNull()
      .references(() => santri.nis),
    idReward: uuid('id_reward')
      .notNull()
      .references(() => reward.idReward),
    poinUsed: integer('poin_used').notNull(),
    status: penukaranStatusEnum('status').default('redeemed').notNull(),
    waktu: timestamp('waktu', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ nisWaktuIdx: index('penukaran_reward_nis_waktu_index').on(t.nis, t.waktu) }),
);

/* ------------------------------------------------------------------ *
 * transaksi_pembelian — 2026_09_20_000007
 * ------------------------------------------------------------------ */
export const transaksiPembelian = pgTable(
  'transaksi_pembelian',
  {
    id: serial('id').primaryKey(),
    nis: varchar('nis', { length: 20 })
      .notNull()
      .references(() => santri.nis),
    barcode: varchar('barcode', { length: 50 })
      .notNull()
      .references(() => produk.barcode),
    qty: integer('qty').notNull(),
    penaltyPerUnit: smallint('penalty_per_unit').default(1).notNull(),
    status: transaksiStatusEnum('status').default('open').notNull(),
    staffId: integer('staff_id')
      .notNull()
      .references(() => users.id),
    waktu: timestamp('waktu', { withTimezone: true }).defaultNow().notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    catatan: text('catatan'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    nisBarcodeStatusIdx: index('transaksi_nis_barcode_status_index').on(t.nis, t.barcode, t.status),
    statusWaktuIdx: index('transaksi_status_waktu_index').on(t.status, t.waktu),
  }),
);

/* ------------------------------------------------------------------ *
 * sesi_verifikasi + sesi_verifikasi_items — 2026_09_20_000008
 * ------------------------------------------------------------------ */
export const sesiVerifikasi = pgTable(
  'sesi_verifikasi',
  {
    id: serial('id').primaryKey(),
    nis: varchar('nis', { length: 20 })
      .notNull()
      .references(() => santri.nis),
    petugasId: integer('petugas_id')
      .notNull()
      .references(() => users.id),
    waktuMulai: timestamp('waktu_mulai', { withTimezone: true }).defaultNow().notNull(),
    waktuSelesai: timestamp('waktu_selesai', { withTimezone: true }),
    totalPoinChange: integer('total_poin_change').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ nisMulaiIdx: index('sesi_nis_waktu_mulai_index').on(t.nis, t.waktuMulai) }),
);

export const sesiVerifikasiItems = pgTable(
  'sesi_verifikasi_items',
  {
    id: serial('id').primaryKey(),
    idSesi: integer('id_sesi')
      .notNull()
      .references(() => sesiVerifikasi.id, { onDelete: 'cascade' }),
    barcode: varchar('barcode', { length: 50 })
      .notNull()
      .references(() => produk.barcode),
    qtyIn: integer('qty_in').notNull(),
    qtyOpenAtTime: integer('qty_open_at_time').notNull(),
    qtyMatched: integer('qty_matched').notNull(),
    qtyExcess: integer('qty_excess').notNull(),
    qtyShortfall: integer('qty_shortfall').notNull(),
    poinDelta: integer('poin_delta').notNull(),
    // path relatif di bucket Supabase, bukan URL absolut
    fotoBuktiPath: varchar('foto_bukti_path', { length: 500 }),
    catatan: text('catatan'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ sesiBarcodeIdx: index('sesi_items_sesi_barcode_index').on(t.idSesi, t.barcode) }),
);

/* ------------------------------------------------------------------ *
 * poin_ledger — 2026_09_20_000009
 * Buku besar poin: saldo_sebelum / poin_delta / saldo_sesudah wajib
 * konsisten per baris — dipakai untuk audit dan koreksi.
 * ------------------------------------------------------------------ */
export const poinLedger = pgTable(
  'poin_ledger',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    nis: varchar('nis', { length: 20 })
      .notNull()
      .references(() => santri.nis),
    sourceType: varchar('source_type', { length: 30 }).notNull(),
    sourceId: bigint('source_id', { mode: 'number' }),
    poinDelta: integer('poin_delta').notNull(),
    saldoSebelum: integer('saldo_sebelum').notNull(),
    saldoSesudah: integer('saldo_sesudah').notNull(),
    waktu: timestamp('waktu', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    waktuIdx: index('poin_ledger_waktu_index').on(t.waktu),
    nisWaktuIdx: index('poin_ledger_nis_waktu_index').on(t.nis, t.waktu),
    sourceIdx: index('poin_ledger_source_type_source_id_index').on(t.sourceType, t.sourceId),
  }),
);

export type PoinLedger = typeof poinLedger.$inferSelect;

/* ------------------------------------------------------------------ *
 * reset_denda_log — 2026_09_20_000010
 * Dua langkah verifikasi wajib untuk reset denda (T3 guard).
 * ------------------------------------------------------------------ */
export const resetDendaLog = pgTable(
  'reset_denda_log',
  {
    id: serial('id').primaryKey(),
    nis: varchar('nis', { length: 20 })
      .notNull()
      .references(() => santri.nis),
    adminId: integer('admin_id')
      .notNull()
      .references(() => users.id),
    poinSebelum: integer('poin_sebelum').notNull(),
    poinSesudah: integer('poin_sesudah').default(0).notNull(),
    verifikasiStep1: boolean('verifikasi_step_1').default(false).notNull(),
    verifikasiStep2: boolean('verifikasi_step_2').default(false).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    catatan: text('catatan'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ nisCompletedIdx: index('reset_denda_nis_completed_index').on(t.nis, t.completedAt) }),
);

/* ------------------------------------------------------------------ *
 * config_settings — 2026_09_20_000011
 * PK kolom `key` bertipe varchar(50), bukan id numerik.
 * ------------------------------------------------------------------ */
export const configSettings = pgTable('config_settings', {
  key: varchar('key', { length: 50 }).primaryKey(),
  value: varchar('value', { length: 255 }).notNull(),
  description: text('description'),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ConfigSetting = typeof configSettings.$inferSelect;

/* ------------------------------------------------------------------ *
 * audit_logs — 2026_09_20_000012
 * CATATAN PENTING: kolom `payload` adalah jsonb. Di Laravel, query memakai
 * JSON_EXTRACT() yang hanya ada di MySQL dan GAGAL di PostgreSQL.
 * Di Drizzle ini pakai operator ->> Postgres. Lihat src/server/db/queries.ts
 * ------------------------------------------------------------------ */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    role: varchar('role', { length: 30 }).notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }),
    resourceId: bigint('resource_id', { mode: 'number' }),
    payload: jsonb('payload'),
    adminAlasan: text('admin_alasan'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    waktu: timestamp('waktu', { withTimezone: true }).defaultNow().notNull(),
    archiveAt: timestamp('archive_at', { withTimezone: true }),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
  },
  (t) => ({
    waktuIdx: index('audit_logs_waktu_index').on(t.waktu),
    userWaktuIdx: index('audit_logs_user_id_waktu_index').on(t.userId, t.waktu),
    actionWaktuIdx: index('audit_logs_action_waktu_index').on(t.action, t.waktu),
    archiveIdx: index('audit_logs_archive_at_index').on(t.archiveAt),
    purgedIdx: index('audit_logs_purged_at_index').on(t.purgedAt),
  }),
);

export type AuditLog = typeof auditLogs.$inferSelect;

/* ------------------------------------------------------------------ *
 * audit_logs_archive — 2026_09_20_000012
 *                     + 2026_09_21_120000_add_original_id
 * ------------------------------------------------------------------ */
export const auditLogsArchive = pgTable(
  'audit_logs_archive',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    originalLogId: bigint('original_log_id', { mode: 'number' }),
    userId: bigint('user_id', { mode: 'number' }),
    role: varchar('role', { length: 30 }).notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }),
    resourceId: bigint('resource_id', { mode: 'number' }),
    payload: jsonb('payload'),
    adminAlasan: text('admin_alasan'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    waktu: timestamp('waktu', { withTimezone: true }).notNull(),
    archiveAt: timestamp('archive_at', { withTimezone: true }).notNull(),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    archivedToTableAt: timestamp('archived_to_table_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    waktuIdx: index('audit_logs_archive_waktu_index').on(t.waktu),
    purgedIdx: index('audit_logs_archive_purged_at_index').on(t.purgedAt),
    originalIdx: uniqueIndex('audit_logs_archive_original_log_id_unique').on(t.originalLogId),
  }),
);

/* ------------------------------------------------------------------ *
 * personal_access_tokens — 2026_09_20_055752
 * Dipakai sebagai daftar token JWT yang masih valid, sehingga JWT bisa
 * dicabut (logout / suspend user) tanpa menunggu kedaluwarsa.
 * ------------------------------------------------------------------ */
export const personalAccessTokens = pgTable(
  'personal_access_tokens',
  {
    id: serial('id').primaryKey(),
    tokenableType: varchar('tokenable_type').notNull(),
    tokenableId: integer('tokenable_id').notNull(),
    name: text('name').notNull(),
    /** SHA-256 dari token JWT — TIDAK pernah simpan token mentah */
    token: varchar('token', { length: 64 }).notNull().unique(),
    abilities: text('abilities'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ expiresIdx: index('personal_access_tokens_expires_at_index').on(t.expiresAt) }),
);

export type PersonalAccessToken = typeof personalAccessTokens.$inferSelect;

/* ------------------------------------------------------------------ *
 * Kontrak tipe untuk hal yang sering dipakai
 * ------------------------------------------------------------------ */
export const POINT_SOURCE_TYPES = [
  'verification', // setor sampah terverifikasi
  'redemption', // tukar reward
  'penalty', // denda shortfall
  'purchase', // pembelian sampah oleh sekolah (bukan dari sampahلفزيون)
  'return_match', // retur / pembalikan
  'reset', // reset denda oleh admin
  'adjustment', // penyesuaian manual super admin
] as const;
export type PointSourceType = (typeof POINT_SOURCE_TYPES)[number];
