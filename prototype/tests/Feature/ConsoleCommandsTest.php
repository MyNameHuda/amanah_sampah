<?php

namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Support\Facades\Artisan;
use App\Models\PoinLedger;

class ConsoleCommandsTest extends TestCase
{
    public function test_archive_audit_command_runs_successfully(): void
    {
        $exitCode = Artisan::call('amanah:archive-audit');
        $this->assertEquals(0, $exitCode);
    }

    public function test_backfill_poin_ledger_command_runs(): void
    {
        // Create a user with some settlement that triggers backfill
        $santri = $this->makeSantri('99888');
        \App\Models\TransaksiPembelian::create([
            'nis' => '99888',
            'barcode' => 'TEST001',
            'qty' => 2,
            'penalty_per_unit' => -1,
            'status' => 'settled',
            'staff_id' => $this->makeUser('staff_kantin')->id,
            'waktu' => now()->subMonth(),
            'settled_at' => now()->subMonth(),
        ]);

        $exitCode = Artisan::call('amanah:backfill-poin-ledger', ['--force' => true]);
        $this->assertEquals(0, $exitCode);

        // Verify PoinLedger entry created
        $entry = PoinLedger::where('nis', '99888')
            ->where('source_type', PoinLedger::SOURCE_PURCHASE)
            ->first();
        $this->assertNotNull($entry);
    }

    public function test_archive_audit_does_not_duplicate(): void
    {
        $user = $this->makeUser('staff_kantin');
        \App\Models\AuditLog::record('test.action', ['k' => 'v']);

        Artisan::call('amanah:archive-audit');
        $count1 = \Illuminate\Support\Facades\DB::table('audit_logs_archive')->count();

        Artisan::call('amanah:archive-audit');
        $count2 = \Illuminate\Support\Facades\DB::table('audit_logs_archive')->count();

        $this->assertEquals($count1, $count2, 'Archive should be idempotent');
    }
}
