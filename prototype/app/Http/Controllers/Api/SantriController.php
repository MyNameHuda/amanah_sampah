<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\PoinLedger;
use App\Models\Santri;
use App\Models\TransaksiPembelian;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SantriController extends Controller
{
    /**
     * GET /api/santri — admin list dengan filter.
     */
    public function index(Request $request)
    {
        $query = Santri::with('user');
        if ($q = $request->query('q')) {
            $query->where(function ($q2) use ($q) {
                $q2->where('nis', 'like', "%$q%")
                    ->orWhere('nama', 'like', "%$q%")
                    ->orWhere('kelas', 'like', "%$q%");
            });
        }
        if ($request->boolean('blocked')) {
            $query->where('is_blocked', true);
        }
        if ($request->boolean('active')) {
            $query->whereNull('archived_at');
        }
        $santri = $query->orderBy('nama')->paginate(50);
        return response()->json($santri);
    }

    /**
     * POST /api/santri — admin create.
     */
    public function store(Request $request)
    {
        $user = $request->user();
        if (!$user->isAdmin() && !$user->isSuperAdmin()) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak.']);
        }
        $data = $request->validate([
            'nis' => 'required|string|unique:santri,nis|max:20',
            'nama' => 'required|string|max:100',
            'kelas' => 'required|string|max:30',
            'asrama' => 'nullable|string|max:50',
            'email' => 'nullable|email|unique:users,email',
            'default_password' => 'nullable|string|min:8',
        ]);

        $defaultPassword = $data['default_password'] ?? 'SANTRI' . substr($data['nis'], -4);

        $newUser = \App\Models\User::create([
            'email' => $data['email'] ?? null,
            'name' => $data['nama'],
            'role' => 'santri',
            'password' => $defaultPassword,
            'must_change_password' => true, // [v1.1] force change on first login
        ]);

        $santri = Santri::create([
            'nis' => $data['nis'],
            'user_id' => $newUser->id,
            'nama' => $data['nama'],
            'kelas' => $data['kelas'],
            'asrama' => $data['asrama'] ?? null,
            'current_poin' => 0, // [v2] starting = 0
        ]);

        // Seed initial ledger row (no delta)
        PoinLedger::create([
            'nis' => $santri->nis,
            'source_type' => PoinLedger::SOURCE_INITIAL,
            'source_id' => null,
            'poin_delta' => 0,
            'saldo_sebelum' => 0,
            'saldo_sesudah' => 0,
            'waktu' => now(),
        ]);

        AuditLog::record('santri.create', ['nis' => $santri->nis]);

        return response()->json([
            'santri' => $santri,
            'default_password' => $defaultPassword, // shown ONCE only
            'message' => 'Siswa baru dibuat. Default password ditampilkan sekali — sampaikan ke siswa untuk force change at first login.',
        ], 201);
    }

    /**
     * GET /api/santri/{nis} — show one.
     * Admin/super_admin: any nis.
     * Santri: only own nis (ownership check).
     */
    public function show(Request $request, $nis)
    {
        $user = $request->user();
        if ($user->isSantri()) {
            $ownSantri = Santri::where('user_id', $user->id)->first();
            if (!$ownSantri || $ownSantri->nis !== $nis) {
                throw ValidationException::withMessages(['auth' => 'Santri hanya boleh akses data sendiri.']);
            }
        }

        $santri = Santri::with('user')->where('nis', $nis)->firstOrFail();
        $openDebts = TransaksiPembelian::where('nis', $nis)->where('status', 'open')
            ->selectRaw('barcode, SUM(qty) as qty')
            ->groupBy('barcode')
            // [F-fix] Eager-load produk untuk tampilkan nama, bukan barcode saja
            ->with('produk:id,barcode,nama_produk')
            ->get()
            ->map(fn($tx) => [
                'barcode' => $tx->barcode,
                'nama_produk' => $tx->produk?->nama_produk ?? $tx->barcode, // fallback ke barcode jika produk di-archive/hilang
                'qty' => (int) $tx->qty,
            ]);
        $recentLedger = PoinLedger::where('nis', $nis)->orderBy('waktu', 'desc')->limit(20)->get();

        return response()->json([
            'santri' => $santri,
            'open_debts' => $openDebts,
            'recent_ledger' => $recentLedger,
            'prior_open_count' => $santri->prior_open_count,
            'current_penalty_tier' => $santri->current_penalty_tier,
            // Staff kantin & petugas perlu tahu ini SEBELUM mulai scan atau
            // buka sesi verifikasi, supaya tidak bekerja sia-sia lalu ditolak
            // 422 di akhir. Backend tetap menolak apa pun yang terjadi di sisi
            // klien — ini murni penanda yang bikin kegagalan cepat & jelas.
            'is_suspended' => $santri->isAccountSuspended(),
        ]);
    }

    /**
     * GET /api/santri/me — Santri lihat profile sendiri.
     */
    public function me(Request $request)
    {
        $user = $request->user();
        if (!$user->isSantri()) {
            throw ValidationException::withMessages(['auth' => 'Hanya Santri.']);
        }
        $santri = Santri::where('user_id', $user->id)->firstOrFail();

        // Bangun ulang payload yang sama dengan show() tanpa delegasi langsung
        // (karena show() punya signature show(Request $request, $nis))
        $santri->load('user');
        $openDebts = TransaksiPembelian::where('nis', $santri->nis)->where('status', 'open')
            ->selectRaw('barcode, SUM(qty) as qty')
            ->groupBy('barcode')->get();
        $recentLedger = PoinLedger::where('nis', $santri->nis)->orderBy('waktu', 'desc')->limit(20)->get();

        return response()->json([
            'santri' => $santri,
            'open_debts' => $openDebts,
            'recent_ledger' => $recentLedger,
            'prior_open_count' => $santri->prior_open_count,
            'current_penalty_tier' => $santri->current_penalty_tier,
        ]);
    }

    /**
     * GET /api/santri/{nis}/pembelian — history pembelian per siswa.
     * Admin/super_admin: any nis. Santri: only own.
     */
    public function pembelian(Request $request, $nis)
    {
        $user = $request->user();
        if ($user->isSantri()) {
            $ownSantri = Santri::where('user_id', $user->id)->first();
            if (!$ownSantri || $ownSantri->nis !== $nis) {
                throw ValidationException::withMessages(['auth' => 'Santri hanya boleh akses data sendiri.']);
            }
        }
        $tx = TransaksiPembelian::with('produk')->where('nis', $nis)
            ->orderBy('waktu', 'desc')->limit(50)->get();
        return response()->json(['data' => $tx]);
    }
}
