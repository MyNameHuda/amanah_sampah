var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/shared/password-policy.ts
function checkPasswordPolicy(pw) {
  const problems = [];
  const value = pw ?? "";
  if (value.length < PASSWORD_MIN_LENGTH) {
    problems.push(`minimal ${PASSWORD_MIN_LENGTH} karakter`);
  }
  if (!/[a-z]/.test(value)) problems.push("harus ada huruf kecil");
  if (!/[A-Z]/.test(value)) problems.push("harus ada huruf besar");
  if (!/[0-9]/.test(value)) problems.push("harus ada angka");
  return { ok: problems.length === 0, problems };
}
function checkPasswordLength(pw, min2 = PASSWORD_MIN_SELF) {
  const problems = [];
  if (!pw || pw.length < min2) problems.push(`minimal ${min2} karakter`);
  return { ok: problems.length === 0, problems };
}
function describeProblems(problems) {
  if (problems.length === 0) return "";
  if (problems.length === 1) return problems[0];
  return `${problems.slice(0, -1).join(", ")}, dan ${problems[problems.length - 1]}`;
}
var PASSWORD_MIN_SELF, PASSWORD_MIN_LENGTH, PASSWORD_RULES;
var init_password_policy = __esm({
  "src/shared/password-policy.ts"() {
    "use strict";
    PASSWORD_MIN_SELF = 8;
    PASSWORD_MIN_LENGTH = 12;
    PASSWORD_RULES = [
      `Minimal ${PASSWORD_MIN_LENGTH} karakter`,
      "Mengandung huruf besar (A\u2013Z)",
      "Mengandung huruf kecil (a\u2013z)",
      "Mengandung angka (0\u20139)"
    ];
  }
});

// src/server/auth/password.ts
var password_exports = {};
__export(password_exports, {
  PASSWORD_MIN_LENGTH: () => PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_SELF: () => PASSWORD_MIN_SELF,
  PASSWORD_RULES: () => PASSWORD_RULES,
  checkPasswordLength: () => checkPasswordLength,
  checkPasswordPolicy: () => checkPasswordPolicy,
  describeProblems: () => describeProblems,
  hashPassword: () => hashPassword,
  verifyPassword: () => verifyPassword
});
import bcrypt from "bcryptjs";
function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}
function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
var ROUNDS;
var init_password = __esm({
  "src/server/auth/password.ts"() {
    "use strict";
    init_password_policy();
    ROUNDS = 10;
  }
});

// src/server/routes/auth/change-password.ts
import { eq as eq2 } from "drizzle-orm";

