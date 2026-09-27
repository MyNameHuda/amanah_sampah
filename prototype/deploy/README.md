# Panduan Deployment — Amanah Sampah

Dokumen ini adalah runbook lengkap: dari memilih sampai platform sampai aplikasi
live, lengkap dengan perintah yang bisa di-copy-paste.

---

## 1. Ringkasan keputusan arsitektur

Aplikasi iniριksa dilayani sebagai **single-origin**: satu domain menyajikan
API Laravel *dan* hasil build React sekaligus.

```
Browser  →  https://amanah.domain.com
             │
             ├─ /api/*      → Laravel (PHP-FPM)
             ├─ /assets/*   → file statis hasil build Vite
             └─ /*          → index.html (React Router)
```

Kenapa bukan dua domain (frontend di Vercel, backend di Render)?

| | Single-origin | Split (Vercel + Render) |
|---|---|---|
| CORS | Tidak perlu, URL relatif | Perlu konfigurasi, sering bermasalah dengan cookie |
| TLS | Satu sertifikat | Dua sertifikat |
| Cold start | Tidak ada | Render free tidur 15 menit → 30-50 detik delay |
| Deploy | Satu perintah | Dua perintah, dua tempat bisa tidak sinkron |
| Debug | Satu log | Dua log, harus correlates |

Untuk aplikasi sekolah dengan 51 siswa, untung jelas single-origin.

---

## 2. Rekomendasi platform gratis

### 2.1 Opsi utama — Oracle Cloud Always Free (VM)

**Rekomendasi saya.** Bukan karena paling mudah, tapi karena satu-satunya yang
benar-benar gratis *dan* punya persistent disk.

| Keamanan | Detail |
|---|---|
| Biaya | $0 selamanya (Always Free tier) |
| Spec | 4 vCPU ARM, 24 GB RAM, 200 GB block storage |
| Region paling dekat | **Singapore** (`ap-singapore-1`) — penting untuk latency dari Indonesia |
| OS | Ubuntu 22.04/24.04 |

Kenapa ini yang tepat untuk aplikasi ini:

- **Persistent disk.** Aplikasi ini pakai SQLite + foto bukti barcode di
  filesystem. Hampir semua platform PaaS gratis **tidak** memberi persistent
  disk,artinya database dan foto hilang setiap kali container di-restart.
- **Tanpa cold start.** Untuk POS kantin, delay 30-50 detik saat staff
  menekan "Selesaikan Transaksi" tidak bisa diterima.
- **Cron jalan.** `amanah:archive-audit` dan `amanah:purge-expired-tokens`
  butuh scheduler yang benar-benar jalan.
- **Kontrol penuh.** Satu server, satu domain, satu tempat rollback.

**Risiko yang harus kamu tahu:** Oracle pernah *reclaim* instance Always Free
yang dianggap idle (CPU/memory/network terlalu rendah). Mitigasi: aplikasi ini
dipakai setiap hari oleh staff kantin, jadi tidak akan terlihat idle. Tapi
tetap siapkan backup database rutin (lihat §7.3).

### 2.2 Opsi alternatif — Render free + Neon + R2

Kalau kamu **tidak mau menyentuh server sama sekali** (mau semua lewat dashboard
web), ini jalan — dengan pengorbanan yang nyata.

| Komponen | Layanan | Free tier |
|---|---|---|
| Backend | Render Web Service | 750 jam/bulan |
| Frontend | Vercel | Unlimited |
| Database | Neon Postgres | 0.5 GB |
| Foto | Cloudflare R2 | 10 GB |
| Cron | Render Cron | Free |

**Pengorbanan yang harus diterima:**

- ⚠️ **Cold start 30-50 detik.** Render free tidur setelah 15 menit idle.
  mitigated oleh UptimeRobot ping tiap 5 menit.
- ⚠️ **Tidak ada persistent disk** — makanya wajib pakai Neon (bukan SQLite)
  dan R2 (bukan disk lokal).
- ⚠️ Config lebih banyak: 5 dashboard terpisah + CORS + rewrite Vercel.

### 2.3 Yang TIDAK saya rekomendasikan

