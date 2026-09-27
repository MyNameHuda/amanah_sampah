<?php

namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Support\Facades\Hash;

class AuthFlowTest extends TestCase
{
    /**
     * Test login dengan NIS + password.
     */
    public function test_login_with_nis_succeeds(): void
    {
        $santri = $this->makeSantri('99888');
        $user = $santri->user;
        $user->password = Hash::make('rahasia123');
        $user->save();

        $response = $this->postJson('/api/auth/login', [
            'login' => '99888',
            'password' => 'rahasia123',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'token',
                'user' => ['id', 'name', 'role', 'suspended_at', 'must_change_password'],
            ]);
    }

    public function test_login_with_wrong_password_returns_422(): void
    {
        $santri = $this->makeSantri('99888');
        $response = $this->postJson('/api/auth/login', [
            'login' => '99888',
            'password' => 'salahpassword',
        ]);
        $response->assertStatus(422);
    }

    public function test_login_includes_must_change_password_flag(): void
    {
        $santri = $this->makeSantri('99888');
        $santri->user->update([
            'password' => Hash::make('rahasia123'),
            'must_change_password' => true,
        ]);

        $response = $this->postJson('/api/auth/login', [
            'login' => '99888',
            'password' => 'rahasia123',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('user.must_change_password', true);
    }

    public function test_login_suspended_user_returns_422(): void
    {
        $admin = $this->makeUser('admin_kesantrian');
        $user = $this->makeUser('staff_kantin');
        $user->suspended_at = now();
        $user->save();

        $response = $this->postJson('/api/auth/login', [
            'login' => $user->email,
            'password' => 'password123',
        ]);

        $response->assertStatus(422);
    }

    public function test_me_endpoint_returns_authenticated_user(): void
    {
        $user = $this->makeUser('staff_kantin', ['email' => 'staff@test.local']);
        $this->actAs($user);

        $response = $this->getJson('/api/auth/me');

        $response->assertStatus(200)
            ->assertJsonPath('email', 'staff@test.local')
            ->assertJsonPath('role', 'staff_kantin');
    }

    public function test_change_password_with_current(): void
    {
        $user = $this->makeUser('staff_kantin');
        $user->password = Hash::make('oldpass123');
        $user->save();
        $this->actAs($user);

        $response = $this->postJson('/api/auth/change-password', [
            'current_password' => 'oldpass123',
            'new_password' => 'newpass456',
            'new_password_confirmation' => 'newpass456',
        ]);

        $response->assertStatus(200);
        $user->refresh();
        $this->assertTrue(Hash::check('newpass456', $user->password));
    }

    public function test_change_password_without_current_for_first_login(): void
    {
        $user = $this->makeUser('staff_kantin');
        $user->password = Hash::make('temp1234');
        $user->must_change_password = true;
        $user->save();
        $this->actAs($user);

        $response = $this->postJson('/api/auth/change-password', [
            'for_first_login' => true,
            'new_password' => 'newsecure789',
            'new_password_confirmation' => 'newsecure789',
        ]);

        $response->assertStatus(200);
        $user->refresh();
        $this->assertFalse($user->must_change_password);
        $this->assertTrue(Hash::check('newsecure789', $user->password));
    }

    public function test_logout_revokes_token(): void
    {
        $user = $this->makeUser('staff_kantin');
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/auth/logout');

        if ($response->status() !== 200) {
            dump('Logout response: status=' . $response->status() . ' body=' . $response->getContent());
        }

        $response->assertStatus(200);

        // Token must be revoked
        $this->assertSame(0, $user->fresh()->tokens()->count());
    }

    public function test_must_change_password_middleware_blocks_protected_endpoints(): void
    {
        $santri = $this->makeSantri('99888');
        $user = $santri->user;
        $user->must_change_password = true;
        $user->password = Hash::make('temp1234');
        $user->save();
        $this->actAs($user);

        // Try to call a protected endpoint that isn't allowed during forced password change
        $response = $this->getJson('/api/santri/' . $santri->nis);
        $response->assertStatus(403)
            ->assertJsonPath('must_change_password', true);
    }
}