// src/server/db/index.ts
import { Pool, neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

// src/server/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  POINT_SOURCE_TYPES: () => POINT_SOURCE_TYPES,
  auditLogs: () => auditLogs,
  auditLogsArchive: () => auditLogsArchive,
  configSettings: () => configSettings,
  kategoriProduk: () => kategoriProduk,
  penukaranReward: () => penukaranReward,
  penukaranStatusEnum: () => penukaranStatusEnum,
  personalAccessTokens: () => personalAccessTokens,
  poinLedger: () => poinLedger,
  produk: () => produk,
  resetDendaLog: () => resetDendaLog,
  reward: () => reward,
  roleEnum: () => roleEnum,
  sesiVerifikasi: () => sesiVerifikasi,
  sesiVerifikasiItems: () => sesiVerifikasiItems,
  siswa: () => siswa,
  transaksiPembelian: () => transaksiPembelian,
  transaksiStatusEnum: () => transaksiStatusEnum,
  users: () => users
});
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
  uniqueIndex
} from "drizzle-orm/pg-core";
var roleEnum = pgEnum("role", [
  // 'santri' = nilai yang MASIH tersimpan di DB. Jangan diubah tanpa migrasi
  // ALTER TYPE. Yang berubah hanya nama yang tampil ke user: "Siswa".
  "santri",
  "staff_kantin",
  "petugas_kesantrian",
  "admin_kesantrian",
  "super_admin",
  "super_admin_tier3"
]);
var transaksiStatusEnum = pgEnum("transaksi_status", ["open", "settled", "cancelled"]);
var penukaranStatusEnum = pgEnum("penukaran_status", ["redeemed"]);
var users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email").unique(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull(),
    password: text("password").notNull(),
    // [v1.1] suspend flag
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    // biodata
    phone: varchar("phone", { length: 25 }),
    gender: varchar("gender", { length: 1 }),
    // 'L' | 'P'
    birthPlace: varchar("birth_place", { length: 100 }),
    birthDate: date("birth_date"),
    address: text("address"),
    mustChangePassword: boolean("must_change_password").default(false).notNull(),
    rememberToken: text("remember_token"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({ roleIdx: index("users_role_index").on(t.role) })
);
var siswa = pgTable(
  // Nama tabel di DB MASIH "santri" (belum dimigrasikan). Nama export siswa
  // dan label UI "Siswa" sudah berubah; string tabelnya sengaja dibiarkan
  // supaya aplikasi jalan tanpa ALTER TABLE.
  "santri",
  {
    nis: varchar("nis", { length: 20 }).primaryKey(),
    userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
    nama: varchar("nama", { length: 100 }).notNull(),
    kelas: varchar("kelas", { length: 30 }).notNull(),
    asrama: varchar("asrama", { length: 50 }),
    currentPoin: integer("current_poin").default(0).notNull(),
    isBlocked: boolean("is_blocked").default(false).notNull(),
    blockReason: varchar("block_reason", { length: 255 }),
    blockAt: timestamp("block_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    resetAt: timestamp("reset_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    blockedIdx: index("santri_nis_is_blocked_index").on(t.nis, t.isBlocked),
    archivedIdx: index("santri_archived_at_index").on(t.archivedAt)
  })
);
var kategoriProduk = pgTable("kategori_produk", {
  id: serial("id").primaryKey(),
  namaKategori: varchar("nama_kategori", { length: 50 }).notNull().unique(),
  deskripsi: text("deskripsi"),
  isDefaultExcluded: boolean("is_default_excluded").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
var produk = pgTable(
  "produk",
  {
    barcode: varchar("barcode", { length: 50 }).primaryKey(),
    namaProduk: varchar("nama_produk", { length: 100 }).notNull(),
    idKategori: integer("id_kategori").notNull().references(() => kategoriProduk.id),
    isExcludedFromDebit: boolean("is_excluded_from_debit").default(false).notNull(),
    imageUrl: varchar("image_url", { length: 500 }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: integer("archived_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({ kategoriIdx: index("produk_id_kategori_index").on(t.idKategori) })
);
var reward = pgTable(
  "reward",
  {
    idReward: uuid("id_reward").primaryKey(),
    namaReward: varchar("nama_reward", { length: 100 }).notNull(),
    biayaPoin: integer("biaya_poin").notNull(),
    stok: integer("stok").default(0).notNull(),
    statusAktif: boolean("status_aktif").default(true).notNull(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: integer("archived_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    aktifIdx: index("reward_status_aktif_index").on(t.statusAktif),
    archivedIdx: index("reward_archived_at_index").on(t.archivedAt),
    aktifArchivedIdx: index("reward_status_aktif_archived_at_index").on(t.statusAktif, t.archivedAt)
  })
);
var penukaranReward = pgTable(
  "penukaran_reward",
  {
    id: serial("id").primaryKey(),
    nis: varchar("nis", { length: 20 }).notNull().references(() => siswa.nis),
    idReward: uuid("id_reward").notNull().references(() => reward.idReward),
    poinUsed: integer("poin_used").notNull(),
    status: penukaranStatusEnum("status").default("redeemed").notNull(),
    waktu: timestamp("waktu", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({ nisWaktuIdx: index("penukaran_reward_nis_waktu_index").on(t.nis, t.waktu) })
);
var transaksiPembelian = pgTable(
  "transaksi_pembelian",
  {
    id: serial("id").primaryKey(),
    nis: varchar("nis", { length: 20 }).notNull().references(() => siswa.nis),
    barcode: varchar("barcode", { length: 50 }).notNull().references(() => produk.barcode),
    qty: integer("qty").notNull(),
    penaltyPerUnit: smallint("penalty_per_unit").default(1).notNull(),
    status: transaksiStatusEnum("status").default("open").notNull(),
    staffId: integer("staff_id").notNull().references(() => users.id),
    waktu: timestamp("waktu", { withTimezone: true }).defaultNow().notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    catatan: text("catatan"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    nisBarcodeStatusIdx: index("transaksi_nis_barcode_status_index").on(t.nis, t.barcode, t.status),
    statusWaktuIdx: index("transaksi_status_waktu_index").on(t.status, t.waktu)
  })
);
var sesiVerifikasi = pgTable(
  "sesi_verifikasi",
  {
    id: serial("id").primaryKey(),
    nis: varchar("nis", { length: 20 }).notNull().references(() => siswa.nis),
    petugasId: integer("petugas_id").notNull().references(() => users.id),
    waktuMulai: timestamp("waktu_mulai", { withTimezone: true }).defaultNow().notNull(),
    waktuSelesai: timestamp("waktu_selesai", { withTimezone: true }),
    totalPoinChange: integer("total_poin_change").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({ nisMulaiIdx: index("sesi_nis_waktu_mulai_index").on(t.nis, t.waktuMulai) })
);
var sesiVerifikasiItems = pgTable(
  "sesi_verifikasi_items",
  {
    id: serial("id").primaryKey(),
    idSesi: integer("id_sesi").notNull().references(() => sesiVerifikasi.id, { onDelete: "cascade" }),
    barcode: varchar("barcode", { length: 50 }).notNull().references(() => produk.barcode),
    qtyIn: integer("qty_in").notNull(),
    qtyOpenAtTime: integer("qty_open_at_time").notNull(),
    qtyMatched: integer("qty_matched").notNull(),
    qtyExcess: integer("qty_excess").notNull(),
    qtyShortfall: integer("qty_shortfall").notNull(),
    poinDelta: integer("poin_delta").notNull(),
    // path relatif di bucket Supabase, bukan URL absolut
    fotoBuktiPath: varchar("foto_bukti_path", { length: 500 }),
    catatan: text("catatan"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({ sesiBarcodeIdx: index("sesi_items_sesi_barcode_index").on(t.idSesi, t.barcode) })
);
var poinLedger = pgTable(
  "poin_ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    nis: varchar("nis", { length: 20 }).notNull().references(() => siswa.nis),
    sourceType: varchar("source_type", { length: 30 }).notNull(),
    sourceId: bigint("source_id", { mode: "number" }),
    poinDelta: integer("poin_delta").notNull(),
    saldoSebelum: integer("saldo_sebelum").notNull(),
    saldoSesudah: integer("saldo_sesudah").notNull(),
    waktu: timestamp("waktu", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    waktuIdx: index("poin_ledger_waktu_index").on(t.waktu),
    nisWaktuIdx: index("poin_ledger_nis_waktu_index").on(t.nis, t.waktu),
    sourceIdx: index("poin_ledger_source_type_source_id_index").on(t.sourceType, t.sourceId)
  })
);
var resetDendaLog = pgTable(
  "reset_denda_log",
  {
    id: serial("id").primaryKey(),
    nis: varchar("nis", { length: 20 }).notNull().references(() => siswa.nis),
    adminId: integer("admin_id").notNull().references(() => users.id),
    poinSebelum: integer("poin_sebelum").notNull(),
    poinSesudah: integer("poin_sesudah").default(0).notNull(),
    verifikasiStep1: boolean("verifikasi_step_1").default(false).notNull(),
    verifikasiStep2: boolean("verifikasi_step_2").default(false).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    catatan: text("catatan"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({ nisCompletedIdx: index("reset_denda_nis_completed_index").on(t.nis, t.completedAt) })
);
var configSettings = pgTable("config_settings", {
  key: varchar("key", { length: 50 }).primaryKey(),
  value: varchar("value", { length: 255 }).notNull(),
  description: text("description"),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
var auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    role: varchar("role", { length: 30 }).notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    resourceType: varchar("resource_type", { length: 50 }),
    resourceId: bigint("resource_id", { mode: "number" }),
    payload: jsonb("payload"),
    adminAlasan: text("admin_alasan"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    waktu: timestamp("waktu", { withTimezone: true }).defaultNow().notNull(),
    archiveAt: timestamp("archive_at", { withTimezone: true }),
    purgedAt: timestamp("purged_at", { withTimezone: true })
  },
  (t) => ({
    waktuIdx: index("audit_logs_waktu_index").on(t.waktu),
    userWaktuIdx: index("audit_logs_user_id_waktu_index").on(t.userId, t.waktu),
    actionWaktuIdx: index("audit_logs_action_waktu_index").on(t.action, t.waktu),
    archiveIdx: index("audit_logs_archive_at_index").on(t.archiveAt),
    purgedIdx: index("audit_logs_purged_at_index").on(t.purgedAt)
  })
);
var auditLogsArchive = pgTable(
  "audit_logs_archive",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    originalLogId: bigint("original_log_id", { mode: "number" }),
    userId: bigint("user_id", { mode: "number" }),
    role: varchar("role", { length: 30 }).notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    resourceType: varchar("resource_type", { length: 50 }),
    resourceId: bigint("resource_id", { mode: "number" }),
    payload: jsonb("payload"),
    adminAlasan: text("admin_alasan"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    waktu: timestamp("waktu", { withTimezone: true }).notNull(),
    archiveAt: timestamp("archive_at", { withTimezone: true }).notNull(),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    archivedToTableAt: timestamp("archived_to_table_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    waktuIdx: index("audit_logs_archive_waktu_index").on(t.waktu),
    purgedIdx: index("audit_logs_archive_purged_at_index").on(t.purgedAt),
    originalIdx: uniqueIndex("audit_logs_archive_original_log_id_unique").on(t.originalLogId)
  })
);
var personalAccessTokens = pgTable(
  "personal_access_tokens",
  {
    id: serial("id").primaryKey(),
    tokenableType: varchar("tokenable_type").notNull(),
    tokenableId: integer("tokenable_id").notNull(),
    name: text("name").notNull(),
    /** SHA-256 dari token JWT — TIDAK pernah simpan token mentah */
    token: varchar("token", { length: 64 }).notNull().unique(),
    abilities: text("abilities"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({ expiresIdx: index("personal_access_tokens_expires_at_index").on(t.expiresAt) })
);
var POINT_SOURCE_TYPES = [
  "initial",
  // baris pembuka saat siswa dibuat
  "purchase",
  // pembelian sampah (-1 poin per unit, flat)
  "return_match",
  // retur / pembalikan hasil verifikasi
  "redeem",
  // penukaran reward
  "reset",
  // reset denda oleh admin
  "admin_adjustment"
  // penyesuaian manual oleh super admin
];

// src/server/db/index.ts
import WebSocketImpl from "ws";
neonConfig.webSocketConstructor = WebSocketImpl;
function requireUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL belum di-set. Isi di Vercel \u2192 Settings \u2192 Environment Variables."
    );
  }
  return url;
}
var cachedPool;
var cachedDb;
var cachedSql;
function getSql() {
  if (!cachedSql) cachedSql = neon(requireUrl());
  return cachedSql;
}
function getDb() {
  if (!cachedDb) {
    cachedPool = new Pool({ connectionString: requireUrl() });
    cachedDb = drizzle(cachedPool, { schema: schema_exports });
  }
  return cachedDb;
}
async function pingDatabase() {
  const started = Date.now();
  try {
    await getSql()`select 1`;
    return { ok: true, latencyMs: Date.now() - started };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: e instanceof Error ? e.message : "unknown error"
    };
  }
}

// src/server/routes/auth/change-password.ts
init_password();

// src/server/auth/jwt.ts
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
var JWT_ISSUER = "amanah-sampah";
var DEFAULT_TTL_SECONDS = 60 * 60 * 12;
function getSecret() {
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    throw new Error(
      `JWT_SECRET belum di-set. Generate dengan: openssl rand -base64 32 atau node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  return new TextEncoder().encode(raw);
}
function hashToken(raw) {
  return createHash("sha256").update(raw).digest("hex");
}
async function signToken(input, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const jti = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + ttlSeconds * 1e3);
  const token = await new SignJWT({
    email: input.email,
    role: input.role,
    jti,
    mustChangePassword: input.mustChangePassword
  }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(String(input.sub)).setIssuer(JWT_ISSUER).setIssuedAt().setExpirationTime(Math.floor(expiresAt.getTime() / 1e3)).sign(getSecret());
  return { token, jti, expiresAt };
}
var AuthError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
async function verifyToken(token) {
  let payload;
  try {
    const { payload: verified } = await jwtVerify(token, getSecret(), {
      issuer: JWT_ISSUER
    });
    payload = {
      sub: Number(verified.sub),
      email: String(verified.email),
      role: verified.role,
      jti: String(verified.jti),
      mustChangePassword: Boolean(verified.mustChangePassword)
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("expired")) throw new AuthError("expired", "Token kedaluwarsa");
    throw new AuthError("invalid", "Token tidak valid");
  }
  const db = getDb();
  const rows = await db.select({
    id: schema_exports.personalAccessTokens.id,
    userId: schema_exports.users.id,
    suspendedAt: schema_exports.users.suspendedAt
  }).from(schema_exports.personalAccessTokens).innerJoin(schema_exports.users, eq(schema_exports.users.id, schema_exports.personalAccessTokens.tokenableId)).where(
    and(
      eq(schema_exports.personalAccessTokens.token, hashToken(token)),
      eq(schema_exports.personalAccessTokens.tokenableType, "users")
    )
  ).limit(1);
  const row = rows[0];
  if (!row) throw new AuthError("revoked", "Token sudah dicabut (logout)");
  if (row.suspendedAt) throw new AuthError("revoked", "Akun sedang disuspend");
  return payload;
}
async function recordToken(userId2, token, expiresAt, name = "access") {
  const db = getDb();
  await db.insert(schema_exports.personalAccessTokens).values({
    tokenableType: "users",
    tokenableId: userId2,
    name,
    token: hashToken(token),
    expiresAt
  });
}
async function revokeToken(token) {
  const db = getDb();
  const deleted = await db.delete(schema_exports.personalAccessTokens).where(eq(schema_exports.personalAccessTokens.token, hashToken(token))).returning({ id: schema_exports.personalAccessTokens.id });
  return deleted.length > 0;
}
async function revokeAllForUser(userId2) {
  const db = getDb();
  const deleted = await db.delete(schema_exports.personalAccessTokens).where(
    and(
      eq(schema_exports.personalAccessTokens.tokenableType, "users"),
      eq(schema_exports.personalAccessTokens.tokenableId, userId2)
    )
  ).returning({ id: schema_exports.personalAccessTokens.id });
  return deleted.length;
}

// src/server/audit.ts
async function recordAudit(action, payload = {}, opts = {}) {
  try {
    const db = getDb();
    await db.insert(schema_exports.auditLogs).values({
      userId: opts.userId ?? null,
      role: opts.role ?? "system",
      action,
      resourceType: opts.resourceType ?? null,
      resourceId: opts.resourceId ?? null,
      payload,
      adminAlasan: opts.adminAlasan ?? null,
      // Truncate sesuai ukuran kolom
      ipAddress: opts.ip ? opts.ip.slice(0, 45) : null,
      userAgent: opts.userAgent ?? null,
      waktu: /* @__PURE__ */ new Date()
    });
  } catch (e) {
    console.error("[audit] gagal menulis", action, e instanceof Error ? e.message : e);
  }
}

// src/server/http.ts
var HttpError = class extends Error {
  status;
  field;
  /** Marker `suspended` dibaca client.ts untuk redirect ke /login?suspended=1 */
  suspended;
  /** Marker `password_reverify` dibaca frontend untuk buka dialog password */
  actionRequired;
  /**
   * Daftar alasan kegagalan yang lebih spesifik, mis. ["minimal 12 karakter"].
   * Dipakai endpoint password agar frontend bisa menampilkan APA yang kurang,
   * bukan cuma "tidak memenuhi syarat" yang tidak bisa ditindaklanjuti.
   */
  problems;
  constructor(status, message, opts = {}) {
    super(message);
    this.status = status;
    this.field = opts.field ?? null;
    this.suspended = opts.suspended ?? false;
    this.actionRequired = opts.actionRequired ?? null;
    this.problems = opts.problems ?? null;
  }
  /** Bentuk error Laravel ValidationException: { login: ["Kredensial salah."] } */
  toBody() {
    const body = { message: this.message };
    if (this.field) {
      body[this.field] = [this.message];
      body.field = this.field;
    }
    if (this.suspended) body.suspended = true;
    if (this.actionRequired) body.action_required = this.actionRequired;
    if (this.problems?.length) body.problems = this.problems;
    return body;
  }
};
function makeCtx(req, res) {
  const fwd = req.headers["x-forwarded-for"];
  const ip = (typeof fwd === "string" ? fwd.split(",")[0]?.trim() : void 0) ?? req.headers["x-real-ip"] ?? null;
  const ua = req.headers["user-agent"];
  return { req, res, ip: typeof ip === "string" ? ip : null, userAgent: typeof ua === "string" ? ua : null };
}
function readBody(ctx) {
  const b = ctx.req.body;
  if (b == null) return {};
  if (typeof b === "string") {
    if (b === "") return {};
    try {
      return JSON.parse(b);
    } catch {
      throw new HttpError(400, "Body bukan JSON yang valid.");
    }
  }
  if (typeof b === "object") return b;
  return {};
}
function requireString(body, key, opts = {}) {
  const v = body[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new HttpError(422, `Kolom ${key} wajib diisi.`, { field: key });
  }
  const s = v.trim();
  if (opts.min && s.length < opts.min) {
    throw new HttpError(422, `${key} minimal ${opts.min} karakter.`, { field: key });
  }
  if (opts.max && s.length > opts.max) {
    throw new HttpError(422, `${key} maksimal ${opts.max} karakter.`, { field: key });
  }
  return s;
}
function optionalString(body, key) {
  const v = body[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : void 0;
}
function readBoolean(body, key) {
  const v = body[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
  return false;
}
async function requireAuth(ctx) {
  const header = ctx.req.headers.authorization;
  const bearer = typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : null;
  if (!bearer) {
    throw new HttpError(401, "Unauthenticated.");
  }
  try {
    return await verifyToken(bearer);
  } catch (e) {
    if (e instanceof AuthError && e.code === "revoked" && /suspend/i.test(e.message)) {
      throw new HttpError(403, e.message, { suspended: true });
    }
    throw new HttpError(401, e instanceof Error ? e.message : "Unauthenticated.");
  }
}
var JsonResult = class {
  constructor(status, body) {
    this.status = status;
    this.body = body;
  }
  status;
  body;
};
var Created = (body) => new JsonResult(201, body);
function handler(fn) {
  return async (req, res, ...args) => {
    const ctx = makeCtx(req, res);
    try {
      const body = await fn(ctx, ...args);
      if (res.writableEnded) return;
      if (body instanceof JsonResult) {
        if (body.status === 204) return res.status(204).end();
        return res.status(body.status).json(body.body);
      }
      res.status(200).json(body ?? { message: "OK." });
    } catch (e) {
      if (res.writableEnded) return;
      if (e instanceof HttpError) {
        return res.status(e.status).json(e.toBody());
      }
      const message = e instanceof Error ? e.message : "Internal server error";
      const isProd = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
      if (isProd) console.error("[500]", message);
      return res.status(500).json({
        message: isProd ? "Terjadi kesalahan di server." : message
      });
    }
  };
}

// src/server/routes/auth/change-password.ts
var change_password_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") {
    throw new HttpError(405, "Method not allowed.");
  }
  const auth = await requireAuth(ctx);
  const body = readBody(ctx);
  const newPassword = requireString(body, "new_password", { min: 8, max: 255 });
  const confirmation = requireString(body, "new_password_confirmation", { max: 255 });
  const currentPassword = optionalString(body, "current_password");
  const forFirstLogin = readBoolean(body, "for_first_login");
  if (newPassword !== confirmation) {
    throw new HttpError(422, "Konfirmasi password tidak cocok.", {
      field: "new_password"
    });
  }
  const db = getDb();
  const rows = await db.select({
    id: schema_exports.users.id,
    password: schema_exports.users.password,
    mustChangePassword: schema_exports.users.mustChangePassword
  }).from(schema_exports.users).where(eq2(schema_exports.users.id, auth.sub)).limit(1);
  const user = rows[0];
  if (!user) throw new HttpError(401, "User tidak ditemukan.");
  if (forFirstLogin) {
    if (!user.mustChangePassword) {
      throw new HttpError(422, "Mode ini hanya untuk first-login.", {
        field: "for_first_login"
      });
    }
  } else {
    if (!currentPassword) {
      throw new HttpError(422, "Kolom current_password wajib diisi.", {
        field: "current_password"
      });
    }
    if (!await verifyPassword(currentPassword, user.password)) {
      throw new HttpError(422, "Password lama salah.", { field: "current_password" });
    }
  }
  await db.update(schema_exports.users).set({
    password: await hashPassword(newPassword),
    mustChangePassword: false,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq2(schema_exports.users.id, auth.sub));
  await recordAudit(
    forFirstLogin ? "auth.password_change_first_login" : "auth.password_change",
    { is_first_login: forFirstLogin },
    { userId: auth.sub, role: auth.role, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  const revoked = await revokeAllForUser(auth.sub);
  console.log(`[change-password] user ${auth.sub}: ${revoked} token dicabut`);
  return { message: "Password berhasil diubah.", tokens_revoked: revoked };
});

// src/server/routes/auth/login.ts
import { eq as eq3, and as and2, isNull } from "drizzle-orm";
init_password();
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var DEFAULT_TTL_MINUTES = Number(process.env.TOKEN_TTL_MINUTES ?? 60);
var REMEMBER_TTL_MINUTES = 7 * 24 * 60;
var login_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") {
    throw new HttpError(405, "Method not allowed.");
  }
  const body = readBody(ctx);
  const login = requireString(body, "login", { max: 255 });
  const password = requireString(body, "password", { max: 255 });
  const rememberMe = readBoolean(body, "remember_me");
  const db = getDb();
  if (!EMAIL_RE.test(login) && login.length <= 20) {
    const rows = await db.select({
      id: schema_exports.users.id,
      email: schema_exports.users.email,
      name: schema_exports.users.name,
      role: schema_exports.users.role,
      password: schema_exports.users.password,
      suspendedAt: schema_exports.users.suspendedAt,
      mustChangePassword: schema_exports.users.mustChangePassword
    }).from(schema_exports.siswa).innerJoin(schema_exports.users, eq3(schema_exports.users.id, schema_exports.siswa.userId)).where(and2(eq3(schema_exports.siswa.nis, login), isNull(schema_exports.siswa.archivedAt))).limit(1);
    const found = rows[0];
    if (found && await verifyPassword(password, found.password)) {
      if (found.suspendedAt) throw suspendedError();
      return issueToken(ctx, found, rememberMe);
    }
  }
  const users2 = await db.select({
    id: schema_exports.users.id,
    email: schema_exports.users.email,
    name: schema_exports.users.name,
    role: schema_exports.users.role,
    password: schema_exports.users.password,
    suspendedAt: schema_exports.users.suspendedAt,
    mustChangePassword: schema_exports.users.mustChangePassword
  }).from(schema_exports.users).where(eq3(schema_exports.users.email, login)).limit(1);
  const user = users2[0];
  if (!user || !await verifyPassword(password, user.password)) {
    throw new HttpError(422, "Kredensial salah.", { field: "login" });
  }
  if (user.suspendedAt) throw suspendedError();
  return issueToken(ctx, user, rememberMe);
});
function suspendedError() {
  return new HttpError(422, "Akun di-suspend. Hubungi admin.", { field: "login" });
}
async function issueToken(ctx, user, rememberMe) {
  const ttlMinutes = rememberMe ? REMEMBER_TTL_MINUTES : DEFAULT_TTL_MINUTES;
  const { token, expiresAt } = await signToken(
    {
      sub: user.id,
      email: user.email ?? "",
      role: user.role,
      mustChangePassword: user.mustChangePassword
    },
    ttlMinutes * 60
  );
  const tokenName = `auth-${user.role}${rememberMe ? "-remembered" : ""}`;
  await recordToken(user.id, token, expiresAt, tokenName);
  await recordAudit(
    "auth.login",
    { remember_me: rememberMe },
    { userId: user.id, role: user.role, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    token,
    token_expires_in: ttlMinutes,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      suspended_at: user.suspendedAt ? user.suspendedAt.toISOString() : null,
      must_change_password: Boolean(user.mustChangePassword)
    }
  };
}

// src/server/routes/auth/logout.ts
var logout_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") {
    throw new HttpError(405, "Method not allowed.");
  }
  const auth = await requireAuth(ctx);
  const header = ctx.req.headers.authorization;
  const bearer = typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : "";
  if (bearer) await revokeToken(bearer);
  await recordAudit("auth.logout", {}, {
    userId: auth.sub,
    role: auth.role,
    ip: ctx.ip,
    userAgent: ctx.userAgent
  });
  return { message: "Logout berhasil." };
});

// src/server/routes/auth/me.ts
import { eq as eq4, and as and3, count } from "drizzle-orm";

// src/server/auth/roles.ts
var ROLES = [
  // WAJIB sama persis dengan isi kolom users.role di DB (schema.ts → roleEnum).
  // Yang berubah hanya nama tampilnya: "Santri" → "Siswa".
  "santri",
  "staff_kantin",
  "petugas_kesantrian",
  "admin_kesantrian",
  "super_admin",
  "super_admin_tier3"
];
var ROLE_LABELS = {
  santri: "Siswa",
  staff_kantin: "Staff Kantin",
  petugas_kesantrian: "Petugas Kesantrian",
  admin_kesantrian: "Admin Kesantrian",
  super_admin: "Super Admin (Tier 1)",
  super_admin_tier3: "Super Admin (Tier 3)"
};
var isRole = (v) => typeof v === "string" && ROLES.includes(v);
var isSiswa = (role) => role === "santri";
var isStaffKantin = (role) => role === "staff_kantin";
var isPetugas = (role) => role === "petugas_kesantrian";
var isAdmin = (role) => role === "admin_kesantrian";
var isSuperAdmin = (role) => role === "super_admin" || role === "super_admin_tier3";
var isSuperAdminTier1 = (role) => role === "super_admin";
var isSuperAdminTier3 = (role) => role === "super_admin_tier3";
var CAPABILITIES = {
  input_verifikasi: ["petugas_kesantrian", "admin_kesantrian", "super_admin", "super_admin_tier3"],
  // Katalog. Aturan bisnis: staff kantin boleh menambah produk & kategori,
  // tetapi tidak boleh mengubah/meng-archive milik orang lain. Petugas ke
  // atas boleh dua-duanya.
  //
  // Roster di sini adalah SATU-SATUNYA sumber kebenaran. Dulu `kelola_katalog`
  // tidak menyertakan staff kantin padahal `serialize.ts` membolehkannya —
  // dua definisi aturan yang sama, dan bertentangan. Sekarang
  // `canManageProduk()` / `canEditProduk()` membaca dari tabel ini, jadi
  // tidak bisa melenceng lagi.
  kelola_katalog: ["staff_kantin", "petugas_kesantrian", "admin_kesantrian", "super_admin", "super_admin_tier3"],
  kelola_katalog_edit: ["petugas_kesantrian", "admin_kesantrian", "super_admin", "super_admin_tier3"],
  kelola_reward: ["admin_kesantrian", "super_admin", "super_admin_tier3"],
  kelola_pembelian: ["staff_kantin", "admin_kesantrian", "super_admin", "super_admin_tier3"],
  kelola_siswa: ["petugas_kesantrian", "admin_kesantrian", "super_admin", "super_admin_tier3"],
  super_admin_panel: ["super_admin", "super_admin_tier3"],
  /** hanya T3 — destructive */
  super_admin_tier3: ["super_admin_tier3"]
};
var hasCapability = (role, cap) => CAPABILITIES[cap].includes(role);

// src/server/routes/auth/me.ts
var me_default = handler(async (ctx) => {
  if (ctx.req.method !== "GET" && ctx.req.method !== "POST") {
    throw new HttpError(405, "Method not allowed.");
  }
  const auth = await requireAuth(ctx);
  const db = getDb();
  const rows = await db.select({
    id: schema_exports.users.id,
    name: schema_exports.users.name,
    email: schema_exports.users.email,
    role: schema_exports.users.role,
    suspendedAt: schema_exports.users.suspendedAt,
    mustChangePassword: schema_exports.users.mustChangePassword
  }).from(schema_exports.users).where(eq4(schema_exports.users.id, auth.sub)).limit(1);
  const user = rows[0];
  if (!user) throw new HttpError(401, "User tidak ditemukan.");
  const base = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    suspended_at: user.suspendedAt ? user.suspendedAt.toISOString() : null,
    must_change_password: Boolean(user.mustChangePassword)
  };
  if (isSiswa(user.role)) {
    const rows2 = await db.select({
      nis: schema_exports.siswa.nis,
      kelas: schema_exports.siswa.kelas,
      asrama: schema_exports.siswa.asrama,
      currentPoin: schema_exports.siswa.currentPoin,
      isBlocked: schema_exports.siswa.isBlocked,
      blockReason: schema_exports.siswa.blockReason,
      blockAt: schema_exports.siswa.blockAt,
      archivedAt: schema_exports.siswa.archivedAt
    }).from(schema_exports.siswa).where(eq4(schema_exports.siswa.userId, user.id)).limit(1);
    const row = rows2[0];
    if (row) {
      base.siswa = {
        nis: row.nis,
        nama: user.name,
        kelas: row.kelas,
        asrama: row.asrama,
        current_poin: row.currentPoin,
        is_blocked: row.isBlocked,
        block_reason: row.blockReason,
        block_at: row.blockAt ? row.blockAt.toISOString() : null,
        archived_at: row.archivedAt ? row.archivedAt.toISOString() : null,
        // `is_suspended` = keputusan admin (users.suspended_at), BEDA dari
        // `is_blocked` yang berbasis saldo poin.
        // Lihat Siswa::isAccountSuspended() di model aslinya.
        is_suspended: Boolean(user.suspendedAt)
      };
      const [openRow] = await db.select({ n: count() }).from(schema_exports.transaksiPembelian).where(
        and3(
          eq4(schema_exports.transaksiPembelian.nis, row.nis),
          eq4(schema_exports.transaksiPembelian.status, "open")
        )
      );
      base.prior_open_count = Number(openRow?.n ?? 0);
      base.penalty_tier = -1;
    }
  }
  return base;
});

// src/server/routes/cron/archive-audit.ts
var archive_audit_default = handler(async (_ctx) => {
  const q = getSql();
  const started = Date.now();
  try {
    const rows = await q`select * from amanah_archive_audit()`;
    const r = rows[0] ?? {};
    return {
      job: "archive-audit",
      ok: true,
      // (a) ditandai siap arsip, (b) disalin ke audit_logs_archive,
      // (c) arsip lama ditandai purge, (d) dihapus, (e) audit_logs dibersihkan
      marked: Number(r.marked ?? 0),
      copied: Number(r.copied ?? 0),
      purged: Number(r.purged ?? 0),
      deleted: Number(r.deleted ?? 0),
      cleaned: Number(r.cleaned ?? 0),
      elapsed_ms: Date.now() - started,
      at: (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (e) {
    return {
      job: "archive-audit",
      ok: false,
      error: "Fungsi amanah_archive_audit() belum ada di database. Jalankan drizzle/0001_cron.sql di Neon SQL Editor.",
      detail: e instanceof Error ? e.message : String(e),
      at: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
});

// src/server/routes/cron/purge-tokens.ts
var purge_tokens_default = handler(async (_ctx) => {
  const q = getSql();
  const started = Date.now();
  try {
    const rows = await q`select amanah_purge_expired_tokens(30) as purged`;
    const purged = Number(rows[0]?.purged ?? 0);
    return {
      job: "purge-expired-tokens",
      purged,
      cutoff_days: 30,
      elapsed_ms: Date.now() - started,
      at: (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (e) {
    return {
      job: "purge-expired-tokens",
      ok: false,
      error: "Fungsi amanah_purge_expired_tokens() belum ada di database. Jalankan drizzle/0001_cron.sql di Neon SQL Editor.",
      detail: e instanceof Error ? e.message : String(e),
      at: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
});

// src/server/routes/kategori/check-name.ts
import { eq as eq5 } from "drizzle-orm";
var check_name_default = handler(async (ctx) => {
  if (ctx.req.method !== "GET") return new JsonResult(405, { error: "method_not_allowed" });
  await requireAuth(ctx);
  const nama = String(ctx.req.query.nama ?? "").trim();
  if (nama === "" || nama.length > 50) {
    return new JsonResult(422, {
      available: false,
      reason: "invalid_format",
      message: "Nama kategori kosong atau terlalu panjang (max 50 char)."
    });
  }
  const idRaw = ctx.req.query.id;
  const id = idRaw === void 0 || idRaw === null || idRaw === "" ? null : Number(idRaw);
  const db = getDb();
  const found = await db.select().from(schema_exports.kategoriProduk).where(eq5(schema_exports.kategoriProduk.namaKategori, nama)).limit(1);
  const hit = id ? found.filter((f) => f.id !== id)[0] : found[0];
  if (hit) {
    return new JsonResult(409, {
      available: false,
      reason: "duplicate",
      message: `Nama kategori '${nama}' sudah dipakai.`,
      existing: { id: hit.id, nama_kategori: hit.namaKategori }
    });
  }
  return { available: true, nama, message: "Nama kategori tersedia." };
});

// src/server/routes/kategori/index.ts
import { eq as eq6, asc, inArray } from "drizzle-orm";

// src/server/http-guards.ts
function requireAdminOrSuper(actual) {
  if (!isAdmin(actual) && !isSuperAdmin(actual)) {
    throw new HttpError(422, "Akses ditolak.", { field: "auth" });
  }
}
function requireCapability(actual, cap) {
  if (!hasCapability(actual, cap)) {
    throw new HttpError(422, "Akses ditolak.", { field: "auth" });
  }
}
function requireSuperAdmin(actual) {
  if (!isSuperAdmin(actual)) {
    throw new HttpError(422, "Akses ditolak.", { field: "auth" });
  }
}
function iso(v) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}
function serializeSiswa(s) {
  return {
    nis: s.nis,
    // `nama` di model Laravel selalu me-return users.name (sumber kebenaran),
    // bukan kolom DB. Lihat Siswa::getNamaAttribute().
    nama: s.userName ?? s.nama,
    kelas: s.kelas,
    asrama: s.asrama ?? null,
    current_poin: s.currentPoin ?? 0,
    is_blocked: s.isBlocked ?? false,
    block_reason: s.blockReason ?? null,
    block_at: iso(s.blockAt),
    archived_at: iso(s.archivedAt),
    reset_at: iso(s.resetAt)
  };
}
function serializeProduk(p) {
  return {
    barcode: p.barcode,
    nama_produk: p.namaProduk,
    id_kategori: p.idKategori,
    is_excluded_from_debit: p.isExcludedFromDebit ?? false,
    image_url: p.imageUrl ?? null,
    archived_at: iso(p.archivedAt)
  };
}
function serializeLedger(l) {
  return {
    id: l.id,
    source_type: l.sourceType,
    source_id: l.sourceId ?? null,
    poin_delta: l.poinDelta,
    saldo_sebelum: l.saldoSebelum,
    saldo_sesudah: l.saldoSesudah,
    waktu: iso(l.waktu)
  };
}
function serializeTransaksi(t) {
  return {
    id: t.id,
    nis: t.nis,
    barcode: t.barcode,
    qty: t.qty,
    penalty_per_unit: t.penaltyPerUnit,
    status: t.status,
    staff_id: t.staffId,
    waktu: iso(t.waktu),
    settled_at: iso(t.settledAt),
    cancelled_at: iso(t.cancelledAt),
    catatan: t.catatan ?? null
  };
}
function serializeReset(r) {
  return {
    id: r.id,
    nis: r.nis,
    admin_id: r.adminId,
    poin_sebelum: r.poinSebelum,
    poin_sesudah: r.poinSesudah,
    verifikasi_step_1: r.verifikasiStep1,
    verifikasi_step_2: r.verifikasiStep2,
    completed_at: iso(r.completedAt),
    catatan: r.catatan ?? null,
    created_at: iso(r.createdAt)
  };
}

// src/server/serialize.ts
function serializeKategori(k) {
  return {
    id: k.id,
    nama_kategori: k.namaKategori,
    deskripsi: k.deskripsi ?? null,
    is_default_excluded: k.isDefaultExcluded ?? false,
    created_at: iso(k.createdAt),
    updated_at: iso(k.updatedAt)
  };
}
function serializeProduk2(p, kategori) {
  const out = {
    barcode: p.barcode,
    nama_produk: p.namaProduk,
    id_kategori: p.idKategori,
    is_excluded_from_debit: p.isExcludedFromDebit ?? false,
    image_url: p.imageUrl ?? null,
    created_by: p.createdBy ?? null,
    updated_by: p.updatedBy ?? null,
    archived_at: iso(p.archivedAt),
    archived_by: p.archivedBy ?? null,
    created_at: iso(p.createdAt),
    updated_at: iso(p.updatedAt)
  };
  out.kategori = kategori ? serializeKategori(kategori) : null;
  return out;
}
function serializeReward(r, extra) {
  return {
    id_reward: r.idReward,
    nama_reward: r.namaReward,
    biaya_poin: r.biayaPoin,
    stok: r.stok,
    status_aktif: r.statusAktif ?? false,
    archived_at: iso(r.archivedAt),
    archived_by: r.archivedBy ?? null,
    created_by: r.createdBy ?? null,
    updated_by: r.updatedBy ?? null,
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
    ...extra ?? {}
  };
}
function serializePenukaran(p) {
  return {
    id: p.id,
    nis: p.nis,
    id_reward: p.idReward,
    poin_used: p.poinUsed,
    status: p.status,
    waktu: iso(p.waktu),
    created_at: iso(p.createdAt),
    updated_at: iso(p.updatedAt)
  };
}
function canManageProduk(role) {
  return hasCapability(role, "kelola_katalog");
}
function canEditProduk(role) {
  return hasCapability(role, "kelola_katalog_edit");
}

// src/server/routes/kategori/index.ts
var kategori_default = handler(async (ctx) => {
  const auth = await requireAuth(ctx);
  const db = getDb();
  if (ctx.req.method === "GET") {
    const cats = await db.select().from(schema_exports.kategoriProduk).orderBy(asc(schema_exports.kategoriProduk.namaKategori));
    const ids = cats.map((c) => c.id);
    const prods = ids.length ? await db.select().from(schema_exports.produk).where(inArray(schema_exports.produk.idKategori, ids)).orderBy(asc(schema_exports.produk.namaProduk)) : [];
    void prods;
    const data = cats.map((c) => ({
      ...serializeKategori(c),
      produk: prods.filter((p) => p.idKategori === c.id).map((p) => serializeProduk2(p))
    }));
    return { data };
  }
  if (ctx.req.method === "POST") {
    if (!canManageProduk(auth.role)) {
      throw new HttpError(422, "Akses ditolak.", { field: "auth" });
    }
    const body = readBody(ctx);
    const nama = requireString(body, "nama_kategori", { max: 50 });
    const deskripsi = optionalString(body, "deskripsi") ?? null;
    const isDefaultExcluded = body.is_default_excluded === true || body.is_default_excluded === 1 || body.is_default_excluded === "1" || body.is_default_excluded === "true";
    if (deskripsi !== null && deskripsi.length > 500) {
      throw new HttpError(422, "deskripsi maksimal 500 karakter.", { field: "deskripsi" });
    }
    const dup = await db.select().from(schema_exports.kategoriProduk).where(eq6(schema_exports.kategoriProduk.namaKategori, nama)).limit(1);
    if (dup.length) {
      throw new HttpError(422, "Nama kategori sudah dipakai.", { field: "nama_kategori" });
    }
    const now = /* @__PURE__ */ new Date();
    const [kat] = await db.insert(schema_exports.kategoriProduk).values({ namaKategori: nama, deskripsi, isDefaultExcluded, createdAt: now, updatedAt: now }).returning();
    await recordAudit(
      "kategori.create",
      { id: kat.id, name: kat.namaKategori, is_default_excluded: kat.isDefaultExcluded, created_by: auth.sub, role: auth.role },
      { userId: auth.sub, role: auth.role, resourceType: "kategori", resourceId: kat.id, ip: ctx.ip, userAgent: ctx.userAgent }
    );
    return Created({ kategori: serializeKategori(kat) });
  }
  throw new HttpError(405, "Method not allowed.");
});

// src/server/routes/me/profile.ts
import { eq as eq7, and as and4, count as count2 } from "drizzle-orm";
var SELF_EDITABLE_FIELDS = ["name", "phone", "gender", "birth_place", "birth_date", "address"];
var MAX = {
  name: 100,
  phone: 25,
  gender: 1,
  birth_place: 100,
  address: 500
};
function biodataOf(u) {
  return {
    phone: u.phone ?? null,
    gender: u.gender ?? null,
    birth_place: u.birthPlace ?? null,
    // Laravel: $this->birth_date?->format('Y-m-d')
    birth_date: u.birthDate ? new Date(u.birthDate).toISOString().slice(0, 10) : null,
    address: u.address ?? null
  };
}
var profile_default = handler(async (ctx) => {
  const auth = await requireAuth(ctx);
  const db = getDb();
  const rows = await db.select().from(schema_exports.users).where(eq7(schema_exports.users.id, auth.sub)).limit(1);
  const user = rows[0];
  if (!user) throw new HttpError(401, "User tidak ditemukan.");
  const role = user.role;
  if (ctx.req.method === "GET") {
    const payload = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role,
        suspended_at: iso(user.suspendedAt),
        created_at: iso(user.createdAt),
        updated_at: iso(user.updatedAt),
        biodata: biodataOf(user)
      },
      editable_fields: SELF_EDITABLE_FIELDS
    };
    if (isSiswa(role)) {
      const s = await db.select().from(schema_exports.siswa).where(eq7(schema_exports.siswa.userId, user.id)).limit(1);
      const row = s[0];
      if (row) {
        const [open] = await db.select({ n: count2() }).from(schema_exports.transaksiPembelian).where(
          and4(
            eq7(schema_exports.transaksiPembelian.nis, row.nis),
            eq7(schema_exports.transaksiPembelian.status, "open")
          )
        );
        payload.role_data = {
          type: "santri",
          nis: row.nis,
          kelas: row.kelas,
          asrama: row.asrama,
          current_poin: row.currentPoin,
          is_blocked: row.isBlocked,
          block_reason: row.blockReason,
          prior_open_count: Number(open?.n ?? 0),
          penalty_tier: -1
        };
      }
    } else {
      payload.role_data = {
        type: role,
        label: ROLE_LABELS[role] ?? role
      };
    }
    return payload;
  }
  if (ctx.req.method === "PATCH" || ctx.req.method === "PUT") {
    const body = readBody(ctx);
    const patch = {};
    if ("name" in body) {
      const v = body.name;
      if (typeof v !== "string" || v.trim() === "") {
        throw new HttpError(422, "Kolom name wajib diisi.", { field: "name" });
      }
      if (v.length > MAX.name) {
        throw new HttpError(422, `name maksimal ${MAX.name} karakter.`, { field: "name" });
      }
      patch.name = v.trim();
    }
    for (const f of ["phone", "gender", "birth_place", "address"]) {
      if (!(f in body)) continue;
      const v = body[f];
      if (v === null) {
        patch[f] = null;
        continue;
      }
      if (typeof v !== "string") {
        throw new HttpError(422, `Kolom ${f} harus berupa teks.`, { field: f });
      }
      if (v.length > MAX[f]) {
        throw new HttpError(422, `${f} maksimal ${MAX[f]} karakter.`, { field: f });
      }
      patch[f] = v === "" ? null : v;
    }
    if ("gender" in patch && patch.gender !== null && !["L", "P"].includes(patch.gender)) {
      throw new HttpError(422, "gender harus L atau P.", { field: "gender" });
    }
    if ("birth_date" in body) {
      const v = body.birth_date;
      if (v === null) {
        patch.birthDate = null;
      } else {
        if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          throw new HttpError(422, "birth_date harus format YYYY-MM-DD.", { field: "birth_date" });
        }
        if (Number.isNaN(Date.parse(v))) {
          throw new HttpError(422, "birth_date bukan tanggal valid.", { field: "birth_date" });
        }
        patch.birthDate = v;
      }
    }
    if (Object.keys(patch).length === 0) {
      throw new HttpError(422, "Tidak ada field yang di-update.", { field: "body" });
    }
    const before = biodataOf(user);
    await db.update(schema_exports.users).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq7(schema_exports.users.id, auth.sub));
    const newName = patch.name;
    if (isSiswa(role) && typeof newName === "string") {
      await db.update(schema_exports.siswa).set({ nama: newName }).where(eq7(schema_exports.siswa.userId, auth.sub));
    }
    await recordAudit(
      "profile.update_self",
      { user_id: auth.sub, fields_updated: Object.keys(patch) },
      { userId: auth.sub, role, ip: ctx.ip, userAgent: ctx.userAgent }
    );
    const fresh = await db.select().from(schema_exports.users).where(eq7(schema_exports.users.id, auth.sub)).limit(1);
    const after = biodataOf(fresh[0]);
    const diff = {};
    for (const k of Object.keys(patch)) {
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) diff[k] = after[k];
    }
    return {
      message: "Biodata berhasil diperbarui.",
      user: {
        id: user.id,
        name: fresh[0].name,
        email: fresh[0].email,
        role,
        biodata: after
      },
      diff
    };
  }
  throw new HttpError(405, "Method not allowed.");
});

// src/server/routes/pembelian/index.ts
import { eq as eq8, desc, inArray as inArray2 } from "drizzle-orm";
var PENALTY_PER_UNIT = -1;
var pembelian_default = handler(async (ctx) => {
  const auth = await requireAuth(ctx);
  if (ctx.req.method === "POST") return store(ctx, auth);
  if (ctx.req.method === "GET") return history(ctx, auth);
  throw new HttpError(405, "Method not allowed.");
});
function readItems(body) {
  const raw = body.items;
  if (Array.isArray(raw) && raw.length > 0) {
    return {
      isBatch: true,
      items: raw.map((it) => {
        if (typeof it?.barcode !== "string" || it.barcode.trim() === "") {
          throw new HttpError(422, "items.*.barcode wajib diisi.", { field: "barcode" });
        }
        const qty2 = Number(it?.qty);
        if (!Number.isInteger(qty2) || qty2 < 1) {
          throw new HttpError(422, "items.*.qty harus integer >= 1.", { field: "qty" });
        }
        return { barcode: it.barcode.trim(), qty: qty2 };
      })
    };
  }
  const barcode = requireString(body, "barcode", { max: 50 });
  const qty = Number(body.qty);
  if (!Number.isInteger(qty) || qty < 1) {
    throw new HttpError(422, "qty harus integer >= 1.", { field: "qty" });
  }
  return { items: [{ barcode, qty }], isBatch: false };
}
async function store(ctx, auth) {
  requireCapability(auth.role, "kelola_pembelian");
  const db = getDb();
  const body = readBody(ctx);
  if (typeof body.nis !== "string" || body.nis.trim() === "") {
    throw new HttpError(422, "Field nis wajib diisi di top-level request.", { field: "nis" });
  }
  const nis = body.nis.trim();
  const { items, isBatch } = readItems(body);
  const [siswa2] = await db.select().from(schema_exports.siswa).where(eq8(schema_exports.siswa.nis, nis)).limit(1);
  if (!siswa2) {
    throw new HttpError(422, `Siswa dengan NIS '${nis}' tidak ditemukan.`, { field: "nis" });
  }
  if (siswa2.archivedAt) {
    throw new HttpError(422, "Siswa sudah archived.", { field: "nis" });
  }
  const [subjectUser] = await db.select().from(schema_exports.users).where(eq8(schema_exports.users.id, siswa2.userId)).limit(1);
  if (!isSuperAdmin(auth.role) && subjectUser?.suspendedAt) {
    throw new HttpError(
      422,
      `Akun ${siswa2.nama} (NIS ${nis}) sedang di-suspend. Transaksi tidak bisa dicatat. Hubungi admin untuk membuka akses.`,
      { field: "nis" }
    );
  }
  const barcodes = [...new Set(items.map((i) => i.barcode))];
  const prods = await db.select().from(schema_exports.produk).where(inArray2(schema_exports.produk.barcode, barcodes));
  const produkByBarcode = new Map(prods.map((p) => [p.barcode, p]));
  for (const bc of barcodes) {
    const p = produkByBarcode.get(bc);
    if (!p) throw new HttpError(422, `Produk '${bc}' tidak ditemukan.`, { field: "barcode" });
    if (p.archivedAt) {
      throw new HttpError(422, `Produk '${p.namaProduk}' sudah di-archive. Tidak bisa dijual.`, {
        field: "barcode"
      });
    }
  }
  const hasPlastik = items.some((i) => !produkByBarcode.get(i.barcode).isExcludedFromDebit);
  if (siswa2.isBlocked && hasPlastik) {
    throw new HttpError(
      422,
      `Siswa ${siswa2.nama} sedang di-block (poin: ${siswa2.currentPoin}). Tidak boleh beli plastik.`,
      { field: "blocked" }
    );
  }
  const now = /* @__PURE__ */ new Date();
  const saldoSebelum = siswa2.currentPoin;
  let running = saldoSebelum;
  let totalDelta = 0;
  const plan = items.map((it) => {
    const poinDelta = PENALTY_PER_UNIT * it.qty;
    totalDelta += poinDelta;
    running += poinDelta;
    return {
      barcode: it.barcode,
      nama_produk: produkByBarcode.get(it.barcode).namaProduk,
      qty: it.qty,
      penalty_per_unit: PENALTY_PER_UNIT,
      poin_delta: poinDelta,
      saldo_sebelum: running - poinDelta,
      saldo_sesudah: running
    };
  });
  const saldoAkhir = running;
  const [limitRow] = await db.select().from(schema_exports.configSettings).where(eq8(schema_exports.configSettings.key, "default_negative_limit")).limit(1);
  const ambang = Number(limitRow?.value ?? 0);
  const jadiBlocked = saldoAkhir <= ambang;
  const txIds = [];
  await db.transaction(async (tx) => {
    for (const p of plan) {
      const [ins] = await tx.insert(schema_exports.transaksiPembelian).values({
        nis,
        barcode: p.barcode,
        qty: p.qty,
        penaltyPerUnit: p.penalty_per_unit,
        status: "open",
        staffId: auth.sub,
        waktu: now,
        createdAt: now,
        updatedAt: now
      }).returning({ id: schema_exports.transaksiPembelian.id });
      txIds.push(ins.id);
      await tx.insert(schema_exports.poinLedger).values({
        nis,
        sourceType: "purchase",
        sourceId: ins.id,
        poinDelta: p.poin_delta,
        saldoSebelum: p.saldo_sebelum,
        saldoSesudah: p.saldo_sesudah,
        waktu: now,
        createdAt: now,
        updatedAt: now
      });
    }
    await tx.update(schema_exports.siswa).set({
      currentPoin: saldoAkhir,
      isBlocked: jadiBlocked,
      ...jadiBlocked && !siswa2.blockAt ? { blockAt: now, blockReason: "Melewati ambang minus 50 poin" } : {},
      updatedAt: now
    }).where(eq8(schema_exports.siswa.nis, nis));
  });
  await recordAudit(
    isBatch ? "pembelian.batch_create" : "pembelian.create",
    { tx_ids: txIds, nis, items: plan, total_poin_delta: totalDelta, saldo_after: saldoAkhir },
    { userId: auth.sub, role: auth.role, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return Created({
    mode: isBatch ? "batch" : "single",
    transactions: plan.map((p, i) => ({
      id: txIds[i],
      nis,
      barcode: p.barcode,
      qty: p.qty,
      penalty_per_unit: p.penalty_per_unit,
      status: "open",
      staff_id: auth.sub
    })),
    items: plan.map((p, i) => ({ tx_id: txIds[i], ...p })),
    siswa: { nis, current_poin: saldoAkhir, is_blocked: jadiBlocked },
    total_poin_delta: totalDelta
  });
}
async function history(ctx, auth) {
  void ctx;
  void auth;
  const db = getDb();
  const rows = await db.select().from(schema_exports.transaksiPembelian).where(eq8(schema_exports.transaksiPembelian.staffId, auth.sub)).orderBy(desc(schema_exports.transaksiPembelian.waktu)).limit(100);
  return { data: await withProduk(db, rows) };
}
async function withProduk(db, rows) {
  const out = rows.map((t) => ({ ...serializeTransaksi(t) }));
  if (rows.length === 0) return out;
  const prods = await db.select().from(schema_exports.produk).where(inArray2(schema_exports.produk.barcode, [...new Set(rows.map((t) => t.barcode))]));
  const byBc = new Map(prods.map((p) => [p.barcode, serializeProduk(p)]));
  for (const item of out) {
    item.produk = byBc.get(item.barcode) ?? null;
  }
  return out;
}

// src/server/routes/produk/[barcode]/index.ts
import { eq as eq9 } from "drizzle-orm";
var barcode_default = handler(async (ctx) => {
  const auth = await requireAuth(ctx);
  const barcode = String(ctx.req.query.barcode ?? "").trim();
  if (!barcode) throw new HttpError(422, "Barcode wajib diisi.", { field: "barcode" });
  if (ctx.req.method === "PATCH") return update(ctx, barcode, auth);
  if (ctx.req.method === "DELETE") return archive(ctx, barcode, auth);
  throw new HttpError(405, "Method not allowed.");
});
function flag(v) {
  return v === true || v === 1 || v === "1" || v === "true";
}
async function load(db, barcode) {
  const rows = await db.select().from(schema_exports.produk).where(eq9(schema_exports.produk.barcode, barcode)).limit(1);
  if (!rows[0]) throw new HttpError(404, "Produk tidak ditemukan.", { field: "barcode" });
  const cat = await db.select().from(schema_exports.kategoriProduk).where(eq9(schema_exports.kategoriProduk.id, rows[0].idKategori)).limit(1);
  return { produk: rows[0], kategori: cat[0] ?? null };
}
async function update(ctx, barcode, auth) {
  if (!canEditProduk(auth.role)) {
    throw new HttpError(422, "Akses ditolak.", { field: "auth" });
  }
  const db = getDb();
  const { produk: produk2, kategori } = await load(db, barcode);
  if (produk2.archivedAt) {
    throw new HttpError(422, "Produk sudah di-archive. Unarchive dulu untuk edit.", {
      field: "produk"
    });
  }
  const body = readBody(ctx);
  const patch = {};
  if ("nama_produk" in body) {
    const v = body.nama_produk;
    if (typeof v !== "string" || v.trim() === "") {
      throw new HttpError(422, "Kolom nama_produk wajib diisi.", { field: "nama_produk" });
    }
    if (v.length > 100) {
      throw new HttpError(422, "nama_produk maksimal 100 karakter.", { field: "nama_produk" });
    }
    patch.namaProduk = v.trim();
  }
  if ("id_kategori" in body) {
    const id = Number(body.id_kategori);
    if (!Number.isInteger(id)) {
      throw new HttpError(422, "id_kategori tidak valid.", { field: "id_kategori" });
    }
    const cat = await db.select().from(schema_exports.kategoriProduk).where(eq9(schema_exports.kategoriProduk.id, id)).limit(1);
    if (!cat.length) {
      throw new HttpError(422, "Kategori tidak ditemukan.", { field: "id_kategori" });
    }
    patch.idKategori = id;
  }
  if ("is_excluded_from_debit" in body) {
    patch.isExcludedFromDebit = flag(body.is_excluded_from_debit);
  }
  if (Object.keys(patch).length === 0) {
    throw new HttpError(422, "Tidak ada field yang di-update.", { field: "body" });
  }
  const before = {
    nama_produk: produk2.namaProduk,
    id_kategori: produk2.idKategori,
    is_excluded_from_debit: produk2.isExcludedFromDebit
  };
  const [updated] = await db.update(schema_exports.produk).set({ ...patch, updatedBy: auth.sub, updatedAt: /* @__PURE__ */ new Date() }).where(eq9(schema_exports.produk.barcode, barcode)).returning();
  const catAfter = await db.select().from(schema_exports.kategoriProduk).where(eq9(schema_exports.kategoriProduk.id, updated.idKategori)).limit(1);
  await recordAudit(
    "produk.update",
    {
      barcode,
      before,
      after: {
        nama_produk: updated.namaProduk,
        id_kategori: updated.idKategori,
        is_excluded_from_debit: updated.isExcludedFromDebit
      },
      updated_by: auth.sub
    },
    { userId: auth.sub, role: auth.role, resourceType: "produk", resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return { produk: serializeProduk2(updated, catAfter[0] ?? kategori) };
}
async function archive(ctx, barcode, auth) {
  if (!canEditProduk(auth.role)) {
    throw new HttpError(422, "Akses ditolak.", { field: "auth" });
  }
  const db = getDb();
  const { produk: produk2 } = await load(db, barcode);
  const now = /* @__PURE__ */ new Date();
  const [updated] = await db.update(schema_exports.produk).set({ archivedAt: now, archivedBy: auth.sub, updatedBy: auth.sub, updatedAt: now }).where(eq9(schema_exports.produk.barcode, barcode)).returning();
  await recordAudit(
    "produk.archive",
    { barcode, nama_produk: produk2.namaProduk, archived_by: auth.sub },
    { userId: auth.sub, role: auth.role, resourceType: "produk", resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    message: `Produk '${produk2.namaProduk}' sudah di-archive. Tidak akan muncul di POS lagi.`,
    produk: serializeProduk2(updated)
  };
}

// src/server/routes/produk/[barcode]/log.ts
import { eq as eq10, asc as asc2 } from "drizzle-orm";
var ACTION_LABELS = {
  "produk.create": "Produk ditambah ke katalog",
  "produk.update": "Produk di-update",
  "produk.archive": "Produk di-archive",
  "produk.unarchive": "Produk di-restore"
};
var STATUS_LABELS = {
  open: "Hutang (belum setor)",
  settled: "Disetor (matched)",
  cancelled: "Dibatalkan"
};
var log_default = handler(async (ctx) => {
  if (ctx.req.method !== "GET") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);
  const barcode = String(ctx.req.query.barcode ?? "").trim();
  if (!barcode) throw new HttpError(422, "Barcode wajib diisi.", { field: "barcode" });
  const db = getDb();
  const rows = await db.select().from(schema_exports.produk).where(eq10(schema_exports.produk.barcode, barcode)).limit(1);
  const produk2 = rows[0];
  if (!produk2) throw new HttpError(404, "Produk tidak ditemukan.", { field: "barcode" });
  const logs = await getSql()`
    select id, role, action, payload, waktu
    from audit_logs
    where action in ('produk.create','produk.update','produk.archive','produk.unarchive')
      and payload->>'barcode' = ${barcode}
    order by waktu asc
    limit 200
  `;
  const incoming = logs.map((l) => ({
    event_type: "masuk",
    subtype: l.action,
    label: ACTION_LABELS[l.action] ?? l.action,
    waktu: iso(l.waktu),
    actor_name: l.payload?.created_by ?? l.payload?.updated_by ?? null,
    actor_role: l.role,
    payload: l.payload ?? null
  }));
  const buys = await db.select({
    id: schema_exports.transaksiPembelian.id,
    nis: schema_exports.transaksiPembelian.nis,
    qty: schema_exports.transaksiPembelian.qty,
    penaltyPerUnit: schema_exports.transaksiPembelian.penaltyPerUnit,
    status: schema_exports.transaksiPembelian.status,
    waktu: schema_exports.transaksiPembelian.waktu,
    namaSiswa: schema_exports.siswa.nama
  }).from(schema_exports.transaksiPembelian).innerJoin(schema_exports.siswa, eq10(schema_exports.siswa.nis, schema_exports.transaksiPembelian.nis)).where(eq10(schema_exports.transaksiPembelian.barcode, barcode)).orderBy(asc2(schema_exports.transaksiPembelian.waktu)).limit(200);
  const purchasing = buys.map((r) => ({
    event_type: "keluar",
    subtype: "transaksi_pembelian",
    label: `Dibeli ${r.qty} unit oleh ${r.namaSiswa} (NIS ${r.nis}) \u2014 ${STATUS_LABELS[r.status] ?? r.status}`,
    waktu: iso(r.waktu),
    // nama siswa dari users.name (sumber kebenaran)
    actor_name: r.namaSiswa,
    actor_role: "santri",
    nis: r.nis,
    qty: r.qty,
    penalty_per_unit: r.penaltyPerUnit,
    status: r.status
  }));
  const stat = await getSql()`
    select
      count(*) as tx_count,
      coalesce(sum(case when status = 'settled' then qty else 0 end), 0) as qty_settled,
      coalesce(sum(case when status = 'open' then qty else 0 end), 0) as qty_open,
      coalesce(sum(case when status = 'cancelled' then qty else 0 end), 0) as qty_cancelled
    from transaksi_pembelian
    where barcode = ${barcode}
  `;
  const s = stat[0] ?? {};
  const events = [...incoming, ...purchasing].sort((a, b) => {
    const ta = a.waktu ? Date.parse(a.waktu) : 0;
    const tb = b.waktu ? Date.parse(b.waktu) : 0;
    return tb - ta;
  });
  return {
    produk: produk2,
    summary: {
      created_at: iso(produk2.createdAt),
      created_by: produk2.createdBy,
      updated_at: iso(produk2.updatedAt),
      updated_by: produk2.updatedBy,
      archived_at: iso(produk2.archivedAt),
      archived_by: produk2.archivedBy,
      purchases: {
        total_tx: Number(s.tx_count ?? 0),
        qty_settled: Number(s.qty_settled ?? 0),
        qty_open: Number(s.qty_open ?? 0),
        qty_cancelled: Number(s.qty_cancelled ?? 0)
      }
    },
    events
  };
});

// src/server/routes/produk/[barcode]/unarchive.ts
import { eq as eq11 } from "drizzle-orm";
var unarchive_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  if (!isSuperAdmin(auth.role)) {
    throw new HttpError(422, "Akses ditolak \u2014 super admin only.", { field: "auth" });
  }
  const barcode = String(ctx.req.query.barcode ?? "").trim();
  if (!barcode) throw new HttpError(422, "Barcode wajib diisi.", { field: "barcode" });
  const db = getDb();
  const rows = await db.select().from(schema_exports.produk).where(eq11(schema_exports.produk.barcode, barcode)).limit(1);
  const produk2 = rows[0];
  if (!produk2) throw new HttpError(404, "Produk tidak ditemukan.", { field: "barcode" });
  if (!produk2.archivedAt) {
    throw new HttpError(422, "Produk tidak dalam keadaan archived.", { field: "produk" });
  }
  const now = /* @__PURE__ */ new Date();
  const [updated] = await db.update(schema_exports.produk).set({ archivedAt: null, archivedBy: null, updatedBy: auth.sub, updatedAt: now }).where(eq11(schema_exports.produk.barcode, barcode)).returning();
  await recordAudit(
    "produk.unarchive",
    { barcode, restored_by: auth.sub },
    { userId: auth.sub, role: auth.role, resourceType: "produk", resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    message: `Produk '${produk2.namaProduk}' sudah di-restore.`,
    produk: serializeProduk2(updated)
  };
});

// src/server/routes/produk/check-barcode/[barcode].ts
import { eq as eq12 } from "drizzle-orm";
var barcode_default2 = handler(async (ctx) => {
  if (ctx.req.method !== "GET") return new JsonResult(405, { error: "method_not_allowed" });
  await requireAuth(ctx);
  const barcode = String(ctx.req.query.barcode ?? "").trim();
  if (barcode === "" || barcode.length > 50) {
    return new JsonResult(422, {
      available: false,
      barcode,
      reason: "invalid_format",
      message: "Barcode kosong atau terlalu panjang (max 50 char)."
    });
  }
  const db = getDb();
  const rows = await db.select().from(schema_exports.produk).where(eq12(schema_exports.produk.barcode, barcode)).limit(1);
  const existing = rows[0];
  if (existing) {
    const cat = await db.select().from(schema_exports.kategoriProduk).where(eq12(schema_exports.kategoriProduk.id, existing.idKategori)).limit(1);
    return new JsonResult(409, {
      available: false,
      barcode,
      reason: "duplicate",
      message: `Barcode '${barcode}' sudah dipakai oleh '${existing.namaProduk}'.`,
      existing: {
        barcode: existing.barcode,
        nama_produk: existing.namaProduk,
        kategori: cat[0]?.namaKategori ?? null,
        archived: existing.archivedAt !== null
      }
    });
  }
  return {
    available: true,
    barcode,
    message: "Barcode tersedia untuk produk baru."
  };
});

// src/server/routes/produk/index.ts
import { and as and5, eq as eq13, ilike, isNull as isNull2, isNotNull } from "drizzle-orm";
var produk_default = handler(async (ctx) => {
  const auth = await requireAuth(ctx);
  const db = getDb();
  if (ctx.req.method === "GET") return list(ctx, db, auth.role);
  if (ctx.req.method === "POST") return create(ctx, db, auth);
  throw new HttpError(405, "Method not allowed.");
});
function flag2(v) {
  return v === "1" || v === "true" || v === true;
}
async function list(ctx, db, role) {
  const conds = [];
  if (!(flag2(ctx.req.query.include_archived) && (isAdmin(role) || isSuperAdmin(role)))) {
    conds.push(isNull2(schema_exports.produk.archivedAt));
  }
  const archived = ctx.req.query.archived;
  if (archived === "only") conds.push(isNotNull(schema_exports.produk.archivedAt));
  else if (archived === "no") conds.push(isNull2(schema_exports.produk.archivedAt));
  if (ctx.req.query.barcode) conds.push(ilike(schema_exports.produk.barcode, `%${ctx.req.query.barcode}%`));
  if (ctx.req.query.nama) conds.push(ilike(schema_exports.produk.namaProduk, `%${ctx.req.query.nama}%`));
  if (ctx.req.query.kategori) {
    const cats2 = await db.select().from(schema_exports.kategoriProduk).where(eq13(schema_exports.kategoriProduk.namaKategori, String(ctx.req.query.kategori))).limit(1);
    if (cats2[0]) conds.push(eq13(schema_exports.produk.idKategori, cats2[0].id));
  }
  const where = conds.length ? and5(...conds) : void 0;
  const rows = await db.select().from(schema_exports.produk).where(where).limit(200);
  const cats = await db.select().from(schema_exports.kategoriProduk);
  const byId = new Map(cats.map((c) => [c.id, c]));
  return { data: rows.map((p) => serializeProduk2(p, byId.get(p.idKategori) ?? null)) };
}
async function create(ctx, db, auth) {
  if (!canManageProduk(auth.role)) {
    throw new HttpError(422, "Akses ditolak.", { field: "auth" });
  }
  const body = readBody(ctx);
  const barcode = requireString(body, "barcode", { max: 50 });
  const namaProduk = requireString(body, "nama_produk", { max: 100 });
  const idKategori = Number(body.id_kategori);
  if (!Number.isInteger(idKategori)) {
    throw new HttpError(422, "Kolom id_kategori wajib diisi.", { field: "id_kategori" });
  }
  const isExcluded = body.is_excluded_from_debit === true || body.is_excluded_from_debit === 1 || body.is_excluded_from_debit === "1" || body.is_excluded_from_debit === "true";
  const dup = await db.select().from(schema_exports.produk).where(eq13(schema_exports.produk.barcode, barcode)).limit(1);
  if (dup.length) {
    throw new HttpError(422, "Barcode sudah dipakai.", { field: "barcode" });
  }
  const cat = await db.select().from(schema_exports.kategoriProduk).where(eq13(schema_exports.kategoriProduk.id, idKategori)).limit(1);
  if (!cat.length) {
    throw new HttpError(422, "Kategori tidak ditemukan.", { field: "id_kategori" });
  }
  const now = /* @__PURE__ */ new Date();
  const [produk2] = await db.insert(schema_exports.produk).values({
    barcode,
    namaProduk,
    idKategori,
    isExcludedFromDebit: isExcluded,
    createdBy: auth.sub,
    updatedBy: auth.sub,
    createdAt: now,
    updatedAt: now
  }).returning();
  await recordAudit(
    "produk.create",
    { barcode, nama_produk: namaProduk, created_by: auth.sub, role: auth.role },
    { userId: auth.sub, role: auth.role, resourceType: "produk", resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return Created({ produk: serializeProduk2(produk2, cat[0]) });
}

// src/server/routes/produk/scan/[barcode].ts
import { eq as eq14 } from "drizzle-orm";
var barcode_default3 = handler(async (ctx) => {
  if (ctx.req.method !== "GET") return new JsonResult(405, { error: "method_not_allowed" });
  const auth = await requireAuth(ctx);
  const barcode = String(ctx.req.query.barcode ?? "").trim();
  if (barcode === "" || barcode.length > 50) {
    return new JsonResult(422, {
      barcode: ["Barcode kosong atau terlalu panjang."],
      message: "Barcode kosong atau terlalu panjang."
    });
  }
  const db = getDb();
  const rows = await db.select().from(schema_exports.produk).where(eq14(schema_exports.produk.barcode, barcode)).limit(1);
  const produk2 = rows[0];
  if (!produk2) {
    await recordAudit("produk.scan_not_found", { barcode }, {
      userId: auth.sub,
      role: auth.role,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return new JsonResult(404, {
      found: false,
      barcode,
      message: "Produk tidak ditemukan di katalog."
    });
  }
  const cat = await db.select().from(schema_exports.kategoriProduk).where(eq14(schema_exports.kategoriProduk.id, produk2.idKategori)).limit(1);
  await recordAudit(
    "produk.scan_hit",
    { barcode, produk_id: barcode, archived: produk2.archivedAt !== null },
    { userId: auth.sub, role: auth.role, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    found: true,
    produk: {
      barcode: produk2.barcode,
      nama_produk: produk2.namaProduk,
      kategori: cat[0]?.namaKategori ?? null,
      is_excluded_from_debit: produk2.isExcludedFromDebit,
      archived_at: iso(produk2.archivedAt),
      is_active: produk2.archivedAt === null
    }
  };
});

// src/server/routes/reset/[reset_id]/apply.ts
import { eq as eq15, sql } from "drizzle-orm";
var apply_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);
  const resetId = Number(ctx.req.query.reset_id ?? ctx.req.query.resetId);
  if (!Number.isInteger(resetId)) {
    throw new HttpError(422, "reset_id tidak valid.", { field: "reset_id" });
  }
  const db = getDb();
  const now = /* @__PURE__ */ new Date();
  let poinSebelum = 0;
  let nis = "";
  await db.transaction(async (tx) => {
    const raw = await tx.execute(
      sql`select * from reset_denda_log where id = ${resetId} for update`
    );
    const rows = Array.isArray(raw) ? raw : raw?.rows ?? [];
    const log = rows[0];
    if (!log) throw new HttpError(404, "Data reset tidak ditemukan.");
    if (!log.verifikasi_step_1) {
      throw new HttpError(422, "Step 1 belum dikonfirmasi.", { field: "reset" });
    }
    if (log.completed_at) {
      throw new HttpError(422, "Reset sudah di-apply sebelumnya.", { field: "reset" });
    }
    nis = log.nis;
    const [siswa2] = await tx.select().from(schema_exports.siswa).where(eq15(schema_exports.siswa.nis, nis)).limit(1);
    if (!siswa2) throw new HttpError(404, "Siswa tidak ditemukan.");
    poinSebelum = siswa2.currentPoin;
    await tx.update(schema_exports.siswa).set({
      currentPoin: 0,
      isBlocked: false,
      blockReason: null,
      blockAt: null,
      resetAt: now,
      updatedAt: now
    }).where(eq15(schema_exports.siswa.nis, nis));
    await tx.insert(schema_exports.poinLedger).values({
      nis,
      sourceType: "reset",
      sourceId: resetId,
      poinDelta: -poinSebelum,
      saldoSebelum: poinSebelum,
      saldoSesudah: 0,
      waktu: now,
      createdAt: now,
      updatedAt: now
    });
    await tx.update(schema_exports.resetDendaLog).set({
      verifikasiStep2: true,
      poinSesudah: 0,
      completedAt: now,
      updatedAt: now
    }).where(eq15(schema_exports.resetDendaLog.id, resetId));
  });
  const [finalLog] = await db.select().from(schema_exports.resetDendaLog).where(eq15(schema_exports.resetDendaLog.id, resetId)).limit(1);
  await recordAudit(
    "reset.complete",
    { reset_id: resetId, nis, poin_before: poinSebelum, poin_after: 0 },
    { userId: auth.sub, role: auth.role, resourceType: "reset", resourceId: resetId, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    reset: serializeReset(finalLog),
    siswa: { nis, current_poin: 0, is_blocked: false },
    message: "Reset poin selesai. Poin kembali ke 0. Debts TETAP OPEN \u2014 siswa harus return sampah secara bertahap."
  };
});

// src/server/routes/reset/[reset_id]/start.ts
import { eq as eq16 } from "drizzle-orm";
var start_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);
  const nis = String(ctx.req.query.reset_id ?? ctx.req.query.nis ?? "").trim();
  if (!nis) throw new HttpError(422, "NIS wajib diisi.", { field: "nis" });
  const db = getDb();
  const [siswa2] = await db.select().from(schema_exports.siswa).where(eq16(schema_exports.siswa.nis, nis)).limit(1);
  if (!siswa2) throw new HttpError(404, "Siswa tidak ditemukan.");
  if (!siswa2.isBlocked) {
    throw new HttpError(422, "Siswa tidak dalam keadaan blocked.", { field: "nis" });
  }
  const now = /* @__PURE__ */ new Date();
  const [log] = await db.insert(schema_exports.resetDendaLog).values({
    nis,
    adminId: auth.sub,
    poinSebelum: siswa2.currentPoin,
    poinSesudah: 0,
    // [v1.1] target = 0
    verifikasiStep1: false,
    verifikasiStep2: false,
    createdAt: now,
    updatedAt: now
  }).returning();
  await recordAudit(
    "reset.start",
    { reset_id: log.id, nis, poin_before: siswa2.currentPoin },
    { userId: auth.sub, role: auth.role, resourceType: "reset", resourceId: log.id, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return { reset: serializeReset(log) };
});

// src/server/routes/reset/[reset_id]/step1.ts
import { eq as eq17 } from "drizzle-orm";
var step1_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);
  const resetId = Number(ctx.req.query.reset_id ?? ctx.req.query.resetId);
  if (!Number.isInteger(resetId)) {
    throw new HttpError(422, "reset_id tidak valid.", { field: "reset_id" });
  }
  const db = getDb();
  const [updated] = await db.update(schema_exports.resetDendaLog).set({ verifikasiStep1: true, updatedAt: /* @__PURE__ */ new Date() }).where(eq17(schema_exports.resetDendaLog.id, resetId)).returning();
  if (!updated) throw new HttpError(404, "Data reset tidak ditemukan.");
  await recordAudit(
    "reset.step1",
    { reset_id: resetId },
    { userId: auth.sub, role: auth.role, resourceType: "reset", resourceId: resetId, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return { reset: serializeReset(updated) };
});

// src/server/routes/reward/[id]/archive.ts
import { eq as eq18 } from "drizzle-orm";
var archive_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);
  const id = String(ctx.req.query.id ?? "").trim();
  if (!id) throw new HttpError(422, "id_reward wajib diisi.", { field: "id_reward" });
  const db = getDb();
  const rows = await db.select().from(schema_exports.reward).where(eq18(schema_exports.reward.idReward, id)).limit(1);
  const reward2 = rows[0];
  if (!reward2) throw new HttpError(404, "Reward tidak ditemukan.", { field: "id_reward" });
  if (reward2.archivedAt !== null) {
    return { reward: serializeReward(reward2), message: "Reward sudah di-archive." };
  }
  const now = /* @__PURE__ */ new Date();
  const [updated] = await db.update(schema_exports.reward).set({ archivedAt: now, archivedBy: auth.sub, statusAktif: false, updatedBy: auth.sub, updatedAt: now }).where(eq18(schema_exports.reward.idReward, id)).returning();
  await recordAudit(
    "reward.archive",
    { reward_id: id, nama_reward: reward2.namaReward },
    { userId: auth.sub, role: auth.role, resourceType: "reward", resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    reward: serializeReward(updated),
    message: `Reward '${reward2.namaReward}' telah di-archive.`
  };
});

// src/server/routes/reward/[id]/index.ts
import { eq as eq19, and as and6, sql as sql2, isNull as isNull3 } from "drizzle-orm";
var id_default = handler(async (ctx) => {
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);
  const id = String(ctx.req.query.id ?? "").trim();
  if (!id) throw new HttpError(422, "id_reward wajib diisi.", { field: "id_reward" });
  if (ctx.req.method === "GET") {
    const db = getDb();
    const rows = await db.select().from(schema_exports.reward).where(eq19(schema_exports.reward.idReward, id)).limit(1);
    if (!rows[0]) throw new HttpError(404, "Reward tidak ditemukan.", { field: "id_reward" });
    return { reward: serializeReward(rows[0]) };
  }
  if (ctx.req.method === "PATCH" || ctx.req.method === "PUT") {
    const db = getDb();
    const rows = await db.select().from(schema_exports.reward).where(eq19(schema_exports.reward.idReward, id)).limit(1);
    const reward2 = rows[0];
    if (!reward2) throw new HttpError(404, "Reward tidak ditemukan.", { field: "id_reward" });
    if (reward2.archivedAt !== null) {
      throw new HttpError(422, "Reward sudah di-archive. Restore dulu untuk mengedit.", {
        field: "reward"
      });
    }
    const body = readBody(ctx);
    const nama = requireString(body, "nama_reward", { max: 100 });
    const biaya = Number(body.biaya_poin);
    const stok = Number(body.stok);
    if (!Number.isInteger(biaya) || biaya < 1 || biaya > 1e6) {
      throw new HttpError(422, "biaya_poin harus integer 1..1000000.", { field: "biaya_poin" });
    }
    if (!Number.isInteger(stok) || stok < 0) {
      throw new HttpError(422, "stok harus integer >= 0.", { field: "stok" });
    }
    if (typeof body.status_aktif !== "boolean") {
      throw new HttpError(422, "status_aktif wajib diisi (true/false).", { field: "status_aktif" });
    }
    const statusAktif = body.status_aktif;
    const dup = await db.select().from(schema_exports.reward).where(sql2`lower(${schema_exports.reward.namaReward}) = ${nama.toLowerCase()}`).limit(1);
    if (dup.length && dup[0].idReward !== id) {
      throw new HttpError(422, "Nama reward sudah dipakai reward lain.", {
        field: "nama_reward"
      });
    }
    const before = {
      nama_reward: reward2.namaReward,
      biaya_poin: reward2.biayaPoin,
      stok: reward2.stok,
      status_aktif: reward2.statusAktif
    };
    const [updated] = await db.update(schema_exports.reward).set({ namaReward: nama, biayaPoin: biaya, stok, statusAktif, updatedBy: auth.sub, updatedAt: /* @__PURE__ */ new Date() }).where(eq19(schema_exports.reward.idReward, id)).returning();
    await recordAudit(
      "reward.update",
      {
        reward_id: id,
        payload: {
          before,
          after: {
            nama_reward: updated.namaReward,
            biaya_poin: updated.biayaPoin,
            stok: updated.stok,
            status_aktif: updated.statusAktif
          }
        }
      },
      { userId: auth.sub, role: auth.role, resourceType: "reward", resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent }
    );
    return { reward: serializeReward(updated) };
  }
  throw new HttpError(405, "Method not allowed.");
});

// src/server/routes/reward/[id]/redeem.ts
import { eq as eq20, sql as sql3 } from "drizzle-orm";
function rowsOf(raw) {
  if (Array.isArray(raw)) return raw;
  const r = raw?.rows;
  return Array.isArray(r) ? r : [];
}
var redeem_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  if (!isSiswa(auth.role)) {
    throw new HttpError(422, "Hanya Siswa yang bisa redeem reward.", { field: "auth" });
  }
  const id = String(ctx.req.query.id ?? "").trim();
  if (!id) throw new HttpError(422, "id_reward wajib diisi.", { field: "id_reward" });
  const db = getDb();
  const now = /* @__PURE__ */ new Date();
  const [siswa2] = await db.select().from(schema_exports.siswa).where(eq20(schema_exports.siswa.userId, auth.sub)).limit(1);
  if (!siswa2) throw new HttpError(404, "Data siswa tidak ditemukan.");
  const [rewardRow] = await db.select().from(schema_exports.reward).where(eq20(schema_exports.reward.idReward, id)).limit(1);
  if (!rewardRow) throw new HttpError(404, "Reward tidak ditemukan.");
  if (rewardRow.archivedAt) throw new HttpError(422, "Reward sudah di-archive.");
  if (!rewardRow.statusAktif) throw new HttpError(422, "Reward sedang nonaktif.");
  if (rewardRow.stok < 1) throw new HttpError(422, "Stok reward habis.");
  if (siswa2.currentPoin < rewardRow.biayaPoin) {
    throw new HttpError(
      422,
      `Poin tidak cukup. Dibutuhkan ${rewardRow.biayaPoin} poin, kamu punya ${siswa2.currentPoin}.`,
      { field: "poin" }
    );
  }
  const biaya = rewardRow.biayaPoin;
  const saldoSebelum = siswa2.currentPoin;
  const saldoSesudah = siswa2.currentPoin - biaya;
  const namaReward = rewardRow.namaReward;
  const stokSisa = rewardRow.stok - 1;
  let penukaranId = 0;
  await db.transaction(async (tx) => {
    const raw = await tx.execute(
      sql3`select stok, status_aktif, archived_at from reward where id_reward = ${id} for update`
    );
    const locked = rowsOf(raw)[0];
    if (!locked) throw new HttpError(404, "Reward tidak ditemukan.");
    if (locked.archived_at) throw new HttpError(422, "Reward sudah di-archive.");
    if (!locked.status_aktif) throw new HttpError(422, "Reward sedang nonaktif.");
    if (Number(locked.stok) < 1) throw new HttpError(422, "Stok reward habis.");
    const [px2] = await tx.insert(schema_exports.penukaranReward).values({
      nis: siswa2.nis,
      idReward: id,
      poinUsed: biaya,
      status: "redeemed",
      waktu: now,
      createdAt: now,
      updatedAt: now
    }).returning({ id: schema_exports.penukaranReward.id });
    penukaranId = px2.id;
    await tx.update(schema_exports.reward).set({ stok: stokSisa, updatedBy: auth.sub, updatedAt: now }).where(eq20(schema_exports.reward.idReward, id));
    await tx.update(schema_exports.siswa).set({ currentPoin: saldoSesudah, updatedAt: now }).where(eq20(schema_exports.siswa.nis, siswa2.nis));
    await tx.insert(schema_exports.poinLedger).values({
      nis: siswa2.nis,
      sourceType: "redeem",
      sourceId: penukaranId,
      poinDelta: -biaya,
      saldoSebelum,
      saldoSesudah,
      waktu: now,
      createdAt: now,
      updatedAt: now
    });
  });
  const [fresh] = await db.select().from(schema_exports.reward).where(eq20(schema_exports.reward.idReward, id)).limit(1);
  const [px] = await db.select().from(schema_exports.penukaranReward).where(eq20(schema_exports.penukaranReward.id, penukaranId)).limit(1);
  await recordAudit(
    "reward.redeem",
    { reward_id: id, poin_used: biaya, saldo_before: saldoSebelum, saldo_after: saldoSesudah },
    { userId: auth.sub, role: auth.role, resourceType: "reward", resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    message: `Berhasil redeem '${namaReward}'. Poin berkurang ${biaya}.`,
    reward: serializeReward(fresh),
    penukaran: serializePenukaran(px)
  };
});

// src/server/routes/reward/[id]/restore.ts
import { eq as eq21 } from "drizzle-orm";
var restore_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  if (!isSuperAdmin(auth.role)) {
    throw new HttpError(422, "Hanya Super Admin yang bisa restore reward.", { field: "auth" });
  }
  const id = String(ctx.req.query.id ?? "").trim();
  if (!id) throw new HttpError(422, "id_reward wajib diisi.", { field: "id_reward" });
  const db = getDb();
  const rows = await db.select().from(schema_exports.reward).where(eq21(schema_exports.reward.idReward, id)).limit(1);
  const reward2 = rows[0];
  if (!reward2) throw new HttpError(404, "Reward tidak ditemukan.", { field: "id_reward" });
  if (reward2.archivedAt === null) {
    return { reward: serializeReward(reward2), message: "Reward tidak di-archive." };
  }
  const [updated] = await db.update(schema_exports.reward).set({ archivedAt: null, archivedBy: null, statusAktif: true, updatedBy: auth.sub, updatedAt: /* @__PURE__ */ new Date() }).where(eq21(schema_exports.reward.idReward, id)).returning();
  await recordAudit(
    "reward.restore",
    { reward_id: id, nama_reward: reward2.namaReward },
    { userId: auth.sub, role: auth.role, resourceType: "reward", resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    reward: serializeReward(updated),
    message: `Reward '${reward2.namaReward}' telah dipulihkan.`
  };
});

// src/server/routes/reward/[id]/toggle-active.ts
import { eq as eq22 } from "drizzle-orm";
var toggle_active_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);
  const id = String(ctx.req.query.id ?? "").trim();
  if (!id) throw new HttpError(422, "id_reward wajib diisi.", { field: "id_reward" });
  const db = getDb();
  const rows = await db.select().from(schema_exports.reward).where(eq22(schema_exports.reward.idReward, id)).limit(1);
  const reward2 = rows[0];
  if (!reward2) throw new HttpError(404, "Reward tidak ditemukan.", { field: "id_reward" });
  if (reward2.archivedAt !== null) {
    throw new HttpError(422, "Reward archived.", { field: "reward" });
  }
  const next = !reward2.statusAktif;
  const [updated] = await db.update(schema_exports.reward).set({ statusAktif: next, updatedBy: auth.sub, updatedAt: /* @__PURE__ */ new Date() }).where(eq22(schema_exports.reward.idReward, id)).returning();
  await recordAudit(
    "reward.toggle_active",
    { reward_id: id, status_aktif: next },
    { userId: auth.sub, role: auth.role, resourceType: "reward", resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return { reward: serializeReward(updated) };
});

// src/server/routes/reward/admin.ts
import { and as and7, asc as asc3, eq as eq23, ilike as ilike2, isNull as isNull4, isNotNull as isNotNull2, count as count3 } from "drizzle-orm";
var admin_default = handler(async (ctx) => {
  if (ctx.req.method !== "GET") {
    return { message: "Gunakan GET.", error: "method_not_allowed" };
  }
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);
  const db = getDb();
  const conds = [];
  const status = String(ctx.req.query.status ?? "all");
  if (status === "active") {
    conds.push(eq23(schema_exports.reward.statusAktif, true), isNull4(schema_exports.reward.archivedAt));
  } else if (status === "archived") {
    conds.push(isNotNull2(schema_exports.reward.archivedAt));
  } else if (status === "inactive") {
    conds.push(eq23(schema_exports.reward.statusAktif, false), isNull4(schema_exports.reward.archivedAt));
  }
  const q = String(ctx.req.query.q ?? "").trim();
  if (q) conds.push(ilike2(schema_exports.reward.namaReward, `%${q}%`));
  const where = conds.length ? and7(...conds) : void 0;
  const rows = await db.select().from(schema_exports.reward).where(where).orderBy(asc3(schema_exports.reward.biayaPoin));
  const stats = await db.select({
    idReward: schema_exports.penukaranReward.idReward,
    n: count3()
  }).from(schema_exports.penukaranReward).groupBy(schema_exports.penukaranReward.idReward);
  const byId = new Map(stats.map((s) => [s.idReward, Number(s.n)]));
  const data = rows.map(
    (r) => serializeReward(r, {
      redeemed_count: byId.get(r.idReward) ?? 0,
      is_archived: r.archivedAt !== null
    })
  );
  return { data };
});

// src/server/routes/reward/index.ts
import { eq as eq24, and as and8, asc as asc4, isNull as isNull5, sql as sql4 } from "drizzle-orm";
var reward_default = handler(async (ctx) => {
  const auth = await requireAuth(ctx);
  const db = getDb();
  if (ctx.req.method === "GET") {
    const rows = await db.select().from(schema_exports.reward).where(and8(eq24(schema_exports.reward.statusAktif, true), isNull5(schema_exports.reward.archivedAt))).orderBy(asc4(schema_exports.reward.biayaPoin));
    return { data: rows.map((r) => serializeReward(r)) };
  }
  if (ctx.req.method === "POST") {
    requireAdminOrSuper(auth.role);
    const body = readBody(ctx);
    const nama = requireString(body, "nama_reward", { max: 100 });
    const biaya = Number(body.biaya_poin);
    const stok = Number(body.stok);
    if (!Number.isInteger(biaya) || biaya < 1 || biaya > 1e6) {
      throw new HttpError(422, "biaya_poin harus integer 1..1000000.", { field: "biaya_poin" });
    }
    if (!Number.isInteger(stok) || stok < 0) {
      throw new HttpError(422, "stok harus integer >= 0.", { field: "stok" });
    }
    const dup = await db.select().from(schema_exports.reward).where(sql4`lower(${schema_exports.reward.namaReward}) = ${nama.toLowerCase()}`).limit(1);
    if (dup.length) {
      throw new HttpError(422, `Reward dengan nama '${nama}' sudah ada.`, {
        field: "nama_reward"
      });
    }
    const now = /* @__PURE__ */ new Date();
    const [reward2] = await db.insert(schema_exports.reward).values({
      idReward: crypto.randomUUID(),
      namaReward: nama,
      biayaPoin: biaya,
      stok,
      statusAktif: true,
      createdBy: auth.sub,
      updatedBy: auth.sub,
      createdAt: now,
      updatedAt: now
    }).returning();
    await recordAudit(
      "reward.create",
      { reward_id: reward2.idReward, payload: { nama_reward: nama, biaya_poin: biaya, stok } },
      { userId: auth.sub, role: auth.role, resourceType: "reward", resourceId: null, ip: ctx.ip, userAgent: ctx.userAgent }
    );
    return Created({ reward: serializeReward(reward2) });
  }
  throw new HttpError(405, "Method not allowed.");
});

// src/server/routes/setup/bootstrap-admin.ts
import { eq as eq25, inArray as inArray3 } from "drizzle-orm";
init_password();
var SUPER_ADMIN_ROLES = ["super_admin", "super_admin_tier3"];
var PUBLIC_PASSWORD_STEMS = [
  "super12345",
  "admin12345",
  "staff12345",
  "petugas12345",
  "demo12345",
  "amanah1234",
  "admin1234",
  "password"
];
function containsPublicPasswordStem(pw) {
  const lower = pw.toLowerCase();
  for (const stem of PUBLIC_PASSWORD_STEMS) {
    if (lower.includes(stem)) return stem;
  }
  return null;
}
async function handler2(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const rawPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  const name = (process.env.BOOTSTRAP_ADMIN_NAME ?? "Super Admin Sekolah").trim();
  const missing = [];
  if (!email) missing.push("BOOTSTRAP_ADMIN_EMAIL");
  if (!rawPassword) missing.push("BOOTSTRAP_ADMIN_PASSWORD");
  if (missing.length > 0) {
    return res.status(503).json({
      status: "not_configured",
      message: "Env var belum lengkap. Isi di Vercel \u2192 Settings \u2192 Environment Variables.",
      missing
    });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      status: "invalid_email",
      message: "BOOTSTRAP_ADMIN_EMAIL bukan format email yang valid."
    });
  }
  const publicStem = containsPublicPasswordStem(rawPassword);
  if (publicStem) {
    return res.status(400).json({
      status: "public_password_rejected",
      message: "Password ini mengandung pola yang ada di DatabaseSeeder.php dan publik di repo GitHub. Pilih yang lain.",
      matched: publicStem
    });
  }
  const policy = checkPasswordPolicy(rawPassword);
  if (!policy.ok) {
    return res.status(400).json({
      status: "weak_password",
      message: `Password tidak memenuhi syarat: ${describeProblems(policy.problems)}.`,
      problems: policy.problems
    });
  }
  const db = getDb();
  try {
    const existingAdmins = await db.select({ id: schema_exports.users.id, email: schema_exports.users.email }).from(schema_exports.users).where(inArray3(schema_exports.users.role, [...SUPER_ADMIN_ROLES])).limit(1);
    if (existingAdmins.length > 0) {
      return res.status(409).json({
        status: "already_bootstrapped",
        message: "Super admin sudah ada. Endpoint ini dinonaktifkan selamanya. Hapus BOOTSTRAP_ADMIN_* dari Vercel.",
        existing: { email: existingAdmins[0].email }
      });
    }
    const emailTaken = await db.select({ id: schema_exports.users.id, role: schema_exports.users.role }).from(schema_exports.users).where(eq25(schema_exports.users.email, email)).limit(1);
    if (emailTaken.length > 0) {
      return res.status(409).json({
        status: "email_taken",
        message: "Email itu sudah dipakai user lain dengan role berbeda.",
        existingRole: emailTaken[0].role
      });
    }
    const passwordHash = await hashPassword(rawPassword);
    const now = /* @__PURE__ */ new Date();
    const inserted = await db.insert(schema_exports.users).values({
      email,
      name,
      role: "super_admin",
      password: passwordHash,
      mustChangePassword: true,
      // wajib ganti password di login pertama
      suspendedAt: null,
      createdAt: now,
      updatedAt: now
    }).returning({ id: schema_exports.users.id, email: schema_exports.users.email, role: schema_exports.users.role });
    const created = inserted[0];
    if (!created) {
      return res.status(500).json({ status: "insert_failed" });
    }
    await db.insert(schema_exports.auditLogs).values({
      userId: created.id,
      role: "super_admin",
      action: "super_admin.bootstrap",
      resourceType: "user",
      resourceId: created.id,
      payload: { via: "env", email },
      ipAddress: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers["user-agent"] ?? null,
      waktu: now
    });
    return res.status(201).json({
      status: "created",
      message: "Super admin dibuat. Login lalu GANTI PASSWORD, lalu HAPUS BOOTSTRAP_ADMIN_* dari Vercel.",
      user: { id: created.id, email: created.email, role: created.role },
      nextSteps: [
        "1. Buka /login dan masuk dengan email + password di atas",
        "2. Ganti password dari menu profil",
        "3. Di Vercel hapus BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_NAME",
        "4. Menjalankan ulang endpoint ini akan selalu membalas 409"
      ]
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return res.status(500).json({ status: "error", message });
  }
}

// src/server/routes/siswa/[nis]/index.ts
import { and as and9, eq as eq26, count as count4, desc as desc2, inArray as inArray4, sum } from "drizzle-orm";
var nis_default = handler(async (ctx) => {
  if (ctx.req.method !== "GET") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  const nis = String(ctx.req.query.nis ?? "").trim();
  if (!nis) throw new HttpError(422, "NIS wajib diisi.", { field: "nis" });
  const db = getDb();
  if (isSiswa(auth.role)) {
    const own = await db.select().from(schema_exports.siswa).where(eq26(schema_exports.siswa.userId, auth.sub)).limit(1);
    if (!own[0] || own[0].nis !== nis) {
      throw new HttpError(422, "Siswa hanya boleh akses data sendiri.", { field: "auth" });
    }
  }
  const rows = await db.select().from(schema_exports.siswa).where(eq26(schema_exports.siswa.nis, nis)).limit(1);
  const row = rows[0];
  if (!row) throw new HttpError(404, "Siswa tidak ditemukan.");
  const [u] = await db.select().from(schema_exports.users).where(eq26(schema_exports.users.id, row.userId)).limit(1);
  const [open] = await db.select({ n: count4() }).from(schema_exports.transaksiPembelian).where(and9(eq26(schema_exports.transaksiPembelian.nis, nis), eq26(schema_exports.transaksiPembelian.status, "open")));
  const openDebts2 = await debtsOf(db, nis);
  const ledger = await db.select().from(schema_exports.poinLedger).where(eq26(schema_exports.poinLedger.nis, nis)).orderBy(desc2(schema_exports.poinLedger.waktu)).limit(20);
  return {
    siswa: serializeSiswa({ ...row, userName: u?.name }),
    open_debts: openDebts2,
    recent_ledger: ledger.map(serializeLedger),
    prior_open_count: Number(open?.n ?? 0),
    current_penalty_tier: -1,
    // Staff & petugas perlu tahu ini SEBELUM scan, biar gagal cepat dan jelas
    // (asli: Siswa::isAccountSuspended())
    is_suspended: !!u?.suspendedAt
  };
});
async function debtsOf(db, nis) {
  const rows = await db.select({
    barcode: schema_exports.transaksiPembelian.barcode,
    qty: sum(schema_exports.transaksiPembelian.qty)
  }).from(schema_exports.transaksiPembelian).where(and9(eq26(schema_exports.transaksiPembelian.nis, nis), eq26(schema_exports.transaksiPembelian.status, "open"))).groupBy(schema_exports.transaksiPembelian.barcode);
  if (rows.length === 0) return [];
  const prods = await db.select().from(schema_exports.produk).where(inArray4(schema_exports.produk.barcode, rows.map((r) => r.barcode)));
  const byBc = new Map(prods.map((p) => [p.barcode, p.namaProduk]));
  return rows.map((r) => ({
    barcode: r.barcode,
    nama_produk: byBc.get(r.barcode) ?? r.barcode,
    qty: Number(r.qty)
  }));
}

// src/server/routes/siswa/[nis]/pembelian.ts
import { eq as eq27, desc as desc3, inArray as inArray5 } from "drizzle-orm";
var pembelian_default2 = handler(async (ctx) => {
  if (ctx.req.method !== "GET") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  const nis = String(ctx.req.query.nis ?? "").trim();
  if (!nis) throw new HttpError(422, "NIS wajib diisi.", { field: "nis" });
  const db = getDb();
  if (isSiswa(auth.role)) {
    const own = await db.select().from(schema_exports.siswa).where(eq27(schema_exports.siswa.userId, auth.sub)).limit(1);
    if (!own[0] || own[0].nis !== nis) {
      throw new HttpError(422, "Siswa hanya boleh akses data sendiri.", { field: "auth" });
    }
  }
  const rows = await db.select().from(schema_exports.transaksiPembelian).where(eq27(schema_exports.transaksiPembelian.nis, nis)).orderBy(desc3(schema_exports.transaksiPembelian.waktu)).limit(50);
  const out = rows.map((t) => ({ ...serializeTransaksi(t) }));
  if (rows.length > 0) {
    const barcodes = [...new Set(rows.map((t) => t.barcode))];
    const prods = await db.select().from(schema_exports.produk).where(inArray5(schema_exports.produk.barcode, barcodes));
    const byBc = new Map(prods.map((p) => [p.barcode, p]));
    for (const item of out) {
      const p = byBc.get(item.barcode);
      item.produk = p ? serializeProduk(p) : null;
    }
  }
  return { data: out };
});

// src/server/routes/siswa/index.ts
import { and as and10, or, eq as eq28, ilike as ilike3, isNull as isNull6, count as count5, asc as asc5, inArray as inArray6 } from "drizzle-orm";
init_password();
var siswa_default = handler(async (ctx) => {
  const auth = await requireAuth(ctx);
  const db = getDb();
  if (ctx.req.method === "GET") return list2(ctx, db);
  if (ctx.req.method === "POST") return create2(ctx, db, auth.sub, auth.role);
  throw new HttpError(405, "Method not allowed.");
});
async function list2(ctx, db) {
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);
  const q = typeof ctx.req.query.q === "string" ? ctx.req.query.q : "";
  const blocked = ctx.req.query.blocked === "1" || ctx.req.query.blocked === "true";
  const active = ctx.req.query.active === "1" || ctx.req.query.active === "true";
  const page = Math.max(1, Number(ctx.req.query.page ?? 1) || 1);
  const perPage = 50;
  const conds = [];
  if (q) {
    const pat = `%${q}%`;
    conds.push(
      or(
        ilike3(schema_exports.siswa.nis, pat),
        ilike3(schema_exports.siswa.nama, pat),
        ilike3(schema_exports.siswa.kelas, pat)
      )
    );
  }
  if (blocked) conds.push(eq28(schema_exports.siswa.isBlocked, true));
  if (active) conds.push(isNull6(schema_exports.siswa.archivedAt));
  const where = conds.length ? and10(...conds) : void 0;
  const [{ n: total }] = await db.select({ n: count5() }).from(schema_exports.siswa).where(where);
  const rows = await db.select().from(schema_exports.siswa).where(where).orderBy(asc5(schema_exports.siswa.nama)).limit(perPage).offset((page - 1) * perPage);
  const ids = rows.map((r) => r.userId);
  const users2 = ids.length ? await db.select().from(schema_exports.users).where(inArray6(schema_exports.users.id, ids)) : [];
  const nameById = new Map(users2.map((u) => [u.id, u.name]));
  const data = rows.map((r) => serializeSiswa({ ...r, userName: nameById.get(r.userId) }));
  const from = rows.length ? (page - 1) * perPage + 1 : 0;
  const to = from + rows.length - 1;
  return {
    data,
    current_page: page,
    last_page: Math.max(1, Math.ceil(Number(total) / perPage)),
    per_page: perPage,
    total: Number(total),
    from: from || null,
    to: to > 0 ? to : null
  };
}
async function create2(ctx, db, userId2, role) {
  requireAdminOrSuper(role);
  const body = readBody(ctx);
  const nis = requireString(body, "nis", { max: 20 });
  const nama = requireString(body, "nama", { max: 100 });
  const kelas = requireString(body, "kelas", { max: 30 });
  const asrama = optionalString(body, "asrama") ?? null;
  const email = optionalString(body, "email") ?? null;
  const givenPw = optionalString(body, "default_password") ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(422, "Format email tidak valid.", { field: "email" });
  }
  if (givenPw !== null && givenPw.length < 8) {
    throw new HttpError(422, "default_password minimal 8 karakter.", {
      field: "default_password"
    });
  }
  const nisTaken = await db.select().from(schema_exports.siswa).where(eq28(schema_exports.siswa.nis, nis)).limit(1);
  if (nisTaken.length) {
    throw new HttpError(422, "NIS sudah terdaftar.", { field: "nis" });
  }
  if (email) {
    const mailTaken = await db.select().from(schema_exports.users).where(eq28(schema_exports.users.email, email)).limit(1);
    if (mailTaken.length) {
      throw new HttpError(422, "Email sudah terdaftar.", { field: "email" });
    }
  }
  const defaultPassword = givenPw ?? `SISWA${nis.slice(-4)}`;
  const now = /* @__PURE__ */ new Date();
  const [newUser] = await db.insert(schema_exports.users).values({
    email,
    name: nama,
    role: "santri",
    password: await hashPassword(defaultPassword),
    // [v1.1] paksa ganti password di login pertama
    mustChangePassword: true,
    createdAt: now,
    updatedAt: now
  }).returning({ id: schema_exports.users.id });
  const [siswa2] = await db.insert(schema_exports.siswa).values({
    nis,
    userId: newUser.id,
    nama,
    kelas,
    asrama,
    currentPoin: 0,
    // [v2] mulai dari 0
    isBlocked: false,
    createdAt: now,
    updatedAt: now
  }).returning();
  await db.insert(schema_exports.poinLedger).values({
    nis: siswa2.nis,
    sourceType: "initial",
    sourceId: null,
    poinDelta: 0,
    saldoSebelum: 0,
    saldoSesudah: 0,
    waktu: now,
    createdAt: now,
    updatedAt: now
  });
  await recordAudit("santri.create", { nis }, {
    userId: userId2,
    role,
    resourceType: "santri",
    resourceId: null,
    ip: ctx.ip,
    userAgent: ctx.userAgent
  });
  return Created({
    siswa: serializeSiswa({ ...siswa2, userName: nama }),
    // Ditampilkan SEKALI saja di response — frontend wajib menyimpannya
    // (frontend menyimpannya lalu menampilkannya ke siswa).
    default_password: defaultPassword,
    message: "Siswa baru dibuat. Default password ditampilkan sekali \u2014 sampaikan ke siswa untuk force change at first login."
  });
}

// src/server/routes/siswa/me.ts
import { and as and11, eq as eq29, count as count6, desc as desc4, inArray as inArray7, sum as sum2 } from "drizzle-orm";
var me_default2 = handler(async (ctx) => {
  if (ctx.req.method !== "GET") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  if (!isSiswa(auth.role)) {
    throw new HttpError(422, "Hanya Siswa.", { field: "auth" });
  }
  const db = getDb();
  const rows = await db.select().from(schema_exports.siswa).where(eq29(schema_exports.siswa.userId, auth.sub)).limit(1);
  const row = rows[0];
  if (!row) throw new HttpError(404, "Data siswa tidak ditemukan.");
  const [open] = await db.select({ n: count6() }).from(schema_exports.transaksiPembelian).where(and11(eq29(schema_exports.transaksiPembelian.nis, row.nis), eq29(schema_exports.transaksiPembelian.status, "open")));
  const [u] = await db.select().from(schema_exports.users).where(eq29(schema_exports.users.id, auth.sub)).limit(1);
  const ledger = await db.select().from(schema_exports.poinLedger).where(eq29(schema_exports.poinLedger.nis, row.nis)).orderBy(desc4(schema_exports.poinLedger.waktu)).limit(20);
  return {
    siswa: { ...serializeSiswa({ ...row, userName: u?.name }), is_suspended: !!u?.suspendedAt },
    open_debts: await openDebts(db, row.nis),
    recent_ledger: ledger.map(serializeLedger),
    prior_open_count: Number(open?.n ?? 0),
    current_penalty_tier: -1
  };
});
async function openDebts(db, nis) {
  const rows = await db.select({
    barcode: schema_exports.transaksiPembelian.barcode,
    qty: sum2(schema_exports.transaksiPembelian.qty)
  }).from(schema_exports.transaksiPembelian).where(and11(eq29(schema_exports.transaksiPembelian.nis, nis), eq29(schema_exports.transaksiPembelian.status, "open"))).groupBy(schema_exports.transaksiPembelian.barcode);
  if (rows.length === 0) return [];
  const barcodes = rows.map((r) => r.barcode);
  const prods = await db.select().from(schema_exports.produk).where(inArray7(schema_exports.produk.barcode, barcodes));
  const nameByBc = new Map(prods.map((p) => [p.barcode, p.namaProduk]));
  return rows.map((r) => ({
    barcode: r.barcode,
    // fallback ke barcode kalau produknya di-archive / hilang
    nama_produk: nameByBc.get(r.barcode) ?? r.barcode,
    qty: Number(r.qty)
  }));
}

// src/server/routes/status.ts
import { eq as eq30 } from "drizzle-orm";
var VERSION = "1.0.0-phase1";
async function handler3(_req, res) {
  const started = Date.now();
  const db = await pingDatabase();
  const storage = checkStorageEnv();
  const auth = checkAuthEnv();
  const maintenance = await checkMaintenanceMode();
  const healthy = db.ok && !maintenance.isMaintenance;
  const body = {
    status: maintenance.isMaintenance ? "maintenance" : healthy ? "running" : "degraded",
    version: VERSION,
    time: (/* @__PURE__ */ new Date()).toISOString(),
    region: process.env.VERCEL_REGION ?? "unknown",
    // 'sin1' = Singapore. Kalau nilainya iad1 (US), Neon jadi sangat lambat.
    regionOk: (process.env.VERCEL_REGION ?? "").startsWith("sin"),
    maintenance: maintenance.isMaintenance,
    database: db,
    storage: storage.configured,
    auth: auth.configured,
    elapsedMs: Date.now() - started
  };
  const code = maintenance.isMaintenance ? 503 : healthy ? 200 : 503;
  return res.status(code).json(body);
}
function checkStorageEnv() {
  const keys = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_ENDPOINT",
    "AWS_BUCKET",
    "AWS_URL",
    "AWS_DEFAULT_REGION"
  ];
  const missing = keys.filter((k) => !process.env[k]);
  return { configured: missing.length === 0, missing };
}
function checkAuthEnv() {
  const missing = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.JWT_SECRET) missing.push("JWT_SECRET");
  return { configured: missing.length === 0, missing };
}
async function checkMaintenanceMode() {
  try {
    const db = getDb();
    const rows = await db.select({ value: schema_exports.configSettings.value }).from(schema_exports.configSettings).where(eq30(schema_exports.configSettings.key, "is_maintenance")).limit(1);
    return { isMaintenance: rows[0]?.value === "true" || rows[0]?.value === "1" };
  } catch {
    return { isMaintenance: false };
  }
}

// src/server/routes/super-admin/audit/search.ts
import { and as and12, or as or2, eq as eq31, gte, lte, like, desc as desc5, sql as sql5, inArray as inArray8, count as count7 } from "drizzle-orm";
var PER_PAGE = 50;
var search_default = handler(async (ctx) => {
  if (ctx.req.method !== "GET") {
    return { message: "Gunakan GET.", error: "method_not_allowed" };
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const db = getDb();
  const q = ctx.req.query;
  const conds = [];
  const nis = typeof q.nis === "string" ? q.nis.trim() : "";
  if (nis) {
    conds.push(
      or2(
        sql5`${schema_exports.auditLogs.payload}->>'nis' = ${nis}`,
        sql5`${schema_exports.auditLogs.payload}->>'target_nis' = ${nis}`
      )
    );
  }
  const action = typeof q.action === "string" ? q.action.trim() : "";
  if (action) conds.push(like(schema_exports.auditLogs.action, `%${action}%`));
  const role = typeof q.role === "string" ? q.role.trim() : "";
  if (role) conds.push(eq31(schema_exports.auditLogs.role, role));
  if (typeof q.from === "string" && q.from !== "") {
    const d = new Date(q.from);
    if (!Number.isNaN(d.getTime())) conds.push(gte(schema_exports.auditLogs.waktu, d));
  }
  if (typeof q.to === "string" && q.to !== "") {
    const d = new Date(q.to);
    if (!Number.isNaN(d.getTime())) conds.push(lte(schema_exports.auditLogs.waktu, d));
  }
  const userId2 = Number(q.user_id);
  if (Number.isInteger(userId2) && userId2 > 0) conds.push(eq31(schema_exports.auditLogs.userId, userId2));
  const where = conds.length ? and12(...conds) : void 0;
  const page = Math.max(1, Number(q.page ?? 1) || 1);
  const [totalRow] = await db.select({ n: count7() }).from(schema_exports.auditLogs).where(where);
  const total = Number(totalRow?.n ?? 0);
  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE));
  const rows = await db.select().from(schema_exports.auditLogs).where(where).orderBy(desc5(schema_exports.auditLogs.waktu)).limit(PER_PAGE).offset((page - 1) * PER_PAGE);
  const ids = [...new Set(rows.map((r) => r.userId).filter((v) => v !== null))];
  const users2 = ids.length ? await db.select({ id: schema_exports.users.id, name: schema_exports.users.name, email: schema_exports.users.email }).from(schema_exports.users).where(inArray8(schema_exports.users.id, ids)) : [];
  const byId = new Map(users2.map((u) => [u.id, u]));
  const data = rows.map((r) => ({
    id: r.id,
    user_id: r.userId,
    user: r.userId ? byId.get(r.userId) ?? null : null,
    role: r.role,
    action: r.action,
    resource_type: r.resourceType,
    resource_id: r.resourceId,
    payload: r.payload,
    admin_alasan: r.adminAlasan,
    ip_address: r.ipAddress,
    user_agent: r.userAgent,
    waktu: r.waktu,
    archive_at: r.archiveAt,
    purged_at: r.purgedAt
  }));
  const from = rows.length ? (page - 1) * PER_PAGE + 1 : null;
  const to = from !== null ? from + rows.length - 1 : null;
  return {
    data,
    current_page: page,
    last_page: lastPage,
    per_page: PER_PAGE,
    total,
    from,
    to,
    links: "",
    path: "/api/super-admin/audit/search"
  };
});

// src/server/routes/super-admin/config.ts
import { asc as asc6, eq as eq32 } from "drizzle-orm";
var NUMERIC_KEYS = [
  "default_negative_limit",
  // batas minimum poin (mis. -50)
  "reset_target_poin"
  // target poin saat reset (biasanya 0)
];
var present = (c) => ({
  key: c.key,
  value: c.value,
  description: c.description ?? null,
  updated_by: c.updatedBy ?? null,
  updated_at: iso(c.updatedAt)
});
var config_default = handler(async (ctx) => {
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const db = getDb();
  if (ctx.req.method === "GET") {
    const rows = await db.select().from(schema_exports.configSettings).orderBy(asc6(schema_exports.configSettings.key));
    return { data: rows.map(present) };
  }
  if (ctx.req.method === "POST" || ctx.req.method === "PATCH") {
    const body = readBody(ctx);
    const key = requireString(body, "key", { max: 50 });
    if (body.value === void 0 || body.value === null) {
      throw new HttpError(422, "Kolom value wajib diisi.", { field: "value" });
    }
    const [existing] = await db.select().from(schema_exports.configSettings).where(eq32(schema_exports.configSettings.key, key)).limit(1);
    if (!existing) {
      throw new HttpError(422, `Config '${key}' tidak ada.`, { field: "key" });
    }
    let value;
    if (NUMERIC_KEYS.includes(key)) {
      const raw = String(body.value);
      if (!/^-?\d+$/.test(raw.trim())) {
        throw new HttpError(422, `Config '${key}' harus berupa angka.`, { field: "value" });
      }
      const n = Number(raw.trim());
      if (key === "default_negative_limit" && n > 0) {
        throw new HttpError(422, "Batas minimum poin harus <= 0 (negatif atau nol).", {
          field: "value"
        });
      }
      value = String(n);
    } else {
      value = String(body.value);
    }
    const [updated] = await db.update(schema_exports.configSettings).set({ value, updatedBy: auth.sub, updatedAt: /* @__PURE__ */ new Date() }).where(eq32(schema_exports.configSettings.key, key)).returning();
    await recordAudit(
      "superadmin.config_update",
      {
        key,
        new_value: value,
        admin_alasan: typeof body.alasan === "string" && body.alasan ? body.alasan : "config tweak"
      },
      { userId: auth.sub, role: auth.role, ip: ctx.ip, userAgent: ctx.userAgent }
    );
    return { config: present(updated) };
  }
  throw new HttpError(405, "Method not allowed.");
});

// src/server/routes/super-admin/coverage.ts
import { sql as sql6, asc as asc7, and as and13, eq as eq33 } from "drizzle-orm";
var coverage_default = handler(async (ctx) => {
  if (ctx.req.method !== "GET") {
    return { message: "Gunakan GET.", error: "method_not_allowed" };
  }
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);
  const db = getDb();
  const rows = await getSql()`
    select
      s.nis,
      s.nama,
      s.current_poin,
      s.is_blocked,
      coalesce(sum(case when t.status = 'settled' then t.qty else 0 end), 0) as qty_settled,
      coalesce(sum(case when t.status = 'open' then t.qty else 0 end), 0) as qty_open,
      count(t.id) as total_tx
    from siswa s
    left join transaksi_pembelian t on t.nis = s.nis
    where s.archived_at is null
    group by s.nis, s.nama, s.current_poin, s.is_blocked
    order by s.nama
  `;
  const data = rows.map((r) => {
    const qtySettled = Number(r.qty_settled ?? 0);
    const qtyOpen = Number(r.qty_open ?? 0);
    const total = qtySettled + qtyOpen;
    return {
      nis: r.nis,
      // Nama dari kolom DB di sini disengaja: ini laporan agregat, bukan
      // tampilan profil, jadi tidak perlu accessor users.name.
      nama: r.nama,
      current_poin: Number(r.current_poin ?? 0),
      is_blocked: r.is_blocked,
      qty_settled: qtySettled,
      qty_open: qtyOpen,
      total_tx: Number(r.total_tx ?? 0),
      // Pembulatan 1 desimal; null kalau belum ada transaksi sama sekali
      coverage_pct: total > 0 ? Math.round(qtySettled / total * 1e3) / 10 : null
    };
  });
  return { data };
});

// src/server/routes/super-admin/cron.ts
import { count as count8, isNotNull as isNotNull3, lt } from "drizzle-orm";
var cron_default = handler(async (ctx) => {
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const q = getSql();
  const db = getDb();
  let functionsReady = false;
  let missingDetail = "";
  try {
    const fn = await q`
      select proname from pg_proc
      where proname in ('amanah_purge_expired_tokens', 'amanah_archive_audit')
    `;
    functionsReady = fn.length === 2;
  } catch (e) {
    missingDetail = e instanceof Error ? e.message : String(e);
  }
  const auditRows = await db.select({ n: count8() }).from(schema_exports.auditLogs);
  const archiveRows = await db.select({ n: count8() }).from(schema_exports.auditLogsArchive);
  const tokenRows = await db.select({ n: count8() }).from(schema_exports.personalAccessTokens).where(isNotNull3(schema_exports.personalAccessTokens.expiresAt));
  const expiredRows = await db.select({ n: count8() }).from(schema_exports.personalAccessTokens).where(lt(schema_exports.personalAccessTokens.expiresAt, /* @__PURE__ */ new Date()));
  const tables = {
    audit_logs: Number(auditRows[0]?.n ?? 0),
    audit_logs_archive: Number(archiveRows[0]?.n ?? 0),
    tokens_total: Number(tokenRows[0]?.n ?? 0),
    tokens_expired: Number(expiredRows[0]?.n ?? 0)
  };
  const schedule = {
    mechanism: "Vercel Cron (didefinisikan di vercel.json -> crons)",
    jobs: [
      { path: "/api/cron/purge-tokens", schedule: "17 3 * * *", note: "harian 03:17 UTC" },
      { path: "/api/cron/archive-audit", schedule: "43 4 * * *", note: "harian 04:43 UTC" }
    ],
    note: "Jadwal di atas dibaca dari vercel.json. Status eksekusi aktual ada di Vercel Dashboard \u2192 project \u2192 Cron Jobs.",
    cron_secret_set: !!process.env.CRON_SECRET
  };
  const health = {
    functions_ready: functionsReady,
    detail: functionsReady ? "Fungsi SQL tersedia." : "Fungsi SQL belum ada. Jalankan drizzle/0001_cron.sql di Neon SQL Editor, lalu panggil endpoint ini lagi.",
    ...missingDetail ? { error: missingDetail } : {}
  };
  if (ctx.req.method === "GET") {
    return { installed: functionsReady, health, schedule, tables };
  }
  if (ctx.req.method === "POST") {
    const body = ctx.req.body ?? {};
    const job = typeof body.job === "string" ? body.job : "all";
    const results = {};
    if (job === "purge-tokens" || job === "all") {
      try {
        const rows = await q`select amanah_purge_expired_tokens(30) as purged`;
        results.purge_tokens = { ok: true, purged: Number(rows[0]?.purged ?? 0) };
      } catch (e) {
        results.purge_tokens = {
          ok: false,
          error: "Jalankan drizzle/0001_cron.sql di Neon SQL Editor dulu.",
          detail: e instanceof Error ? e.message : String(e)
        };
      }
    }
    if (job === "archive-audit" || job === "all") {
      try {
        const rows = await q`select * from amanah_archive_audit()`;
        const r = rows[0] ?? {};
        results.archive_audit = {
          ok: true,
          marked: Number(r.marked ?? 0),
          copied: Number(r.copied ?? 0),
          purged: Number(r.purged ?? 0),
          deleted: Number(r.deleted ?? 0),
          cleaned: Number(r.cleaned ?? 0)
        };
      } catch (e) {
        results.archive_audit = {
          ok: false,
          error: "Jalankan drizzle/0001_cron.sql di Neon SQL Editor dulu.",
          detail: e instanceof Error ? e.message : String(e)
        };
      }
    }
    return { ran: job, at: (/* @__PURE__ */ new Date()).toISOString(), results, tables };
  }
  throw new HttpError(405, "Method not allowed.");
});

// src/server/routes/super-admin/mode.ts
import { eq as eq34 } from "drizzle-orm";
var ALLOWED_KEYS = ["is_maintenance", "is_readonly"];
var mode_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST" && ctx.req.method !== "PATCH") {
    throw new HttpError(405, "Method not allowed.");
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const body = readBody(ctx);
  const key = requireString(body, "key", { max: 50 });
  if (!ALLOWED_KEYS.includes(key)) {
    throw new HttpError(422, `Key '${key}' bukan mode toggle. Pilih: ${ALLOWED_KEYS.join(" atau ")}.`, {
      field: "key"
    });
  }
  if (typeof body.value !== "boolean") {
    throw new HttpError(422, "value harus boolean (true/false).", { field: "value" });
  }
  const value = body.value;
  const db = getDb();
  const [existing] = await db.select().from(schema_exports.configSettings).where(eq34(schema_exports.configSettings.key, key)).limit(1);
  if (!existing) {
    throw new HttpError(422, `Config '${key}' belum ada di database.`, { field: "key" });
  }
  const [updated] = await db.update(schema_exports.configSettings).set({ value: value ? "true" : "false", updatedBy: auth.sub, updatedAt: /* @__PURE__ */ new Date() }).where(eq34(schema_exports.configSettings.key, key)).returning();
  await recordAudit(
    "superadmin.mode_toggle",
    { key, value },
    { userId: auth.sub, role: auth.role, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    config: {
      key: updated.key,
      value: updated.value,
      description: updated.description ?? null,
      updated_by: updated.updatedBy,
      updated_at: iso(updated.updatedAt)
    },
    message: key === "is_maintenance" ? value ? "Mode maintenance AKTIF. Aplikasi hanya bisa diakses untuk login." : "Mode maintenance nonaktif. Aplikasi kembali normal." : value ? "Mode read-only AKTIF. Tidak ada perubahan data yang bisa dilakukan." : "Mode read-only nonaktif."
  };
});

// src/server/routes/super-admin/recompute-saldo.ts
import { eq as eq36, sum as sum3, inArray as inArray9 } from "drizzle-orm";

// src/server/config.ts
import { eq as eq35 } from "drizzle-orm";
async function getConfig(key) {
  const db = getDb();
  const [row] = await db.select({ value: schema_exports.configSettings.value }).from(schema_exports.configSettings).where(eq35(schema_exports.configSettings.key, key)).limit(1);
  return row?.value ?? null;
}
function truthy(v) {
  return v === "true" || v === "1";
}
async function isReadOnly() {
  return truthy(await getConfig("is_readonly"));
}
async function isMaintenance() {
  return truthy(await getConfig("is_maintenance"));
}
async function getNegativeLimit() {
  const n = Number(await getConfig("default_negative_limit") ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// src/server/routes/super-admin/recompute-saldo.ts
var recompute_saldo_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST" && ctx.req.method !== "PATCH") {
    throw new HttpError(405, "Method not allowed.");
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const body = readBody(ctx);
  const alasan = requireString(body, "alasan", { min: 30, max: 500 });
  const nisBody = typeof body.nis === "string" ? body.nis.trim() : "";
  const nisQuery = typeof ctx.req.query.nis === "string" ? ctx.req.query.nis.trim() : "";
  const nisFilter = nisBody !== "" ? nisBody : nisQuery !== "" ? nisQuery : null;
  const db = getDb();
  const now = /* @__PURE__ */ new Date();
  const limit = await getNegativeLimit();
  const rows = nisFilter ? await db.select().from(schema_exports.siswa).where(eq36(schema_exports.siswa.nis, nisFilter)).limit(1) : await db.select().from(schema_exports.siswa).limit(2e3);
  if (nisFilter && rows.length === 0) {
    throw new HttpError(404, `Siswa dengan NIS '${nisFilter}' tidak ditemukan.`, { field: "nis" });
  }
  const nisList = rows.map((r) => r.nis);
  const totals = nisList.length ? await db.select({ nis: schema_exports.poinLedger.nis, total: sum3(schema_exports.poinLedger.poinDelta) }).from(schema_exports.poinLedger).where(inArray9(schema_exports.poinLedger.nis, nisList)).groupBy(schema_exports.poinLedger.nis) : [];
  const totalByNis = new Map(totals.map((t) => [t.nis, Number(t.total)]));
  const changed = [];
  const untouched = [];
  for (const row of rows) {
    const total = totalByNis.get(row.nis) ?? 0;
    if (total === row.currentPoin) {
      untouched.push({ nis: row.nis, current: row.currentPoin });
      continue;
    }
    changed.push({ nis: row.nis, before: row.currentPoin, after: total });
    await db.update(schema_exports.siswa).set({
      currentPoin: total,
      isBlocked: total <= limit,
      ...total <= limit ? {} : { blockReason: null, blockAt: null },
      updatedAt: now
    }).where(eq36(schema_exports.siswa.nis, row.nis));
  }
  await recordAudit(
    "superadmin.recompute_saldo",
    { nis_filter: nisFilter ?? "ALL", count: rows.length, changed: changed.length },
    { userId: auth.sub, role: auth.role, adminAlasan: alasan, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    message: `${rows.length} siswa saldo di-recompute. ${changed.length} berubah, ${untouched.length} sudah cocok.`,
    count: rows.length,
    changed_count: changed.length,
    unchanged_count: untouched.length,
    changed
  };
});

// src/server/routes/super-admin/siswa/[nis]/adjust-poin.ts
import { eq as eq37, sql as sql7 } from "drizzle-orm";
init_password();
var adjust_poin_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST" && ctx.req.method !== "PATCH") {
    throw new HttpError(405, "Method not allowed.");
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const nis = String(ctx.req.query.nis ?? "").trim();
  if (!nis) throw new HttpError(422, "NIS wajib diisi.", { field: "nis" });
  const body = readBody(ctx);
  const delta = Number(body.poin_delta);
  if (!Number.isInteger(delta)) {
    throw new HttpError(422, "poin_delta harus bilangan bulat.", { field: "poin_delta" });
  }
  if (delta === 0) {
    throw new HttpError(422, "poin_delta tidak boleh 0.", { field: "poin_delta" });
  }
  const alasan = requireString(body, "alasan", { min: 30, max: 500 });
  const reverify = requireString(body, "password_reverify", { min: 1, max: 255 });
  const db = getDb();
  const [me] = await db.select({ password: schema_exports.users.password }).from(schema_exports.users).where(eq37(schema_exports.users.id, auth.sub)).limit(1);
  if (!me || !await verifyPassword(reverify, me.password)) {
    throw new HttpError(422, "Password salah.", { field: "password_reverify" });
  }
  const now = /* @__PURE__ */ new Date();
  let before = 0;
  let after = 0;
  let isBlocked = false;
  await db.transaction(async (tx2) => {
    await tx2.execute(sql7`select current_poin from siswa where nis = ${nis} for update`);
    const rows = await tx2.select().from(schema_exports.siswa).where(eq37(schema_exports.siswa.nis, nis)).limit(1);
    const target = rows[0];
    if (!target) throw new HttpError(404, "Siswa tidak ditemukan.", { field: "nis" });
    before = target.currentPoin;
    after = before + delta;
    await tx2.insert(schema_exports.poinLedger).values({
      nis,
      sourceType: "admin_adjustment",
      sourceId: null,
      poinDelta: delta,
      saldoSebelum: before,
      saldoSesudah: after,
      waktu: now,
      createdAt: now,
      updatedAt: now
    });
    const limit = await getNegativeLimit();
    isBlocked = after <= limit;
    await tx2.update(schema_exports.siswa).set({
      currentPoin: after,
      isBlocked,
      ...isBlocked ? {} : { blockReason: null, blockAt: null },
      updatedAt: now
    }).where(eq37(schema_exports.siswa.nis, nis));
  });
  await recordAudit(
    "superadmin.adjust_poin",
    { nis, delta, saldo_after: after },
    { userId: auth.sub, role: auth.role, resourceType: "santri", resourceId: null, adminAlasan: alasan, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    siswa: { nis, current_poin: after, is_blocked: isBlocked }
  };
});

// src/server/routes/super-admin/siswa/[nis]/timeline.ts
import { eq as eq38, desc as desc6 } from "drizzle-orm";
var LIMIT = 50;
var timeline_default = handler(async (ctx) => {
  if (ctx.req.method !== "GET") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const nis = String(ctx.req.query.nis ?? "").trim();
  if (!nis) throw new HttpError(422, "NIS wajib diisi.", { field: "nis" });
  const db = getDb();
  const [siswa2] = await db.select().from(schema_exports.siswa).where(eq38(schema_exports.siswa.nis, nis)).limit(1);
  if (!siswa2) throw new HttpError(404, "Siswa tidak ditemukan.", { field: "nis" });
  const tx = await db.select().from(schema_exports.transaksiPembelian).where(eq38(schema_exports.transaksiPembelian.nis, nis)).orderBy(desc6(schema_exports.transaksiPembelian.waktu)).limit(LIMIT);
  const poin = await db.select().from(schema_exports.poinLedger).where(eq38(schema_exports.poinLedger.nis, nis)).orderBy(desc6(schema_exports.poinLedger.waktu)).limit(LIMIT);
  const timeline = [
    ...tx.map((t) => ({
      type: "pembelian",
      waktu: iso(t.waktu),
      data: serializeTransaksi(t)
    })),
    ...poin.map((p) => ({
      type: "poin_ledger",
      waktu: iso(p.waktu),
      data: serializeLedger(p)
    }))
  ].sort((a, b) => {
    const ta = a.waktu ? Date.parse(a.waktu) : 0;
    const tb = b.waktu ? Date.parse(b.waktu) : 0;
    return tb - ta;
  }).slice(0, LIMIT);
  return { nis, timeline };
});

// src/server/routes/super-admin/system-health.ts
import { and as and14, gte as gte2, isNull as isNull8, inArray as inArray10, like as like2, count as count9, desc as desc7 } from "drizzle-orm";
var system_health_default = handler(async (ctx) => {
  if (ctx.req.method !== "GET") {
    return { message: "Gunakan GET.", error: "method_not_allowed" };
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const db = getDb();
  let dbSizeKb = 0;
  try {
    const rows = await getSql()`select pg_database_size(current_database()) / 1024.0 as size_kb`;
    dbSizeKb = Math.round(Number(rows[0]?.size_kb ?? 0) * 10) / 10;
  } catch {
    dbSizeKb = 0;
  }
  const pakeS3 = !!process.env.AWS_ENDPOINT;
  let photoSizeKb = null;
  let photoNote = "";
  if (pakeS3) {
    photoNote = "Foto disimpan di object storage (Supabase). Ukuran tidak dihitung \u2014 perlu mendaftar semua objek di bucket.";
  } else {
    photoSizeKb = 0;
    photoNote = "Disimpan di disk lokal (development).";
  }
  const [siswaRow] = await db.select({ n: count9() }).from(schema_exports.siswa).where(isNull8(schema_exports.siswa.archivedAt));
  const [staffRow] = await db.select({ n: count9() }).from(schema_exports.users).where(inArray10(schema_exports.users.role, ["staff_kantin", "petugas_kesantrian"]));
  const since = new Date(Date.now() - 60 * 60 * 1e3);
  const recentErrors = await db.select().from(schema_exports.auditLogs).where(and14(gte2(schema_exports.auditLogs.waktu, since), like2(schema_exports.auditLogs.action, "%error%"))).orderBy(desc7(schema_exports.auditLogs.waktu)).limit(10);
  const limitRaw = await getConfig("default_negative_limit");
  const targetRaw = await getConfig("reset_target_poin");
  return {
    db_size_kb: dbSizeKb,
    photo_storage_kb: photoSizeKb,
    photo_storage_note: photoNote,
    total_active_siswa: Number(siswaRow?.n ?? 0),
    total_staff: Number(staffRow?.n ?? 0),
    recent_error_logs_count: recentErrors.length,
    modes: {
      is_maintenance: await isMaintenance(),
      is_readonly: await isReadOnly()
    },
    // Key yang boleh diedit dari UI, lengkap dengan batasnya
    config: [
      {
        key: "default_negative_limit",
        label: "Batas Minimum Poin",
        description: "Siswa otomatis di-block jika saldo turun ke nilai ini (default -50).",
        value: Number(limitRaw ?? -50),
        type: "number",
        min: -1e3,
        // Batas atas 0 bukan hiasan: kalau positif, siswa tidak pernah
        // terblokir dan mekanisme block mati tanpa error.
        max: 0
      },
      {
        key: "reset_target_poin",
        label: "Target Poin saat Reset",
        description: "Saldo poin target setelah reset (biasanya 0).",
        value: Number(targetRaw ?? 0),
        type: "number",
        min: 0,
        max: 1e3
      }
    ],
    checked_at: (/* @__PURE__ */ new Date()).toISOString()
  };
});

// src/server/routes/super-admin/transactions/[txId]/reverse.ts
import { eq as eq40 } from "drizzle-orm";
var reverse_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST" && ctx.req.method !== "PATCH") {
    throw new HttpError(405, "Method not allowed.");
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  if (!await isReadOnly()) {
    throw new HttpError(422, "Read-only mode harus diaktifkan dulu sebelum reverse transactions (G-SU-03).", {
      field: "mode"
    });
  }
  const txId = Number(ctx.req.query.txId);
  if (!Number.isInteger(txId)) {
    throw new HttpError(422, "txId tidak valid.", { field: "txId" });
  }
  const body = readBody(ctx);
  const alasan = requireString(body, "alasan", { min: 30, max: 500 });
  const reverify = requireString(body, "password_reverify", { min: 1, max: 255 });
  void reverify;
  const { verifyPassword: verifyPassword2 } = await Promise.resolve().then(() => (init_password(), password_exports));
  const db0 = getDb();
  const [me] = await db0.select({ password: schema_exports.users.password }).from(schema_exports.users).where(eq40(schema_exports.users.id, auth.sub)).limit(1);
  if (!me || !await verifyPassword2(reverify, me.password)) {
    throw new HttpError(422, "Password salah.", { field: "password_reverify" });
  }
  const db = getDb();
  const [tx] = await db.select().from(schema_exports.transaksiPembelian).where(eq40(schema_exports.transaksiPembelian.id, txId)).limit(1);
  if (!tx) throw new HttpError(404, "Transaksi tidak ditemukan.", { field: "txId" });
  if (tx.status === "cancelled") {
    throw new HttpError(422, "Transaksi sudah di-reverse.", { field: "tx" });
  }
  const now = /* @__PURE__ */ new Date();
  let before = 0;
  let after = 0;
  let isBlocked = false;
  const compDelta = -tx.penaltyPerUnit * tx.qty;
  await db.transaction(async (tx2) => {
    await tx2.execute(
      (await import("drizzle-orm")).sql`select current_poin from siswa where nis = ${tx.nis} for update`
    );
    const [siswa2] = await tx2.select().from(schema_exports.siswa).where(eq40(schema_exports.siswa.nis, tx.nis)).limit(1);
    if (!siswa2) throw new HttpError(404, "Data siswa tidak ditemukan.", { field: "nis" });
    before = siswa2.currentPoin;
    after = before + compDelta;
    await tx2.insert(schema_exports.poinLedger).values({
      nis: tx.nis,
      sourceType: "admin_adjustment",
      sourceId: tx.id,
      poinDelta: compDelta,
      saldoSebelum: before,
      saldoSesudah: after,
      waktu: now,
      createdAt: now,
      updatedAt: now
    });
    const limit = await getNegativeLimit();
    isBlocked = after <= limit;
    await tx2.update(schema_exports.siswa).set({
      currentPoin: after,
      isBlocked,
      ...isBlocked ? {} : { blockReason: null, blockAt: null },
      updatedAt: now
    }).where(eq40(schema_exports.siswa.nis, tx.nis));
    await tx2.update(schema_exports.transaksiPembelian).set({ status: "cancelled", cancelledAt: now, updatedAt: now }).where(eq40(schema_exports.transaksiPembelian.id, txId));
  });
  await recordAudit(
    "superadmin.reverse_transaction",
    { tx_id: tx.id, nis: tx.nis, compensating_poin_delta: compDelta },
    { userId: auth.sub, role: auth.role, resourceType: "transaksi", resourceId: tx.id, adminAlasan: alasan, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    message: `Transaksi #${tx.id} di-reverse. Compensating poin: ${compDelta > 0 ? "+" : ""}${compDelta}`,
    tx: { id: tx.id, nis: tx.nis, barcode: tx.barcode, qty: tx.qty, status: "cancelled", cancelled_at: now },
    siswa: { nis: tx.nis, current_poin: after, is_blocked: isBlocked }
  };
});

// src/server/routes/super-admin/users/[userId]/delete.ts
import { and as and15, eq as eq42, isNotNull as isNotNull4, count as count10 } from "drizzle-orm";

// src/server/auth/t3.ts
import { eq as eq41 } from "drizzle-orm";
init_password();
async function requireT3Reverify(ctx, auth) {
  if (isSuperAdminTier1(auth.role)) return;
  if (!isSuperAdminTier3(auth.role)) return;
  if (!isSuperAdmin(auth.role)) return;
  const body = ctx.req.body ?? {};
  const fromHeader = ctx.req.headers["x-re-verified-password"];
  const password = (typeof body.password === "string" && body.password !== "" ? body.password : void 0) ?? (typeof fromHeader === "string" ? fromHeader : void 0);
  if (!password) {
    throw new HttpError(403, "Tier 3 admin harus re-verify password untuk aksi ini.", {
      // Ditandai supaya frontend menampilkan dialog password, bukan pesan biasa
      field: "password",
      actionRequired: "password_reverify"
    });
  }
  const db = getDb();
  const [row] = await db.select({ password: schema_exports.users.password }).from(schema_exports.users).where(eq41(schema_exports.users.id, auth.sub)).limit(1);
  if (!row || !await verifyPassword(password, row.password)) {
    throw new HttpError(403, "Password re-verifikasi gagal.");
  }
  await recordAudit(
    "superadmin.destructive_reverified",
    { path: `/${ctx.req.url ?? ""}`, method: ctx.req.method },
    { userId: auth.sub, role: auth.role, ip: ctx.ip, userAgent: ctx.userAgent }
  );
}

// src/server/routes/super-admin/users/[userId]/delete.ts
var delete_default = handler(async (ctx) => {
  if (ctx.req.method !== "DELETE" && ctx.req.method !== "POST") {
    throw new HttpError(405, "Method not allowed.");
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  await requireT3Reverify(ctx, auth);
  const id = Number(ctx.req.query.userId);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, "userId tidak valid.", { field: "userId" });
  }
  if (id === auth.sub) {
    throw new HttpError(422, "Tidak bisa menghapus akun sendiri.", { field: "userId" });
  }
  const body = readBody(ctx);
  const alasan = requireString(body, "alasan", { min: 10, max: 500 });
  const db = getDb();
  const [row] = await db.select().from(schema_exports.users).where(eq42(schema_exports.users.id, id)).limit(1);
  if (!row) throw new HttpError(404, "User tidak ditemukan.", { field: "userId" });
  const role = row.role;
  if (isSuperAdmin(role) || isStaffKantin(role) || isPetugas(role)) {
    throw new HttpError(
      422,
      `User dengan role '${role}' tidak bisa dihapus \u2014 ada riwayat operasional. Gunakan suspend.`,
      { field: "userId" }
    );
  }
  const [txCount] = await db.select({ n: count10() }).from(schema_exports.transaksiPembelian).where(eq42(schema_exports.transaksiPembelian.staffId, id));
  if (Number(txCount?.n ?? 0) > 0) {
    throw new HttpError(422, "User punya riwayat transaksi. Gunakan suspend.", { field: "userId" });
  }
  const [sesiCount] = await db.select({ n: count10() }).from(schema_exports.sesiVerifikasi).where(eq42(schema_exports.sesiVerifikasi.petugasId, id));
  if (Number(sesiCount?.n ?? 0) > 0) {
    throw new HttpError(422, "User punya riwayat verifikasi. Gunakan suspend.", { field: "userId" });
  }
  const revoked = await revokeAllForUser(id);
  const now = /* @__PURE__ */ new Date();
  const [updated] = await db.update(schema_exports.users).set({ suspendedAt: now, mustChangePassword: true, updatedAt: now }).where(and15(eq42(schema_exports.users.id, id), isNotNull4(schema_exports.users.id))).returning();
  await recordAudit(
    "superadmin.user_delete",
    { user_id: id, name: row.name, role, tokens_revoked: revoked },
    { userId: auth.sub, role: auth.role, resourceType: "user", resourceId: id, adminAlasan: alasan, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    message: `User ${row.name} dinonaktifkan. Data tidak dihapus fisik \u2014 riwayat tetap bisa diaudit.`,
    user: { id: updated.id, name: updated.name, is_suspended: true, tokens_revoked: revoked }
  };
});

// src/server/routes/super-admin/users/[userId]/force-logout.ts
import { eq as eq43 } from "drizzle-orm";
var force_logout_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST" && ctx.req.method !== "PATCH") {
    throw new HttpError(405, "Method not allowed.");
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  await requireT3Reverify(ctx, auth);
  const id = Number(ctx.req.query.userId);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, "userId tidak valid.", { field: "userId" });
  }
  if (id === auth.sub) {
    throw new HttpError(422, "Gunakan logout biasa untuk akun sendiri.", { field: "userId" });
  }
  const db = getDb();
  const [row] = await db.select().from(schema_exports.users).where(eq43(schema_exports.users.id, id)).limit(1);
  if (!row) throw new HttpError(404, "User tidak ditemukan.", { field: "userId" });
  const revoked = await revokeAllForUser(id);
  await recordAudit(
    "superadmin.force_logout",
    { user_id: id, tokens_revoked: revoked },
    { userId: auth.sub, role: auth.role, resourceType: "user", resourceId: id, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    message: revoked > 0 ? `${revoked} sesi ${row.name} dicabut. Dia harus login lagi.` : `Tidak ada sesi aktif milik ${row.name}.`,
    user: { id: row.id, name: row.name, tokens_revoked: revoked }
  };
});

// src/server/routes/super-admin/users/[userId]/index.ts
import { eq as eq44 } from "drizzle-orm";
var userId = (ctx) => {
  const id = Number(ctx.req.query.userId);
  if (!Number.isInteger(id)) throw new HttpError(422, "userId tidak valid.", { field: "userId" });
  return id;
};
var userId_default = handler(async (ctx) => {
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const id = userId(ctx);
  const db = getDb();
  if (ctx.req.method === "GET") {
    const [row] = await db.select().from(schema_exports.users).where(eq44(schema_exports.users.id, id)).limit(1);
    if (!row) throw new HttpError(404, "User tidak ditemukan.", { field: "userId" });
    const [siswaRow] = await db.select().from(schema_exports.siswa).where(eq44(schema_exports.siswa.userId, id)).limit(1);
    return {
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        nis: siswaRow?.nis ?? null,
        kelas: siswaRow?.kelas ?? null,
        is_suspended: row.suspendedAt !== null,
        suspended_at: iso(row.suspendedAt),
        must_change_password: row.mustChangePassword,
        created_at: iso(row.createdAt),
        updated_at: iso(row.updatedAt)
      }
    };
  }
  if (ctx.req.method === "PATCH" || ctx.req.method === "PUT") {
    await requireT3Reverify(ctx, auth);
    const body = readBody(ctx);
    const [row] = await db.select().from(schema_exports.users).where(eq44(schema_exports.users.id, id)).limit(1);
    if (!row) throw new HttpError(404, "User tidak ditemukan.", { field: "userId" });
    if (id === auth.sub && "role" in body) {
      const next = String(body.role);
      if (next !== "super_admin" && next !== "super_admin_tier3") {
        throw new HttpError(422, "Tidak bisa demote akun sendiri.", { field: "role" });
      }
    }
    const patch = {};
    if ("name" in body) {
      const v = requireString(body, "name", { max: 255 });
      patch.name = v;
    }
    if ("role" in body) {
      const r = requireString(body, "role", { max: 30 });
      if (!isRole(r)) {
        throw new HttpError(422, `Role '${r}' tidak dikenal. Pilihan: ${ROLES.join(", ")}.`, {
          field: "role"
        });
      }
      patch.role = r;
    }
    if (Object.keys(patch).length === 0) {
      throw new HttpError(422, "Tidak ada field yang di-update.", { field: "body" });
    }
    const before = { name: row.name, role: row.role };
    const [updated] = await db.update(schema_exports.users).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq44(schema_exports.users.id, id)).returning();
    if ("name" in patch) {
      await db.update(schema_exports.siswa).set({ nama: patch.name }).where(eq44(schema_exports.siswa.userId, id));
    }
    await recordAudit(
      "superadmin.user_update",
      { user_id: id, before, after: { name: updated.name, role: updated.role } },
      { userId: auth.sub, role: auth.role, resourceType: "user", resourceId: id, ip: ctx.ip, userAgent: ctx.userAgent }
    );
    return {
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        is_suspended: updated.suspendedAt !== null
      }
    };
  }
});

// src/server/routes/super-admin/users/[userId]/reset-password.ts
import { eq as eq45 } from "drizzle-orm";
init_password();
var reset_password_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST" && ctx.req.method !== "PATCH") {
    throw new HttpError(405, "Method not allowed.");
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  await requireT3Reverify(ctx, auth);
  const id = Number(ctx.req.query.userId);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, "userId tidak valid.", { field: "userId" });
  }
  const body = readBody(ctx);
  const newPassword = requireString(body, "new_password", { min: 8, max: 255 });
  const policy = checkPasswordPolicy(newPassword);
  if (!policy.ok) {
    throw new HttpError(
      422,
      `Password baru tidak memenuhi syarat: ${describeProblems(policy.problems)}.`,
      { field: "new_password", problems: policy.problems }
    );
  }
  const db = getDb();
  const [row] = await db.select().from(schema_exports.users).where(eq45(schema_exports.users.id, id)).limit(1);
  if (!row) throw new HttpError(404, "User tidak ditemukan.", { field: "userId" });
  await db.update(schema_exports.users).set({
    password: await hashPassword(newPassword),
    mustChangePassword: true,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq45(schema_exports.users.id, id));
  const revoked = await revokeAllForUser(id);
  await recordAudit(
    "superadmin.reset_password",
    { user_id: id, tokens_revoked: revoked },
    { userId: auth.sub, role: auth.role, resourceType: "user", resourceId: id, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    message: `Password ${row.name} direset. ${revoked} sesi dicabut \u2014 dia harus login lagi dan akan diminta ganti password.`,
    user: { id: row.id, name: row.name, must_change_password: true, tokens_revoked: revoked }
  };
});

// src/server/routes/super-admin/users/[userId]/suspend.ts
import { eq as eq46 } from "drizzle-orm";
var suspend_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST" && ctx.req.method !== "PATCH") {
    throw new HttpError(405, "Method not allowed.");
  }
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  await requireT3Reverify(ctx, auth);
  const id = Number(ctx.req.query.userId);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, "userId tidak valid.", { field: "userId" });
  }
  if (id === auth.sub) {
    throw new HttpError(422, "Tidak bisa suspend akun sendiri.", { field: "userId" });
  }
  const body = readBody(ctx);
  if (typeof body.suspended !== "boolean") {
    throw new HttpError(422, "Kolom suspended harus boolean (true/false).", { field: "suspended" });
  }
  const suspended = body.suspended;
  const alasan = requireString(body, "alasan", { min: 10, max: 500 });
  const db = getDb();
  const [row] = await db.select().from(schema_exports.users).where(eq46(schema_exports.users.id, id)).limit(1);
  if (!row) throw new HttpError(404, "User tidak ditemukan.", { field: "userId" });
  const now = /* @__PURE__ */ new Date();
  const [updated] = await db.update(schema_exports.users).set({
    suspendedAt: suspended ? now : null,
    updatedAt: now,
    // Buka kembali = pengguna wajib ganti password lagi, karena aksesnya
    // pernah hilang dan kita tidak bisa memastikan dia tetap pemilik.
    ...suspended ? {} : { mustChangePassword: true }
  }).where(eq46(schema_exports.users.id, id)).returning();
  const revoked = suspended ? await revokeAllForUser(id) : 0;
  await recordAudit(
    suspended ? "superadmin.user_suspend" : "superadmin.user_unsuspend",
    { user_id: id, target_role: row.role, tokens_revoked: revoked },
    { userId: auth.sub, role: auth.role, resourceType: "user", resourceId: id, adminAlasan: alasan, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return {
    message: suspended ? `Akun ${row.name} disuspend. ${revoked} sesi aktif dicabut.` : `Akun ${row.name} dibuka kembali. User harus ganti password saat login.`,
    user: {
      id: updated.id,
      name: updated.name,
      is_suspended: updated.suspendedAt !== null,
      suspended_at: iso(updated.suspendedAt),
      tokens_revoked: revoked
    }
  };
});