| Platform | Alasan |
|---|---|
| **Railway** | Free tier sudah dihapus, jadi minimum $5/bulan |
| **Fly.io** | Free tier ditutup untuk akun/organisasi baru |
| **Vercel untuk backend** | Tidak mendukung PHP sama sekali |
| **Shared hosting (000webhost, InfinityFree)** | Tidak ada shell/SSH untuk cron & composer, sangat lambat, tidak cocok Laravel 12 |
| **Heroku** | Sudah berbayar |

---

## 3. Yang sudah disiapkan di repo

Sebelum kamu mulai, berikut file yang sudah ada:

| File | Fungsi |
|---|---|
| `prototype/.env.production.example` | Template semua env var produksi + alasan tiap keputusan |
| `prototype/deploy/nginx-amanah.conf` | Konfigurasi Nginx siap pakai (TLS, cache, rate limit, security headers) |
| `prototype/deploy/deploy.sh` | Script deploy: build → backup DB → rsync → migrate |
| `prototype/routes/web.php` | SPA catch-all (`/login`, `/super/users` tidak 404 saat reload) |
| `prototype/resources/views/spa-missing.blade.php` | Halaman 503 yang informatif kalau frontend belum di-build |
| `prototype-frontend/package.json` → `npm run deploy` | Build + salin frontend ke `prototype/public/` |
| `prototype-frontend/src/vite-env.d.ts` | Deklarasi `VITE_API_BASE_URL` |
| `prototype/tests/Feature/DeploymentReadinessTest.php` | Smoke test jalur deploy (SPA route, no-cache, health) |

---

## 4. Deploy ke Oracle Cloud Always Free

### 4.1 Buat instance (sekali saja)

1. Buka <https://cloud.oracle.com> → **Start with a Free Tier**
2. **Create instance**:
   - Name: `amanah-sampah`
   - Image: **Ubuntu 22.04** (atau 24.04)
   - Shape: **VM.Standard.A1.Flex**
   - OCPU: **4**, Memory: **24 GB**
   - **Boot volume 200 GB** (gratis sampai 200 GB)
   - **Add SSH key** — generate kalau belum punya:
     ```bash
     ssh-keygen -t ed25519 -C "amanah-deploy"
     cat ~/.ssh/id_ed25519.pub   # paste ke form Oracle
     ```
3. **Networking → Virtual Cloud Network → Create VCN**: biarkan default.
4. **PENTING — pilih region Singapore** saat membuat VCN. Region tidak bisa
   diubah setelah instance dibuat, dan Jakarta/region distant akan menambah
   latency 100-200ms per request.
5. Catat **Public IP** instance.

> Kalau yang muncul "Out of capacity" saat memilih A1.Flex: coba region lain
> (Japan/Frankfurt), atau coba lagi beberapa kali — biasanya transient.

### 4.2 Firewall

**Networking → Virtual Cloud Network → Security Lists → Add Ingress Rules**:

| Source | Port | CIDR |
|---|---|---|
| `0.0.0.0/0` | 22 | TCP (SSH) |
| `0.0.0.0/0` | 80 | TCP (HTTP — buat certbot) |
| `0.0.0.0/0` | 443 | TCP (HTTPS) |

> Idealnya batasi SSH ke IP kamu saja, tapi untukVlade pertama pakai 0.0.0.0/0
> lalu kunci password & pasang fail2ban (bagian 4.7).

### 4.3 Install dependency di server

```bash
ssh ubuntu@<IP_SERVER>

sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx unzip git curl software-properties-common

# PHP 8.3 + ekstensi yang dibutuhkan Laravel 12
sudo add-apt-repository -y ppa:ondrej/php
sudo apt install -y php8.3-fpm php8.3-cli php8.3-sqlite3 php8.3-mbstring \
  php8.3-xml php8.3-curl php8.3-zip php8.3-gd php8.3-intl php8.3-bcmath

sudo update-alternatives --set php /usr/bin/php8.3

# Composer
cd /tmp && curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer

# Verifikasi
php -v && composer -V && php -m | grep -E 'sqlite3|pdo_sqlite|gd|mbstring|intl|fileinfo'
```

`pdo_sqlite` dan `fileinfo` itu wajib. Tanpa `fileinfo`, validasi foto bukti
barcode akan menolak semua upload (lihat `PhotoUploadService`).

### 4.4 Ambil kode

