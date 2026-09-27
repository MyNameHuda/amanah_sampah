<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\PoinLedger;
use App\Models\ResetDendaLog;
use App\Models\Santri;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ResetController extends Controller
{
    /**
     * POST /api/reset/{nis}/start — initiate reset (admin only).
     */
    public function start(Request $request, $nis)
    {
        $user = $request->user();
        if (!$user->isAdmin() && !$user->isSuperAdmin()) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak.']);
        }
        $santri = Santri::where('nis', $nis)->firstOrFail();
        if (!$santri->is_blocked) {
            throw ValidationException::withMessages(['nis' => 'Santri tidak dalam keadaan blocked.']);
        }

        $log = ResetDendaLog::create([
            'nis' => $nis,
            'admin_id' => $user->id,
            'poin_sebelum' => $santri->current_poin,
            'poin_sesudah' => 0, // [v1.1] target = 0
            'verifikasi_step_1' => false,
            'verifikasi_step_2' => false,
        ]);

        AuditLog::record('reset.start', ['reset_id' => $log->id, 'nis' => $nis, 'poin_before' => $santri->current_poin]);

        return response()->json(['reset' => $log], 201);
    }

    /**
     * POST /api/reset/{reset_id}/step1 — admin confirms payment received.
     */
    public function step1(Request $request, $resetId)
    {
        $user = $request->user();
        if (!$user->isAdmin() && !$user->isSuperAdmin()) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak.']);
        }
        $log = ResetDendaLog::findOrFail($resetId);
        $log->verifikasi_step_1 = true;
        $log->save();
        AuditLog::record('reset.step1', ['reset_id' => $resetId]);
        return response()->json(['reset' => $log]);
    }

    /**
     * POST /api/reset/{reset_id}/apply — apply the reset (final, requires step1 true).
     */
    public function apply(Request $request, $resetId)
    {
        $user = $request->user();
        if (!$user->isAdmin() && !$user->isSuperAdmin()) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak.']);
        }
        $log = ResetDendaLog::findOrFail($resetId);
        if (!$log->verifikasi_step_1) {
            throw ValidationException::withMessages(['reset' => 'Step 1 belum dikonfirmasi.']);
        }
        if ($log->completed_at) {
            throw ValidationException::withMessages(['reset' => 'Reset sudah di-apply sebelumnya.']);
        }

        return DB::transaction(function () use ($log, $user) {
            $santri = Santri::where('nis', $log->nis)->lockForUpdate()->first();
            $before = $santri->current_poin;

            // Reset target = 0 (D10); debts remain open (D11)
            $santri->current_poin = 0;
            $santri->is_blocked = false;
            $santri->block_reason = null;
            $santri->block_at = null;
            $santri->reset_at = now();
            $santri->save();

            PoinLedger::create([
                'nis' => $log->nis,
                'source_type' => PoinLedger::SOURCE_RESET,
                'source_id' => $log->id,
                'poin_delta' => -$before,
                'saldo_sebelum' => $before,
                'saldo_sesudah' => 0,
                'waktu' => now(),
            ]);

            $log->verifikasi_step_2 = true;
            $log->poin_sesudah = 0;
            $log->completed_at = now();
            $log->save();

            AuditLog::record('reset.complete', [
                'reset_id' => $log->id,
                'nis' => $log->nis,
                'poin_before' => $before,
                'poin_after' => 0,
            ]);

            return response()->json([
                'reset' => $log,
                'santri' => [
                    'nis' => $santri->nis,
                    'current_poin' => 0,
                    'is_blocked' => false,
                ],
                'message' => 'Reset poin selesai. Poin kembali ke 0. Debts TETAP OPEN — siswa harus return sampah secara bertahap.',
            ]);
        });
    }
}