// src/server/routes/super-admin/users/index.ts
import { and as and16, asc as asc8, eq as eq47, or as or4, ilike as ilike4, isNull as isNull9, isNotNull as isNotNull5 } from "drizzle-orm";
init_password();
var users_default = handler(async (ctx) => {
  const auth = await requireAuth(ctx);
  requireSuperAdmin(auth.role);
  const db = getDb();
  if (ctx.req.method === "GET") return list3(ctx, db, auth.role);
  if (ctx.req.method === "POST") return create3(ctx, db, auth);
  throw new HttpError(405, "Method not allowed.");
});
async function list3(ctx, db, role) {
  void role;
  const conds = [];
  if (ctx.req.query.suspended === "1" || ctx.req.query.suspended === "true") {
    conds.push(isNotNull5(schema_exports.users.suspendedAt));
  } else if (ctx.req.query.suspended === "0") {
    conds.push(isNull9(schema_exports.users.suspendedAt));
  }
  const roleFilter = ctx.req.query.role;
  if (roleFilter && isRole(String(roleFilter))) {
    conds.push(eq47(schema_exports.users.role, String(roleFilter)));
  }
  const q = String(ctx.req.query.q ?? "").trim();
  if (q) {
    conds.push(or4(ilike4(schema_exports.users.name, `%${q}%`), ilike4(schema_exports.users.email, `%${q}%`)));
  }
  const where = conds.length ? and16(...conds) : void 0;
  const rows = await db.select().from(schema_exports.users).where(where).orderBy(asc8(schema_exports.users.name)).limit(200);
  const nisByUser = await db.select({
    userId: schema_exports.siswa.userId,
    nis: schema_exports.siswa.nis,
    poin: schema_exports.siswa.currentPoin
  }).from(schema_exports.siswa);
  const nisMap = new Map(nisByUser.map((s) => [s.userId, s]));
  return {
    data: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      nis: nisMap.get(u.id)?.nis ?? null,
      current_poin: nisMap.get(u.id)?.poin ?? null,
      is_suspended: u.suspendedAt !== null,
      suspended_at: iso(u.suspendedAt),
      must_change_password: u.mustChangePassword,
      created_at: iso(u.createdAt),
      updated_at: iso(u.updatedAt)
    }))
  };
}
async function create3(ctx, db, auth) {
  await requireT3Reverify(ctx, auth);
  const body = readBody(ctx);
  const name = requireString(body, "name", { max: 255 });
  const roleRaw = requireString(body, "role", { max: 30 });
  const email = optionalString(body, "email") ?? null;
  const password = requireString(body, "password", { min: 8, max: 255 });
  const nis = optionalString(body, "nis") ?? null;
  const kelas = optionalString(body, "kelas") ?? null;
  const asrama = optionalString(body, "asrama") ?? null;
  const mustChange = body.must_change_password === void 0 ? true : body.must_change_password === true;
  if (!isRole(roleRaw)) {
    throw new HttpError(422, `Role '${roleRaw}' tidak dikenal. Pilihan: ${ROLES.join(", ")}.`, {
      field: "role"
    });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(422, "Format email tidak valid.", { field: "email" });
  }
  const policy = checkPasswordPolicy(password);
  if (!policy.ok && roleRaw !== "santri") {
    throw new HttpError(
      422,
      `Password tidak memenuhi syarat: ${describeProblems(policy.problems)}.`,
      { field: "password", problems: policy.problems }
    );
  }
  if (nis) {
    if (nis.length > 20) {
      throw new HttpError(422, "NIS maksimal 20 karakter.", { field: "nis" });
    }
    if (roleRaw !== "santri") {
      throw new HttpError(422, "NIS hanya boleh diisi untuk role Siswa.", { field: "nis" });
    }
  }
  if (email) {
    const dup = await db.select().from(schema_exports.users).where(eq47(schema_exports.users.email, email)).limit(1);
    if (dup.length) {
      throw new HttpError(422, "Email sudah dipakai.", { field: "email" });
    }
  }
  if (nis) {
    const dup = await db.select().from(schema_exports.siswa).where(eq47(schema_exports.siswa.nis, nis)).limit(1);
    if (dup.length) {
      throw new HttpError(422, "NIS sudah dipakai.", { field: "nis" });
    }
  }
  const now = /* @__PURE__ */ new Date();
  const [user] = await db.insert(schema_exports.users).values({
    email,
    name,
    role: roleRaw,
    password: await hashPassword(password),
    mustChangePassword: mustChange,
    createdAt: now,
    updatedAt: now
  }).returning({ id: schema_exports.users.id });
  if (nis) {
    await db.insert(schema_exports.siswa).values({
      nis,
      userId: user.id,
      nama: name,
      kelas: kelas ?? "-",
      asrama,
      currentPoin: 0,
      isBlocked: false,
      createdAt: now,
      updatedAt: now
    });
    await db.insert(schema_exports.poinLedger).values({
      nis,
      sourceType: "initial",
      sourceId: null,
      poinDelta: 0,
      saldoSebelum: 0,
      saldoSesudah: 0,
      waktu: now,
      createdAt: now,
      updatedAt: now
    });
  }
  await recordAudit(
    "superadmin.user_create",
    { user_id: user.id, role: roleRaw, nis, has_email: !!email },
    { userId: auth.sub, role: auth.role, resourceType: "user", resourceId: user.id, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return Created({ user: { id: user.id, name, email, role: roleRaw, nis } });
}

// src/server/routes/verifikasi/[id]/force-end.ts
import { eq as eq48, and as and17, isNull as isNull10 } from "drizzle-orm";
var force_end_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);
  const id = Number(ctx.req.query.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, "id sesi tidak valid.", { field: "id" });
  }
  const body = readBody(ctx);
  const alasan = requireString(body, "alasan", { min: 10, max: 500 });
  const db = getDb();
  const [sesi] = await db.select().from(schema_exports.sesiVerifikasi).where(eq48(schema_exports.sesiVerifikasi.id, id)).limit(1);
  if (!sesi) throw new HttpError(404, "Sesi verifikasi tidak ditemukan.", { field: "id" });
  if (sesi.waktuSelesai) {
    throw new HttpError(422, "Sesi sudah ditutup.", { field: "sesi" });
  }
  const items = await db.select().from(schema_exports.sesiVerifikasiItems).where(eq48(schema_exports.sesiVerifikasiItems.idSesi, id));
  const itemsCount = items.length;
  const totalPoin = items.reduce((a, b) => a + b.poinDelta, 0);
  const now = /* @__PURE__ */ new Date();
  await db.update(schema_exports.sesiVerifikasi).set({ waktuSelesai: now, updatedAt: now }).where(and17(eq48(schema_exports.sesiVerifikasi.id, id), isNull10(schema_exports.sesiVerifikasi.waktuSelesai)));
  await recordAudit(
    "verifikasi.force_end",
    {
      sesi_id: id,
      nis: sesi.nis,
      petugas_id: sesi.petugasId,
      items_dropped_count: itemsCount,
      total_poin_dropped: totalPoin,
      note: "Items tidak diproses ke poin saldo. Sesi di-close paksa oleh admin."
    },
    {
      userId: auth.sub,
      role: auth.role,
      resourceType: "sesi",
      resourceId: id,
      adminAlasan: alasan,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    }
  );
  const [fresh] = await db.select().from(schema_exports.sesiVerifikasi).where(eq48(schema_exports.sesiVerifikasi.id, id)).limit(1);
  return {
    message: `Sesi #${id} di-force-end. Items TIDAK diproses \u2014 poin siswa tidak berubah dari sesi ini.`,
    sesi: fresh,
    items_dropped: { count: itemsCount, total_poin_uncommitted: totalPoin }
  };
});

