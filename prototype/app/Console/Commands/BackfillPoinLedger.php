<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use App\Models\PoinLedger;
use App\Models\Santri;
use App\Models\TransaksiPembelian;
use App\Models\SesiVerifikasi;
use App\Models\AuditLog;

class BackfillPoinLedger extends Command
{
    protected $signature = 'amanah:backfill-poin-ledger {--force : Skip confirmation}';
    protected $description = 'Backfill poin_ledger from existing transaksi_pembelian (settled) and sesi_verifikasi_items (committed)';

    public function handle(): int
    {
        $existingCount = PoinLedger::count();
        if ($existingCount > 0 && !$this->option('force')) {
            $this->error("poin_ledger sudah punya {$existingCount} entries. Gunakan --force untuk re-backfill (akan duplikat).");
            return self::FAILURE;
        }

        $this->info('=== Backfill PoinLedger ===');

        // 1. Settled transaksi_pembelian (purchase source)
        $txCount = DB::table('transaksi_pembelian')
            ->where('status', 'settled')
            ->count();
        $this->info("Ditemukan {$txCount} transaksi settled untuk di-backfill.");

        $created = 0;
        foreach (Santri::all() as $santri) {
            $runningSaldo = $santri->current_poin;

            // Cari semua settled transaksi untuk NIS ini, urut waktu
            $txs = TransaksiPembelian::where('nis', $santri->nis)
                ->where('status', 'settled')
                ->orderBy('waktu', 'asc')
                ->orderBy('id', 'asc')
                ->get();

            foreach ($txs as $tx) {
                $delta = $tx->penalty_per_unit * $tx->qty;
                // Cek apakah sudah ada PoinLedger untuk tx ini
                $exists = PoinLedger::where('source_type', PoinLedger::SOURCE_PURCHASE)
                    ->where('source_id', $tx->id)
                    ->exists();
                if ($exists) continue;

                $saldoSebelum = $runningSaldo - $delta;
                PoinLedger::create([
                    'nis' => $santri->nis,
                    'source_type' => PoinLedger::SOURCE_PURCHASE,
                    'source_id' => $tx->id,
                    'poin_delta' => $delta,
                    'saldo_sebelum' => $saldoSebelum,
                    'saldo_sesudah' => $runningSaldo,
                    'waktu' => $tx->waktu,
                ]);
                $created++;
            }

            // Sesi verifikasi yang sudah selesai
            $sesiList = SesiVerifikasi::where('nis', $santri->nis)
                ->whereNotNull('waktu_selesai')
                ->orderBy('waktu_mulai', 'asc')
                ->orderBy('id', 'asc')
                ->get();

            foreach ($sesiList as $sesi) {
                // Kita tidak tahu running saldo per sesi, jadi pakai delta incremental dari current_poin - delta_remaining
                // Pendekatan aman: hanya insert PoinLedger untuk item yang belum ada
                foreach ($sesi->items as $item) {
                    if ($item->poin_delta == 0) continue;
                    $exists = PoinLedger::where('source_type', PoinLedger::SOURCE_RETURN_MATCH)
                        ->where('source_id', $item->id)
                        ->exists();
                    if ($exists) continue;
                    // Approximate: pakai current running saldo (akan akurat jika backfill sebelumnya juga increment)
                    PoinLedger::create([
                        'nis' => $santri->nis,
                        'source_type' => PoinLedger::SOURCE_RETURN_MATCH,
                        'source_id' => $item->id,
                        'poin_delta' => $item->poin_delta,
                        'saldo_sebelum' => $runningSaldo,
                        'saldo_sesudah' => $runningSaldo + $item->poin_delta,
                        'waktu' => $item->created_at ?? now(),
                    ]);
                    $runningSaldo += $item->poin_delta;
                    $created++;
                }
            }
        }

        $this->info("Berhasil membuat {$created} PoinLedger entries.");

        // Re-compute saldo based on ledger
        $this->info('Memperbarui current_poin berdasarkan ledger...');
        foreach (Santri::all() as $santri) {
            $saldo = PoinLedger::where('nis', $santri->nis)->sum('poin_delta');
            $santri->current_poin = $saldo;
            $negativeLimit = (int) DB::table('config_settings')
                ->where('key', 'default_negative_limit')->value('value') ?? -50;
            $santri->is_blocked = ($saldo <= $negativeLimit);
            $santri->save();
        }

        $totalLedger = PoinLedger::count();
        $this->info("Total PoinLedger sekarang: {$totalLedger}");

        AuditLog::record('superadmin.backfill_poin_ledger', [
            'created_count' => $created,
            'total_after' => $totalLedger,
        ]);

        return self::SUCCESS;
    }
}
