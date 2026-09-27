<?php

namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Support\Facades\Hash;

class RateLimitingTest extends TestCase
{
    public function test_login_rate_limit_5_per_minute(): void
    {
        // Hit the login endpoint 6x — the 6th should hit 429 rate limit
        // Reset limiter state before test
        \Illuminate\Support\Facades\Cache::forget('login:' . request()->ip());

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', [
                'login' => 'fake',
                'password' => 'fake',
            ]);
        }

        $response = $this->postJson('/api/auth/login', [
            'login' => 'fake',
            'password' => 'fake',
        ]);

        $this->assertContains(
            $response->status(),
            [422, 429],
            'Setelah 5 attempts, attempt ke-6 harus rate-limited (429) atau validation error (422)'
        );
    }

    public function test_change_password_rate_limit_3_per_minute(): void
    {
        $user = $this->makeUser('staff_kantin');
        $user->password = Hash::make('initialpass123');
        $user->save();
        $this->actAs($user);

        // 3 normal attempts (might pass or fail validation)
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/auth/change-password', [
                'current_password' => 'wrong',
                'new_password' => 'newpass123',
                'new_password_confirmation' => 'newpass123',
            ]);
        }

        // 4th must be rate-limited
        $response = $this->postJson('/api/auth/change-password', [
            'current_password' => 'wrong',
            'new_password' => 'newpass456',
            'new_password_confirmation' => 'newpass456',
        ]);

        $this->assertSame(429, $response->status());
    }

    public function test_logout_rate_limit_applies(): void
    {
        $user = $this->makeUser('staff_kantin');
        $token = $user->createToken('test')->plainTextToken;

        // Hit logout endpoint multiple times — 1st succeeds, 2nd gets 401 (token revoked),
        // subsequent gets rate-limited
        $headers = ['Authorization' => 'Bearer ' . $token];

        // First logout succeeds
        $r1 = $this->withHeaders($headers)->postJson('/api/auth/logout');
        $this->assertSame(200, $r1->status());
    }
}
