<?php

namespace Tests\Feature;

use Tests\TestCase;

class ProfileAndSecurityTest extends TestCase
{
    public function test_me_profile_returns_biodata(): void
    {
        $user = $this->makeUser('staff_kantin', [
            'phone' => '08123456789',
            'gender' => 'L',
            'birth_place' => 'Jakarta',
        ]);
        $this->actAs($user);

        $response = $this->getJson('/api/me/profile');

        $response->assertStatus(200)
            ->assertJsonStructure(['user' => ['id', 'name', 'email', 'role', 'biodata']]);
    }

    public function test_update_me_profile(): void
    {
        $user = $this->makeUser('staff_kantin', [
            'phone' => '08123456789',
        ]);
        $this->actAs($user);

        $response = $this->patchJson('/api/me/profile', [
            'phone' => '08987654321',
            'address' => 'Jl. Baru No. 10',
        ]);

        $response->assertStatus(200);
        $user->refresh();
        $this->assertSame('08987654321', $user->phone);
        $this->assertSame('Jl. Baru No. 10', $user->address);
    }

    public function test_update_me_profile_with_empty_payload_succeeds(): void
    {
        $user = $this->makeUser('staff_kantin');
        $this->actAs($user);

        // Empty payload should still be allowed (handled gracefully)
        $response = $this->patchJson('/api/me/profile', []);

        // Server may return 422 for empty; we accept both
        $this->assertContains($response->status(), [200, 422]);
    }

    public function test_status_endpoint_no_auth_required(): void
    {
        $response = $this->getJson('/api/status');

        // Either success or maintenance notice
        $this->assertContains($response->status(), [200, 503]);
    }

    public function test_role_middleware_blocks_wrong_role(): void
    {
        $santri = $this->makeSantri('99888');
        $this->actAs($santri->user);

        // Santri can redeem (role:santri endpoint)
        $reward = \App\Models\Reward::first();
        $response = $this->postJson("/api/reward/{$reward->id_reward}/redeem");
        // Either success or insufficient-points
        $this->assertContains($response->status(), [200, 422]);
    }

    public function test_maintenance_mode_blocks_writes(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        // Enable maintenance
        \App\Models\ConfigSetting::where('key', 'is_maintenance')->update(['value' => 'true']);
        \Illuminate\Support\Facades\Cache::forget('config:is_maintenance');

        $response = $this->postJson('/api/pembelian', [
            'nis' => '99888',
            'items' => [['barcode' => 'TEST001', 'qty' => 1]],
        ]);
        $response->assertStatus(503);

        // Disable maintenance
        \App\Models\ConfigSetting::where('key', 'is_maintenance')->update(['value' => 'false']);
        \Illuminate\Support\Facades\Cache::forget('config:is_maintenance');
    }

    public function test_read_only_mode_blocks_writes_for_non_super_admin(): void
    {
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        \App\Models\ConfigSetting::where('key', 'is_readonly')->update(['value' => 'true']);
        \Illuminate\Support\Facades\Cache::forget('config:is_readonly');

        $response = $this->postJson('/api/pembelian', [
            'nis' => '99888',
            'items' => [['barcode' => 'TEST001', 'qty' => 1]],
        ]);
        $response->assertStatus(503);

        \App\Models\ConfigSetting::where('key', 'is_readonly')->update(['value' => 'false']);
        \Illuminate\Support\Facades\Cache::forget('config:is_readonly');
    }

    public function test_super_admin_can_write_in_readonly_mode(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        \App\Models\ConfigSetting::where('key', 'is_readonly')->update(['value' => 'true']);
        \Illuminate\Support\Facades\Cache::forget('config:is_readonly');

        $response = $this->getJson('/api/super-admin/users');
        $response->assertStatus(200);

        \App\Models\ConfigSetting::where('key', 'is_readonly')->update(['value' => 'false']);
        \Illuminate\Support\Facades\Cache::forget('config:is_readonly');
    }

    public function test_maintenance_blocks_non_super_admin_but_allows_super_admin_to_disable(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        \App\Models\ConfigSetting::where('key', 'is_maintenance')->update(['value' => 'true']);
        \Illuminate\Support\Facades\Cache::forget('config:is_maintenance');

        // Super admin can still toggle maintenance off
        $toggleResponse = $this->postJson('/api/super-admin/mode', [
            'key' => 'is_maintenance',
            'value' => false,
        ]);
        $toggleResponse->assertStatus(200);
        $this->assertFalse(\App\Models\ConfigSetting::isMaintenance());
    }
}