```bash
# Ganti dengan URL repo kamu
sudo mkdir -p /var/www/amanah/prototype
sudo chown -R ubuntu:ubuntu /var/www/amanah

git clone https://github.com/USERNAME/amanah_sampah.git /tmp/amanah_src
# atau: rsync -az --exclude node_modules --exclude vendor laptop:/path/ /tmp/amanah_src/

cp -r /tmp/amanah_src/prototype/*      /var/www/amanah/prototype/
cp -r /tmp/amanah_src/prototype-frontend /var/www/amanah/
```

> **Jangan** clone langsung ke `/var/www/amanah/prototype` kalau repo-nya
> berisi `.env` dan database dev — supaya tidak ketimpa tidak sengaja.

### 4.5 Setup aplikasi

```bash
cd /var/www/amanah/prototype

# .env
cp .env.production.example .env
# Edit .env: isi APP_KEY & APP_URL
nano .env
#   APP_KEY=  -> php artisan key:generate --show   (paste hasilnya)
#   APP_URL=https://amanah.domain.com

# Dependency
composer install --no-dev --optimize-autoloader

# Database — WAJIB di persistent disk, jangan di /tmp
mkdir -p database
touch database/database.sqlite
php artisan migrate --force
php artisan storage:link

# Seed akun awal (super admin)
php artisan db:seed --force
```

### 4.6 Permission

```bash
cd /var/www/amanah/prototype
chown -R www-data:www-data storage bootstrap/cache database/database.sqlite
chmod -R 775 storage bootstrap/cache
chmod 664 database/database.sqlite
```

### 4.7 Nginx + TLS

```bash
sudo cp /var/www/amanah/prototype/deploy/nginx-amanah.conf /etc/nginx/sites-available/amanah
sudo nano /etc/nginx/sites-available/amanah
# Ganti amanah.example.com -> domain kamu, DAN baris fastcgi_pass
# ke versi PHP kamu (mis. php8.3-fpm.sock)

sudo ln -s /etc/nginx/sites-available/amanah /etc/nginx/sites-enabled/amanah
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# TLS gratis
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d amanah.domain.com -d www.amanah.domain.com
# Pilih "Redirect all traffic to HTTPS"

# Auto-renew TLS (sudah default dari certbot, tapi pastikan)
sudo systemctl status certbot.timer
```

### 4.8 Cron

```bash
crontab -e
```

```cron
* * * * * cd /var/www/amanah/prototype && php artisan schedule:run >> /dev/null 2>&1
```

Verifikasi:

```bash
cd /var/www/amanah/prototype
php artisan schedule:list
```

Harus muncul `amanah:archive-audit` dan `amanah:purge-expired-tokens`.

### 4.9 Basic hardening

```bash
# 1. Matikan password login untuk ubuntu (pakai key saja)
sudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# 2. Fail2ban
sudo apt install -y fail2ban && sudo systemctl enable --now fail2ban

# 3. UFW
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable

# 4. Auto-update security
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

---

## 5. Deploy frontend (build + sync)

Dari komputer lokal:

```bash
cd prototype-frontend
npm ci
npm run deploy        # = build + salin dist/ ke ../prototype/public/
```

Verifikasi:

```bash
ls ../prototype/public/index.html
ls ../prototype/public/assets/ | head
```

Kalau `public/index.html` tidak ada, buka domain → kamu akan melihat halaman
"Frontend belum di-deploy" yang informatif (bukan 404 misterius).

---

## 6. Domain

Gratis & cocok untuk sekolah:

| Registrar | Harga | Catatan |
|---|---|---|
| **Cloudflare Registrar** | Harga cost | Tapi TIDAK gratis, hanya sold-at-cost |
| **Namecheap** | ~Rp 150.000/thn | `.id` domain resmi-imiah lebih mahal |
| **Google Domains** | — | Alamatnya sudah di-redirect ke Squarespace, Avoid |
| **Pandi (.id)** | ~Rp 250.000/thn | Domain `.id` resmi, Recommended untuk sekolah Indonesia |

Alternatif tanpa beli domain: pakai **nip.io** atau **sslip.io** yang
menghasilkan subdomain gratis dari IP server:

```
http://203.0.113.10.nip.io
```

Cukup untuk testing, **jangan** untuk produksi — tidak punya HTTPS dari
Let's Encrypt wildcard dengan mudah, dan terlihat unprofessional.

---

## 7. Verifikasi & operasional

### 7.1 Smoke test setelah deploy

Jalankan **dari komputer lokal**, bukan dari server (menguji jalur internet
sesungguhnya):

```bash
DOMAIN=https://amanah.domain.com

