<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Produk;

class BarcodeScanTest extends TestCase
{
    public function test_staff_kantin_can_scan(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $response = $this->getJson('/api/produk/scan/TEST001');

        $response->assertStatus(200)
            ->assertJsonPath('found', true)
            ->assertJsonPath('produk.barcode', 'TEST001')
            ->assertJsonPath('produk.is_active', true)
            ->assertJsonPath('produk.kategori', 'Test Snack');
    }

    public function test_petugas_kesantrian_can_scan(): void
    {
        $petugas = $this->makeUser('petugas_kesantrian');
        $this->actAs($petugas);

        $response = $this->getJson('/api/produk/scan/TEST001');

        $response->assertStatus(200);
    }

    public function test_santri_cannot_scan(): void
    {
        $santri = $this->makeSantri('99888');
        $this->actAs($santri->user);

        $response = $this->getJson('/api/produk/scan/TEST001');

        $response->assertStatus(403);
    }

    public function test_scan_unknown_barcode_returns_404(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $response = $this->getJson('/api/produk/scan/NOTEXIST999');

        $response->assertStatus(404)
            ->assertJsonPath('found', false)
            ->assertJsonPath('barcode', 'NOTEXIST999');
    }

    public function test_scan_archived_product_returns_archived_flag(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $produk = Produk::where('barcode', 'TEST001')->first();
        $produk->update(['archived_at' => now(), 'archived_by' => $admin->id]);

        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $response = $this->getJson('/api/produk/scan/TEST001');

        $response->assertStatus(200)
            ->assertJsonPath('found', true)
            ->assertJsonPath('produk.is_active', false);

        // Cleanup
        $produk->update(['archived_at' => null, 'archived_by' => null]);
    }

    public function test_scan_url_encoded_barcode(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        // Test with special characters / URL encoding
        $response = $this->getJson('/api/produk/scan/' . urlencode('TEST001'));

        $response->assertStatus(200)
            ->assertJsonPath('found', true);
    }

    public function test_unauthenticated_scan_rejected(): void
    {
        $response = $this->getJson('/api/produk/scan/TEST001');
        $response->assertStatus(401);
    }

    public function test_scan_creates_audit_log(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $auditBefore = \App\Models\AuditLog::where('action', 'produk.scan_hit')->count();

        $this->getJson('/api/produk/scan/TEST001')->assertStatus(200);

        $auditAfter = \App\Models\AuditLog::where('action', 'produk.scan_hit')->count();
        $this->assertEquals($auditBefore + 1, $auditAfter, 'Successful scan harus tercatat di audit log');
    }

    public function test_scan_not_found_creates_audit_log(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $auditBefore = \App\Models\AuditLog::where('action', 'produk.scan_not_found')->count();

        $this->getJson('/api/produk/scan/GHOST999')->assertStatus(404);

        $auditAfter = \App\Models\AuditLog::where('action', 'produk.scan_not_found')->count();
        $this->assertEquals($auditBefore + 1, $auditAfter,
            'Failed scan (not found) harus tercatat untuk forensic');
    }

    public function test_scan_with_empty_barcode_rejected(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        // Empty barcode — Laravel returns 404 (no route matches) atau 405
        $response = $this->getJson('/api/produk/scan/');
        $this->assertContains($response->status(), [404, 405],
            'Empty barcode harus ditolak (no route match atau method not allowed)');
    }

    public function test_tier3_can_scan(): void
    {
        $tier3 = $this->makeUser('super_admin_tier3');
        $this->actAs($tier3);

        $response = $this->getJson('/api/produk/scan/TEST001');
        $response->assertStatus(200);
    }
}
