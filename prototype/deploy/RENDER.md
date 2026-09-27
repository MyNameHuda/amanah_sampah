# Panduan Deployment — Render (100% gratis, tanpa kartu kredit)

Jalur ini memenuhi syarat: **tidak ada satu pun layanan yang meminta kartu kredit.**

| Layanan | Role | Gratis | Kartu kredit? |
|---|---|---|---|
| Render | Backend + frontend (satu service) | 750 jam/bulan | Tidak |
| Neon | Database PostgreSQL | 0.5 GB, permanen | Tidak |
| Cloudflare R2 | Foto bukti barcode | 10 GB | Tidak |
| UptimeRobot | Pings supaya tidak tidur | 50 monitor | Tidak |

Total biaya: **$0.**

---

## Kenapa Render, bukan Oracle Cloud

Oracle Always Free lebih kuat (VM 4 CPU, persistent disk, tanpa cold start), tapi
**wajib kartu kredit** untuk verifikasi identitas. Karena itu tidak dipakai di
jalur ini.

Konsekuensi yang harus kamu terima:

| Batas | Dampak untuk aplikasi ini |
|---|---|
| **Cold start 30-50 detik** | Service tidur setelah 15 menit idle. UptimeRobot (langkah 6) mengatasinya. |
| **Tanpa persistent disk** | Wajib pakai Neon untuk database dan R2 untuk foto. Tidak bisa pakai SQLite. |
| **Tanpa shell / SSH** | Tidak bisa `php artisan tinker`. Jalur admin awal lewat env var (sudah disiapkan). |
| **5 GB bandwidth/bulan** | Cukup untuk 51 siswa. Habis? Service **di-suspend** (bukan ditagih). |

---

## Arsitektur

```
Browser
   │  https://amanah-sampah.onrender.com
   ▼
Render free web service  (Docker)
   ├─ nginx  ── /assets/*   → file statis (cache 1 tahun, immutable)
   │          ── /api/*      → php-fpm → Laravel
   │          ── /*          → index.html (React Router)
   ├─ php-fpm + Laravel 12
   └─ cron loop (schedule:run tiap menit)
        │
        ├── Neon PostgreSQL   (data: user, poin, transaksi, audit)
        └── Cloudflare R2     (foto bukti barcode)
```

Satu domain menyajikan API **dan** frontend. Tidak ada CORS, tidak ada domain
kedua, tidak ada proxy berlapis.

---

## Langkah 1 — Push kode ke GitHub (3 menit)

```bash
cd C:\Users\bangn\Documents\Kerja\amanah_sampah
git init
git add .
git commit -m "feat: deploy config untuk Render free"
```

Buat repo di <https://github.com/new>, lalu:

```bash
git remote add origin https://github.com/USERNAME/amanah_sampah.git
git push -u origin main
```

**Penting:** `render.yaml` ada di root repo, bukan di dalam `prototype/`.

---

## Langkah 2 — Buat database di Neon (3 menit)

1. <https://console.neon.tech/signup> — daftar pakai GitHub/Google
2. **Create a project** → nama `amanah-sampah`
3. **Region: Singapore (ap-southeast-1)** ← penting untuk latency dari Indonesia
4. Selesai. Klik **Connect** di dashboard.

Yang perlu dicatat (semua ada di panel Connection String):

| Yang dicatat | Nama env var di Render |
|---|---|
| **Host** | `DB_HOST` |
| **Port** | `DB_PORT` (biasanya `5432`) |
| **Database** | `DB_DATABASE` |
| **User** | `DB_USERNAME` |
| **Password** | `DB_PASSWORD` |

> **Pakai yang "Pooled connection"!** Untuk serverless, koneksi langsung
> bisa exhausting connection limit-nya. Neon menyediakan endpoint khusus itu
> di panel yang sama.

---

## Langkah 3 — Buat bucket di Cloudflare R2 (5 menit)

1. <https://dash.cloudflare.com/sign-up> — daftar (tanpa kartu kredit)
2. Menu kiri → **R2** → **Create bucket**
   - Bucket name: `amanah-bukti`
   - Location: **Asia Pacific**
3._bucket R2 → **Settings** → **Public access**:
   - Pilih **Connect Domain** jika mau domain sendiri, ATAU
   - Pilih **r2.dev** (gratis, URL langsung dapat, cukup untuk aplikasi ini)
   - Aktifkan, lalu **copy** public URL-nya → ini jadi `AWS_URL`
     - Bentuknya: `https://amanah-bukti.<xxxx>.r2.dev`
4. Menu **R2** → **Manage R2 API Tokens** → **Create API Token**
   - Permissions: **Object Read & Write**
   - Specify bucket: `amanah-bukti` (JANGAN pilih "All buckets")
   - Klik **Create**, lalu **copy** dua nilai:
     - **Access Key ID** → `AWS_ACCESS_KEY_ID`
     - **Secret Access Key** → `AWS_SECRET_ACCESS_KEY` ⚠️ **sekali saja, tidak bisa dilihat lagi**
