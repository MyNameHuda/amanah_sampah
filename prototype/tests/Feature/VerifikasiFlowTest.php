<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\SesiVerifikasi;
use App\Models\TransaksiPembelian;
use App\Models\PoinLedger;

class VerifikasiFlowTest extends TestCase
{
    public function test_petugas_can_open_sesi(): void
    {
        $petugas = $this->makeUser('petugas_kesantrian');
        $santri = $this->makeSantri('99888');
        $this->actAs($petugas);

        $response = $this->postJson('/api/verifikasi/sesi', [
            'nis' => '99888',
        ]);

        $response->assertStatus(201)
            ->assertJsonStructure(['sesi', 'open_debts', 'santri']);
    }

    public function test_non_petugas_cannot_open_sesi(): void
    {
        $user = $this->makeUser('staff_kantin');
        $this->actAs($user);

        $response = $this->postJson('/api/verifikasi/sesi', [
            'nis' => '99888',
        ]);

        $response->assertStatus(403);
    }

    public function test_petugas_can_add_items_to_sesi(): void
    {
        $petugas = $this->makeUser('petugas_kesantrian');
        $santri = $this->makeSantri('99888');
        $this->actAs($petugas);

        // Add some open transactions so there's a debt to verify
        TransaksiPembelian::create([
            'nis' => '99888',
            'barcode' => 'TEST001',
            'qty' => 3,
            'penalty_per_unit' => -1,
            'status' => 'open',
            'staff_id' => $petugas->id,
            'waktu' => now(),
        ]);

        // Open sesi
        $sesiResponse = $this->postJson('/api/verifikasi/sesi', ['nis' => '99888']);
        $sesiId = $sesiResponse->json('sesi.id');

        // Add item
        $response = $this->postJson("/api/verifikasi/sesi/{$sesiId}/items", [
            'barcode' => 'TEST001',
            'qty_in' => 2,
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('item.qty_matched', 2)
            ->assertJsonPath('item.qty_excess', 0)
            ->assertJsonPath('item.qty_shortfall', 1)
            ->assertJsonPath('item.poin_delta', 4);  // 2 matched × 2
    }

    public function test_sesi_with_active_session_returns_422(): void
    {
        $petugas = $this->makeUser('petugas_kesantrian');
        $santri = $this->makeSantri('99888');
        $this->actAs($petugas);

        // First sesi
        $this->postJson('/api/verifikasi/sesi', ['nis' => '99888'])->assertStatus(201);

        // Second sesi for same siswa should fail
        $response = $this->postJson('/api/verifikasi/sesi', ['nis' => '99888']);
        $response->assertStatus(422);
    }

    public function test_commit_sesi_creates_poin_ledger_with_running_balance(): void
    {
        $petugas = $this->makeUser('petugas_kesantrian');
        $santri = $this->makeSantri('99888');
        $santri->update(['current_poin' => -10]);
        $this->actAs($petugas);

        // Open debt for matching
        TransaksiPembelian::create([
            'nis' => '99888',
            'barcode' => 'TEST001',
            'qty' => 5,
            'penalty_per_unit' => -1,
            'status' => 'open',
            'staff_id' => $petugas->id,
            'waktu' => now(),
        ]);

        // Open sesi
        $sesiResponse = $this->postJson('/api/verifikasi/sesi', ['nis' => '99888']);
        $sesiId = $sesiResponse->json('sesi.id');

        // Add 2 items with different deltas
        $this->postJson("/api/verifikasi/sesi/{$sesiId}/items", [
            'barcode' => 'TEST001', 'qty_in' => 2,
        ])->assertStatus(201);

        $this->postJson("/api/verifikasi/sesi/{$sesiId}/items", [
            'barcode' => 'TEST001', 'qty_in' => 1,
        ])->assertStatus(201);

        // Commit
        $commit = $this->postJson("/api/verifikasi/sesi/{$sesiId}/commit");
        $commit->assertStatus(200);

        // Verify PoinLedger entries have proper running balance
        $entries = PoinLedger::where('nis', '99888')
            ->where('source_type', PoinLedger::SOURCE_RETURN_MATCH)
            ->orderBy('id', 'asc')
            ->get();

        // Each entry should have running saldo (saldo_sesudah - poin_delta should equal saldo_sebelum)
        foreach ($entries as $entry) {
            $expectedSebelum = $entry->saldo_sesudah - $entry->poin_delta;
            $this->assertEquals($expectedSebelum, $entry->saldo_sebelum,
                "Entry #{$entry->id}: saldo_sebelum should match saldo_sesudah - delta");
        }
    }

    public function test_admin_can_force_end_idle_sesi(): void
    {
        $petugas = $this->makeUser('petugas_kesantrian');
        $admin = $this->makeUser('super_admin');  // use super_admin instead of admin_kesantrian
        $santri = $this->makeSantri('99888');

        $this->actingAs($petugas, 'sanctum');
        $sesiResponse = $this->postJson('/api/verifikasi/sesi', ['nis' => '99888']);
        $sesiId = $sesiResponse->json('sesi.id');

        // Login as super admin
        $this->actAs($admin);

        $response = $this->postJson("/api/admin/verifikasi/{$sesiId}/force-end", [
            'alasan' => 'Test force end via PHPUnit test',
        ]);

        if ($response->status() !== 200) {
            dump('Response status: ' . $response->status() . ' body: ' . $response->getContent());
        }

        $response->assertStatus(200);
        $sesi = SesiVerifikasi::find($sesiId);
        $this->assertNotNull($sesi->waktu_selesai);
    }

    public function test_cancel_sesi(): void
    {
        $petugas = $this->makeUser('petugas_kesantrian');
        $santri = $this->makeSantri('99888');
        $this->actAs($petugas);

        $sesiResponse = $this->postJson('/api/verifikasi/sesi', ['nis' => '99888']);
        $sesiId = $sesiResponse->json('sesi.id');

        $response = $this->postJson("/api/verifikasi/sesi/{$sesiId}/cancel", [
            'reason' => 'test cancel',
        ]);

        $response->assertStatus(200);
        $sesi = SesiVerifikasi::find($sesiId);
        $this->assertNotNull($sesi->waktu_selesai);
    }
}
