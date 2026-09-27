<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ConfigSetting;
use App\Models\PoinLedger;
use App\Models\Santri;
use App\Models\TransaksiPembelian;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class SuperAdminController extends Controller
{
    /**
     * T1.1 — System health dashboard.
     */
    public function systemHealth(Request $request)
    {
        $this->requireSuperAdmin($request);

        $dbSize = $this->getDatabaseSizeKb();
        $photoSize = $this->getDirectorySize('barcode-evidence');
        $totalSantri = Santri::whereNull('archived_at')->count();
        $totalStaff = User::whereIn('role', ['staff_kantin', 'petugas_kesantrian'])->count();
        $recentErrors = AuditLog::where('waktu', '>=', now()->subHours(1))
            ->where('action', 'like', '%error%')
            ->limit(10)->get();
        $mode = [
            'is_maintenance' => ConfigSetting::isMaintenance(),
            'is_readonly' => ConfigSetting::isReadOnly(),
        ];

        // [F-feat] Expose editable config keys untuk Super Admin dashboard.
        // Bawa daftar key yang boleh diedit dari UI — saat ini hanya threshold poin.
        $config = [
            [
                'key' => 'default_negative_limit',
                'label' => 'Batas Minimum Poin',
                'description' => 'Santri otomatis di-block jika saldo turun ke nilai ini (default -50).',
                'value' => (int) ConfigSetting::get('default_negative_limit', -50),
                'type' => 'number',
                'min' => -1000,
                'max' => 0,
            ],
            [
                'key' => 'reset_target_poin',
                'label' => 'Target Poin saat Reset',
                'description' => 'Saldo poin target setelah reset (biasanya 0).',
                'value' => (int) ConfigSetting::get('reset_target_poin', 0),
                'type' => 'number',
                'min' => 0,
                'max' => 1000,
            ],
        ];

        return response()->json([
            'db_size_kb' => round($dbSize, 1),
            'photo_storage_kb' => $photoSize,
            'total_active_santri' => $totalSantri,
            'total_staff' => $totalStaff,
            'recent_error_logs_count' => $recentErrors->count(),
            'modes' => $mode,
            'config' => $config,
            'checked_at' => now(),
        ]);
    }

    /**
     * T1.3 — Force logout user (revoke all tokens).
     */
    public function forceLogout(Request $request, $userId)
    {
        $this->requireSuperAdmin($request);
        $user = User::findOrFail($userId);
        $user->tokens()->delete(); // Hapus semua Sanctum tokens
        AuditLog::record('superadmin.force_logout', [
            'target_user_id' => $userId,
            'admin_alasan' => $request->input('alasan', 'no reason'),
        ], ['admin_alasan' => $request->input('alasan', 'no reason')]);
        return response()->json(['message' => "Semua token user {$userId} sudah di-revoke."]);
    }

    /**
     * T1.4 — Reset password for any user.
     */
    public function resetPassword(Request $request, $userId)
    {
        $this->requireSuperAdmin($request);
        $data = $request->validate([
            'new_password' => 'required|string|min:8',
        ]);
        $user = User::findOrFail($userId);
        $user->password = $data['new_password'];
        // Force user ganti password di next login (B3 / security best practice)
        $user->must_change_password = true;
        $user->save();

        AuditLog::record('superadmin.password_reset', [
            'target_user_id' => $userId,
            'admin_alasan' => $request->input('alasan', 'no reason'),
        ], ['admin_alasan' => $request->input('alasan', 'no reason')]);

        return response()->json(['message' => "Password user {$userId} sudah di-reset. User akan diminta ganti password di next login."]);
    }

    /**
     * T1.5 — Suspend / un-suspend user.
     *
     * Suspend berarti "tidak boleh melakukan APAPUN". Selain diblokir oleh
     * `EnsureNotSuspended` di setiap request, semua Sanctum token ikut
     * di-revoke. Tanpa ini, user yang sedang punya sesi POS/verifikasi open
     * akan tetap "login" di perangkatnya dan hanya melihat 403 di setiap
     * aksi — tampilannya rusak dan membingungkan, bukan benar-benar dikeluarkan.
     * Revoke token membuat perangkatnya langsung fallback ke 401 (token
     * invalid), yang sudah ditangani frontend sebagai auto-logout.
     */
    public function toggleSuspend(Request $request, $userId)
    {
        $this->requireSuperAdmin($request);
        $user = User::findOrFail($userId);

        // Menahan diri: kalau super admin suspend dirinya sendiri, dia langsung
        // kehilangan akses ke endpoint yang bisa membatalkan suspend-nya
        // (semua `role:super_admin`-protected route akan 403). Satu admin
        // tinggal mengunci dirinya sendiri, dan tidak ada super admin lain
        // untuk mengembalikannya. Tidak ada jalur pemulihan lain selain
        // intervensi database manual.
        if ((int) $user->id === (int) $request->user()->id) {
            throw ValidationException::withMessages([
                'auth' => 'Anda tidak bisa men-suspend akun Anda sendiri. Minta super admin lain.',
            ]);
        }

        $user->suspended_at = $user->suspended_at ? null : now();
        $user->save();

        $nowSuspended = $user->suspended_at !== null;
        $tokensRevoked = 0;
        if ($nowSuspended) {
            $tokensRevoked = $user->tokens()->delete();
        }

        AuditLog::record('superadmin.toggle_suspend', [
            'target_user_id' => $userId,
            'suspended' => $nowSuspended,
            'tokens_revoked' => $tokensRevoked,
            'admin_alasan' => $request->input('alasan', 'no reason'),
        ]);

        return response()->json([
            'user' => $user->fresh(),
            'suspended' => $nowSuspended,
            'tokens_revoked' => $tokensRevoked,
        ]);
    }

    /**
     * T1.6 — List all users dengan filter.
     */
    public function listUsers(Request $request)
    {
        $this->requireSuperAdmin($request);
        $query = User::query();
        if ($role = $request->query('role')) $query->where('role', $role);
        if ($request->boolean('suspended')) $query->whereNotNull('suspended_at');
        $users = $query->orderBy('id', 'desc')->paginate(50);
        return response()->json($users);
    }

    /**
     * T1.7 — Update config_settings.
     */
    public function updateConfig(Request $request)
    {
        $this->requireSuperAdmin($request);
        $data = $request->validate([
            'key' => 'required|string|exists:config_settings,key',
            'value' => 'required',
        ]);

        // [F-fix] Per-key value validation — config_settings punya beberapa key dengan tipe berbeda.
        // Numeric key (default_negative_limit, reset_target_poin, dll) harus integer.
        // String key boleh apa saja.
        $numericKeys = [
            'default_negative_limit',  // batas minimum poin (biasanya negatif, mis. -50)
            'reset_target_poin',       // target poin saat reset (biasanya 0)
        ];
        if (in_array($data['key'], $numericKeys, true)) {
            if (!is_numeric($data['value'])) {
                throw ValidationException::withMessages([
                    'value' => "Config '{$data['key']}' harus berupa angka.",
                ]);
            }
            // Untuk default_negative_limit: harus ≤ 0 (negative atau nol)
            if ($data['key'] === 'default_negative_limit' && (int) $data['value'] > 0) {
                throw ValidationException::withMessages([
                    'value' => 'Batas minimum poin harus ≤ 0 (negatif atau nol).',
                ]);
            }
            $data['value'] = (string) (int) $data['value']; // normalize
        } else {
            $data['value'] = (string) $data['value'];
        }

        $cfg = ConfigSetting::where('key', $data['key'])->first();
        $cfg->value = $data['value'];
        $cfg->updated_by = $request->user()->id;
        $cfg->updated_at = now();
        $cfg->save();
        // [Fix M3] Invalidate cache agar perubahan langsung berlaku (TTL default 60s)
        Cache::forget("config:{$data['key']}");

        AuditLog::record('superadmin.config_update', [
            'key' => $data['key'],
            'new_value' => $data['value'],
            'admin_alasan' => $request->input('alasan', 'config tweak'),
        ]);

        return response()->json(['config' => $cfg]);
    }

    /**
     * T1.8 / T1.9 — Toggle maintenance/readonly mode.
     */
    public function toggleMode(Request $request)
    {
        $this->requireSuperAdmin($request);
        $data = $request->validate([
            'key' => 'required|in:is_maintenance,is_readonly',
            'value' => 'required|boolean',
        ]);
        $cfg = ConfigSetting::where('key', $data['key'])->first();
        $cfg->value = $data['value'] ? 'true' : 'false';
        $cfg->updated_by = $request->user()->id;
        $cfg->updated_at = now();
        $cfg->save();
        Cache::forget("config:{$data['key']}");

        AuditLog::record('superadmin.mode_toggle', [
            'key' => $data['key'],
            'value' => $data['value'],
        ]);

        return response()->json(['config' => $cfg]);
    }

    /**
     * T1.10 — Manual cron trigger (archive audit logs + purge archive).
     */
    public function runCron(Request $request)
    {
        $this->requireSuperAdmin($request);
        try {
            Artisan::call('amanah:archive-audit', ['--force' => true]);
            $output = Artisan::output();
            AuditLog::record('superadmin.cron_manual_trigger', ['output' => substr($output, 0, 200)]);
            return response()->json(['message' => 'Cron triggered', 'output' => $output]);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Cron command missing', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * T2.1 — Advanced audit log search.
     */
    public function searchAudit(Request $request)
    {
        $this->requireSuperAdmin($request);
        $query = AuditLog::with('user')->orderBy('waktu', 'desc');
        if ($nis = $request->query('nis')) {
            $query->where(function ($q) use ($nis) {
                $q->whereRaw("JSON_EXTRACT(payload, '$.nis') = ?", [$nis])
                  ->orWhereRaw("JSON_EXTRACT(payload, '$.target_nis') = ?", [$nis]);
            });
        }
        if ($action = $request->query('action')) $query->where('action', 'like', "%$action%");
        if ($role = $request->query('role')) $query->where('role', $role);
        if ($from = $request->query('from')) $query->where('waktu', '>=', $from);
        if ($to = $request->query('to')) $query->where('waktu', '<=', $to);
        if ($userId = $request->query('user_id')) $query->where('user_id', $userId);

        $logs = $query->paginate(50);
        return response()->json($logs);
    }

    /**
     * T2.2 — Per-santri activity timeline.
     */
    public function siswaTimeline(Request $request, $nis)
    {
        $this->requireSuperAdmin($request);
        $pembelian = TransaksiPembelian::where('nis', $nis)->get()->map(fn($t) => [
            'type' => 'pembelian', 'waktu' => $t->waktu, 'data' => $t,
        ]);
        $poin = PoinLedger::where('nis', $nis)->get()->map(fn($t) => [
            'type' => 'poin_ledger', 'waktu' => $t->waktu, 'data' => $t,
        ]);
        $timeline = $pembelian->merge($poin)->sortByDesc('waktu')->values()->take(50);
        return response()->json(['nis' => $nis, 'timeline' => $timeline]);
    }

    /**
     * T2.4 — Coverage breakdown per-santri.
     * Accessible by admin_kesantrian + super_admin (admin needs for daily monitoring).
     */
    public function coverageBreakdown(Request $request)
    {
        $user = $request->user();
        if (!$user || (!$user->isSuperAdmin() && !$user->isAdmin())) {
            throw ValidationException::withMessages([
                'auth' => 'Akses ditolak — admin atau super admin only.'
            ]);
        }
        $rows = DB::table('santri as s')
            ->leftJoin('transaksi_pembelian as t', 't.nis', '=', 's.nis')
            ->select('s.nis', 's.nama', 's.current_poin', 's.is_blocked',
                DB::raw("SUM(CASE WHEN t.status='settled' THEN t.qty ELSE 0 END) as qty_settled"),
                DB::raw("SUM(CASE WHEN t.status='open' THEN t.qty ELSE 0 END) as qty_open"),
                DB::raw("COUNT(t.id) as total_tx"))
            ->whereNull('s.archived_at')
            ->groupBy('s.nis', 's.nama', 's.current_poin', 's.is_blocked')
            ->orderBy('s.nama')
            ->get();

        $coverage = $rows->map(function ($r) {
            $total = (int) $r->qty_settled + (int) $r->qty_open;
            return [
                'nis' => $r->nis,
                'nama' => $r->nama,
                'current_poin' => (int) $r->current_poin,
                'is_blocked' => (bool) $r->is_blocked,
                'qty_settled' => (int) $r->qty_settled,
                'qty_open' => (int) $r->qty_open,
                'coverage_pct' => $total > 0 ? round(((int) $r->qty_settled) / $total * 100, 1) : null,
            ];
        });
        return response()->json(['data' => $coverage]);
    }

    /**
     * T3.1 — Reverse transaction.
     */
    public function reverseTransaction(Request $request, $txId)
    {
        $this->requireSuperAdmin($request);
        // [v1.1] G-SU-03: read-only mode required
        if (!ConfigSetting::isReadOnly()) {
            throw ValidationException::withMessages([
                'mode' => 'Read-only mode harus diaktifkan dulu sebelum reverse transactions (G-SU-03).'
            ]);
        }
        // [v1.1] G-SU-01: mandatory reason min 30 char
        $data = $request->validate([
            'alasan' => 'required|string|min:30',
            'password_reverify' => 'required|string', // re-enter password
        ]);
        if (!Hash::check($data['password_reverify'], $request->user()->password)) {
            throw ValidationException::withMessages(['password_reverify' => 'Password salah.']);
        }

        $tx = TransaksiPembelian::findOrFail($txId);
        // Compensating: hanya handle pembelian tx (verifikasi reverse beda flow)
        if ($tx->status === 'cancelled') {
            throw ValidationException::withMessages(['tx' => 'Transaksi sudah di-reverse.']);
        }

        return DB::transaction(function () use ($tx, $data, $request) {
            $santri = Santri::where('nis', $tx->nis)->lockForUpdate()->first();
            $before = $santri->current_poin;
            // Compensating poin: +penalty_per_unit × qty (reverse the negative)
            $compDelta = -$tx->penalty_per_unit * $tx->qty;
            $after = $before + $compDelta;

            PoinLedger::create([
                'nis' => $tx->nis,
                'source_type' => PoinLedger::SOURCE_ADMIN_ADJUSTMENT,
                'source_id' => $tx->id,
                'poin_delta' => $compDelta,
                'saldo_sebelum' => $before,
                'saldo_sesudah' => $after,
                'waktu' => now(),
            ]);

            $santri->current_poin = $after;
            $negativeLimit = ConfigSetting::getNegativeLimit();
            $santri->is_blocked = ($after <= $negativeLimit);
            $santri->save();

            $tx->status = 'cancelled';
            $tx->cancelled_at = now();
            $tx->save();

            AuditLog::record('superadmin.reverse_transaction', [
                'tx_id' => $tx->id,
                'nis' => $tx->nis,
                'compensating_poin_delta' => $compDelta,
            ], ['admin_alasan' => $data['alasan']]);

            return response()->json([
                'message' => "Transaksi #{$tx->id} di-reverse. Compensating poin: " . ($compDelta > 0 ? '+' : '') . $compDelta,
                'tx' => $tx,
                'santri' => ['nis' => $santri->nis, 'current_poin' => $after, 'is_blocked' => $santri->is_blocked],
            ]);
        });
    }

    /**
     * T3.2 — Manual poin adjustment.
     */
    public function adjustPoin(Request $request, $nis)
    {
        $this->requireSuperAdmin($request);
        $data = $request->validate([
            'poin_delta' => 'required|integer',
            'alasan' => 'required|string|min:30',
            'password_reverify' => 'required|string',
        ]);
        if (!Hash::check($data['password_reverify'], $request->user()->password)) {
            throw ValidationException::withMessages(['password_reverify' => 'Password salah.']);
        }

        return DB::transaction(function () use ($nis, $data, $request) {
            $santri = Santri::where('nis', $nis)->lockForUpdate()->firstOrFail();
            $before = $santri->current_poin;
            $after = $before + $data['poin_delta'];

            PoinLedger::create([
                'nis' => $nis,
                'source_type' => PoinLedger::SOURCE_ADMIN_ADJUSTMENT,
                'source_id' => null,
                'poin_delta' => $data['poin_delta'],
                'saldo_sebelum' => $before,
                'saldo_sesudah' => $after,
                'waktu' => now(),
            ]);

            $santri->current_poin = $after;
            $negativeLimit = ConfigSetting::getNegativeLimit();
            $santri->is_blocked = ($after <= $negativeLimit);
            $santri->save();

            AuditLog::record('superadmin.adjust_poin', [
                'nis' => $nis, 'delta' => $data['poin_delta'], 'saldo_after' => $after,
            ], ['admin_alasan' => $data['alasan']]);

            return response()->json(['santri' => $santri]);
        });
    }

    /**
     * T3.3 — Recompute saldo from ledger.
     */
    public function recomputeSaldo(Request $request)
    {
        $this->requireSuperAdmin($request);
        $data = $request->validate([
            'nis' => 'nullable|string|exists:santri,nis',
            'alasan' => 'required|string|min:30',
        ]);

        $query = Santri::query();
        if ($data['nis']) $query->where('nis', $data['nis']);
        $count = 0;
        foreach ($query->get() as $santri) {
            $saldo = PoinLedger::where('nis', $santri->nis)->sum('poin_delta');
            $santri->current_poin = $saldo;
            $negativeLimit = ConfigSetting::getNegativeLimit();
            $santri->is_blocked = ($saldo <= $negativeLimit);
            $santri->save();
            $count++;
        }
        AuditLog::record('superadmin.recompute_saldo', [
            'nis_filter' => $data['nis'] ?? 'ALL',
            'count' => $count,
        ], ['admin_alasan' => $data['alasan']]);
        return response()->json(['message' => "$count siswa saldo di-recompute."]);
    }

    /**
     * Ukuran database dalam KB, lintas driver.
     *
     * Query SQLite `pragma_page_count()` TIDAK bisa jalan di PostgreSQL, dan
     * sebaliknya `pg_database_size()` tidak ada di SQLite. Dulu query ini
     * hardcode SQLite — kalau database-nya diganti ke Postgres/MySQL,
     * endpoint system health langsung 500 dan dashboard Super Admin rusak
     * total. Sekarang dua-duanya ditangani, dengan fallback ke 0 kalau
     * driver-nya tidak dikenali (supaya health check tidak ikut gagal).
     */
    private function getDatabaseSizeKb(): float
    {
        try {
            $driver = DB::connection()->getDriverName();

            if ($driver === 'sqlite') {
                $rows = DB::select(
                    'SELECT page_count * page_size / 1024.0 AS size_kb
                     FROM pragma_page_count(), pragma_page_size()'
                );
                return (float) ($rows[0]->size_kb ?? 0);
            }

            if ($driver === 'pgsql') {
                $rows = DB::select('SELECT pg_database_size(current_database()) / 1024.0 AS size_kb');
                return (float) ($rows[0]->size_kb ?? 0);
            }

            if ($driver === 'mysql') {
                $rows = DB::select(
                    'SELECT SUM(data_length + index_length) / 1024.0 AS size_kb
                     FROM information_schema.TABLES WHERE table_schema = DATABASE()'
                );
                return (float) ($rows[0]->size_kb ?? 0);
            }
        } catch (\Throwable) {
            // Health endpoint tidak boleh 500 gara-gara pengukuran size.
            return 0.0;
        }

        return 0.0;
    }

    private function requireSuperAdmin(Request $request): void
    {
        $user = $request->user();
        if (!$user || !$user->isSuperAdmin()) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak — super admin only.']);
        }
    }

    private function requireAdminOrSuper(Request $request): void
    {
        $user = $request->user();
        if (!$user || (!$user->isSuperAdmin() && !$user->isAdmin())) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak — admin atau super admin.']);
        }
    }

    // ============================================================
    // USER MANAGEMENT CRUD — Super Admin only
    // Full CRUD on all users (admin, staff, petugas, siswa)
    // ============================================================

    /**
     * GET /api/super-admin/users/{id} — Get user detail dengan biodata.
     */
    public function showUser(Request $request, $userId)
    {
        $this->requireSuperAdmin($request);

        $user = User::with('santri')->findOrFail($userId);

        $payload = [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'suspended_at' => $user->suspended_at,
            'created_at' => $user->created_at,
            'updated_at' => $user->updated_at,
            'biodata' => $user->biodata,
        ];

        if ($user->santri) {
            $payload['santri'] = [
                'nis' => $user->santri->nis,
                'kelas' => $user->santri->kelas,
                'asrama' => $user->santri->asrama,
                'current_poin' => $user->santri->current_poin,
                'is_blocked' => $user->santri->is_blocked,
                'archived_at' => $user->santri->archived_at,
            ];
        }

        return response()->json($payload);
    }

    /**
     * GET /api/super-admin/users/{userId}/audit — Audit log timeline per user.
     * Returns all audit_logs entries where user_id == {userId} OR payload references this nis.
     * Plus aggregated stats: total actions, last activity, action breakdown.
     */
    public function userAuditLog(Request $request, $userId)
    {
        $this->requireSuperAdmin($request);
        $user = User::findOrFail($userId);

        // Get audit logs as actor (user_id match) — direct actions by this user
        $actorLogs = AuditLog::where('user_id', $userId)
            ->orderBy('waktu', 'desc')
            ->limit(200)
            ->get();

        // Get audit logs targeting this user (resource_id match) — actions by other users affecting this one
        $nis = $user->santri?->nis;
        $targetLogs = AuditLog::query()
            ->where(function ($q) use ($userId, $nis) {
                $q->where('resource_id', $userId)
                  ->orWhere(function ($q2) use ($nis) {
                      if ($nis) $q2->whereRaw("JSON_EXTRACT(payload, '$.nis') = ?", [$nis]);
                  });
            })
            ->orderBy('waktu', 'desc')
            ->limit(200)
            ->get();

        // Merge & dedupe
        $allLogs = $actorLogs->merge($targetLogs)
            ->unique('id')
            ->sortByDesc('waktu')
            ->values();

        // Stats
        $actionCounts = $allLogs->groupBy('action')->map->count();
        $lastActivity = $allLogs->first()?->waktu;

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'created_at' => $user->created_at,
            ],
            'stats' => [
                'total_actions' => $allLogs->count(),
                'as_actor' => $actorLogs->count(),
                'as_target' => $targetLogs->count(),
                'last_activity' => $lastActivity,
                'action_breakdown' => $actionCounts,
            ],
            'logs' => $allLogs->map(fn($log) => [
                'id' => $log->id,
                'waktu' => $log->waktu,
                'role' => $log->role,
                'action' => $log->action,
                'resource_type' => $log->resource_type,
                'resource_id' => $log->resource_id,
                'payload' => $log->payload,
                'admin_alasan' => $log->admin_alasan,
                'ip_address' => $log->ip_address,
                'is_actor' => $log->user_id === $userId,
            ])->take(100)->values(),
        ]);
    }

    /**
     * POST /api/super-admin/users — Create new user (with optional Santri profile).
     */
    public function createUser(Request $request)
    {
        $this->requireSuperAdmin($request);

        $data = $request->validate([
            'name' => 'required|string|max:100',
            'email' => 'nullable|email|unique:users,email',
            'role' => 'required|in:santri,staff_kantin,petugas_kesantrian,admin_kesantrian,super_admin',
            'password' => 'required|string|min:8',
            'phone' => 'nullable|string|max:25',
            'gender' => 'nullable|in:L,P',
            'birth_place' => 'nullable|string|max:100',
            'birth_date' => 'nullable|date_format:Y-m-d',
            'address' => 'nullable|string|max:500',
            // Santri-specific
            'nis' => 'required_if:role,santri|string|max:20|unique:santri,nis',
            'kelas' => 'required_if:role,santri|string|max:30',
            'asrama' => 'nullable|string|max:50',
            'default_password' => 'nullable|string|min:8', // alias for password
        ]);

        $password = $data['default_password'] ?? $data['password'];
        unset($data['default_password']);

        return DB::transaction(function () use ($data, $password, $request) {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'] ?? null,
                'role' => $data['role'],
                'password' => $password,
                // New user wajib ganti password di first login
                'must_change_password' => true,
                'phone' => $data['phone'] ?? null,
                'gender' => $data['gender'] ?? null,
                'birth_place' => $data['birth_place'] ?? null,
                'birth_date' => $data['birth_date'] ?? null,
                'address' => $data['address'] ?? null,
            ]);

            if ($data['role'] === 'santri') {
                Santri::create([
                    'nis' => $data['nis'],
                    'user_id' => $user->id,
                    'nama' => $data['name'],
                    'kelas' => $data['kelas'],
                    'asrama' => $data['asrama'] ?? null,
                    'current_poin' => 0,
                ]);
                PoinLedger::create([
                    'nis' => $data['nis'],
                    'source_type' => PoinLedger::SOURCE_INITIAL,
                    'poin_delta' => 0,
                    'saldo_sebelum' => 0,
                    'saldo_sesudah' => 0,
                    'waktu' => now(),
                ]);
            }

            AuditLog::record('superadmin.user_create', [
                'user_id' => $user->id,
                'role' => $user->role,
                'name' => $user->name,
            ]);

            return response()->json([
                'message' => "User {$user->name} ({$user->role}) berhasil dibuat. User wajib ganti password di first login.",
                'user' => $user->fresh()->load('santri'),
                'default_password' => $password,
                'must_change_password' => true,
            ], 201);
        });
    }

    /**
     * PATCH /api/super-admin/users/{id} — Update user (biodata + role + suspension).
     * Cannot update password via this endpoint (use /reset-password instead).
     */
    public function updateUser(Request $request, $userId)
    {
        $this->requireSuperAdmin($request);

        $user = User::findOrFail($userId);

        $data = $request->validate([
            'name' => 'sometimes|string|max:100',
            'email' => 'sometimes|nullable|email|unique:users,email,' . $userId,
            'role' => 'sometimes|in:santri,staff_kantin,petugas_kesantrian,admin_kesantrian,super_admin',
            'phone' => 'sometimes|nullable|string|max:25',
            'gender' => 'sometimes|nullable|in:L,P',
            'birth_place' => 'sometimes|nullable|string|max:100',
            'birth_date' => 'sometimes|nullable|date_format:Y-m-d',
            'address' => 'sometimes|nullable|string|max:500',
            // Santri-specific
            'kelas' => 'sometimes|string|max:30',
            'asrama' => 'sometimes|nullable|string|max:50',
        ]);

        if (empty($data)) {
            throw ValidationException::withMessages(['body' => 'Tidak ada field yang di-update.']);
        }

        // Cegah super admin demote diri sendiri
        if ($user->id === $request->user()->id && isset($data['role']) && $data['role'] !== 'super_admin' && $data['role'] !== 'super_admin_tier3') {
            throw ValidationException::withMessages(['role' => 'Tidak bisa demote akun sendiri.']);
        }

        return DB::transaction(function () use ($user, $data, $request) {
            $oldRole = $user->role;
            $user->fill($data);
            $user->save();

            // Sync name to Santri
            if ($user->isSantri() && isset($data['name'])) {
                Santri::where('user_id', $user->id)->update(['nama' => $data['name']]);
            }

            // If role changed to/from Santri, handle Santri profile
            if (isset($data['role']) && $oldRole !== $data['role']) {
                $santri = Santri::where('user_id', $user->id)->first();
                if ($data['role'] === 'santri' && !$santri) {
                    // Promote to Santri: create Santri profile (minimal)
                    throw ValidationException::withMessages([
                        'role' => 'Promote ke role Santri membutuhkan data NIS/kelas. Buat user Santri baru via endpoint create.'
                    ]);
                }
                if ($data['role'] !== 'santri' && $santri) {
                    // Demote from Santri: archive the Santri profile
                    $santri->update(['archived_at' => now()]);
                }
            }

            // Update kelas/asrama if Santri and field provided
            if ($user->isSantri()) {
                $santri = Santri::where('user_id', $user->id)->first();
                if ($santri) {
                    if (isset($data['kelas'])) $santri->kelas = $data['kelas'];
                    if (array_key_exists('asrama', $data)) $santri->asrama = $data['asrama'];
                    $santri->save();
                }
            }

            AuditLog::record('superadmin.user_update', [
                'user_id' => $user->id,
                'fields_updated' => array_keys($data),
                'role_changed' => isset($data['role']) && $data['role'] !== $oldRole ? "{$oldRole} → {$data['role']}" : null,
            ]);

            return response()->json([
                'message' => "User {$user->name} berhasil diperbarui.",
                'user' => $user->fresh()->load('santri'),
            ]);
        });
    }

    /**
     * DELETE /api/super-admin/users/{id} — Soft-delete / archive user.
     * Untuk Santri: set archived_at. Untuk non-Santri: set suspended_at + email empty.
     * Cegah delete akun sendiri.
     */
    public function deleteUser(Request $request, $userId)
    {
        $this->requireSuperAdmin($request);

        if ($userId == $request->user()->id) {
            throw ValidationException::withMessages(['auth' => 'Tidak bisa menghapus akun sendiri.']);
        }

        $user = User::findOrFail($userId);

        return DB::transaction(function () use ($user, $request) {
            // Revoke all tokens
            $user->tokens()->delete();

            if ($user->isSantri()) {
                $santri = Santri::where('user_id', $user->id)->first();
                if ($santri) {
                    $santri->update(['archived_at' => now()]);
                }
                $user->update(['suspended_at' => now()]);
            } else {
                // For staff/petugas/admin/super: soft delete via suspension
                $user->update(['suspended_at' => now()]);
            }

            AuditLog::record('superadmin.user_delete', [
                'user_id' => $user->id,
                'role' => $user->role,
                'name' => $user->name,
            ]);

            return response()->json([
                'message' => "User {$user->name} berhasil di-archive. Login diblokir.",
                'user_id' => $user->id,
            ]);
        });
    }

    // ============================================================
    // ADMIN OPERATIONAL TOOLS — Active session monitoring + Force-end
    // (Accessible by admin_kesantrian + super_admin)
    // ============================================================

    /**
     * T2.5 — List active verifikasi sessions (belum di-commit).
     * Admin bisa lihat: petugas mana verifikasi siswa siapa, real-time.
     */
    public function activeSesiList(Request $request)
    {
        $this->requireAdminOrSuper($request);

        $sesiList = \App\Models\SesiVerifikasi::with(['siswa', 'petugas'])
            ->whereNull('waktu_selesai')
            ->withCount('items')
            ->orderBy('waktu_mulai', 'desc')
            ->get()
            ->map(function ($sesi) {
                $items = $sesi->items;
                $lastItemAt = $items->max('created_at');
                return [
                    'id' => $sesi->id,
                    'nis' => $sesi->nis,
                    'nama_siswa' => $sesi->siswa?->nama,
                    'kelas_siswa' => $sesi->siswa?->kelas,
                    'current_poin_siswa' => $sesi->siswa?->current_poin,
                    'is_blocked' => $sesi->siswa?->is_blocked,
                    'petugas_id' => $sesi->petugas_id,
                    'nama_petugas' => $sesi->petugas?->name,
                    'waktu_mulai' => $sesi->waktu_mulai,
                    'items_count' => $sesi->items_count,
                    'total_poin_change_uncommitted' => (int) $items->sum('poin_delta'),
                    'last_item_at' => $lastItemAt,
                ];
            });

        return response()->json([
            'data' => $sesiList,
            'count' => $sesiList->count(),
            'fetched_at' => now(),
        ]);
    }

    /**
     * T2.6 — Full session log (semua items yang pernah di-add).
     */
    public function sesiLog(Request $request, $id)
    {
        $this->requireAdminOrSuper($request);

        $sesi = \App\Models\SesiVerifikasi::with(['siswa', 'petugas', 'items.produk'])
            ->findOrFail($id);

        return response()->json([
            'sesi' => [
                'id' => $sesi->id,
                'nis' => $sesi->nis,
                'nama_siswa' => $sesi->siswa?->nama,
                'kelas_siswa' => $sesi->siswa?->kelas,
                'petugas_id' => $sesi->petugas_id,
                'nama_petugas' => $sesi->petugas?->name,
                'waktu_mulai' => $sesi->waktu_mulai,
                'waktu_selesai' => $sesi->waktu_selesai,
                'status' => $sesi->waktu_selesai ? 'closed' : 'open',
                'total_poin_change' => $sesi->total_poin_change,
            ],
            'items' => $sesi->items->map(fn($i) => [
                'id' => $i->id,
                'barcode' => $i->barcode,
                'nama_produk' => $i->produk?->nama_produk,
                'qty_in' => $i->qty_in,
                'qty_matched' => $i->qty_matched,
                'qty_excess' => $i->qty_excess,
                'qty_shortfall' => $i->qty_shortfall,
                'poin_delta' => $i->poin_delta,
                'foto_bukti_path' => $i->foto_bukti_path,
                // URL disusun di server supaya frontend tidak perlu tahu
                // apakah foto dilayani dari symlink lokal atau Cloudflare R2.
                'foto_bukti_url' => $this->publicUrlFor($i->foto_bukti_path),
                'catatan' => $i->catatan,
                'created_at' => $i->created_at,
            ])->values(),
        ]);
    }

    /** URL absolut file di disk 'public', atau null kalau tidak ada / gagal. */
    private function publicUrlFor(?string $path): ?string
    {
        if (blank($path)) {
            return null;
        }
        try {
            return Storage::disk('public')->url($path);
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * T2.7 — Admin Force-End sesi (intervensi operasional).
     * TIDAK seperti commit — items TIDAK diproses ke poin saldo.
     * Sesi di-close paksa, items tetap tercatat tapi tidak di-credit.
     * Mandatory alasan untuk audit trail.
     */
    public function forceEndSesi(Request $request, $id)
    {
        $this->requireAdminOrSuper($request);

        $data = $request->validate([
            'alasan' => 'required|string|min:10|max:500',
        ]);

        $sesi = \App\Models\SesiVerifikasi::with('items')
            ->whereNull('waktu_selesai')
            ->findOrFail($id);

        return DB::transaction(function () use ($sesi, $request, $data) {
            $itemsCount = $sesi->items->count();
            $totalPoin = (int) $sesi->items->sum('poin_delta');

            // Force close (no commit, no saldo update)
            $sesi->waktu_selesai = now();
            $sesi->save();

            // Audit log dengan mandatory alasan
            AuditLog::record('verifikasi.force_end', [
                'sesi_id' => $sesi->id,
                'nis' => $sesi->nis,
                'petugas_id' => $sesi->petugas_id,
                'items_dropped_count' => $itemsCount,
                'total_poin_dropped' => $totalPoin,
                'note' => 'Items tidak diproses ke poin saldo. Sesi di-close paksa oleh admin.',
            ], ['admin_alasan' => $data['alasan']]);

            return response()->json([
                'message' => "Sesi #{$sesi->id} di-force-end. Items TIDAK diproses — poin siswa tidak berubah dari sesi ini.",
                'sesi' => $sesi->fresh(),
                'items_dropped' => [
                    'count' => $itemsCount,
                    'total_poin_uncommitted' => $totalPoin,
                ],
            ]);
        });
    }

    private function getDirectorySize(string $dir): float
    {
        try {
            $files = Storage::disk('public')->allFiles($dir);
            $size = 0;
            foreach ($files as $f) $size += Storage::disk('public')->size($f);
            return round($size / 1024, 1);
        } catch (\Throwable $e) {
            return 0;
        }
    }
}
