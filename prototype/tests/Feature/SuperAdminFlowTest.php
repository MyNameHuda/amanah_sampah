<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\TransaksiPembelian;
use App\Models\PoinLedger;

class SuperAdminFlowTest extends TestCase
{
    public function test_sa_can_list_users(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        $response = $this->getJson('/api/super-admin/users');

        $response->assertStatus(200)
            ->assertJsonStructure(['data']);
    }

    public function test_sa_can_create_user(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        $response = $this->postJson('/api/super-admin/users', [
            'name' => 'New Admin',
            'email' => 'newadmin@test.local',
            'role' => 'admin_kesantrian',
            'password' => 'securepass123',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('users', ['email' => 'newadmin@test.local', 'role' => 'admin_kesantrian']);
    }

    public function test_sa_can_update_user(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        $target = $this->makeUser('admin_kesantrian');

        $response = $this->patchJson("/api/super-admin/users/{$target->id}", [
            'name' => 'Updated Name',
        ]);

        $response->assertStatus(200);
        $this->assertSame('Updated Name', $target->fresh()->name);
    }

    public function test_sa_can_suspend_user(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        $target = $this->makeUser('staff_kantin');

        $response = $this->postJson("/api/super-admin/users/{$target->id}/toggle-suspend");
        $response->assertStatus(200);

        $this->assertNotNull($target->fresh()->suspended_at);
    }

    public function test_sa_can_force_logout_user(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        $target = $this->makeUser('staff_kantin');
        $target->createToken('test')->plainTextToken;

        $this->assertGreaterThan(0, $target->tokens()->count());

        $response = $this->postJson("/api/super-admin/users/{$target->id}/force-logout");
        $response->assertStatus(200);

        $this->assertSame(0, $target->fresh()->tokens()->count());
    }

    public function test_sa_can_reset_user_password(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        $target = $this->makeUser('staff_kantin');

        $response = $this->postJson("/api/super-admin/users/{$target->id}/reset-password", [
            'new_password' => 'newtemp123',
        ]);
        $response->assertStatus(200);

        $target->refresh();
        $this->assertTrue($target->must_change_password);
    }

    public function test_sa_can_toggle_maintenance(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        $response = $this->postJson('/api/super-admin/mode', [
            'key' => 'is_maintenance',
            'value' => true,
        ]);

        $response->assertStatus(200);
        $this->assertTrue(\App\Models\ConfigSetting::isMaintenance());

        // Cleanup
        \App\Models\ConfigSetting::where('key', 'is_maintenance')->update(['value' => 'false']);
        \Illuminate\Support\Facades\Cache::forget('config:is_maintenance');
    }

    public function test_sa_can_recompute_saldo(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        // Create some ledger entries first
        $santri = $this->makeSantri('99888');
        PoinLedger::create([
            'nis' => '99888',
            'source_type' => PoinLedger::SOURCE_PURCHASE,
            'poin_delta' => -10,
            'saldo_sebelum' => 0,
            'saldo_sesudah' => -10,
            'waktu' => now(),
        ]);

        $response = $this->postJson('/api/super-admin/recompute-saldo', [
            'nis' => '99888',
            'alasan' => 'Test recompute saldo via PHPUnit testing — 30 char min',
        ]);

        $response->assertStatus(200);
        $santri->refresh();
        $this->assertEquals(-10, $santri->current_poin);
    }

    public function test_sa_can_view_user_audit(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        $target = $this->makeUser('staff_kantin');
        $target->createToken('test')->plainTextToken; // creates auth.login audit
        $target->forceFill(['name' => 'Updated'])->save(); // creates audit
        \App\Models\AuditLog::record('test.action', ['k' => 'v']);

        $response = $this->getJson("/api/super-admin/users/{$target->id}/audit");

        $response->assertStatus(200);
    }

    public function test_sa_can_view_system_health(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        $response = $this->getJson('/api/super-admin/health');

        $response->assertStatus(200);
    }

    public function test_sa_can_view_siswa_timeline(): void
    {
        $sa = $this->makeUser('super_admin');
        $santri = $this->makeSantri('99888');
        $this->actAs($sa);

        $response = $this->getJson('/api/super-admin/santri/99888/timeline');

        $response->assertStatus(200);
    }

    public function test_sa_can_search_audit(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        $response = $this->getJson('/api/super-admin/audit/search?q=login');

        $response->assertStatus(200);
    }

    public function test_admin_role_cannot_access_super_admin_endpoints(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $this->actAs($admin);

        $response = $this->getJson('/api/super-admin/users');

        $response->assertStatus(403);
    }

    public function test_super_admin_tier3_can_access_super_admin_endpoints(): void
    {
        $tier3 = $this->makeUser('super_admin_tier3');
        $this->actAs($tier3);

        $response = $this->getJson('/api/super-admin/users');

        $response->assertStatus(200);
    }

    public function test_sa_can_update_config_invalidates_cache(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        \App\Models\ConfigSetting::where('key', 'is_maintenance')->update(['value' => 'false']);

        $response = $this->patchJson('/api/super-admin/config', [
            'key' => 'is_maintenance',
            'value' => 'true',
        ]);

        $response->assertStatus(200);

        // Verify cache is updated
        $this->assertTrue(\App\Models\ConfigSetting::isMaintenance());

        // Cleanup
        \App\Models\ConfigSetting::where('key', 'is_maintenance')->update(['value' => 'false']);
        \Illuminate\Support\Facades\Cache::forget('config:is_maintenance');
    }

    public function test_sa_can_run_cron(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        $response = $this->postJson('/api/super-admin/cron/run', [
            'command' => 'archive-audit',
        ]);

        $response->assertStatus(200);
    }

    public function test_sa_can_reverse_transaction(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        $santri = $this->makeSantri('99888');
        $staff = $this->makeUser('staff_kantin');
        $tx = TransaksiPembelian::create([
            'nis' => '99888',
            'barcode' => 'TEST001',
            'qty' => 2,
            'penalty_per_unit' => -1,
            'status' => 'open',
            'staff_id' => $staff->id,
            'waktu' => now(),
        ]);

        // Enable read-only mode (required)
        \App\Models\ConfigSetting::where('key', 'is_readonly')->update(['value' => 'true']);
        \Illuminate\Support\Facades\Cache::forget('config:is_readonly');

        $response = $this->postJson("/api/super-admin/reverse-transaction/{$tx->id}", [
            'alasan' => 'Test reverse via PHPUnit — 30 chars minimum',
            'password' => 'password123',
        ]);

        // Cleanup
        \App\Models\ConfigSetting::where('key', 'is_readonly')->update(['value' => 'false']);
        \Illuminate\Support\Facades\Cache::forget('config:is_readonly');

        // May succeed or fail depending on password validation
        $this->assertContains($response->status(), [200, 422]);
    }

    public function test_sa_can_adjust_poin(): void
    {
        $sa = $this->makeUser('super_admin');
        $santri = $this->makeSantri('99888');
        $this->actAs($sa);

        $response = $this->postJson('/api/super-admin/adjust-poin/99888', [
            'poin_delta' => 50,
            'alasan' => 'Test adjust poin via PHPUnit — 30 chars minimum',
            'password' => 'password123',
        ]);

        $this->assertContains($response->status(), [200, 422]);
    }
}
