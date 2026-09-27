<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\KategoriProduk;

class ProductBarcodeAddTest extends TestCase
{
    public function test_staff_kantin_can_create_produk(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $kat = KategoriProduk::where('nama_kategori', 'Test Snack')->first();

        $response = $this->postJson('/api/produk', [
            'barcode' => 'NEWBC001',
            'nama_produk' => 'Produk Baru Test',
            'id_kategori' => $kat->id,
            'is_excluded_from_debit' => false,
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('produk.barcode', 'NEWBC001')
            ->assertJsonPath('produk.nama_produk', 'Produk Baru Test');
    }

    public function test_check_barcode_returns_available_for_new(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $response = $this->getJson('/api/produk/check-barcode/BRANDNEW123');

        $response->assertStatus(200)
            ->assertJsonPath('available', true)
            ->assertJsonPath('barcode', 'BRANDNEW123');
    }

    public function test_check_barcode_returns_duplicate_for_existing(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        // TEST001 already exists from seeder
        $response = $this->getJson('/api/produk/check-barcode/TEST001');

        $response->assertStatus(409)
            ->assertJsonPath('available', false)
            ->assertJsonPath('reason', 'duplicate')
            ->assertJsonPath('existing.barcode', 'TEST001')
            ->assertJsonPath('existing.nama_produk', 'Test Snack');
    }

    public function test_check_barcode_rejects_empty(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        // Empty path: Laravel returns 404 (route no match) — that's fine
        $response = $this->getJson('/api/produk/check-barcode/');
        $this->assertContains($response->status(), [404, 405]);
    }

    public function test_check_barcode_url_encoded(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $response = $this->getJson('/api/produk/check-barcode/' . urlencode('TEST001'));

        $response->assertStatus(409)
            ->assertJsonPath('available', false);
    }

    public function test_petugas_kesantrian_can_create_produk(): void
    {
        $petugas = $this->makeUser('petugas_kesantrian');
        $this->actAs($petugas);

        $kat = KategoriProduk::where('nama_kategori', 'Test Snack')->first();

        // Use unique barcode per test run
        $barcode = 'P' . random_int(10000, 99999);

        $response = $this->postJson('/api/produk', [
            'barcode' => $barcode,
            'nama_produk' => 'Produk Petugas',
            'id_kategori' => $kat->id,
        ]);

        if ($response->status() !== 201) {
            dump('Response status: ' . $response->status() . ' body: ' . $response->getContent());
        }

        $response->assertStatus(201);
    }

    public function test_staff_kantin_can_check_barcode(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $response = $this->getJson('/api/produk/check-barcode/AVAIL123');
        $response->assertStatus(200);

        $response = $this->getJson('/api/produk/check-barcode/TEST001');
        $response->assertStatus(409);
    }

    public function test_santri_cannot_check_barcode(): void
    {
        $santri = $this->makeSantri('99888');
        $this->actAs($santri->user);

        $response = $this->getJson('/api/produk/check-barcode/ANYTHING');
        $response->assertStatus(403);
    }

    public function test_santri_cannot_create_produk(): void
    {
        $santri = $this->makeSantri('99888');
        $this->actAs($santri->user);

        $kat = KategoriProduk::where('nama_kategori', 'Test Snack')->first();

        $response = $this->postJson('/api/produk', [
            'barcode' => 'SANTRI01',
            'nama_produk' => 'Produk Santri',
            'id_kategori' => $kat->id,
        ]);

        $response->assertStatus(403);
    }

    public function test_staff_cannot_archive_produk(): void
    {
        // Archive masih restricted untuk admin/super/petugas (PRD strict)
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $response = $this->deleteJson('/api/produk/TEST001');
        $response->assertStatus(403);
    }

    public function test_staff_cannot_update_produk(): void
    {
        // Update masih restricted
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $response = $this->patchJson('/api/produk/TEST001', [
            'nama_produk' => 'Updated',
        ]);
        $response->assertStatus(403);
    }

    public function test_create_produk_with_duplicate_barcode_returns_422(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $kat = KategoriProduk::where('nama_kategori', 'Test Snack')->first();

        $response = $this->postJson('/api/produk', [
            'barcode' => 'TEST001',  // already exists
            'nama_produk' => 'Duplicate Product',
            'id_kategori' => $kat->id,
        ]);

        $response->assertStatus(422);
    }

    public function test_create_produk_validates_required_fields(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        // Missing nama_produk
        $response = $this->postJson('/api/produk', [
            'barcode' => 'NEW002',
            'id_kategori' => 1,
        ]);
        $response->assertStatus(422);

        // Missing barcode
        $response = $this->postJson('/api/produk', [
            'nama_produk' => 'No Barcode',
            'id_kategori' => 1,
        ]);
        $response->assertStatus(422);

        // Missing kategori
        $response = $this->postJson('/api/produk', [
            'barcode' => 'NEW003',
            'nama_produk' => 'No Category',
        ]);
        $response->assertStatus(422);
    }

    // ===== [P6] KATEGORI: Staff can create =====

    public function test_staff_kantin_can_create_kategori(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $response = $this->postJson('/api/kategori', [
            'nama_kategori' => 'Kategori Staff Test',
            'deskripsi' => 'Kategori dari staff',
            'is_default_excluded' => false,
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('kategori.nama_kategori', 'Kategori Staff Test');
        $this->assertDatabaseHas('kategori_produk', ['nama_kategori' => 'Kategori Staff Test']);
    }

    public function test_admin_can_create_kategori(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $this->actAs($admin);

        $response = $this->postJson('/api/kategori', [
            'nama_kategori' => 'Kategori Admin Test',
            'deskripsi' => 'Kategori dari admin',
        ]);

        $response->assertStatus(201);
    }

    public function test_duplicate_kategori_returns_422(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        // 'Test Snack' is already seeded
        $response = $this->postJson('/api/kategori', [
            'nama_kategori' => 'Test Snack',
        ]);

        $response->assertStatus(422);
    }

    public function test_santri_cannot_create_kategori(): void
    {
        $santri = $this->makeSantri('99888');
        $this->actAs($santri->user);

        $response = $this->postJson('/api/kategori', [
            'nama_kategori' => 'Ilegal Kategori',
        ]);

        $response->assertStatus(403);
    }

    public function test_check_kategori_name_available(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $response = $this->getJson('/api/kategori/check-name?nama=Kategori Baru');
        $response->assertStatus(200)
            ->assertJsonPath('available', true);
    }

    public function test_check_kategori_name_duplicate(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        // 'Test Snack' exists from seeder
        $response = $this->getJson('/api/kategori/check-name?nama=Test+Snack');
        $response->assertStatus(409)
            ->assertJsonPath('available', false)
            ->assertJsonPath('reason', 'duplicate');
    }

    public function test_check_kategori_name_invalid(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $response = $this->getJson('/api/kategori/check-name?nama=');
        $response->assertStatus(422);

        // Too long name (> 50 char)
        $longName = str_repeat('a', 51);
        $response = $this->getJson('/api/kategori/check-name?nama=' . $longName);
        $response->assertStatus(422);
    }

    public function test_create_kategori_creates_audit_log(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $beforeCount = \App\Models\AuditLog::where('action', 'kategori.create')->count();

        $this->postJson('/api/kategori', [
            'nama_kategori' => 'Kategori Audit Test',
        ])->assertStatus(201);

        $afterCount = \App\Models\AuditLog::where('action', 'kategori.create')->count();
        $this->assertEquals($beforeCount + 1, $afterCount, 'Kategori create harus tercatat di audit log');

        // Audit harus include role staff_kantin
        $audit = \App\Models\AuditLog::where('action', 'kategori.create')->latest()->first();
        $this->assertEquals('staff_kantin', $audit->role);
        $this->assertEquals('Kategori Audit Test', $audit->payload['name']);
    }
}
