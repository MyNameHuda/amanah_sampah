<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\PoinLedger;
use App\Models\Produk;
use App\Models\Santri;
use App\Models\TransaksiPembelian;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PembelianController extends Controller
{
    /**
     * Buat transaksi pembelian baru (POST /api/pembelian).
     * Support 2 modes:
     *  1. Single: { nis, barcode, qty }
     *  2. Batch (cart): { nis, items: [{ barcode, qty }, ...] }
     * Step 1 validasi, Step 2 compute penalty_tier per item (cumulative),
     * Step 3 atomic insert + poin_ledger.
     */
    public function store(Request $request)
    {
        // Detect batch mode
        $items = $request->input('items');
        if (is_array($items) && count($items) > 0) {
            return $this->storeBatch($request, $items);
        }

        // Single-item mode (backward compatible)
        $data = $request->validate([
            'nis' => 'required|string|exists:santri,nis',
            'barcode' => 'required|string|exists:produk,barcode',
            'qty' => 'required|integer|min:1',
        ]);
        return $this->processTransactions($request, [$data], true);
    }

    /**
     * Batch mode — multiple items in one transaction.
     */
    private function storeBatch(Request $request, array $items)
    {
        $validated = $request->validate([
            'nis' => 'required|string|exists:santri,nis',
            'items' => 'required|array|min:1',
            'items.*.barcode' => 'required|string|exists:produk,barcode',
            'items.*.qty' => 'required|integer|min:1',
        ]);
        return $this->processTransactions($request, $validated['items'], true);
    }

    /**
     * Shared logic — handles single or batch.
     * $items = array of { barcode, qty }
     */
    private function processTransactions(Request $request, array $items, bool $isBatch)
    {
        $staff = $request->user();
        // [Fix S4] Selalu pakai top-level nis (untuk single + batch). Abaikan nis dalam items.
        $nis = $request->input('nis');
        if (!$nis || !is_string($nis)) {
            throw ValidationException::withMessages(['nis' => 'Field nis wajib diisi di top-level request.']);
        }
        $nis = trim($nis);

        $santri = Santri::where('nis', $nis)->first();
        if (!$santri) {
            throw ValidationException::withMessages(['nis' => "Santri dengan NIS '{$nis}' tidak ditemukan."]);
        }
        if ($santri->archived_at) {
            throw ValidationException::withMessages(['nis' => 'Santri sudah archived.']);
        }

        // Akun siswa di-suspend = tidak ada aktivitas apa pun yang boleh
        // tercatat untuknya, termasuk yang dicatat oleh staff kantin.
        //
        // Yang perlu dicek di sini adalah status akun SUBJEK transaksi
        // (siswa), bukan status staff yang sedang login — makanya guard ini
        // tidak bisa pakai middleware EnsureNotSuspended yang hanya melihat
        // user terautentikasi.
        //
        // Super admin tetap boleh: dia satu-satunya jalur pemulihan kalau
        // ada koreksi yang harus masuk untuk siswa ter-suspend. Menutup jalur
        // itu membuat data siswa suspended mustahil diperbaiki tanpa
        // un-suspend dulu.
        if (!$staff->isSuperAdmin() && $santri->isAccountSuspended()) {
            throw ValidationException::withMessages([
                'nis' => "Akun {$santri->nama} (NIS {$nis}) sedang di-suspend. Transaksi tidak bisa dicatat. Hubungi admin untuk membuka akses.",
            ]);
        }

        // Validate all products upfront + check archived
        $produkByBarcode = [];
        foreach ($items as $item) {
            $bc = $item['barcode'];
            if (isset($produkByBarcode[$bc])) continue;
            $p = Produk::where('barcode', $bc)->first();
            if (!$p) {
                throw ValidationException::withMessages(['barcode' => "Produk '$bc' tidak ditemukan."]);
            }
            if ($p->archived_at) {
                throw ValidationException::withMessages(['barcode' => "Produk '{$p->nama_produk}' sudah di-archive. Tidak bisa dijual."]);
            }
            $produkByBarcode[$bc] = $p;
        }

        // Block warning: kalau siswa blocked DAN ada produk plastik
        $hasPlastik = false;
        foreach ($items as $item) {
            if (!$produkByBarcode[$item['barcode']]->is_excluded_from_debit) {
                $hasPlastik = true;
                break;
            }
        }
        if ($santri->is_blocked && $hasPlastik) {
            throw ValidationException::withMessages([
                'blocked' => "Santri {$santri->nama} sedang di-block (poin: {$santri->current_poin}). Tidak boleh beli plastik."
            ]);
        }

        return DB::transaction(function () use ($santri, $items, $produkByBarcode, $staff, $isBatch) {
            $transactions = [];
            $totalDelta = 0;
            $itemsMeta = []; // for response

            // [F-change] Flat penalty: setiap produk = -1 poin per unit, REGARDLESS dari prior_open_count.
            // Sebelumnya ada sistem escalation (0 open→-1, 1→-2, 2+→-3) yang dianggap terlalu punishing.
            // Sekarang sederhana: beli 1 = -1, beli 3 = -3, dst.
            $penaltyPerUnit = -1;

            foreach ($items as $item) {
                $barcode = $item['barcode'];
                $qty = (int) $item['qty'];
                $produk = $produkByBarcode[$barcode];

                $poinDelta = $penaltyPerUnit * $qty;

                $tx = TransaksiPembelian::create([
                    'nis' => $santri->nis,
                    'barcode' => $produk->barcode,
                    'qty' => $qty,
                    'penalty_per_unit' => $penaltyPerUnit,
                    'status' => 'open',
                    'staff_id' => $staff->id,
                    'waktu' => now(),
                ]);

                $transactions[] = $tx;
                $totalDelta += $poinDelta;
                $itemsMeta[] = [
                    'tx_id' => $tx->id,
                    'barcode' => $produk->barcode,
                    'nama_produk' => $produk->nama_produk,
                    'qty' => $qty,
                    'penalty_per_unit' => $penaltyPerUnit,
                    'poin_delta' => $poinDelta,
                ];
            }

            $before = $santri->current_poin;
            $newPoin = $before + $totalDelta;

            // PoinLedger entries with RUNNING balance (per item, incremental)
            // saldo_sebelum/sesudah merefleksikan saldo running agar laporan akurat
            $runningSaldo = $before;
            foreach ($transactions as $idx => $tx) {
                $runningSaldo += $itemsMeta[$idx]['poin_delta'];
                PoinLedger::create([
                    'nis' => $santri->nis,
                    'source_type' => PoinLedger::SOURCE_PURCHASE,
                    'source_id' => $tx->id,
                    'poin_delta' => $itemsMeta[$idx]['poin_delta'],
                    'saldo_sebelum' => $runningSaldo - $itemsMeta[$idx]['poin_delta'],
                    'saldo_sesudah' => $runningSaldo,
                    'waktu' => now(),
                ]);
                // Add PoinLedger source_id mapping for traceability
                $itemsMeta[$idx]['ledger_id'] = ($itemsMeta[$idx]['ledger_id'] ?? 0);
            }

            $santri->current_poin = $newPoin;
            $santri->is_blocked = ($newPoin <= (int) DB::table('config_settings')->where('key', 'default_negative_limit')->value('value'));
            if ($santri->is_blocked && !$santri->block_at) {
                $santri->block_at = now();
                $santri->block_reason = "Melewati ambang minus 50 poin";
            }
            $santri->save();

            AuditLog::record(
                $isBatch ? 'pembelian.batch_create' : 'pembelian.create',
                [
                    'tx_ids' => array_map(fn($t) => $t->id, $transactions),
                    'nis' => $santri->nis,
                    'items' => $itemsMeta,
                    'total_poin_delta' => $totalDelta,
                    'saldo_after' => $newPoin,
                ]
            );

            return response()->json([
                'mode' => $isBatch ? 'batch' : 'single',
                'transactions' => $transactions,
                'items' => $itemsMeta,
                'santri' => [
                    'nis' => $santri->nis,
                    'current_poin' => $newPoin,
                    'is_blocked' => $santri->is_blocked,
                ],
                'total_poin_delta' => $totalDelta,
            ], 201);
        });
    }

    /**
     * GET /api/pembelian — staff history (own transactions).
     */
    public function history(Request $request)
    {
        $transactions = TransaksiPembelian::with(['santri', 'produk'])
            ->where('staff_id', $request->user()->id)
            ->orderBy('waktu', 'desc')
            ->limit(100)
            ->get();
        return response()->json(['data' => $transactions]);
    }
}