curl -sI $DOMAIN/up | head -1              # harus 200
curl -s  $DOMAIN/ | head -3                # JSON metadata
curl -sI $DOMAIN/login | head -1           # harus 200 (SPA catch-all)
curl -s  $DOMAIN/api/status                # status endpoint

# Login harus menolak password salah
curl -s -X POST $DOMAIN/api/auth/login \
  -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -d '{"login":"super@amanah.id","password":"SALAH"}' | head -c 200
```

Lalu cek di browser:

- [ ] `/login` terbuka, tidak 404
- [ ] Refresh di `/login` — masih terbuka (uji catch-all)
- [ ] Login sebagai tiap role: admin, staff, petugas, Longitude-longitude Camtrik
- [ ] Staff kantin: lookup NIS → scan barcode → finalize
- [ ] **Kamera scanner**: tombol scan harus bisa diakses (butuh HTTPS!)
- [ ] Petugas: buka sesi → add item → commit
- [ ] Santri: lihat poin, redeem reward
- [ ] Super admin: System Health, toggle mode, suspend/unsuspend user
- [ ] Upload foto bukti barcode berhasil

### 7.2 Monitoring

**UptimeRobot** (gratis, 50 monitor):

1. <https://uptimerobot.com> → sign up
2. **Add New Monitor**:
   - Type: HTTP(s)
   - URL: `https://DOMAIN/up`
   - Interval: **5 minutes**
   - Alert contacts: email kamu
3. Timeout: 30 detik

Penting: interval 5 menit juga mencegah service|idle|tidur di platform
yang memakai sleep (penting kalau kamu pilih Opsi B).

### 7.3 Backup

SQLite adalah **satu file** — backup-nya gampang, tapi kalau lupa, data hilang.

```bash
# Backup harian, simpan 14 hari
crontab -e
```

```cron
30 2 * * * cd /var/www/amanah/prototype && \
  sqlite3 database/database.sqlite ".backup 'backups/db-$(date +\%Y\%m\%d).sqlite'" && \
  find backups -name 'db-*.sqlite' -mtime +14 -delete
```

```bash
mkdir -p /var/www/amanah/prototype/backups
sudo chown ubuntu:ubuntu /var/www/amanah/prototype/backups
```

**Backup ke tempat lain juga.** Kalau instance Oracle di-reclaim, data di
disk ikut hilang. Opsi gratis:

| Cara | Cara |
|---|---|
| **Backblaze B2** | 10 GB gratis |
| **rclone → Google Drive** | Gratis, 15 GB |
| **Kirim ke email sendiri** | Untuk DB kecil (< 1 MB) suffice |

```bash
# Contoh: rclone sync harian ke Google Drive
rclone config   # setup sekali
30 3 * * * rclone sync /var/www/amanah/prototype/database /gdrive:amanah-db
```

> **Restore:**
> ```bash
> cp backups/db-20260927.sqlite database/database.sqlite
> php artisan optimize:clear
> ```

---

## 8. Update aplikasi (deploy berikutnya)

```bash
# Dari komputer lokal, edit deploy.sh dulu: isi APP_DIR & REMOTE_HOST
./prototype/deploy/deploy.sh --dry-run   # lihat apa yang akan terjadi
./prototype/deploy/deploy.sh
```

Yang terjadi:

1. `npm ci && npm run build` — build frontend + cek TypeScript
2. **Backup SQLite** di server dengan timestamp
3. `rsync` kode Laravel, **tidak** menyentuh `.env`, `vendor/`, `storage/`,
   `database/*.sqlite`
4. Sync `dist/` → `public/`
5. `composer install`, `storage:link`, `optimize:clear`, `migrate --force`,
   cache config/route/view

### Rollback

Kalau deploy baru broke sesuatu:

```bash
# 1. Lihat backup yang tersedia
ssh ubuntu@SERVER 'ls -lh /var/www/amanah/prototype/database/*.sqlite'

# 2. Restore database (kalau migrasi mengubah skema)
ssh ubuntu@SERVER 'cd /var/www/amanah/prototype && \
  cp database/predeploy-20260927-153000.sqlite database/database.sqlite && \
  php artisan optimize:clear'

# 3. Rollback kode — kalau deploy-nya yang salah
cd /path/amanah_sampah
git log --oneline -5
git checkout <commit-sebelumnya>
./prototype/deploy/deploy.sh --skip-build
```