// src/server/routes/verifikasi/[id]/log.ts
import { eq as eq50, inArray as inArray11 } from "drizzle-orm";

// src/server/verifikasi.ts
import { and as and18, eq as eq49, isNull as isNull11, sum as sum4, min } from "drizzle-orm";
var DURASI_IDLE_MENIT = 15;
async function openDebtsFor(nis) {
  const db = getDb();
  const rows = await db.select({
    barcode: schema_exports.transaksiPembelian.barcode,
    qty: sum4(schema_exports.transaksiPembelian.qty),
    // MIN(waktu) = transaksi open terlama, sama seperti di Laravel
    oldest: min(schema_exports.transaksiPembelian.waktu)
  }).from(schema_exports.transaksiPembelian).where(
    and18(
      eq49(schema_exports.transaksiPembelian.nis, nis),
      eq49(schema_exports.transaksiPembelian.status, "open")
    )
  ).groupBy(schema_exports.transaksiPembelian.barcode);
  if (rows.length === 0) return [];
  const prods = await db.select({ barcode: schema_exports.produk.barcode, nama: schema_exports.produk.namaProduk }).from(schema_exports.produk);
  const nameByBc = new Map(prods.map((p) => [p.barcode, p.nama]));
  return rows.map((r) => ({
    barcode: r.barcode,
    nama_produk: nameByBc.get(r.barcode) ?? null,
    qty: Number(r.qty),
    oldest: iso(r.oldest)
  }));
}
async function assertSiswaNotSuspended(nis, actorRole) {
  if (isSuperAdmin(actorRole)) return;
  const db = getDb();
  const rows = await db.select({
    nama: schema_exports.users.name,
    suspendedAt: schema_exports.users.suspendedAt
  }).from(schema_exports.siswa).innerJoin(schema_exports.users, eq49(schema_exports.users.id, schema_exports.siswa.userId)).where(eq49(schema_exports.siswa.nis, nis)).limit(1);
  if (rows[0]?.suspendedAt) {
    throw new HttpError(
      422,
      `Akun ${rows[0].nama} (NIS ${nis}) sedang di-suspend. Verifikasi pembuangan tidak bisa dicatat. Hubungi admin untuk membuka akses.`,
      { field: "nis" }
    );
  }
}
function photoUrl(path) {
  if (!path) return null;
  const base = process.env.AWS_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
function presentItem(i, namaProduk) {
  return {
    id: i.id,
    id_sesi: i.idSesi,
    barcode: i.barcode,
    qty_in: i.qtyIn,
    qty_open_at_time: i.qtyOpenAtTime,
    qty_matched: i.qtyMatched,
    qty_excess: i.qtyExcess,
    qty_shortfall: i.qtyShortfall,
    poin_delta: i.poinDelta,
    foto_bukti_path: i.fotoBuktiPath ?? null,
    foto_bukti_url: photoUrl(i.fotoBuktiPath),
    nama_produk: namaProduk ?? null,
    catatan: i.catatan ?? null,
    created_at: iso(i.createdAt),
    updated_at: iso(i.updatedAt)
  };
}
function presentSesi(s, items, namaProdukByBarcode) {
  return {
    id: s.id,
    nis: s.nis,
    petugas_id: s.petugasId,
    waktu_mulai: iso(s.waktuMulai),
    waktu_selesai: iso(s.waktuSelesai),
    total_poin_change: s.totalPoinChange ?? 0,
    created_at: iso(s.createdAt),
    updated_at: iso(s.updatedAt),
    items: items.map((i) => presentItem(i, namaProdukByBarcode.get(i.barcode) ?? null))
  };
}
async function presentSiswa(nis) {
  const db = getDb();
  const rows = await db.select({
    nis: schema_exports.siswa.nis,
    nama: schema_exports.users.name,
    currentPoin: schema_exports.siswa.currentPoin,
    isBlocked: schema_exports.siswa.isBlocked
  }).from(schema_exports.siswa).innerJoin(schema_exports.users, eq49(schema_exports.users.id, schema_exports.siswa.userId)).where(eq49(schema_exports.siswa.nis, nis)).limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    nis: r.nis,
    nama: r.nama,
    current_poin: r.currentPoin,
    is_blocked: r.isBlocked
  };
}
async function productNameMap(barcodes) {
  if (barcodes.length === 0) return /* @__PURE__ */ new Map();
  const db = getDb();
  const { inArray: inArray13 } = await import("drizzle-orm");
  const prods = await db.select({ barcode: schema_exports.produk.barcode, nama: schema_exports.produk.namaProduk }).from(schema_exports.produk).where(inArray13(schema_exports.produk.barcode, [...new Set(barcodes)]));
  return new Map(prods.map((p) => [p.barcode, p.nama]));
}

