<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Reward;
use App\Models\PoinLedger;

class RewardFlowTest extends TestCase
{
    public function test_admin_can_create_reward(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $this->actAs($admin);

        $response = $this->postJson('/api/reward', [
            'nama_reward' => 'Test Reward Baru',
            'biaya_poin' => 50,
            'stok' => 20,
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('reward', ['nama_reward' => 'Test Reward Baru']);
    }

    public function test_admin_lists_rewards(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $this->actAs($admin);

        $response = $this->getJson('/api/reward');

        $response->assertStatus(200);
    }

    public function test_santri_can_redeem_with_sufficient_points(): void
    {
        $santri = $this->makeSantri('99888');
        $santri->update(['current_poin' => 100]);
        $this->actAs($santri->user);

        $reward = Reward::where('nama_reward', 'Test Reward')->first();

        $response = $this->postJson("/api/reward/{$reward->id_reward}/redeem");

        $response->assertStatus(200)
            ->assertJsonStructure(['redeem', 'santri', 'message']);

        $reward->refresh();
        $this->assertEquals(9, $reward->stok); // was 10

        $this->assertDatabaseHas('penukaran_reward', [
            'nis' => '99888',
            'id_reward' => $reward->id_reward,
        ]);

        $santri->refresh();
        $this->assertEquals(70, $santri->current_poin); // 100 - 30
    }

    public function test_santri_cannot_redeem_with_insufficient_points(): void
    {
        $santri = $this->makeSantri('99888');
        $santri->update(['current_poin' => 10]);
        $this->actAs($santri->user);

        $reward = Reward::where('nama_reward', 'Test Reward')->first();

        $response = $this->postJson("/api/reward/{$reward->id_reward}/redeem");

        $response->assertStatus(422);
    }

    public function test_redeem_creates_poin_ledger_entry(): void
    {
        $santri = $this->makeSantri('99888');
        $santri->update(['current_poin' => 100]);
        $this->actAs($santri->user);

        $reward = Reward::where('nama_reward', 'Test Reward')->first();

        $ledgerBefore = PoinLedger::where('nis', '99888')->count();
        $this->postJson("/api/reward/{$reward->id_reward}/redeem")->assertStatus(200);
        $ledgerAfter = PoinLedger::where('nis', '99888')->count();

        $this->assertGreaterThan($ledgerBefore, $ledgerAfter);

        $entry = PoinLedger::where('nis', '99888')->latest('id')->first();
        $this->assertEquals(PoinLedger::SOURCE_REDEEM, $entry->source_type);
        $this->assertEquals(-30, $entry->poin_delta);
    }

    public function test_non_santri_cannot_redeem(): void
    {
        $user = $this->makeUser('staff_kantin');
        $this->actAs($user);

        $reward = Reward::where('nama_reward', 'Test Reward')->first();

        $response = $this->postJson("/api/reward/{$reward->id_reward}/redeem");

        $response->assertStatus(403);
    }

    public function test_redeem_with_zero_stock_fails(): void
    {
        $santri = $this->makeSantri('99888');
        $santri->update(['current_poin' => 100]);
        $this->actAs($santri->user);

        $reward = Reward::where('nama_reward', 'Test Reward')->first();
        $reward->update(['stok' => 0]);

        $response = $this->postJson("/api/reward/{$reward->id_reward}/redeem");

        $response->assertStatus(422);
    }

    public function test_redeem_inactive_reward_fails(): void
    {
        $santri = $this->makeSantri('99888');
        $santri->update(['current_poin' => 100]);
        $this->actAs($santri->user);

        $reward = Reward::where('nama_reward', 'Test Reward')->first();
        $reward->update(['status_aktif' => false]);

        $response = $this->postJson("/api/reward/{$reward->id_reward}/redeem");

        $response->assertStatus(422);
    }

    public function test_redeem_without_santri_profile_returns_422(): void
    {
        // Edge case: user with role=santri but no Santri profile
        $user = $this->makeUser('santri');
        $this->actAs($user);

        $reward = Reward::where('nama_reward', 'Test Reward')->first();

        $response = $this->postJson("/api/reward/{$reward->id_reward}/redeem");

        $response->assertStatus(422);
    }

    // ─── Catalog Management (Admin/Super Admin CRUD) ───

    public function test_admin_can_list_all_rewards_for_management(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $this->actAs($admin);

        $response = $this->getJson('/api/reward/admin');
        $response->assertStatus(200)
            ->assertJsonStructure(['data']);
    }

    public function test_admin_can_show_single_reward(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $this->actAs($admin);

        $reward = Reward::where('nama_reward', 'Test Reward')->first();
        $response = $this->getJson("/api/reward/{$reward->id_reward}");
        $response->assertStatus(200)
            ->assertJsonStructure(['reward']);
    }

    public function test_santri_cannot_access_admin_reward_list(): void
    {
        $santri = $this->makeSantri('99888');
        $this->actAs($santri->user);

        $response = $this->getJson('/api/reward/admin');
        $response->assertStatus(403);
    }

    public function test_admin_can_update_reward(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $this->actAs($admin);

        $reward = Reward::where('nama_reward', 'Test Reward')->first();

        $response = $this->patchJson("/api/reward/{$reward->id_reward}", [
            'nama_reward' => 'Test Reward Updated',
            'biaya_poin' => 100,
            'stok' => 50,
            'status_aktif' => true,
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('reward', [
            'id_reward' => $reward->id_reward,
            'nama_reward' => 'Test Reward Updated',
            'biaya_poin' => 100,
            'stok' => 50,
        ]);
    }

    public function test_update_reward_validates_unique_name(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $this->actAs($admin);

        // Create a second reward
        Reward::create([
            'nama_reward' => 'Another Reward',
            'biaya_poin' => 10,
            'stok' => 5,
            'status_aktif' => true,
            'created_by' => $admin->id,
        ]);

        // Try to rename "Test Reward" to "Another Reward" — should fail
        $reward = Reward::where('nama_reward', 'Test Reward')->first();
        $response = $this->patchJson("/api/reward/{$reward->id_reward}", [
            'nama_reward' => 'Another Reward',
            'biaya_poin' => 100,
            'stok' => 50,
            'status_aktif' => true,
        ]);

        $response->assertStatus(422);
    }

    public function test_admin_can_toggle_reward_active_status(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $this->actAs($admin);

        $reward = Reward::where('nama_reward', 'Test Reward')->first();
        $original = $reward->status_aktif;

        $response = $this->postJson("/api/reward/{$reward->id_reward}/toggle-active");
        $response->assertStatus(200);

        $reward->refresh();
        $this->assertNotEquals($original, $reward->status_aktif);
    }

    public function test_admin_can_archive_reward(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $this->actAs($admin);

        $reward = Reward::where('nama_reward', 'Test Reward')->first();

        $response = $this->postJson("/api/reward/{$reward->id_reward}/archive");
        $response->assertStatus(200);

        $reward->refresh();
        $this->assertNotNull($reward->archived_at);
        $this->assertFalse($reward->status_aktif);
    }

    public function test_archived_reward_hidden_from_santri_list(): void
    {
        // Archive a reward
        $admin = $this->makeUser('admin_kesantrian');
        $this->actAs($admin);
        $reward = Reward::where('nama_reward', 'Test Reward')->first();
        $this->postJson("/api/reward/{$reward->id_reward}/archive")->assertStatus(200);

        // Switch to Santri view
        $santri = $this->makeSantri('99888');
        $this->actAs($santri->user);
        $response = $this->getJson('/api/reward');

        $response->assertStatus(200)
            ->assertJsonMissing(['nama_reward' => 'Test Reward']);
    }

    public function test_only_super_admin_can_restore_reward(): void
    {
        // First archive
        $super = $this->makeUser('super_admin');
        $this->actAs($super);
        $reward = Reward::where('nama_reward', 'Test Reward')->first();
        $this->postJson("/api/reward/{$reward->id_reward}/archive")->assertStatus(200);

        // Admin tries to restore — should be forbidden
        $admin = $this->makeUser('admin_kesantrian');
        $this->actAs($admin);
        $response = $this->postJson("/api/reward/{$reward->id_reward}/restore");
        $response->assertStatus(403);

        // Super Admin restores successfully
        $this->actAs($super);
        $response2 = $this->postJson("/api/reward/{$reward->id_reward}/restore");
        $response2->assertStatus(200);

        $reward->refresh();
        $this->assertNull($reward->archived_at);
        $this->assertTrue($reward->status_aktif);
    }

    public function test_cannot_update_archived_reward(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $this->actAs($admin);

        $reward = Reward::where('nama_reward', 'Test Reward')->first();
        $this->postJson("/api/reward/{$reward->id_reward}/archive")->assertStatus(200);

        $response = $this->patchJson("/api/reward/{$reward->id_reward}", [
            'nama_reward' => 'Should Fail',
            'biaya_poin' => 50,
            'stok' => 10,
            'status_aktif' => true,
        ]);
        $response->assertStatus(422);
    }

    public function test_admin_index_filters_rewards(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $this->actAs($admin);

        // Archive one reward
        $reward = Reward::where('nama_reward', 'Test Reward')->first();
        $this->postJson("/api/reward/{$reward->id_reward}/archive")->assertStatus(200);

        // Filter archived
        $response = $this->getJson('/api/reward/admin?status=archived');
        $response->assertStatus(200);
        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertEquals('Test Reward', $data[0]['nama_reward']);
        $this->assertTrue($data[0]['is_archived']);
    }
}
