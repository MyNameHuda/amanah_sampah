# =============================================================================
# Amanah Sampah — image produksi untuk Render (free tier)
# =============================================================================
# Struktur dua tahap:
#   Stage 1 (node)  -> build frontend React, hasilnya disalin ke /app/public
#   Stage 2 (php)   -> runtime: nginx + php-fpm + dependency composer
#
# Kenapa dua tahap: node_modules + toolchain Vite berukuran sekitar 400 MB dan
# tidak perlu ada di image produksi. Render free hanya memberi 512 MB RAM, jadi
# ukuran image dan jumlah proses harus dijaga.
#
# nginx + php-fpm dalam SATU container (bukan dua service) karena Render free
# hanya memberi satu web service. Ini juga yang membuat aplikasinya
# single-origin: satu domain menyajikan API sekaligus hasil build frontend,
# jadi tidak ada CORS dan tidak ada domain kedua.
# =============================================================================


# --- Stage 1: build frontend -------------------------------------------------
FROM node:20-alpine AS frontend

WORKDIR /build

# Copy manifest dulu supaya layer cache tidak invalid setiap kali kode berubah.
# Selama package-lock.json tidak berubah, `npm ci` tidak dijalankan ulang.
COPY prototype-frontend/package.json prototype-frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY prototype-frontend/ ./

# Build produksi. Kalau ada error TypeScript, build GAGAL di sini — bagus,
# karena kode broken tidak akan pernah sampai ke produksi.
RUN npm run build


# --- Stage 2: runtime -------------------------------------------------------
FROM php:8.3-fpm-alpine AS runtime

# Ekstensi wajib:
#   pdo_pgsql   -> koneksi ke Neon (PostgreSQL). WAJIB, bukan opsional.
#   pdo_sqlite  -> dipakai seeder & test, dan fallback sebelum DB diganti.
#   fileinfo    -> PhotoUploadService memvalidasi MIME asli file. Tanpa ini
#                  SEMUA upload foto bukti akan ditolak.
#   gd          -> validasi dimensi gambar.
#   intl        -> dipakai Laravel di setiap operasi locale.
#   mbstring    -> wajib di semua aplikasi PHP modern.
#   opcache     -> wajib untuk performa. Tanpa ini PHP meng-compile ulang
#                  setiap request, dan di CPU 0.1 core itu terasa banget.
#   pcntl       -> dibutuhkan oleh artisan schedule:run.
#   zip         -> dipakai composer.
RUN apk add --no-cache \
        nginx \
        supervisor \
        libpq \
        libpng \
        libjpeg-turbo \
        freetype \
        icu-libs \
        libzip \
        oniguruma \
    && docker-php-ext-install -j"$(nproc)" \
        pdo_pgsql \
        pdo_sqlite \
        fileinfo \
        gd \
        intl \
        mbstring \
        opcache \
        pcntl \
        zip \
    && rm -rf /var/cache/apk/*

# --- Konfigurasi PHP --------------------------------------------------------
# Nilai di sini sengaja konservatif: Render free hanya 512 MB RAM. Pool
# php-fpm yang agresif akan memicu OOM-kill karena nginx + php-fpm + OS
# harus muat bersama.
RUN { \
        echo 'memory_limit=192M'; \
        echo 'upload_max_filesize=8M'; \
        echo 'post_max_size=10M'; \
        echo 'max_execution_time=120'; \
        echo 'expose_php=Off'; \
        echo 'date.timezone=Asia/Jakarta'; \
    } > /usr/local/etc/php/conf.d/amanah.ini

# OPcache. `validate_timestamps=0` penting: dengan filesystem container yang
# immutable, revalidasi timestamp tiap request itu pure overhead.
RUN { \
        echo 'opcache.enable=1'; \
        echo 'opcache.enable_cli=0'; \
        echo 'opcache.memory_consumption=64'; \
        echo 'opcache.interned_strings_buffer=8'; \
        echo 'opcache.max_accelerated_files=4000'; \
        echo 'opcache.validate_timestamps=0'; \
        echo 'opcache.save_comments=1'; \
    } > /usr/local/etc/php/conf.d/opcache-amanah.ini

COPY docker/php-www.conf    /usr/local/etc/php-fpm.d/zz-amanah.conf
COPY docker/nginx.conf      /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisord.conf
COPY docker/entrypoint.sh   /usr/local/bin/entrypoint.sh

# --- Composer ---------------------------------------------------------------
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Composer install sebelum copy source: layer vendor/ hanya berubah saat
# composer.lock berubah, bukan setiap kali file PHP disentuh.
# `--no-scripts` dipakai karena artisan belum bisa jalan (belum ada source).
COPY prototype/composer.json prototype/composer.lock* ./
RUN composer install \
        --no-dev \
        --no-scripts \
        --no-autoloader \
        --prefer-dist \
        --no-interaction

COPY prototype/ ./
COPY --from=frontend /build/dist/ ./public/

# Sekarang source sudah ada, baru dump autoloader dengan `--optimize` supaya
# production tidak melakukan classmap scan tiap request. Perintah `package:discover`
# yang biasanya ada di post-autoload-dump TIDAK dipakai di sini: ia butuh .env
# yang di-render hanya tersedia saat container start, bukan saat image build.
RUN composer dump-autoload --optimize --no-dev

# Folder yang wajib writable oleh user non-root.
RUN mkdir -p storage/framework/cache/data \
             storage/framework/sessions \
             storage/framework/views \
             storage/logs \
             storage/app/public \
             bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 80

# Health check. Sengaja pakai nginx (`/up` sudah di-proxy ke Laravel, tapi
# probe ini harus tetap ringan supaya tidak membebani 0.1 CPU).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/up || exit 1

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
