<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Setup test environment — migrate fresh DB.
     */
    protected function setUp(): void
    {
        parent::setUp();
        // Ensure DB is fresh for each test
        $this->artisan('migrate:fresh', ['--seed' => false]);
        $this->seedTestData();
    }

    /**
     * Seed minimal test data yang dipakai bersama banyak test.
     */
    protected function seedTestData(): void
    {
        \App\Models\ConfigSetting::updateOrCreate(
            ['key' => 'default_negative_limit'],
            ['value' => '-50', 'description' => 'Default negative limit', 'updated_at' => now()]
        );
        \App\Models\ConfigSetting::updateOrCreate(
            ['key' => 'reset_target_poin'],
            ['value' => '0', 'description' => 'Reset target poin', 'updated_at' => now()]
        );
        \App\Models\ConfigSetting::updateOrCreate(
            ['key' => 'is_maintenance'],
            ['value' => 'false', 'description' => 'Maintenance mode', 'updated_at' => now()]
        );
        \App\Models\ConfigSetting::updateOrCreate(
            ['key' => 'is_readonly'],
            ['value' => 'false', 'description' => 'Read-only mode', 'updated_at' => now()]
        );

        // Minimal kategori + produk + reward
        $kat = \App\Models\KategoriProduk::firstOrCreate(
            ['nama_kategori' => 'Test Snack'],
            ['deskripsi' => 'Kategori test', 'is_default_excluded' => false]
        );

        \App\Models\Produk::updateOrCreate(
            ['barcode' => 'TEST001'],
            [
                'nama_produk' => 'Test Snack',
                'id_kategori' => $kat->id,
                'is_excluded_from_debit' => false,
            ]
        );

        \App\Models\Reward::updateOrCreate(
            ['nama_reward' => 'Test Reward'],
            [
                'biaya_poin' => 30,
                'stok' => 10,
                'status_aktif' => true,
            ]
        );
    }

    /**
     * Helper: create user dengan role tertentu.
     */
    protected function makeUser(string $role, array $extra = []): \App\Models\User
    {
        return \App\Models\User::create(array_merge([
            'name' => 'Test ' . ucfirst($role) . ' ' . uniqid(),
            'role' => $role,
            'password' => bcrypt('password123'),
            'email' => 'test_' . $role . '_' . uniqid() . '@test.local',
        ], $extra));
    }

    /**
     * Helper: create Santri + linked User.
     */
    protected function makeSantri(string $nis = null): \App\Models\Santri
    {
        $user = $this->makeUser('santri');
        return \App\Models\Santri::create([
            'nis' => $nis ?? 'TEST' . str_pad((string)random_int(1, 99999), 5, '0', STR_PAD_LEFT),
            'user_id' => $user->id,
            'nama' => 'Test Santri',
            'kelas' => 'X-A',
            'current_poin' => 0,
        ]);
    }

    /**
     * Helper: authenticate user dan return Bearer token.
     */
    protected function authToken(\App\Models\User $user): string
    {
        return $user->createToken('test')->plainTextToken;
    }

    /**
     * Helper: actAs(user) — set Bearer token untuk next request.
     * Pakai actingAs() untuk set guard state DAN withHeader() untuk Bearer.
     */
    protected function actAs(\App\Models\User $user): self
    {
        $this->flushHeaders();
        $this->actingAs($user, 'sanctum');
        $this->withHeader('Authorization', 'Bearer ' . $this->authToken($user));
        return $this;
    }

    /**
     * Helper: clear cache between tests.
     */
    protected function tearDown(): void
    {
        \Illuminate\Support\Facades\Cache::flush();
        parent::tearDown();
    }
}