5. Buka tab **Account Details** di bawah R2 → copy **Account ID** dan **R2 API Endpoint** (format `https://<account-id>.r2.cloudflarestorage.com`) → jadi `AWS_ENDPOINT`

---

## Langkah 4 — Generate APP_KEY (1 menit)

Di komputer lokal:

```bash
cd C:\Users\bangn\Documents\Kerja\amanah_sampah\prototype
php artisan key:generate --show
```

Copy hasilnya (pola `base64:xxxxxxxx...`). Ini nilai `APP_KEY`.

---

## Langkah 5 — Deploy ke Render (10 menit)

1. <https://dashboard.render.com> → **Get Started** (pakai GitHub)
2. **New** → **Blueprint**
3. Pilih repo `amanah_sampah`
4. Render membaca `render.yaml` dan membuat service `amanah-sampah`
5. Render akan meminta env var yang ditandai `sync: false`. Isi **9 nilai**:

| Env var | Nilainya |
|---|---|
| `APP_KEY` | Hasil langkah 4 |
| `APP_URL` | **Temporarily** `https://amanah-sampah.onrender.com` (diperbaiki di langkah 7) |
| `DATABASE_URL` | Pooled connection string dari Neon (langkah 2) |
| `DB_HOST` | Dari Neon |
| `DB_PORT` | Dari Neon |
| `DB_DATABASE` | Dari Neon |
| `DB_USERNAME` | Dari Neon |
| `DB_PASSWORD` | Dari Neon |
| `AWS_ACCESS_KEY_ID` | Dari Cloudflare (langkah 3) |
| `AWS_SECRET_ACCESS_KEY` | Dari Cloudflare (langkah 3) |
| `AWS_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `AWS_URL` | `https://amanah-bukti.<xxxx>.r2.dev` |
| `BOOTSTRAP_ADMIN_EMAIL` | Email super admin yang kamu mau (mis. `super@sekolah.sch.id`) |
| `BOOTSTRAP_ADMIN_PASSWORD` | **Minimal 12 karakter, ada huruf besar + kecil + angka** |

   > Contoh yang bisa dipakai: `AmanahSampah2026Bogor`
   > **Ganti dengan milikmu sendiri.** Password ini akan jadi password
   > super admin pertamamu.

6. Klik **Apply** → deploy berjalan

### Kalau build gagal

Deploy pertama kemungkinan butuh 1-2 putaran perbaikan. Buka
**service → Events**, cari baris merah, lalu kirim screenshot atau teks
errornya ke saya. Docker build di mesin lokal tidak bisa saya test
(Docker Desktop tidak terpasang di sini), jadi error pertama yang muncul
itu normal.

Cek yang paling sering gagal:
- Ekstensi PHP gagal compile — biasanya kurang library Alpine (`libjpeg-turbo`, `icu-libs`, `libzip`)
- `composer install` gagal → `composer.lock` tidak sinkron dengan `composer.json`
- `/up` 503 → migrasi gagal; cek **Logs** untuk pesan dari entrypoint

---

## Langkah 6 — Supaya tidak tidur (5 menit)

1. <https://uptimerobot.com> → daftar (gratis)
2. **Add New Monitor**:
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `Amanah Sampah`
   - URL: `https://amanah-sampah.onrender.com/up`
   - Monitoring Interval: **5 minutes**
   - Timeout: `60` detik (cold start bisa 50 detik, jadi jangan terlalu kecil)
3. Klik **Create Monitor**

Ini melayani dua tujuan: memberi tahu kalau aplikasi down, **dan** mencegah
Renderollip service supaya staff tidak menunggu 30-50 detik tiap kali mau
mulai shift.

---

## Langkah 7 — Perbaiki APP_URL (2 menit)

Render memberi URL final setelah deploy pertama sukses. Biasanya URL-nya sudah
mengikuti nama service, tapi cek dan samakan:

1. Buka service → **Environment**
2. Set `APP_URL` = URL persis yang Render tampilkan
3. **Save & Deploy**

`APP_URL` dipakai Sanctum untuk link dan untuk `secure()`. Salah setting →
cookie session ditolak browser dan user langsung ter-logout.

---

## Langkah 8 — Login dan amankan (3 menit)

1. Buka `https://amanah-sampah.onrender.com/login`
2. Login pakai email + password dari `BOOTSTRAP_ADMIN_*`
3. **GANTI password** dari menu profil ( compulsory )
4. **Hapus env var `BOOTSTRAP_ADMIN_PASSWORD`** → Save & Deploy
   - Kalau dibiarkan, password itu tersimpan selamanya di dashboard Render
     dan bisa dibaca siapa pun yang punya akses ke project

---

## Langkah 9 — Verifikasi (10 menit)

Jalankan dari komputer lokal:

```bash
D=https://amanah-sampah.onrender.com

curl -sI $D/up    | head -1    # harus 200
curl -sI $D/login | head -1    # harus 200 (uji SPA catch-all)
curl -s  $D/api/status          # harus JSON
```

Lalu di browser, cek satu per satu:

**Super Admin**
- [ ] System Health terbuka, angka Database Size & Photo Storage tampil
- [ ] Toggle Maintenance Mode ON → OFF, badge berubah warna
- [ ] Configuration → edit threshold poin
- [ ] Users → search user, suspend, cek badge berubah

**Admin Kesantrian**
- [ ] Daftar siswa tampil, search jalan
- [ ] Tambah produk & kategori
- [ ] Reset poin siswa (pakai siswa yang status BLOCKED)

**Staff Kantin**
- [ ] Lookup NIS → data siswa muncul
- [ ] Scan barcode (atau ketik manual) → masuk keranjang
- [ ] Selesaikan transaksi → toast sukses, poin berubah
- [ ] **Upload foto bukti** ← ini yang belum pernah teruji, paling penting

**Petugas**
- [ ] Buka sesi verifikasi
- [ ] Tambah item → commit → poin naik
- [ ] Cek "Hutang yang Tersisa" berkurang

**Santri**
- [ ] Lihat saldo poin, riwayat
- [ ] Coba redeem reward (dan lihat-badge alasan kalau tidak bisa)

**Umum**
- [ ] Ganti password dari menu profil
- [ ] Refresh di `/login` — harus tetap terbuka, bukan 404

---

## Pemeliharaan

### Update kode

Push ke branch utama → Render auto-deploy (bisa ±5 menit).

Kalau deploy gagal, buka **Events** → **Rollback** ke deploy sebelumnya.

### Rotasi password admin

Kalau lupa atau perlu ganti: Super Admin → **User Management** → **Reset PW**.

### Menonaktifkan mode maintenance

Super Admin → **System Health** → toggle **Maintenance Mode**. T Ramadan saat
gereja libur, aplikasi bisa dikunci total tanpa kehilangan data.

### Kalau container sering restart

`PLAN=free` punya 750 jam/bulan. Kalau habis, Render **menyuspend** semua
free service sampai bulan berikutnya. Gejalanya: aplikasi tidak merespons
sama sekali. Normalnya 750 jam itu cukup — 1 service yang aktif 24/7 saja
memakai 744 jam.

---

## Troubleshoot cepat

| Gejala | Penyebab & solusi |
|---|---|
| Build gagal di `docker-php-ext-install` | Kurang library Alpine. Copy pesan error lengkap ke saya. |
| Build gagal di `npm run build` | Ada error TypeScript. Jalankan `npm run build` di lokal untuk melihat detailnya. |
| 503 "Frontend belum di-deploy" | `public/index.html` tidak masuk image. Cek apakah `docker/` ikut ter-`COPY` dan build context benar. |
| 500 semua halaman | `APP_KEY` kosong/salah, atau `DB_HOST` salah. Cek **Logs**. |
| Login langsung logout | `SESSION_SECURE_COOKIE=true` tapi diakses via http. Pastikan pakai `https://`. |
| Foto bukti upload gagal | `fileinfo` tidak terpasang di image, atau R2 env salah. Cek **Logs**. |
| Kamera scanner tidak jalan | Butuh HTTPS. Render sudah menyediakan TLS otomatis. |
| "419 CSRF token mismatch" | `APP_URL` tidak sama dengan URL asli. Perbaiki, Save & Deploy. |
| Halaman putih setelah deploy | Hard reload (Ctrl+Shift+R). `index.html` sengaja di-set no-cache, jadi seharusnya jarang terjadi. |
| 429 Too Many Requests | Rate limit nginx (30r/s). Naikkan di `docker/nginx.conf` kalau perlu. |
| Tidak bisa login sama sekali | Cek **Logs** untuk pesan bootstrap. Password weak akan ditolak dengan pesan jelas. |
| Render suspend service | Kuota 750 jam habis, atau 5 GB bandwidth habis. Tunggu bulan depan. |

---

## Command yang tersedia

| Command | Kapan dipakai |
|---|---|
| `amanah:archive-audit` | Otomatis bulanan oleh cron internal. |
| `amanah:purge-expired-tokens --days=30` | Otomatis harian oleh cron internal. |
| `amanah:backfill-poin-ledger` | Migrasi data lama. Jalankan sekali kalau perlu. |
| `amanah:bootstrap-admin` | Otomatis dari entrypoint. Aman dijalankan berkali-kali. |
| `amanah:create-super-admin` | Untuk menambah admin dari mesin lokal. |

Cron berjalan di dalam container sebagai loop `schedule:run` tiap menit
(`ENABLE_INTERNAL_CRON=true`). Kalau kamu matikan env itu, dua command
otomatis tersebut tidak akan jalan lagi.

---

## Kalau nanti mau pindah ke hosting yang lebih kuat

Semua yang dibuat di sini (Dockerfile, nginx, entrypoint) tidak terikat
Render. Kalau suatu saat ada anggaran $7/bulan:

- **Render Starter** ($7): hilang cold start, dapat persistent disk, dapat
  shell, dan bisa ganti database ke SQLite lokal lagi.
- **Oracle Always Free**: paling murah, tapi minta kartu kredit.

Migrasinya gampang karena arsitekturnya single-origin + Docker — tinggal
build image yang sama di tempat lain.
