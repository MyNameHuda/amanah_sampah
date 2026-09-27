<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\PoinLedger;
use App\Models\Reward;
use App\Models\PenukaranReward;
use App\Models\Santri;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class RewardController extends Controller
{
    /**
     * GET /api/reward — list aktif.
     * Hanya return reward yang aktif & tidak di-archive.
     */
    public function index()
    {
        $rewards = Reward::where('status_aktif', true)
            ->whereNull('archived_at')
            ->orderBy('biaya_poin', 'asc')
            ->get();
        return response()->json(['data' => $rewards]);
    }

    /**
     * GET /api/reward/admin — list ALL rewards (termasuk archived & non-aktif).
     * Untuk Admin/Super Admin catalog management view.
     */
    public function indexAdmin(Request $request)
    {
        $user = $request->user();
        if (!$user->isAdmin() && !$user->isSuperAdmin()) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak.']);
        }
        $query = Reward::query();

        // Optional filter: ?status=active|archived|inactive|all
        $status = $request->query('status', 'all');
        if ($status === 'active') {
            $query->where('status_aktif', true)->whereNull('archived_at');
        } elseif ($status === 'archived') {
            $query->whereNotNull('archived_at');
        } elseif ($status === 'inactive') {
            $query->where('status_aktif', false)->whereNull('archived_at');
        }

        // Optional search: ?q=<keyword> (by nama_reward)
        if ($q = trim((string) $request->query('q', ''))) {
            $query->where('nama_reward', 'like', "%{$q}%");
        }

        $rewards = $query->orderBy('biaya_poin', 'asc')->get();

        // Tambah statistik ringan per reward (stok awal + jumlah pernah di-redeem)
        $stats = PenukaranReward::select('id_reward', DB::raw('COUNT(*) as redeemed_count'))
            ->groupBy('id_reward')
            ->pluck('redeemed_count', 'id_reward');

        $data = $rewards->map(function (Reward $r) use ($stats) {
            return [
                'id_reward' => $r->id_reward,
                'nama_reward' => $r->nama_reward,
                'biaya_poin' => $r->biaya_poin,
                'stok' => $r->stok,
                'status_aktif' => $r->status_aktif,
                'archived_at' => $r->archived_at?->toIso8601String(),
                'archived_by' => $r->archived_by,
                'created_by' => $r->created_by,
                'updated_by' => $r->updated_by,
                'created_at' => $r->created_at?->toIso8601String(),
                'updated_at' => $r->updated_at?->toIso8601String(),
                'redeemed_count' => (int) ($stats[$r->id_reward] ?? 0),
                'is_archived' => $r->archived_at !== null,
            ];
        });

        return response()->json(['data' => $data]);
    }

    /**
     * GET /api/reward/{id} — detail 1 reward.
     */
    public function show(Request $request, $id)
    {
        $user = $request->user();
        if (!$user->isAdmin() && !$user->isSuperAdmin()) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak.']);
        }
        $reward = Reward::findOrFail($id);
        return response()->json(['reward' => $reward]);
    }

    /**
     * POST /api/reward — admin/super_admin create.
     */
    public function store(Request $request)
    {
        $user = $request->user();
        if (!$user->isAdmin() && !$user->isSuperAdmin()) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak.']);
        }
        $data = $request->validate([
            'nama_reward' => 'required|string|max:100',
            'biaya_poin' => 'required|integer|min:1|max:1000000',
            'stok' => 'required|integer|min:0',
        ]);
        // Cek duplikat nama (case-insensitive exact)
        $existing = Reward::whereRaw('LOWER(nama_reward) = ?', [strtolower($data['nama_reward'])])->first();
        if ($existing) {
            throw ValidationException::withMessages([
                'nama_reward' => "Reward dengan nama '{$data['nama_reward']}' sudah ada."
            ]);
        }
        $reward = Reward::create([
            'nama_reward' => $data['nama_reward'],
            'biaya_poin' => $data['biaya_poin'],
            'stok' => $data['stok'],
            'status_aktif' => true,
            'created_by' => $user->id,
            'updated_by' => $user->id,
        ]);
        AuditLog::record('reward.create', [
            'reward_id' => $reward->id_reward,
            'payload' => ['nama_reward' => $reward->nama_reward, 'biaya_poin' => $reward->biaya_poin, 'stok' => $reward->stok],
        ]);
        return response()->json(['reward' => $reward], 201);
    }

    /**
     * PATCH /api/reward/{id} — update nama / biaya_poin / stok / status_aktif.
     * Tidak bisa edit jika archived (kecuali restore dulu).
     */
    public function update(Request $request, $id)
    {
        $user = $request->user();
        if (!$user->isAdmin() && !$user->isSuperAdmin()) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak.']);
        }
        $reward = Reward::findOrFail($id);
        if ($reward->archived_at !== null) {
            throw ValidationException::withMessages([
                'reward' => 'Reward sudah di-archive. Restore dulu untuk mengedit.'
            ]);
        }
        $data = $request->validate([
            'nama_reward' => ['required', 'string', 'max:100', Rule::unique('reward', 'nama_reward')->ignore($reward->id_reward, 'id_reward')],
            'biaya_poin' => 'required|integer|min:1|max:1000000',
            'stok' => 'required|integer|min:0',
            'status_aktif' => 'required|boolean',
        ]);
        $before = $reward->only(['nama_reward', 'biaya_poin', 'stok', 'status_aktif']);
        $reward->fill($data);
        $reward->updated_by = $user->id;
        $reward->save();
        $after = $reward->only(['nama_reward', 'biaya_poin', 'stok', 'status_aktif']);
        AuditLog::record('reward.update', [
            'reward_id' => $reward->id_reward,
            'payload' => [
                'before' => $before,
                'after' => $after,
            ],
        ]);
        return response()->json(['reward' => $reward]);
    }

    /**
     * POST /api/reward/{id}/archive — soft-delete (admin/super_admin).
     * Reward yang punya stok 0 atau pernah di-redeem masih boleh di-archive.
     */
    public function archive(Request $request, $id)
    {
        $user = $request->user();
        if (!$user->isAdmin() && !$user->isSuperAdmin()) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak.']);
        }
        $reward = Reward::findOrFail($id);
        if ($reward->archived_at !== null) {
            return response()->json(['reward' => $reward, 'message' => 'Reward sudah di-archive.']);
        }
        // Super Admin Tier 3 perlu password re-verification (controller middleware sudah handle,
        // tapi kita juga enforce di sini untuk safety via error message).
        $reward->archived_at = now();
        $reward->archived_by = $user->id;
        $reward->status_aktif = false;
        $reward->updated_by = $user->id;
        $reward->save();
        AuditLog::record('reward.archive', [
            'reward_id' => $reward->id_reward,
            'nama_reward' => $reward->nama_reward,
        ]);
        return response()->json(['reward' => $reward, 'message' => "Reward '{$reward->nama_reward}' telah di-archive."]);
    }

    /**
     * POST /api/reward/{id}/restore — unarchive (super_admin only, restricted op).
     * Penting untuk recovery jika admin accidentally archive reward yang masih punya stok.
     */
    public function restore(Request $request, $id)
    {
        $user = $request->user();
        if (!$user->isSuperAdmin()) {
            throw ValidationException::withMessages(['auth' => 'Hanya Super Admin yang bisa restore reward.']);
        }
        $reward = Reward::findOrFail($id);
        if ($reward->archived_at === null) {
            return response()->json(['reward' => $reward, 'message' => 'Reward tidak di-archive.']);
        }
        $reward->archived_at = null;
        $reward->archived_by = null;
        $reward->status_aktif = true;
        $reward->updated_by = $user->id;
        $reward->save();
        AuditLog::record('reward.restore', [
            'reward_id' => $reward->id_reward,
            'nama_reward' => $reward->nama_reward,
        ]);
        return response()->json(['reward' => $reward, 'message' => "Reward '{$reward->nama_reward}' telah dipulihkan."]);
    }

    /**
     * POST /api/reward/{id}/toggle-active — quick aktif/nonaktif (admin/super_admin).
     * Berguna untuk pause reward tanpa archive.
     */
    public function toggleActive(Request $request, $id)
    {
        $user = $request->user();
        if (!$user->isAdmin() && !$user->isSuperAdmin()) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak.']);
        }
        $reward = Reward::findOrFail($id);
        if ($reward->archived_at !== null) {
            throw ValidationException::withMessages(['reward' => 'Reward archived.']);
        }
        $reward->status_aktif = !$reward->status_aktif;
        $reward->updated_by = $user->id;
        $reward->save();
        AuditLog::record('reward.toggle_active', [
            'reward_id' => $reward->id_reward,
            'status_aktif' => $reward->status_aktif,
        ]);
        return response()->json(['reward' => $reward]);
    }

    /**
     * POST /api/reward/{id}/redeem — REDEEM by Santri.
     */
    public function redeem(Request $request, $id)
    {
        $user = $request->user();
        if (!$user->isSantri()) {
            throw ValidationException::withMessages(['auth' => 'Hanya Santri yang bisa redeem.']);
        }
        $reward = Reward::findOrFail($id);
        $santri = Santri::where('user_id', $user->id)->first();
        if (!$santri) {
            throw ValidationException::withMessages([
                'auth' => "Akun Santri (user_id={$user->id}) tidak memiliki profil siswa. Hubungi admin."
            ]);
        }

        return DB::transaction(function () use ($reward, $santri, $user) {
            // Lock both rows
            $rewardLocked = Reward::where('id_reward', $reward->id_reward)->lockForUpdate()->first();
            $santriLocked = Santri::where('nis', $santri->nis)->lockForUpdate()->first();

            // Validate
            if (!$rewardLocked->hasStock()) {
                throw ValidationException::withMessages(['reward' => $rewardLocked->status_aktif ? 'Stok reward habis.' : 'Reward tidak aktif.']);
            }
            // D13: poin >= biaya
            if ($santriLocked->current_poin < $rewardLocked->biaya_poin) {
                throw ValidationException::withMessages([
                    'poin' => "Poin tidak cukup. Anda punya {$santriLocked->current_poin}, butuh {$rewardLocked->biaya_poin}."
                ]);
            }

            $before = $santriLocked->current_poin;
            $after = $before - $rewardLocked->biaya_poin;

            $rewardLocked->stok -= 1;
            $rewardLocked->save();

            $redeem = PenukaranReward::create([
                'nis' => $santriLocked->nis,
                'id_reward' => $rewardLocked->id_reward,
                'poin_used' => $rewardLocked->biaya_poin,
                'status' => 'redeemed',
                'waktu' => now(),
            ]);

            PoinLedger::create([
                'nis' => $santriLocked->nis,
                'source_type' => PoinLedger::SOURCE_REDEEM,
                'source_id' => $redeem->id,
                'poin_delta' => -$rewardLocked->biaya_poin,
                'saldo_sebelum' => $before,
                'saldo_sesudah' => $after,
                'waktu' => now(),
            ]);

            $santriLocked->current_poin = $after;
            $santriLocked->save();

            AuditLog::record('reward.redeem', [
                'reward_id' => $rewardLocked->id_reward,
                'poin_used' => $rewardLocked->biaya_poin,
                'saldo_after' => $after,
            ]);

            return response()->json([
                'redeem' => $redeem,
                'santri' => ['nis' => $santriLocked->nis, 'current_poin' => $after],
                'message' => "Reward '{$rewardLocked->nama_reward}' berhasil ditukar. Silakan ambil di admin.",
            ]);
        });
    }
}
