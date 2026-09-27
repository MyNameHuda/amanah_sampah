<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * `amanah:bootstrap-admin` adalah SATU-SATUNYA jalan membuat super admin
 * di Render free (tidak ada shell, tidak ada SSH, tidak ada one-off job).
 * Kalau command ini salah, aplikasi online tapi tidak bisa dimasuki.
 *
 * Sifat yang WAJIB dijaga:
 *  - idempotent (dipanggil tiap container wake-up)
 *  - tidak pernah menimpa password yang sudah diganti user
 */
class BootstrapAdminTest extends TestCase
{
    private function envBootstrap(array $overrides = []): void
    {
        $vals = array_merge([
            'BOOTSTRAP_ADMIN_NAME' => 'Super Admin Sekolah',
            'BOOTSTRAP_ADMIN_EMAIL' => 'super@sekolah.sch.id',
            'BOOTSTRAP_ADMIN_PASSWORD' => 'AmanahSampah2026',
        ], $overrides);

        foreach ($vals as $k => $v) {
            putenv("{$k}={$v}");
            $_ENV[$k] = $v;
            $_SERVER[$k] = $v;
        }
    }

    private function clearBootstrapEnv(): void
    {
        foreach (['BOOTSTRAP_ADMIN_NAME', 'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD'] as $k) {
            putenv($k);
            unset($_ENV[$k], $_SERVER[$k]);
        }
    }

    protected function tearDown(): void
    {
        $this->clearBootstrapEnv();
        parent::tearDown();
    }

    public function test_creates_first_super_admin_from_env(): void
    {
        $this->envBootstrap();

        $this->artisan('amanah:bootstrap-admin')->assertExitCode(0);

        $user = User::where('email', 'super@sekolah.sch.id')->first();
        $this->assertNotNull($user);
        $this->assertSame(User::ROLE_SUPER_ADMIN, $user->role);
        $this->assertSame('Super Admin Sekolah', $user->name);
        $this->assertTrue(password_verify('AmanahSampah2026', $user->password));
    }

    public function test_is_idempotent_and_never_resets_password(): void
    {
        $this->envBootstrap();
        $this->artisan('amanah:bootstrap-admin')->assertExitCode(0);

        // Admin login lalu mengganti passwordnya.
        $user = User::where('email', 'super@sekolah.sch.id')->first();
        $user->password = Hash::make('PasswordYangSudahDiganti99');
        $user->save();

        // Container wake up lagi -> entrypoint jalan lagi.
        $this->artisan('amanah:bootstrap-admin')->assertExitCode(0);
        $this->artisan('amanah:bootstrap-admin')->assertExitCode(0);

        $this->assertTrue(
            password_verify('PasswordYangSudahDiganti99', $user->fresh()->password),
            'Bootstrap menimpa password yang sudah diganti admin'
        );
        $this->assertSame(1, User::where('email', 'super@sekolah.sch.id')->count());
    }

    public function test_skips_silently_when_not_configured(): void
    {
        $this->clearBootstrapEnv();

        $this->artisan('amanah:bootstrap-admin')->assertExitCode(0);

        $this->assertSame(0, User::where('role', User::ROLE_SUPER_ADMIN)->count());
    }

    public function test_rejects_weak_password(): void
    {
        $this->envBootstrap(['BOOTSTRAP_ADMIN_PASSWORD' => 'lemah']);

        $this->artisan('amanah:bootstrap-admin')->assertExitCode(1);

        $this->assertSame(0, User::where('email', 'super@sekolah.sch.id')->count());
    }

    public function test_rejects_password_without_number(): void
    {
        $this->envBootstrap(['BOOTSTRAP_ADMIN_PASSWORD' => 'HanyaHurufDenganPanjangCukup']);

        $this->artisan('amanah:bootstrap-admin')->assertExitCode(1);

        $this->assertSame(0, User::where('email', 'super@sekolah.sch.id')->count());
    }

    public function test_rejects_invalid_email(): void
    {
        $this->envBootstrap(['BOOTSTRAP_ADMIN_EMAIL' => 'bukan-email']);

        $this->artisan('amanah:bootstrap-admin')->assertExitCode(1);

        $this->assertSame(0, User::where('role', User::ROLE_SUPER_ADMIN)->count());
    }

    public function test_does_not_create_shadow_admin_when_one_already_exists(): void
    {
        // Super admin sudah dibuat (mis. lewat CLI di mesin lain / import data).
        $this->makeUser('super_admin', ['email' => 'asli@sekolah.sch.id']);

        $this->envBootstrap();

        $this->artisan('amanah:bootstrap-admin')->assertExitCode(0);

        $this->assertSame(0, User::where('email', 'super@sekolah.sch.id')->count());
        $this->assertSame(1, User::where('role', User::ROLE_SUPER_ADMIN)->count());
    }
}
