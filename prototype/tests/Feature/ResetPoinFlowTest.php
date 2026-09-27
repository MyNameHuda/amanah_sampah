<?php

namespace Tests\Feature;

use Tests\TestCase;

class ResetPoinFlowTest extends TestCase
{
    public function test_admin_can_start_reset_for_blocked_santri(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $santri = $this->makeSantri('99888');
        $santri->update(['is_blocked' => true, 'current_poin' => -60]);
        $this->actAs($admin);

        $response = $this->postJson('/api/reset/99888/start');

        $response->assertStatus(201)
            ->assertJsonStructure(['reset']);
    }

    public function test_reset_fails_for_unblocked_santri(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $santri = $this->makeSantri('99888');
        $santri->update(['is_blocked' => false]);
        $this->actAs($admin);

        $response = $this->postJson('/api/reset/99888/start');

        $response->assertStatus(422);
    }

    public function test_reset_full_flow(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $superAdmin = $this->makeUser('super_admin');
        $santri = $this->makeSantri('99888');
        $santri->update(['is_blocked' => true, 'current_poin' => -60]);

        // Admin start
        $this->actAs($admin);
        $startResponse = $this->postJson('/api/reset/99888/start');
        $resetId = $startResponse->json('reset.id');

        // Admin step 1 verify
        $this->postJson("/api/reset/{$resetId}/step1")->assertStatus(200);

        // Apply (no separate step2 in this implementation)
        $this->actAs($superAdmin);
        $response = $this->postJson("/api/reset/{$resetId}/apply");
        $response->assertStatus(200);

        $santri->refresh();
        $this->assertEquals(0, $santri->current_poin);
        $this->assertFalse($santri->is_blocked);
    }

    public function test_non_admin_cannot_start_reset(): void
    {
        $user = $this->makeUser('staff_kantin');
        $this->actAs($user);

        $response = $this->postJson('/api/reset/99888/start');

        $response->assertStatus(403);
    }

    public function test_step1_only_admins_can_verify(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $santri = $this->makeSantri('99888');
        $santri->update(['is_blocked' => true, 'current_poin' => -60]);

        $this->actAs($admin);
        $startResponse = $this->postJson('/api/reset/99888/start');
        $resetId = $startResponse->json('reset.id');

        // Switch to staff
        $staff = $this->makeUser('staff_kantin');
        $this->actAs($staff);

        $response = $this->postJson("/api/reset/{$resetId}/step1");
        $response->assertStatus(403);
    }
}
