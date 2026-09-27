<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\PembelianController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ResetController;
use App\Http\Controllers\Api\RewardController;
use App\Http\Controllers\Api\SantriController;
use App\Http\Controllers\Api\SuperAdminController;
use App\Http\Controllers\Api\VerifikasiController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

// Public
// [R3] Rate limit login: max 5 percobaan per menit per IP
Route::middleware('throttle:login')->post('/auth/login', [AuthController::class, 'login']);

// Public status endpoint (no auth) — frontend pake buat detect maintenance mode
Route::get('/status', function () {
    $maintenance = DB::table('config_settings')->where('key', 'is_maintenance')->value('value');
    $readonly = DB::table('config_settings')->where('key', 'is_readonly')->value('value');
    return response()->json([
        'is_maintenance' => filter_var($maintenance, FILTER_VALIDATE_BOOLEAN),
        'is_readonly' => filter_var($readonly, FILTER_VALIDATE_BOOLEAN),
        'app_version' => 'v1.1',
        'checked_at' => now()->toIso8601String(),
    ]);
});

// Authenticated
Route::middleware(['auth:sanctum'])->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware('throttle:admin-destructive');
    Route::get('/auth/me', [AuthController::class, 'me']);
    // [R3] Rate limit change password: 3 per menit per user
    Route::middleware('throttle:password')->post('/auth/change-password', [AuthController::class, 'changePassword']);

    // Profile self-management (all roles)
    Route::get('/me/profile', [ProfileController::class, 'me']);
    Route::patch('/me/profile', [ProfileController::class, 'updateMe']);

    // Catalog (any role can read; staff/admin/super can write)
    Route::get('/kategori', [CatalogController::class, 'indexKategori']);
    Route::get('/produk', [CatalogController::class, 'indexProduk']);

    // [F3] Camera barcode scan lookup — HARUS sebelum /produk/{barcode} agar tidak ke-shadow
    // Allow: staff_kantin (POS), petugas_kesantrian (verifikasi), admin, super_admin, super_admin_tier3
    Route::get('/produk/scan/{barcode}', [CatalogController::class, 'scanProduk'])
        ->where('barcode', '[^/]+')
        ->middleware('role:staff_kantin,petugas_kesantrian,admin_kesantrian,super_admin,super_admin_tier3');

    // [FEAT] Real-time barcode availability check untuk form Tambah Produk.
    // Returns informative error jika duplikat. Same role allowlist as create.
    Route::get('/produk/check-barcode/{barcode}', [CatalogController::class, 'checkBarcodeAvailability'])
        ->where('barcode', '[^/]+')
        ->middleware('role:staff_kantin,admin_kesantrian,super_admin,petugas_kesantrian');

    // Product CREATE: staff_kantin + admin + super_admin + petugas
    // [FEAT] Staff bisa menambahkan produk baru (termasuk barcode scan di POS).
    // PRD v1.0 had staff excluded — sekarang diperluas berdasarkan real-world feedback.
    Route::middleware('role:staff_kantin,admin_kesantrian,super_admin,petugas_kesantrian')->group(function () {
        Route::post('/kategori', [CatalogController::class, 'storeKategori']);
        Route::get('/kategori/check-name', [CatalogController::class, 'checkKategoriName']);
        Route::post('/produk', [CatalogController::class, 'storeProduk']);
    });

    // Product UPDATE/ARCHIVE: admin + super_admin + petugas (more restricted)
    Route::middleware('role:admin_kesantrian,super_admin,petugas_kesantrian')->group(function () {
        Route::patch('/produk/{barcode}', [CatalogController::class, 'updateProduk']);
        Route::delete('/produk/{barcode}', [CatalogController::class, 'archiveProduk']);
    });

    // Product log (admin + super_admin view-only)
    Route::get('/produk/{barcode}/log', [CatalogController::class, 'productLog'])
        ->where('barcode', '[^/]+')
        ->middleware('role:admin_kesantrian,super_admin');

    // Super admin only: unarchive product (T3 intervensi)
    Route::middleware('role:super_admin')->group(function () {
        Route::post('/produk/{barcode}/unarchive', [CatalogController::class, 'unarchiveProduk']);
    });

    // Reward (read = all; admin write; Santri redeem)
    Route::get('/reward', [RewardController::class, 'index']);
    // Catalog management: admin + super_admin bisa CRUD reward
    Route::middleware('role:admin_kesantrian,super_admin')->group(function () {
        Route::get('/reward/admin', [RewardController::class, 'indexAdmin']);     // list all (incl archived)
        Route::get('/reward/{id}', [RewardController::class, 'show']);
        Route::post('/reward', [RewardController::class, 'store']);
        Route::patch('/reward/{id}', [RewardController::class, 'update']);
        Route::post('/reward/{id}/archive', [RewardController::class, 'archive']);
        Route::post('/reward/{id}/toggle-active', [RewardController::class, 'toggleActive']);
    });
    // Restore (more restricted, super_admin only, butuh password re-verify jika T3)
    Route::middleware('role:super_admin')->group(function () {
        Route::post('/reward/{id}/restore', [RewardController::class, 'restore']);
    });

    // Pembelian (Staff kantin + super admin)
    Route::middleware('role:staff_kantin,super_admin')->group(function () {
        Route::post('/pembelian', [PembelianController::class, 'store']);
        Route::get('/pembelian/history', [PembelianController::class, 'history']);
    });

    // Verifikasi (Petugas + super admin)
    Route::middleware('role:petugas_kesantrian,super_admin')->group(function () {
        // HARUS sebelum /verifikasi/sesi/{id} — kalau tidak, string "sesi-terbuka"
        // akan tertangkap oleh route {id} dan dianggap ID sesi.
        Route::get('/verifikasi/sesi-terbuka', [VerifikasiController::class, 'sesiTerbuka']);
        Route::post('/verifikasi/sesi', [VerifikasiController::class, 'openSesi']);
        Route::get('/verifikasi/sesi/{id}', [VerifikasiController::class, 'showSesi']);
        Route::post('/verifikasi/sesi/{id}/items', [VerifikasiController::class, 'addItem']);
        Route::post('/verifikasi/sesi/{id}/commit', [VerifikasiController::class, 'commitSesi']);
        Route::post('/verifikasi/sesi/{id}/cancel', [VerifikasiController::class, 'cancelSesi']);
    });

    // Reset Poin (Admin + super admin)
    Route::middleware('role:admin_kesantrian,super_admin')->group(function () {
        Route::post('/reset/{nis}/start', [ResetController::class, 'start']);
        Route::post('/reset/{reset_id}/step1', [ResetController::class, 'step1']);
        Route::post('/reset/{reset_id}/apply', [ResetController::class, 'apply']);
    });

    // Santri (Admin CRUD; Santri view-self)
    // Santri endpoints (admin manages + Santri views own)
    Route::middleware('role:admin_kesantrian,super_admin')->group(function () {
        Route::get('/santri', [SantriController::class, 'index']);
        Route::post('/santri', [SantriController::class, 'store']);
    });
    // Show & pembelian: admin/super_admin/staff/petugas always, plus Santri for own data only
    // NOTE: /santri/me HARUS didefinisikan sebelum /santri/{nis} karena regex [0-9A-Za-z]+ cocok dengan literal "me"
    Route::get('/santri/me', [SantriController::class, 'me'])
        ->middleware('role:santri');
    Route::get('/santri/{nis}', [SantriController::class, 'show'])
        ->where('nis', '[0-9A-Za-z]+')
        ->middleware('role:admin_kesantrian,super_admin,santri,staff_kantin,petugas_kesantrian');
    Route::get('/santri/{nis}/pembelian', [SantriController::class, 'pembelian'])
        ->where('nis', '[0-9A-Za-z]+')
        ->middleware('role:admin_kesantrian,super_admin,santri,staff_kantin,petugas_kesantrian');

    // Redeem (Santri only)
    Route::middleware('role:santri')->group(function () {
        Route::post('/reward/{id}/redeem', [RewardController::class, 'redeem']);
    });

    // Super Admin (T1 + T2 + T3) — super_admin_tier3 boleh akses dasar, tapi dibatasi di controller
    Route::middleware('role:super_admin,super_admin_tier3')->prefix('super-admin')->group(function () {
        // Read-only endpoints (no re-verification needed for Tier 3)
        Route::get('/health', [SuperAdminController::class, 'systemHealth']);          // T1.1
        Route::get('/users', [SuperAdminController::class, 'listUsers']);               // T1.6
        Route::get('/users/{userId}', [SuperAdminController::class, 'showUser']);
        Route::get('/users/{userId}/audit', [SuperAdminController::class, 'userAuditLog']); // T2.8: per-user audit timeline
        Route::get('/audit/search', [SuperAdminController::class, 'searchAudit']);     // T2.1
        Route::get('/santri/{nis}/timeline', [SuperAdminController::class, 'siswaTimeline']); // T2.2

        // [R5] Destructive ops butuh password re-verify untuk Tier 3
        Route::middleware('require.password')->group(function () {
            Route::post('/users', [SuperAdminController::class, 'createUser']);
            Route::patch('/users/{userId}', [SuperAdminController::class, 'updateUser']);
            Route::delete('/users/{userId}', [SuperAdminController::class, 'deleteUser']);
            Route::post('/users/{userId}/force-logout', [SuperAdminController::class, 'forceLogout']);
            Route::post('/users/{userId}/reset-password', [SuperAdminController::class, 'resetPassword']);
            Route::post('/users/{userId}/toggle-suspend', [SuperAdminController::class, 'toggleSuspend']);
            Route::patch('/config', [SuperAdminController::class, 'updateConfig']);
            Route::post('/mode', [SuperAdminController::class, 'toggleMode']);
            Route::post('/cron/run', [SuperAdminController::class, 'runCron']);
            Route::post('/reverse-transaction/{txId}', [SuperAdminController::class, 'reverseTransaction']);
            Route::post('/adjust-poin/{nis}', [SuperAdminController::class, 'adjustPoin']);
            Route::post('/recompute-saldo', [SuperAdminController::class, 'recomputeSaldo']);
        });
    });

    // Coverage outside super-admin group — admin + super_admin both need access
    Route::get('/super-admin/coverage', [SuperAdminController::class, 'coverageBreakdown'])
        ->middleware('role:admin_kesantrian,super_admin');

    // Admin: monitor & force-end active verifikasi sessions (admin + super_admin)
    Route::middleware('role:admin_kesantrian,super_admin')->prefix('admin')->group(function () {
        Route::get('/verifikasi/active', [SuperAdminController::class, 'activeSesiList']);     // T2.5
        Route::get('/verifikasi/{id}/log', [SuperAdminController::class, 'sesiLog']);          // T2.6
        Route::post('/verifikasi/{id}/force-end', [SuperAdminController::class, 'forceEndSesi']); // T2.7
    });
});
