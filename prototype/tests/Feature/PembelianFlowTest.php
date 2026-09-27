<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Produk;
use App\Models\TransaksiPembelian;
use App\Models\PoinLedger;

class PembelianFlowTest extends TestCase
{
    public function test_staff_can_create_pembelian(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $santri = $this->makeSantri('99888');
        $this->actAs($staff);

        $response = $this->postJson('/api/pembelian', [
            'nis' => '99888',
            'items' => [
                ['barcode' => 'TEST001', 'qty' => 2],
            ],
        ]);

        $response->assertStatus(201)
            ->assertJsonStructure(['transactions', 'items', 'santri', 'total_poin_delta']);
    }

    public function test_non_staff_cannot_create_pembelian(): void
    {
        $user = $this->makeUser('santri');
        $this->actAs($user);

        $response = $this->postJson('/api/pembelian', [
            'nis' => '99888',
            'items' => [['barcode' => 'TEST001', 'qty' => 1]],
        ]);

        $response->assertStatus(403);
    }

    public function test_pembelian_with_archived_produk_fails(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $santri = $this->makeSantri('99888');
        $this->actAs($staff);

        // Archive TEST001
        $produk = Produk::where('barcode', 'TEST001')->first();
        $produk->update(['archived_at' => now(), 'archived_by' => $staff->id]);

        $response = $this->postJson('/api/pembelian', [
            'nis' => '99888',
            'items' => [['barcode' => 'TEST001', 'qty' => 1]],
        ]);

        $response->assertStatus(422);
        $produk->update(['archived_at' => null, 'archived_by' => null]);  // cleanup
    }

    public function test_pembelian_with_blocked_santri_plastik_fails(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $santri = $this->makeSantri('99888');
        $santri->update(['is_blocked' => true, 'current_poin' => -60]);
        $this->actAs($staff);

        $response = $this->postJson('/api/pembelian', [
            'nis' => '99888',
            'items' => [['barcode' => 'TEST001', 'qty' => 1]],
        ]);

        $response->assertStatus(422);
        $santri->update(['is_blocked' => false]);
    }

    public function test_pembelian_creates_poin_ledger_entry_with_running_balance(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $santri = $this->makeSantri('99888');
        $this->actAs($staff);

        $ledgerBefore = PoinLedger::where('nis', '99888')->count();
        $this->postJson('/api/pembelian', [
            'nis' => '99888',
            'items' => [['barcode' => 'TEST001', 'qty' => 2]],
        ])->assertStatus(201);

        $ledgerAfter = PoinLedger::where('nis', '99888')->count();
        $this->assertGreaterThan($ledgerBefore, $ledgerAfter, 'PoinLedger entry harus ter-create');

        // Verify running balance format
        $entry = PoinLedger::where('nis', '99888')->latest('id')->first();
        $expectedSesudah = $entry->saldo_sebelum + $entry->poin_delta;
        $this->assertEquals($expectedSesudah, $entry->saldo_sesudah,
            "saldo_sesudah ({$entry->saldo_sesudah}) harus = saldo_sebelum ({$entry->saldo_sebelum}) + delta ({$entry->poin_delta})");
    }

    /**
     * [F-change] Sistem poin FLAT: setiap produk = -1 per unit,
     * TIDAK ada escalation berdasarkan prior_open_count (sebelumnya -1/-2/-3).
     * Regression test untuk pastikan aturan ini berlaku meskipun Santri sudah punya
     * banyak hutang terbuka.
     */
    public function test_pembelian_flat_penalty_per_unit_no_escalation(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $santri = $this->makeSantri('99888');
        $this->actAs($staff);

        // Batch 1: beli 3 unit — diharapkan -3 poin (flat, bukan tier)
        $this->postJson('/api/pembelian', [
            'nis' => '99888',
            'items' => [['barcode' => 'TEST001', 'qty' => 3]],
        ])->assertStatus(201);

        $tx1 = TransaksiPembelian::where('nis', '99888')->latest('id')->first();
        $this->assertEquals(-1, $tx1->penalty_per_unit,
            'Batch pertama harus penalty_per_unit = -1');
        $this->assertEquals(-3, $tx1->penalty_per_unit * $tx1->qty,
            'Beli 3 unit = -3 poin (flat -1 per unit)');

        // Batch 2: dengan prior_open=1+, harusnya TETAP -1 per unit (bukan -2)
        // Pakai barcode TEST001 yang sama — tetap valid karena validasi hanya cek existence.
        $this->postJson('/api/pembelian', [
            'nis' => '99888',
            'items' => [['barcode' => 'TEST001', 'qty' => 2]],
        ])->assertStatus(201);

        $tx2 = TransaksiPembelian::where('nis', '99888')->latest('id')->first();
        $this->assertEquals(-1, $tx2->penalty_per_unit,
            'Batch kedua meski prior_open>0, tetap -1 per unit (TIDAK escalate ke -2)');
        $this->assertEquals(-2, $tx2->penalty_per_unit * $tx2->qty,
            'Beli 2 unit = -2 poin (flat, tanpa escalation)');

        // Batch 3: dengan prior_open=2+, harusnya MASIH -1 per unit (bukan -3 capped)
        $this->postJson('/api/pembelian', [
            'nis' => '99888',
            'items' => [['barcode' => 'TEST001', 'qty' => 1]],
        ])->assertStatus(201);

        $tx3 = TransaksiPembelian::where('nis', '99888')->latest('id')->first();
        $this->assertEquals(-1, $tx3->penalty_per_unit,
            'Batch ketiga meski prior_open>=2, tetap -1 per unit (TIDAK escalate atau cap ke -3)');
        $this->assertEquals(-1, $tx3->penalty_per_unit * $tx3->qty,
            'Beli 1 unit = -1 poin (flat)');
    }

    public function test_pembelian_respects_top_level_nis(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $santri = $this->makeSantri('99888');
        $this->actAs($staff);

        $response = $this->postJson('/api/pembelian', [
            'nis' => '99888',
            'items' => [
                ['barcode' => 'TEST001', 'qty' => 1, 'nis' => 'OTHER'],  // malicious
            ],
        ]);

        $response->assertStatus(201);
        // Verify transaction uses '99888', not 'OTHER'
        $tx = TransaksiPembelian::where('nis', 'OTHER')->first();
        $this->assertNull($tx, 'Item-level nis harus diabaikan');
        $tx = TransaksiPembelian::where('nis', '99888')->first();
        $this->assertNotNull($tx);
    }

    public function test_pembelian_with_ghost_nis_returns_422(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $response = $this->postJson('/api/pembelian', [
            'nis' => '99999_GHOST',
            'items' => [['barcode' => 'TEST001', 'qty' => 1]],
        ]);

        $response->assertStatus(422);
    }

    public function test_pembelian_batch_with_multiple_items(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $santri = $this->makeSantri('99888');
        $this->actAs($staff);

        $response = $this->postJson('/api/pembelian', [
            'nis' => '99888',
            'items' => [
                ['barcode' => 'TEST001', 'qty' => 1],
                ['barcode' => 'TEST001', 'qty' => 2],
            ],
        ]);

        $response->assertStatus(201);
        $count = TransaksiPembelian::where('nis', '99888')->count();
        $this->assertEquals(2, $count);
    }

    public function test_pembelian_history_visible_to_staff(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $response = $this->getJson('/api/pembelian/history');

        $response->assertStatus(200)
            ->assertJsonStructure(['data']);
    }
}
