#!/usr/bin/env bash
# =============================================================================
# Script deploy Amanah Sampah (single-origin, Linux)
# =============================================================================
# Jalankan dari komputer lokal yang punya rsync & ssh:
#   ./deploy/deploy.sh
#
# Yang dilakukan:
#   1. Build frontend (tsc + vite) di lokal
#   2. Salin dist/ ke server: public/
#   3. rsync kode Laravel (tanpa .env, vendor, storage)
#   4. Di server: composer install, migrate, cache, storage:link
#
# Sifat penting: script ini TIDAK menyentuh .env dan TIDAK menghapus database.
# Migrasi dijalankan dengan --force supaya aman di production.
#
# Flag:
#   --skip-build   lewati build frontend (deploy backend saja)
#   --dry-run      tampilkan perintah tanpa eksekusi
# =============================================================================
set -euo pipefail

# --- Konfigurasi -------------------------------------------------------------
# Ganti nilai-nilai ini.
APP_DIR="/var/www/amanah"          # direktori tempat project di server
REMOTE_HOST="ubuntu@YOUR_SERVER_IP"
REMOTE_PROJECT="${APP_DIR}/prototype"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND_DIR="${REPO_ROOT}/prototype-frontend"

SKIP_BUILD=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --dry-run)    DRY_RUN=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [dry-run] $*"
  else
    echo "  \$ $*"
    "$@"
  fi
}

echo "=============================================="
echo " Deploy Amanah Sampah"
echo " target : ${REMOTE_HOST}:${REMOTE_PROJECT}"
echo " mode   : $([ "$DRY_RUN" -eq 1 ] && echo DRY-RUN || echo REAL)"
echo "=============================================="

# --- 1. Build frontend -------------------------------------------------------
if [ "$SKIP_BUILD" -eq 0 ]; then
  echo ""
  echo "[1/4] Build frontend"
  cd "$FRONTEND_DIR"
  run npm ci
  run npm run build

  if [ ! -f "${FRONTEND_DIR}/dist/index.html" ]; then
    echo "ERROR: dist/index.html tidak ada — build gagal?" >&2
    exit 1
  fi
else
  echo ""
  echo "[1/4] Build frontend — DILEWATI (--skip-build)"
  FRONTEND_DIR=""   # kosongkan supaya tidak ada sync
fi

echo ""
echo "[2/4] Cek koneksi SSH"
run ssh -o ConnectTimeout=10 "${REMOTE_HOST}" "echo OK"

# --- 3. Backup database SEBELUM migrasi --------------------------------------
# Ini satu-satunya salinan data produksi. Kalau migrasi gagal di tengah,
# ini yang bisa restore.
echo ""
echo "[3/4] Backup database di server"
BACKUP_NAME="predeploy-$(date +%Y%m%d-%H%M%S).sqlite"
run ssh "${REMOTE_HOST}" "cp '${REMOTE_PROJECT}/database/database.sqlite' \
  '${REMOTE_PROJECT}/database/${BACKUP_NAME}' && ls -lh '${REMOTE_PROJECT}/database/${BACKUP_NAME}'"
echo "  backup: ${REMOTE_PROJECT}/database/${BACKUP_NAME}"

# --- 4. Sinkronisasi + setup server ------------------------------------------
echo ""
echo "[4/4] Sync kode & jalankan setup di server"

# rsync kode Laravel.
# - exclude .env         : tidak boleh ditimpa. Menimpa .env = kehilangan APP_KEY
#                          = semua session & token invalid, app tidak jalan.
# - exclude vendor/      : jauh lebih cepat; di-install di server.
# - exclude storage/     : berisi database sqlite + foto bukti. Ini DATA,
#                          bukan kode. Menimpanya = kehilangan data produksi.
# - exclude database/*.sqlite : alasan sama seperti storage/.
EXCLUDES=(
  --exclude='.env'
  --exclude='vendor/'
  --exclude='node_modules/'
  --exclude='storage/'
  --exclude='storage'
  --exclude='database/*.sqlite'
  --exclude='.git/'
  --exclude='deploy/../.git'
)

run rsync -az --delete "${EXCLUDES[@]}" \
  "${REPO_ROOT}/prototype/" "${REMOTE_HOST}:${REMOTE_PROJECT}/"

# Frontend build -> public/ (setelah sync, karena rsync --delete tadi
# akan menghapus isi public/ yang ada).
if [ -n "$FRONTEND_DIR" ]; then
  echo "  sync frontend dist -> public/"
  run rsync -az --delete \
    "${FRONTEND_DIR}/dist/" "${REMOTE_HOST}:${REMOTE_PROJECT}/public/"
fi

echo ""
echo "  setup di server..."
run ssh "${REMOTE_HOST}" "cd '${REMOTE_PROJECT}' && \
  set -e && \
  echo '  - composer install' && composer install --no-dev --optimize-autoloader --no-interaction --quiet && \
  echo '  - storage:link' && php artisan storage:link --force && \
  echo '  - clear cache' && php artisan optimize:clear --quiet && \
  echo '  - migrate' && php artisan migrate --force --no-interaction && \
  echo '  - config:cache' && php artisan config:cache --quiet && \
  echo '  - route:cache' && php artisan route:cache --quiet && \
  echo '  - view:cache' && php artisan view:cache --quiet && \
  echo '  - queue worker restart' && php artisan queue:restart || true"

echo ""
echo "=============================================="
echo " Deploy selesai."
echo " Verifikasi:"
echo "   curl -sI https://DOMAIN/up | head -1"
echo "   curl -s  https://DOMAIN/ | head -3"
echo ""
echo " Kalau ada masalah, rollback:"
echo "   ssh ${REMOTE_HOST} 'cd ${REMOTE_PROJECT} && \\"
echo "     cp database/${BACKUP_NAME} database/database.sqlite && php artisan optimize:clear'"
echo "=============================================="