> Kalau migrasi sudah jalan dan kodenya di-rollback ke versi lama, sering
> perlu `php artisan migrate:rollback` supaya skema DB cocok lagi.

---

## 9. Checklist pra-go-live

**Server**

- [ ] `APP_DEBUG=false` di `.env`
- [ ] `APP_KEY` terisi (32 karakter base64)
- [ ] `APP_URL` = domain produksi, tanpa trailing slash
- [ ] `.env` permission 600, tidak masuk git
- [ ] `php artisan config:cache` sudah dijalankan
- [ ] Nginx: `nginx -t` lolos
- [ ] TLS aktif, `http://` redirect ke `https://`
- [ ] Cron terpasang, `schedule:list` menampilkan 2 command

**Aplikasi**

- [ ] Ganti password semua akun default (terutama super admin)
- [ ] Ganti `APP_NAME` dari "Laravel" jadi "Amanah Sampah"
- [ ] Hapus data demo: `php artisan migrate:fresh --seed`
- [ ] Cek `storage/app/public/barcode-evidence/` bisa ditulis
- [ ] Verifikasi permission `storage/` & `bootstrap/cache/`

**Data**

- [ ] Backup database sudah pernah dicoba di-restore (backup yang tidak pernah
      di-restore bukan backup)
- [ ] Cron backup harian terpasang

**Monitoring**

- [ ] UptimeRobot monitor aktif, email alert dites
- [ ] Alamat email notifikasi benar

---

## 10. Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| Halaman putih setelah deploy | `index.html` ter-cache browser/CDN. Hard reload (Ctrl+Shift+R). Kalau masih, `php artisan optimize:clear`. |
| 404 di `/login` saat refresh | SPA catch-all belum aktif. Cek `php artisan route:list \| grep any` |
| 503 "Frontend belum di-deploy" | `npm run deploy` di `prototype-frontend` belum dijalankan, atau `rsync` gagal. |
| 500 di semua halaman | `APP_KEY` kosong, atau permission `storage/`. Cek `storage/logs/laravel.log`. |
| Login sukses lalu langsung logout | `SESSION_SECURE_COOKIE=true` tapi diakses via HTTP. Wajib HTTPS. |
| Kamera scanner tidak jalan | Butuh HTTPS. `localhost` dikecualikan, IP server tidak. |
| "419 CSRF token mismatch" | Session kedaluwarsa. Cek jam server (`timedatectl`). |
| SQLite "database is locked" | Dua proses tulis bersamaan. `journal_mode=WAL` sudah aktif? |
| Upload foto ditolak | `fileinfo` belum terpasang, atau folder `barcode-evidence` tidak writable. |
| 429 Too Many Requests | Rate limit. Naikkan `rate=30r/s` di `nginx-amanah.conf` atau `APP_ENV` masih `local`. |
| 503 dari Oracle | Instance di-reclaim karena idle. Restore dari backup, buat instance baru. |

Laravel log:

```bash
tail -f /var/www/amanah/prototype/storage/logs/laravel-$(date +%Y-%m-%d).log
```

Nginx log:

```bash
sudo tail -f /var/log/nginx/amanah.error.log
```

---

## 11. Ringkasan perintah harian

```bash
# Cek status
systemctl status nginx php8.3-fpm

# Restart setelah ubah .env
cd /var/www/amanah/prototype && php artisan optimize:clear && php artisan config:cache

# Lihat log
tail -f /var/www/amanah/prototype/storage/logs/laravel-*.log

# Manual cron (untuk test)
php artisan amanah:archive-audit
php artisan amanah:purge-expired-tokens --days=30

# Login database untuk inspect
sqlite3 /var/www/amanah/prototype/database/database.sqlite
```

---

## 12. Dokumentasi terkait

- `docs/02-prd.md` — kebutuhan produk
- `docs/03-erd.md` — skema database
- `DECISION-LOG.md` — keputusan bisnis (D1-D18), termasuk aturan blokir poin
- `prototype/routes/api.php` — daftar endpoint lengkap
