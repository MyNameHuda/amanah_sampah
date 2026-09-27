<?php

namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Support\Facades\Hash;

class Tier3AuthTest extends TestCase
{
    public function test_tier3_can_access_read_endpoints(): void
    {
        $tier3 = $this->makeUser('super_admin_tier3');
        $this->actAs($tier3);

        // Read endpoints tidak butuh password re-verify
        $response = $this->getJson('/api/super-admin/users');
        $response->assertStatus(200);

        $response = $this->getJson('/api/super-admin/health');
        $response->assertStatus(200);

        $response = $this->getJson('/api/super-admin/audit/search');
        $response->assertStatus(200);
    }

    public function test_tier3_destructive_requires_password(): void
    {
        $tier3 = $this->makeUser('super_admin_tier3');
        $this->actAs($tier3);

        // Force logout user tanpa password harus 403
        $target = $this->makeUser('staff_kantin');
        $response = $this->postJson("/api/super-admin/users/{$target->id}/force-logout");
        $response->assertStatus(403)
            ->assertJsonPath('action_required', 'password_reverify');
    }

    public function test_tier3_destructive_with_correct_password_succeeds(): void
    {
        $tier3 = $this->makeUser('super_admin_tier3');
        $tier3->password = Hash::make('correctpass123');
        $tier3->save();
        $this->actAs($tier3);

        $target = $this->makeUser('staff_kantin');
        $target->createToken('test')->plainTextToken;

        $response = $this->postJson("/api/super-admin/users/{$target->id}/force-logout", [
            'password' => 'correctpass123',
        ]);
        $response->assertStatus(200);

        // Target's tokens should be revoked
        $this->assertSame(0, $target->fresh()->tokens()->count());
    }

    public function test_tier3_destructive_with_wrong_password_rejected(): void
    {
        $tier3 = $this->makeUser('super_admin_tier3');
        $tier3->password = Hash::make('correctpass123');
        $tier3->save();
        $this->actAs($tier3);

        $target = $this->makeUser('staff_kantin');
        $response = $this->postJson("/api/super-admin/users/{$target->id}/force-logout", [
            'password' => 'wrongpassword',
        ]);
        $response->assertStatus(403);

        // Target's tokens should NOT be revoked
        $token = $target->createToken('test')->plainTextToken;
        $this->assertSame(1, $target->fresh()->tokens()->count());
    }

    public function test_tier1_destructive_does_not_require_password(): void
    {
        $tier1 = $this->makeUser('super_admin');
        $this->actAs($tier1);

        $target = $this->makeUser('staff_kantin');
        $target->createToken('test')->plainTextToken;

        // No password needed for Tier 1
        $response = $this->postJson("/api/super-admin/users/{$target->id}/force-logout");
        $response->assertStatus(200);

        $this->assertSame(0, $target->fresh()->tokens()->count());
    }

    public function test_tier3_toggle_suspend_requires_password(): void
    {
        $tier3 = $this->makeUser('super_admin_tier3');
        $this->actAs($tier3);

        $target = $this->makeUser('staff_kantin');

        $response = $this->postJson("/api/super-admin/users/{$target->id}/toggle-suspend");
        $response->assertStatus(403);
    }

    public function test_tier3_adjust_poin_requires_password(): void
    {
        $tier3 = $this->makeUser('super_admin_tier3');
        $santri = $this->makeSantri('99888');
        $this->actAs($tier3);

        $response = $this->postJson('/api/super-admin/adjust-poin/99888', [
            'poin_delta' => 10,
            'alasan' => 'Test adjust poin via PHPUnit test — 30 chars min',
        ]);
        $response->assertStatus(403);
    }

    public function test_tier3_recompute_saldo_requires_password(): void
    {
        $tier3 = $this->makeUser('super_admin_tier3');
        $this->actAs($tier3);

        $response = $this->postJson('/api/super-admin/recompute-saldo', [
            'alasan' => 'Test recompute via PHPUnit — 30 chars minimum',
        ]);
        $response->assertStatus(403);
    }

    public function test_password_reverify_is_logged_in_audit(): void
    {
        $tier3 = $this->makeUser('super_admin_tier3');
        $tier3->password = Hash::make('auditlog123');
        $tier3->save();
        $this->actAs($tier3);

        $target = $this->makeUser('staff_kantin');

        $this->postJson("/api/super-admin/users/{$target->id}/toggle-suspend", [
            'password' => 'auditlog123',
        ])->assertStatus(200);

        // Verify audit log recorded the reverification
        $audit = \App\Models\AuditLog::where('action', 'superadmin.destructive_reverified')
            ->where('user_id', $tier3->id)
            ->first();

        $this->assertNotNull($audit, 'Re-verification harus tercatat di audit log');
        $this->assertStringContainsString('toggle-suspend', json_encode($audit->payload));
    }
}
