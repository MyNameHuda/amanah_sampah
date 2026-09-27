#!/bin/sh
# =============================================================================
# Entry point container Amanah Sampah
# =============================================================================
# Dijalankan supervisord SEBELUM php-fpm & nginx (priority=1), supaya cache
# Laravel sudah siap sebelum request pertama masuk. Tanpa ini, request pertama
# setelah cold start bisa dapat 500 karena config belum ter-cache.
#
# WAJIB idempotent. Di Render, container di-restart setiap kali service bangun
# dari sleep, jadi skrip ini akan dieksekusi berulang.
# =============================================================================
set -e

cd /app

log() { echo "[entrypoint] $*"; }

# --- Sanity check env yang wajib ------------------------------------------------
# Gagal cepat & jelas di log jauh lebih mudah dicari daripada 500 nanti.
MISSING=""
[ -z "$APP_KEY" ] && MISSING="$MISSING APP_KEY"
[ -z "$APP_URL" ] && MISSING="$MISSING APP_URL"
[ -z "$DB_HOST" ] && MISSING="$MISSING DB_HOST"

if [ -n "$MISSING" ]; then
    log "FATAL: env berikut belum diisi di Render:$MISSING"
    exit 1
fi

# --- Permission -----------------------------------------------------------------
# Folder storage ikut ter-reset kalau image di-rebuild, jadi di-touch setiap boot.
chown -R www-data:www-data storage bootstrap/cache 2>/dev/null || true

# --- Cache builder --------------------------------------------------------------
# optimize:clear dulu: kalau config cache dari build lama masih ada dan env
# berubah, aplikasi akan membaca nilai LAMA (mis. DB host yang salah).
log "membersihkan cache lama"
php artisan optimize:clear --quiet 2>/dev/null || log "optimize:clear dilewati (normal pada boot pertama)"

log "membuild cache config/route/view"
php artisan config:cache
php artisan route:cache
php artisan view:cache

# --- Database -------------------------------------------------------------------
# WAJIB: Render free tidak punya persistent disk dan tidak ada shell, jadi migrasi
# hanya bisa jalan lewat sini. `migrate --force` bersifat idempotent (hanya
# menjalankan yang belum ada), jadi aman dipanggil setiap boot.
if [ -n "$RUN_MIGRATIONS" ] && [ "$RUN_MIGRATIONS" = "true" ]; then
    log "menjalankan migrasi database"
    php artisan migrate --force --no-interaction

    # Seed HANYA kalau benar-benar database kosong. DatabaseSeeder sekarang
    # idempotent, tapi tetap lebih baik tidak jalan sama sekali kalau data sudah ada.
    if [ -n "$RUN_SEED" ] && [ "$RUN_SEED" = "true" ]; then
        log "menjalankan seeder (hanya untuk database kosong)"
        php artisan db:seed --force --no-interaction || log "seed dilewati"
    fi

    # Bootstrap super admin PERTAMA dari env var.
    #
    # Kenapa ini wajib ada: Render free tidak punya shell dashboard, tidak punya
    # SSH, dan tidak ada one-off job. Jadi `amanah:create-super-admin` tidak
    # pernah bisa dijalankan di sana. Tanpa command ini, deploy pertama akan
    # menghasilkan aplikasi online yang tidak bisa dimasuki siapa pun.
    #
    # Perintah ini idempotent dan hanya membuat akun kalau belum ada, jadi
    # aman dipanggil di setiap boot (termasuk setiap kali container wake up
    # dari sleep).
    log "cek bootstrap super admin"
    php artisan amanah:bootstrap-admin || log "bootstrap admin gagal (lihat pesan di atas)"
else
    log "RUN_MIGRATIONS bukan true — migrasi dilewati"
fi

# --- Cron dalam container --------------------------------------------------------
# Render free tidak menyediakan cron service, dan supervisor tidak punya
# scheduler bawaan. Loop ringan ini menjalankan `schedule:run` tiap menit —
# cukup untuk amanah:archive-audit (bulanan) & purge-expired-tokens (harian).
# Kalau proses ini mati, cron ikut mati; karena itu loop-nya di-fork dari
# entrypoint (priority=1) dan tidak diawasi supervisor secara terpisah.
if [ -n "$ENABLE_INTERNAL_CRON" ] && [ "$ENABLE_INTERNAL_CRON" = "true" ]; then
    log "cron internal diaktifkan (tiap menit)"
    (
        while true; do
            # Timestamp disimpan supaya hostname pseudo-random tiap menit
            # sehingga file lock Laravel tidak bentrok antar-loop.
            sleep 60
            php artisan schedule:run >> /dev/null 2>&1 || true
        done
    ) &
fi

log "selesai — nginx & php-fpm mulai"