// src/server/routes/verifikasi/[id]/log.ts
var log_default2 = handler(async (ctx) => {
  if (ctx.req.method !== "GET") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);
  const id = Number(ctx.req.query.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, "id sesi tidak valid.", { field: "id" });
  }
  const db = getDb();
  const [sesi] = await db.select().from(schema_exports.sesiVerifikasi).where(eq50(schema_exports.sesiVerifikasi.id, id)).limit(1);
  if (!sesi) throw new HttpError(404, "Sesi verifikasi tidak ditemukan.", { field: "id" });
  const [siswa2] = await db.select({ nama: schema_exports.users.name, kelas: schema_exports.siswa.kelas }).from(schema_exports.siswa).innerJoin(schema_exports.users, eq50(schema_exports.users.id, schema_exports.siswa.userId)).where(eq50(schema_exports.siswa.nis, sesi.nis)).limit(1);
  const [petugas] = await db.select({ name: schema_exports.users.name }).from(schema_exports.users).where(eq50(schema_exports.users.id, sesi.petugasId)).limit(1);
  const items = await db.select().from(schema_exports.sesiVerifikasiItems).where(eq50(schema_exports.sesiVerifikasiItems.idSesi, id));
  const barcodes = [...new Set(items.map((i) => i.barcode))];
  const prods = barcodes.length ? await db.select().from(schema_exports.produk).where(inArray11(schema_exports.produk.barcode, barcodes)) : [];
  const namaByBc = new Map(prods.map((p) => [p.barcode, p.namaProduk]));
  return {
    sesi: {
      id: sesi.id,
      nis: sesi.nis,
      nama_siswa: siswa2?.nama ?? null,
      kelas_siswa: siswa2?.kelas ?? null,
      petugas_id: sesi.petugasId,
      nama_petugas: petugas?.name ?? null,
      waktu_mulai: sesi.waktuMulai,
      waktu_selesai: sesi.waktuSelesai,
      status: sesi.waktuSelesai ? "closed" : "open",
      total_poin_change: sesi.totalPoinChange ?? 0
    },
    items: items.map((i) => ({
      id: i.id,
      barcode: i.barcode,
      nama_produk: namaByBc.get(i.barcode) ?? null,
      qty_in: i.qtyIn,
      qty_matched: i.qtyMatched,
      qty_excess: i.qtyExcess,
      qty_shortfall: i.qtyShortfall,
      poin_delta: i.poinDelta,
      foto_bukti_path: i.fotoBuktiPath ?? null,
      // URL disusun di server supaya frontend tidak perlu tahu apakah foto
      // dilayani dari symlink lokal atau Supabase.
      foto_bukti_url: photoUrl(i.fotoBuktiPath),
      catatan: i.catatan ?? null,
      created_at: i.createdAt
    }))
  };
});

