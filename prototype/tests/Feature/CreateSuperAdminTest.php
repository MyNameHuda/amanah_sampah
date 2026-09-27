<?php

namespace Tests\Feature;

use App\Models\User;
use Tests\TestCase;

/**
 * `amanah:create-super-admin` adalah jalur setup produksi yang akan dipakai
 * setelah deploy (Render free tidak punya shell, jadi harus lewat log container).
 * Kalau command ini rusak, user terjebak tanpa cara membuat akun admin.
 */
class CreateSuperAdminTest extends TestCase
{
    public function test_creates_super_admin_with_given_options(): void
    {
        $this->artisan('amanah:create-super-admin', [
            '--name' => 'Super Admin Sekolah',
            '--email' => 'super@sekolah.sch.id',
            '--password' => 'RahasiaKuat123',
            '--password-confirm' => 'RahasiaKuat123',
            '--force' => true,
        ])->assertExitCode(0);

        $user = User::where('email', 'super@sekolah.sch.id')->first();
        $this->assertNotNull($user);
        $this->assertSame(User::ROLE_SUPER_ADMIN, $user->role);
        $this->assertTrue(password_verify('RahasiaKuat123', $user->password));
    }

    public function test_rejects_short_password(): void
    {
        $this->artisan('amanah:create-super-admin', [
            '--name' => 'X',
            '--email' => 'x@sch.id',
            '--password' => 'pendek',
            '--password-confirm' => 'pendek',
            '--force' => true,
        ])->assertExitCode(1);

        $this->assertSame(0, User::where('email', 'x@sch.id')->count());
    }

    public function test_rejects_password_without_uppercase(): void
    {
        $this->artisan('amanah:create-super-admin', [
            '--name' => 'X',
            '--email' => 'y@sch.id',
            '--password' => 'semua-huruf-kecil123',
            '--password-confirm' => 'semua-huruf-kecil123',
            '--force' => true,
        ])->assertExitCode(1);

        $this->assertSame(0, User::where('email', 'y@sch.id')->count());
    }

    public function test_rejects_duplicate_email(): void
    {
        $this->makeUser('admin_kesantrian', ['email' => 'sudah@ada.sch.id']);

        $this->artisan('amanah:create-super-admin', [
            '--name' => 'X',
            '--email' => 'sudah@ada.sch.id',
            '--password' => 'RahasiaKuat123',
            '--password-confirm' => 'RahasiaKuat123',
            '--force' => true,
        ])->assertExitCode(1);
    }

    public function test_refuses_second_super_admin_without_force(): void
    {
        $this->makeUser('super_admin');

        $this->artisan('amanah:create-super-admin', [
            '--name' => 'Super Kedua',
            '--email' => 'kedua@sch.id',
            '--password' => 'RahasiaKuat123',
            '--password-confirm' => 'RahasiaKuat123',
        ])->assertExitCode(1);

        $this->assertSame(0, User::where('email', 'kedua@sch.id')->count());
    }
}