// src/server/routes/verifikasi/active.ts
import { isNull as isNull12, desc as desc8, eq as eq51, inArray as inArray12 } from "drizzle-orm";
var active_default = handler(async (ctx) => {
  if (ctx.req.method !== "GET") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  requireAdminOrSuper(auth.role);
  const db = getDb();
  const sesi = await db.select().from(schema_exports.sesiVerifikasi).where(isNull12(schema_exports.sesiVerifikasi.waktuSelesai)).orderBy(desc8(schema_exports.sesiVerifikasi.waktuMulai));
  const ids = sesi.map((s) => s.id);
  const items = ids.length ? await db.select().from(schema_exports.sesiVerifikasiItems) : [];
  const bySesi = /* @__PURE__ */ new Map();
  for (const it of items) {
    if (!ids.includes(it.idSesi)) continue;
    const list4 = bySesi.get(it.idSesi) ?? [];
    list4.push(it);
    bySesi.set(it.idSesi, list4);
  }
  const nisList = [...new Set(sesi.map((s) => s.nis))];
  const siswa2 = nisList.length ? await db.select({
    nis: schema_exports.siswa.nis,
    nama: schema_exports.users.name,
    kelas: schema_exports.siswa.kelas,
    poin: schema_exports.siswa.currentPoin,
    blocked: schema_exports.siswa.isBlocked
  }).from(schema_exports.siswa).innerJoin(schema_exports.users, eq51(schema_exports.users.id, schema_exports.siswa.userId)).where(inArray12(schema_exports.siswa.nis, nisList)) : [];
  const siswaByNis = new Map(siswa2.map((s) => [s.nis, s]));
  const petugasIds = [...new Set(sesi.map((s) => s.petugasId))];
  const petugas = petugasIds.length ? await db.select({ id: schema_exports.users.id, name: schema_exports.users.name }).from(schema_exports.users).where(inArray12(schema_exports.users.id, petugasIds)) : [];
  const petugasById = new Map(petugas.map((p) => [p.id, p.name]));
  const data = sesi.map((s) => {
    const list4 = bySesi.get(s.id) ?? [];
    const lastItem = list4.length ? list4.reduce((a, b) => a.createdAt > b.createdAt ? a : b) : null;
    const row = siswaByNis.get(s.nis);
    return {
      id: s.id,
      nis: s.nis,
      nama_siswa: row?.nama ?? null,
      kelas_siswa: row?.kelas ?? null,
      current_poin_siswa: row?.poin ?? null,
      is_blocked: row?.blocked ?? null,
      petugas_id: s.petugasId,
      nama_petugas: petugasById.get(s.petugasId) ?? null,
      waktu_mulai: s.waktuMulai,
      items_count: list4.length,
      // Poin yang sudah diinput tapi belum TER-COMMIT ke saldo
      total_poin_change_uncommitted: list4.reduce((a, b) => a + b.poinDelta, 0),
      last_item_at: lastItem?.createdAt ?? null
    };
  });
  return { data, count: data.length, fetched_at: (/* @__PURE__ */ new Date()).toISOString() };
});

// src/server/routes/verifikasi/foto-bukti/presign.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
var MAX_BYTES = 5 * 1024 * 1024;
var EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};
var cachedClient;
function s3() {
  if (cachedClient) return cachedClient;
  const endpoint = process.env.AWS_ENDPOINT;
  const key = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_DEFAULT_REGION;
  if (!endpoint || !key || !secret || !region) {
    throw new HttpError(503, "Storage belum dikonfigurasi (env AWS_* belum lengkap).");
  }
  cachedClient = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    forcePathStyle: true
  });
  return cachedClient;
}
var presign_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  requireCapability(auth.role, "input_verifikasi");
  const body = readBody(ctx);
  const mime = requireString(body, "content_type", { max: 100 }).toLowerCase();
  const ext = EXT_BY_MIME[mime];
  if (!ext) {
    throw new HttpError(422, "Tipe file harus JPEG, PNG, atau WebP.", { field: "content_type" });
  }
  const size = Number(body.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    throw new HttpError(422, "size wajib diisi (byte).", { field: "size" });
  }
  if (size > MAX_BYTES) {
    throw new HttpError(422, "Ukuran file maksimal 5MB.", { field: "size" });
  }
  const bucket = process.env.AWS_BUCKET;
  if (!bucket) throw new HttpError(503, "AWS_BUCKET belum di-set.");
  const now = /* @__PURE__ */ new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const path = `barcode-evidence/${ym}/${randomBytes2(16).toString("hex")}.${ext}`;
  const uploadUrl = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket, Key: path, ContentType: mime }),
    { expiresIn: 300 }
  );
  return {
    upload_url: uploadUrl,
    path,
    method: "PUT",
    headers: { "Content-Type": mime },
    expires_in: 300,
    max_bytes: MAX_BYTES
  };
});

// src/server/routes/verifikasi/sesi-terbuka.ts
import { isNull as isNull13, desc as desc9 } from "drizzle-orm";
var sesi_terbuka_default = handler(async (_ctx) => {
  const auth = await requireAuth(_ctx);
  requireCapability(auth.role, "input_verifikasi");
  const db = getDb();
  const sesi = await db.select().from(schema_exports.sesiVerifikasi).where(isNull13(schema_exports.sesiVerifikasi.waktuSelesai)).orderBy(desc9(schema_exports.sesiVerifikasi.waktuMulai));
  const ids = sesi.map((s) => s.id);
  const items = ids.length ? await db.select().from(schema_exports.sesiVerifikasiItems) : [];
  const bySesi = /* @__PURE__ */ new Map();
  for (const it of items) {
    const list4 = bySesi.get(it.idSesi) ?? [];
    list4.push(it);
    bySesi.set(it.idSesi, list4);
  }
  const now = Date.now();
  const data = [];
  for (const s of sesi) {
    const list4 = bySesi.get(s.id) ?? [];
    const lastTs = list4.length ? Math.max(...list4.map((i) => new Date(i.createdAt).getTime())) : new Date(s.waktuMulai).getTime();
    const idleMenit = Math.floor((now - lastTs) / 6e4);
    const isIdle = idleMenit >= DURASI_IDLE_MENIT;
    data.push({
      id: s.id,
      nis: s.nis,
      nama_siswa: (await presentSiswa(s.nis))?.nama ?? null,
      petugas_id: s.petugasId,
      is_mine: s.petugasId === auth.sub,
      waktu_mulai: s.waktuMulai,
      items_count: list4.length,
      // Poin yang sudah diinput tapi belum TER-COMMIT ke saldo. Ini uang
      // yang belum masuk pembukuan — alasan terkuat untuk menyelesaikan sesi.
      poin_belum_tercatat: list4.reduce((a, b) => a + b.poinDelta, 0),
      last_activity_at: new Date(lastTs).toISOString(),
      idle_menit: idleMenit,
      is_idle: isIdle
    });
  }
  const milikSaya = data.filter((d) => d.is_mine);
  return {
    data,
    count: data.length,
    count_mine: milikSaya.length,
    count_idle_mine: milikSaya.filter((d) => d.is_idle).length,
    idle_threshold_menit: DURASI_IDLE_MENIT,
    fetched_at: (/* @__PURE__ */ new Date()).toISOString()
  };
});

// src/server/routes/verifikasi/sesi/[id]/cancel.ts
import { eq as eq53 } from "drizzle-orm";
var cancel_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  const id = Number(ctx.req.query.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, "id sesi tidak valid.", { field: "id" });
  }
  const db = getDb();
  const [sesi] = await db.select().from(schema_exports.sesiVerifikasi).where(eq53(schema_exports.sesiVerifikasi.id, id)).limit(1);
  if (!sesi) throw new HttpError(404, "Sesi verifikasi tidak ditemukan.", { field: "id" });
  if (sesi.waktuSelesai) {
    return { message: "Already closed." };
  }
  const now = /* @__PURE__ */ new Date();
  await db.update(schema_exports.sesiVerifikasi).set({ waktuSelesai: now, updatedAt: now }).where(eq53(schema_exports.sesiVerifikasi.id, id));
  await recordAudit(
    "verifikasi.cancel",
    { sesi_id: id, reason: optionalString(readBody(ctx), "reason") ?? null },
    { userId: auth.sub, role: auth.role, resourceType: "sesi", resourceId: id, ip: ctx.ip, userAgent: ctx.userAgent }
  );
  return { message: "Sesi di-cancel." };
});

// src/server/routes/verifikasi/sesi/[id]/commit.ts
import { and as and19, eq as eq54, asc as asc9, sql as sql9 } from "drizzle-orm";
var commit_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  const id = Number(ctx.req.query.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, "id sesi tidak valid.", { field: "id" });
  }
  const db = getDb();
  const [sesi] = await db.select().from(schema_exports.sesiVerifikasi).where(eq54(schema_exports.sesiVerifikasi.id, id)).limit(1);
  if (!sesi) throw new HttpError(404, "Sesi verifikasi tidak ditemukan.", { field: "id" });
  if (sesi.waktuSelesai) {
    throw new HttpError(422, "Sesi sudah di-commit.", { field: "sesi" });
  }
  await assertSiswaNotSuspended(sesi.nis, auth.role);
  const items = await db.select().from(schema_exports.sesiVerifikasiItems).where(eq54(schema_exports.sesiVerifikasiItems.idSesi, id));
  const now = /* @__PURE__ */ new Date();
  let saldoAkhir = 0;
  let saldoSebelum = 0;
  let totalDelta = 0;
  const matched = [];
  await db.transaction(async (tx) => {
    await tx.execute(
      sql9`select current_poin from siswa where nis = ${sesi.nis} for update`
    );
    const [row] = await tx.select().from(schema_exports.siswa).where(eq54(schema_exports.siswa.nis, sesi.nis)).limit(1);
    if (!row) throw new HttpError(404, "Data siswa tidak ditemukan.", { field: "nis" });
    saldoSebelum = row.currentPoin;
    totalDelta = items.reduce((a, b) => a + b.poinDelta, 0);
    saldoAkhir = saldoSebelum + totalDelta;
    for (const item of items) {
      let remaining = item.qtyMatched;
      if (remaining <= 0) continue;
      const openTx = await tx.select().from(schema_exports.transaksiPembelian).where(
        and19(
          eq54(schema_exports.transaksiPembelian.nis, sesi.nis),
          eq54(schema_exports.transaksiPembelian.barcode, item.barcode),
          eq54(schema_exports.transaksiPembelian.status, "open")
        )
      ).orderBy(asc9(schema_exports.transaksiPembelian.waktu), asc9(schema_exports.transaksiPembelian.id)).limit(50);
      for (const t of openTx) {
        if (remaining <= 0) break;
        if (t.qty <= remaining) {
          await tx.update(schema_exports.transaksiPembelian).set({ status: "settled", settledAt: now, updatedAt: now }).where(eq54(schema_exports.transaksiPembelian.id, t.id));
          remaining -= t.qty;
        } else {
          const sisa = t.qty - remaining;
          await tx.update(schema_exports.transaksiPembelian).set({ qty: remaining, status: "settled", settledAt: now, updatedAt: now }).where(eq54(schema_exports.transaksiPembelian.id, t.id));
          await tx.insert(schema_exports.transaksiPembelian).values({
            nis: t.nis,
            barcode: t.barcode,
            qty: sisa,
            penaltyPerUnit: t.penaltyPerUnit,
            status: "open",
            staffId: t.staffId,
            waktu: t.waktu,
            // waktu asli dipertahankan
            catatan: `Split remainder from transaksi #${t.id}`,
            createdAt: now,
            updatedAt: now
          });
          remaining = 0;
        }
        matched.push({ tx_id: t.id, barcode: item.barcode, qty: t.qty });
      }
    }
    let running = saldoSebelum;
    for (const item of items) {
      if (item.poinDelta === 0) continue;
      await tx.insert(schema_exports.poinLedger).values({
        nis: sesi.nis,
        sourceType: "return_match",
        sourceId: item.id,
        poinDelta: item.poinDelta,
        saldoSebelum: running,
        saldoSesudah: running + item.poinDelta,
        waktu: now,
        createdAt: now,
        updatedAt: now
      });
      running += item.poinDelta;
    }
    const [limitRow] = await tx.select().from(schema_exports.configSettings).where(eq54(schema_exports.configSettings.key, "default_negative_limit")).limit(1);
    const negativeLimit = Number(limitRow?.value ?? 0);
    const isBlocked = saldoAkhir <= negativeLimit;
    await tx.update(schema_exports.siswa).set({
      currentPoin: saldoAkhir,
      isBlocked,
      // Kalau sudah tidak blocked, bersihkan alasan block-nya
      ...isBlocked ? {} : { blockReason: null, blockAt: null },
      updatedAt: now
    }).where(eq54(schema_exports.siswa.nis, sesi.nis));
    await tx.update(schema_exports.sesiVerifikasi).set({ waktuSelesai: now, totalPoinChange: totalDelta, updatedAt: now }).where(eq54(schema_exports.sesiVerifikasi.id, id));
  });
  await recordAudit("verifikasi.commit", {
    sesi_id: id,
    nis: sesi.nis,
    item_count: items.length,
    total_poin_change: totalDelta,
    saldo_after: saldoAkhir,
    matched_tx_count: matched.length
  }, {
    userId: auth.sub,
    role: auth.role,
    resourceType: "sesi",
    resourceId: id,
    ip: ctx.ip,
    userAgent: ctx.userAgent
  });
  const [row2] = await db.select({ isBlocked: schema_exports.siswa.isBlocked }).from(schema_exports.siswa).where(eq54(schema_exports.siswa.nis, sesi.nis)).limit(1);
  return {
    sesi: {
      id,
      nis: sesi.nis,
      petugas_id: sesi.petugasId,
      waktu_mulai: sesi.waktuMulai,
      waktu_selesai: now,
      total_poin_change: totalDelta
    },
    siswa: { nis: sesi.nis, current_poin: saldoAkhir, is_blocked: row2?.isBlocked ?? false },
    saldo_change: totalDelta,
    matched_tx_count: matched.length
  };
});

// src/server/routes/verifikasi/sesi/[id]/index.ts
import { eq as eq55 } from "drizzle-orm";
var id_default2 = handler(async (ctx) => {
  if (ctx.req.method !== "GET") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  const id = Number(ctx.req.query.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, "id sesi tidak valid.", { field: "id" });
  }
  const db = getDb();
  const [sesi] = await db.select().from(schema_exports.sesiVerifikasi).where(eq55(schema_exports.sesiVerifikasi.id, id)).limit(1);
  if (!sesi) throw new HttpError(404, "Sesi verifikasi tidak ditemukan.", { field: "id" });
  if (sesi.petugasId !== auth.sub && !isAdmin(auth.role) && !isSuperAdmin(auth.role)) {
    throw new HttpError(422, "Akses ditolak.", { field: "sesi" });
  }
  const items = await db.select().from(schema_exports.sesiVerifikasiItems).where(eq55(schema_exports.sesiVerifikasiItems.idSesi, id));
  const nameMap = await productNameMap(items.map((i) => i.barcode));
  return {
    sesi: presentSesi(sesi, items, nameMap),
    open_debts: await openDebtsFor(sesi.nis),
    siswa: await presentSiswa(sesi.nis)
  };
});

// src/server/routes/verifikasi/sesi/[id]/items.ts
import { and as and20, eq as eq56, sum as sum5 } from "drizzle-orm";
var items_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  requireCapability(auth.role, "input_verifikasi");
  const id = Number(ctx.req.query.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(422, "id sesi tidak valid.", { field: "id" });
  }
  const body = readBody(ctx);
  const barcode = requireString(body, "barcode", { max: 50 });
  const qtyIn = Number(body.qty_in);
  if (!Number.isInteger(qtyIn) || qtyIn < 0) {
    throw new HttpError(422, "qty_in harus integer >= 0.", { field: "qty_in" });
  }
  const catatan = optionalString(body, "catatan") ?? null;
  if (catatan && catatan.length > 500) {
    throw new HttpError(422, "catatan maksimal 500 karakter.", { field: "catatan" });
  }
  const fotoPath = optionalString(body, "foto_bukti_path") ?? null;
  if (fotoPath && (fotoPath.length > 500 || fotoPath.includes(".."))) {
    throw new HttpError(422, "foto_bukti_path tidak valid.", { field: "foto_bukti_path" });
  }
  const db = getDb();
  const [sesi] = await db.select().from(schema_exports.sesiVerifikasi).where(eq56(schema_exports.sesiVerifikasi.id, id)).limit(1);
  if (!sesi) throw new HttpError(404, "Sesi verifikasi tidak ditemukan.", { field: "id" });
  if (sesi.waktuSelesai) {
    throw new HttpError(422, "Sesi sudah selesai.", { field: "sesi" });
  }
  await assertSiswaNotSuspended(sesi.nis, auth.role);
  const [produk2] = await db.select().from(schema_exports.produk).where(eq56(schema_exports.produk.barcode, barcode)).limit(1);
  if (!produk2) {
    throw new HttpError(422, `Produk '${barcode}' tidak ditemukan.`, { field: "barcode" });
  }
  let item = {};
  let openQ = 0;
  let qtyMatched = 0;
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ q: sum5(schema_exports.transaksiPembelian.qty) }).from(schema_exports.transaksiPembelian).where(
      and20(
        eq56(schema_exports.transaksiPembelian.nis, sesi.nis),
        eq56(schema_exports.transaksiPembelian.barcode, barcode),
        eq56(schema_exports.transaksiPembelian.status, "open")
      )
    );
    openQ = Number(row?.q ?? 0);
    qtyMatched = Math.min(qtyIn, openQ);
    const now = /* @__PURE__ */ new Date();
    const [created] = await tx.insert(schema_exports.sesiVerifikasiItems).values({
      idSesi: id,
      barcode,
      qtyIn,
      qtyOpenAtTime: openQ,
      qtyMatched,
      qtyExcess: Math.max(0, qtyIn - openQ),
      qtyShortfall: Math.max(0, openQ - qtyIn),
      poinDelta: qtyMatched * 2,
      fotoBuktiPath: fotoPath,
      catatan,
      createdAt: now,
      updatedAt: now
    }).returning();
    item = created;
  });
  const nameMap = await productNameMap([barcode]);
  return Created({
    item: presentItem(item, nameMap.get(barcode) ?? null),
    note: qtyIn === 0 && openQ > 0 ? `Pure-shortfall valid: siswa lapor tanpa bawa sampah. Penalty: -${openQ} poin (sudah dipotong saat pembelian).` : null
  });
});

// src/server/routes/verifikasi/sesi/index.ts
import { and as and21, eq as eq57, isNull as isNull14 } from "drizzle-orm";
var sesi_default = handler(async (ctx) => {
  if (ctx.req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const auth = await requireAuth(ctx);
  requireCapability(auth.role, "input_verifikasi");
  const body = readBody(ctx);
  const nis = requireString(body, "nis", { max: 20 });
  const db = getDb();
  const [siswa2] = await db.select().from(schema_exports.siswa).where(eq57(schema_exports.siswa.nis, nis)).limit(1);
  if (!siswa2) {
    throw new HttpError(422, `Siswa dengan NIS '${nis}' tidak ditemukan.`, { field: "nis" });
  }
  await assertSiswaNotSuspended(nis, auth.role);
  const [bentrok] = await db.select().from(schema_exports.sesiVerifikasi).where(and21(eq57(schema_exports.sesiVerifikasi.nis, nis), isNull14(schema_exports.sesiVerifikasi.waktuSelesai))).limit(1);
  if (bentrok) {
    const [holder] = await db.select({ name: schema_exports.users.name }).from(schema_exports.users).where(eq57(schema_exports.users.id, bentrok.petugasId)).limit(1);
    const pemegang = holder?.name ?? "petugas lain";
    const milikSendiri = bentrok.petugasId === auth.sub;
    throw new HttpError(
      422,
      milikSendiri ? `Kamu masih punya sesi terbuka untuk siswa ini (Sesi #${bentrok.id}). Lanjutkan atau batalkan dulu dari notifikasi di atas.` : `Sesi verifikasi untuk siswa ini sedang dipegang oleh ${pemegang} (Sesi #${bentrok.id}). Minta dia menyelesaikan atau membatalkan dulu.`,
      { field: "nis" }
    );
  }
  const now = /* @__PURE__ */ new Date();
  const [sesi] = await db.insert(schema_exports.sesiVerifikasi).values({ nis, petugasId: auth.sub, waktuMulai: now, createdAt: now, updatedAt: now }).returning();
  const debts = await openDebtsFor(nis);
  const dataSiswa = await presentSiswa(nis);
  await recordAudit("verifikasi.open_sesi", { sesi_id: sesi.id, nis }, {
    userId: auth.sub,
    role: auth.role,
    resourceType: "sesi",
    resourceId: sesi.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent
  });
  return Created({
    sesi: {
      id: sesi.id,
      nis: sesi.nis,
      petugas_id: sesi.petugasId,
      waktu_mulai: sesi.waktuMulai,
      waktu_selesai: null,
      total_poin_change: 0,
      items: []
    },
    open_debts: debts,
    siswa: dataSiswa
  });
});

// src/server/routes.generated.ts
var ROUTES = [
  { url: "/api/auth/change-password", segs: ["auth", "change-password"], handler: change_password_default },
  { url: "/api/auth/login", segs: ["auth", "login"], handler: login_default },
  { url: "/api/auth/logout", segs: ["auth", "logout"], handler: logout_default },
  { url: "/api/auth/me", segs: ["auth", "me"], handler: me_default },
  { url: "/api/cron/archive-audit", segs: ["cron", "archive-audit"], handler: archive_audit_default },
  { url: "/api/cron/purge-tokens", segs: ["cron", "purge-tokens"], handler: purge_tokens_default },
  { url: "/api/kategori/check-name", segs: ["kategori", "check-name"], handler: check_name_default },
  { url: "/api/kategori", segs: ["kategori"], handler: kategori_default },
  { url: "/api/me/profile", segs: ["me", "profile"], handler: profile_default },
  { url: "/api/pembelian", segs: ["pembelian"], handler: pembelian_default },
  { url: "/api/produk/[barcode]", segs: ["produk", ":barcode"], handler: barcode_default },
  { url: "/api/produk/[barcode]/log", segs: ["produk", ":barcode", "log"], handler: log_default },
  { url: "/api/produk/[barcode]/unarchive", segs: ["produk", ":barcode", "unarchive"], handler: unarchive_default },
  { url: "/api/produk/check-barcode/[barcode]", segs: ["produk", "check-barcode", ":barcode"], handler: barcode_default2 },
  { url: "/api/produk", segs: ["produk"], handler: produk_default },
  { url: "/api/produk/scan/[barcode]", segs: ["produk", "scan", ":barcode"], handler: barcode_default3 },
  { url: "/api/reset/[reset_id]/apply", segs: ["reset", ":reset_id", "apply"], handler: apply_default },
  { url: "/api/reset/[reset_id]/start", segs: ["reset", ":reset_id", "start"], handler: start_default },
  { url: "/api/reset/[reset_id]/step1", segs: ["reset", ":reset_id", "step1"], handler: step1_default },
  { url: "/api/reward/[id]/archive", segs: ["reward", ":id", "archive"], handler: archive_default },
  { url: "/api/reward/[id]", segs: ["reward", ":id"], handler: id_default },
  { url: "/api/reward/[id]/redeem", segs: ["reward", ":id", "redeem"], handler: redeem_default },
  { url: "/api/reward/[id]/restore", segs: ["reward", ":id", "restore"], handler: restore_default },
  { url: "/api/reward/[id]/toggle-active", segs: ["reward", ":id", "toggle-active"], handler: toggle_active_default },
  { url: "/api/reward/admin", segs: ["reward", "admin"], handler: admin_default },
  { url: "/api/reward", segs: ["reward"], handler: reward_default },
  { url: "/api/setup/bootstrap-admin", segs: ["setup", "bootstrap-admin"], handler: handler2 },
  { url: "/api/siswa/[nis]", segs: ["siswa", ":nis"], handler: nis_default },
  { url: "/api/siswa/[nis]/pembelian", segs: ["siswa", ":nis", "pembelian"], handler: pembelian_default2 },
  { url: "/api/siswa", segs: ["siswa"], handler: siswa_default },
  { url: "/api/siswa/me", segs: ["siswa", "me"], handler: me_default2 },
  { url: "/api/status", segs: ["status"], handler: handler3 },
  { url: "/api/super-admin/audit/search", segs: ["super-admin", "audit", "search"], handler: search_default },
  { url: "/api/super-admin/config", segs: ["super-admin", "config"], handler: config_default },
  { url: "/api/super-admin/coverage", segs: ["super-admin", "coverage"], handler: coverage_default },
  { url: "/api/super-admin/cron", segs: ["super-admin", "cron"], handler: cron_default },
  { url: "/api/super-admin/mode", segs: ["super-admin", "mode"], handler: mode_default },
  { url: "/api/super-admin/recompute-saldo", segs: ["super-admin", "recompute-saldo"], handler: recompute_saldo_default },
  { url: "/api/super-admin/siswa/[nis]/adjust-poin", segs: ["super-admin", "siswa", ":nis", "adjust-poin"], handler: adjust_poin_default },
  { url: "/api/super-admin/siswa/[nis]/timeline", segs: ["super-admin", "siswa", ":nis", "timeline"], handler: timeline_default },
  { url: "/api/super-admin/system-health", segs: ["super-admin", "system-health"], handler: system_health_default },
  { url: "/api/super-admin/transactions/[txId]/reverse", segs: ["super-admin", "transactions", ":txId", "reverse"], handler: reverse_default },
  { url: "/api/super-admin/users/[userId]/delete", segs: ["super-admin", "users", ":userId", "delete"], handler: delete_default },
  { url: "/api/super-admin/users/[userId]/force-logout", segs: ["super-admin", "users", ":userId", "force-logout"], handler: force_logout_default },
  { url: "/api/super-admin/users/[userId]", segs: ["super-admin", "users", ":userId"], handler: userId_default },
  { url: "/api/super-admin/users/[userId]/reset-password", segs: ["super-admin", "users", ":userId", "reset-password"], handler: reset_password_default },
  { url: "/api/super-admin/users/[userId]/suspend", segs: ["super-admin", "users", ":userId", "suspend"], handler: suspend_default },
  { url: "/api/super-admin/users", segs: ["super-admin", "users"], handler: users_default },
  { url: "/api/verifikasi/[id]/force-end", segs: ["verifikasi", ":id", "force-end"], handler: force_end_default },
  { url: "/api/verifikasi/[id]/log", segs: ["verifikasi", ":id", "log"], handler: log_default2 },
  { url: "/api/verifikasi/active", segs: ["verifikasi", "active"], handler: active_default },
  { url: "/api/verifikasi/foto-bukti/presign", segs: ["verifikasi", "foto-bukti", "presign"], handler: presign_default },
  { url: "/api/verifikasi/sesi-terbuka", segs: ["verifikasi", "sesi-terbuka"], handler: sesi_terbuka_default },
  { url: "/api/verifikasi/sesi/[id]/cancel", segs: ["verifikasi", "sesi", ":id", "cancel"], handler: cancel_default },
  { url: "/api/verifikasi/sesi/[id]/commit", segs: ["verifikasi", "sesi", ":id", "commit"], handler: commit_default },
  { url: "/api/verifikasi/sesi/[id]", segs: ["verifikasi", "sesi", ":id"], handler: id_default2 },
  { url: "/api/verifikasi/sesi/[id]/items", segs: ["verifikasi", "sesi", ":id", "items"], handler: items_default },
  { url: "/api/verifikasi/sesi", segs: ["verifikasi", "sesi"], handler: sesi_default }
];

// src/server/router.ts
function segScore(seg) {
  return seg.startsWith(":") ? 0 : 1;
}
var RANKED = ROUTES.map((route) => ({
  route,
  score: route.segs.map(segScore)
}));
RANKED.sort((a, b) => {
  const len = Math.max(a.score.length, b.score.length);
  for (let i = 0; i < len; i++) {
    const x = a.score[i] ?? -1;
    const y = b.score[i] ?? -1;
    if (x !== y) return y - x;
  }
  return 0;
});
function matchRoute(pathname) {
  let p = pathname.split("?")[0];
  if (p === "/api") p = "/";
  else if (p.startsWith("/api/")) p = p.slice(4);
  const parts = p.split("/").filter(Boolean);
  for (const { route } of RANKED) {
    if (route.segs.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < route.segs.length; i++) {
      const seg = route.segs[i];
      if (seg.startsWith(":")) {
        params[seg.slice(1)] = decodeURIComponent(parts[i]);
      } else if (seg !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}
async function dispatch(req, res, pathname) {
  const m = matchRoute(pathname);
  if (!m) {
    res.status(404).json({
      error: "not_found",
      message: `Route tidak ditemukan: ${pathname}`
    });
    return false;
  }
  req.query = { ...req.query ?? {}, ...m.params };
  await m.route.handler(req, res);
  return true;
}
var ROUTE_COUNT = ROUTES.length;

// src/server/entry.ts
async function handler4(req, res) {
  const raw = String(req.url ?? "/");
  const pathname = raw.split("?")[0];
  const clean = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (clean === "/" || clean === "") {
    res.status(404).json({ error: "not_found", message: "Not found." });
    return;
  }
  try {
    await dispatch(req, res, clean);
  } catch (err) {
    if (!res.writableEnded) {
      res.status(500).json({ error: "internal_error", message: err?.message ?? "Internal error." });
    }
  }
}
export {
  handler4 as default
};
