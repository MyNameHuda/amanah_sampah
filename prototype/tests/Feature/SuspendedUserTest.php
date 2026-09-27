<?php

namespace Tests\Feature;

use App\Models\Reward;
use App\Models\Santri;
use App\Models\User;
use Tests\TestCase;

/**
 * Suspended user tidak boleh melakukan APAPUN.
 *
 * Tes ini sengaja menyasar endpoint yang TIDAK punya middleware `role:` —
 * `/me/profile` (PATCH, write!) dan `/auth/change-password` — karena dua
 * endpoint itulah yang sebelumnya tetap bisa dipakai user yang sudah
 * di-suspend selama token-nya masih valid. Kalau ada route baru yang lupa
 * dikelilingi `role:`, pola tes `test_suspended_user_blocked_on_*` di bawah
 * akan langsung gagal dan memberi tahu.
 */
class SuspendedUserTest extends TestCase
{
    private function suspendedUser(string $role = 'staff_kantin'): User
    {
        $user = $this->makeUser($role, ['email' => 'susp@test.local', 'must_change_password' => false]);
        $user->suspended_at = now();
        $user->save();
        return $user->fresh();
    }

    // ---- Reads & writes yang harus terblokir ----------------------------

    public function test_suspended_user_blocked_on_products_list(): void
    {
        $user = $this->suspendedUser();
        $this->actAs($user);

        $this->getJson('/api/produk')->assertStatus(403)
            ->assertJsonPath('suspended', true)
            ->assertJsonPath('action_required', 'logout');
    }

    public function test_suspended_user_blocked_on_categories_list(): void
    {
        $user = $this->suspendedUser();
        $this->actAs($user);

        $this->getJson('/api/kategori')->assertStatus(403)
            ->assertJsonPath('suspended', true);
    }

    /**
     * Ini celah yang ditutup EnsureNotSuspended: PATCH /me/profile tidak
     * punya middleware `role:`, jadi sebelumnya user ter-suspend masih bisa
     * mengubah biodata sendiri.
     */
    public function test_suspended_user_cannot_update_own_profile(): void
    {
        $user = $this->suspendedUser('admin_kesantrian');
        $this->actAs($user);

        $this->patchJson('/api/me/profile', ['phone' => '081299999999'])
            ->assertStatus(403)
            ->assertJsonPath('suspended', true);

        $this->assertNull($user->fresh()->phone, 'Biodata tidak boleh berubah saat suspended');
    }

    public function test_suspended_user_cannot_change_password(): void
    {
        $user = $this->suspendedUser();
        $originalHash = $user->password;
        $this->actAs($user);

        $this->postJson('/api/auth/change-password', [
            'current_password' => 'password123',
            'new_password' => 'newpassword456',
        ])->assertStatus(403);

        $this->assertSame($originalHash, $user->fresh()->password, 'Password tidak boleh berubah');
    }

    public function test_suspended_user_blocked_on_auth_me(): void
    {
        $user = $this->suspendedUser();
        $this->actAs($user);

        $this->getJson('/api/auth/me')->assertStatus(403)
            ->assertJsonPath('suspended', true);
    }

    public function test_suspended_user_cannot_create_purchase_transaction(): void
    {
        $user = $this->suspendedUser();
        $santri = $this->makeSantri('23001');
        $this->actAs($user);

        $this->postJson('/api/pembelian', [
            'nis' => $santri->nis,
            'items' => [['barcode' => 'TEST001', 'qty' => 1]],
        ])->assertStatus(403);
    }

    public function test_suspended_user_cannot_create_verification_session(): void
    {
        $user = $this->suspendedUser('petugas_kesantrian');
        $santri = $this->makeSantri('23002');
        $this->actAs($user);

        $this->postJson('/api/verifikasi/sesi', ['nis' => $santri->nis])
            ->assertStatus(403);
    }

    public function test_suspended_user_cannot_redeem_reward(): void
    {
        $santri = $this->makeSantri('23003');
        $santri->update(['current_poin' => 500]);
        $user = $santri->user;
        $user->suspended_at = now();
        $user->save();
        $this->actAs($user->fresh());

        $reward = Reward::where('nama_reward', 'Test Reward')->firstOrFail();

        $this->postJson("/api/reward/{$reward->id_reward}/redeem")
            ->assertStatus(403);
    }

    // ---- Transaksi & pembuangan atas nama siswa suspended --------------
    //
    // Beda dengan test di atas: yang di-suspend adalah AKUN SISWA (subjek),
    // sedangkan yang melakukan transaksi adalah staff kantin / petugas.
    // Jadi yang diuji di sini bukan "user yang login diblokir", tapi
    // "aktivitas atas nama siswa suspended ditolak".

    public function test_staff_cannot_record_purchase_for_suspended_santri(): void
    {
        $santri = $this->makeSantri('23010');
        $santriUser = $santri->user;
        $santriUser->suspended_at = now();
        $santriUser->save();

        $staff = $this->makeUser('staff_kantin', ['must_change_password' => false]);
        $this->actAs($staff);

        $response = $this->postJson('/api/pembelian', [
            'nis' => $santri->nis,
            'items' => [['barcode' => 'TEST001', 'qty' => 1]],
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('di-suspend', $response->json('errors.nis.0'));
        $this->assertDatabaseMissing('transaksi_pembelian', ['nis' => $santri->nis]);
    }

    public function test_petugas_cannot_open_verification_for_suspended_santri(): void
    {
        $santri = $this->makeSantri('23011');
        $santriUser = $santri->user;
        $santriUser->suspended_at = now();
        $santriUser->save();

        $petugas = $this->makeUser('petugas_kesantrian', ['must_change_password' => false]);
        $this->actAs($petugas);

        $response = $this->postJson('/api/verifikasi/sesi', ['nis' => $santri->nis]);

        $response->assertStatus(422);
        $this->assertStringContainsString('di-suspend', $response->json('errors.nis.0'));
        $this->assertDatabaseMissing('sesi_verifikasi', ['nis' => $santri->nis]);
    }

    /**
     * Sesi dibuka saat siswa masih aktif, lalu siswa di-suspend. Commit
     * tetap harus ditolak — kalau tidak guarding di addItem & commitSesi,
     * poin siswa tetap berubah lewat jalur yang sudah dibuka sebelum suspend.
     */
    public function test_commit_rejected_when_santri_suspended_mid_session(): void
    {
        $santri = $this->makeSantri('23012');
        $santri->update(['current_poin' => 100]);
        $petugas = $this->makeUser('petugas_kesantrian', ['must_change_password' => false]);
        $this->actAs($petugas);

        $sesiId = $this->postJson('/api/verifikasi/sesi', ['nis' => $santri->nis])->json('sesi.id');
        $this->postJson("/api/verifikasi/sesi/{$sesiId}/items", ['barcode' => 'TEST001', 'qty_in' => 2])->assertStatus(201);

        // Siswa di-suspend di tengah sesi, lalu petugas coba commit.
        $santri->user->update(['suspended_at' => now()]);

        $before = $santri->fresh()->current_poin;
        $this->postJson("/api/verifikasi/sesi/{$sesiId}/commit")->assertStatus(422);
        $this->assertSame($before, $santri->fresh()->current_poin, 'Poin tidak boleh berubah setelah suspend');
    }

    /**
     * Super admin tetap boleh mencatat koreksi untuk siswa suspended.
     * Kalau ikut diblokir, data siswa suspended jadi mustahil diperbaiki
     * tanpa un-suspend lebih dulu — itu dead end data.
     */
    public function test_super_admin_can_still_record_for_suspended_santri(): void
    {
        $santri = $this->makeSantri('23013');
        $santri->user->update(['suspended_at' => now()]);

        $sa = $this->makeUser('super_admin', ['must_change_password' => false]);
        $this->actAs($sa);

        $this->postJson('/api/pembelian', [
            'nis' => $santri->nis,
            'items' => [['barcode' => 'TEST001', 'qty' => 1]],
        ])->assertStatus(201);
    }

    public function test_santri_lookup_exposes_suspended_flag(): void
    {
        $santri = $this->makeSantri('23014');
        $santri->user->update(['suspended_at' => now()]);

        $staff = $this->makeUser('staff_kantin', ['must_change_password' => false]);
        $this->actAs($staff);

        $this->getJson('/api/santri/23014')
            ->assertStatus(200)
            ->assertJsonPath('is_suspended', true);
    }

    public function test_unsuspended_santri_lookup_reports_not_suspended(): void
    {
        $santri = $this->makeSantri('23015');
        $staff = $this->makeUser('staff_kantin', ['must_change_password' => false]);
        $this->actAs($staff);

        $this->getJson('/api/santri/23015')
            ->assertStatus(200)
            ->assertJsonPath('is_suspended', false);
    }

    public function test_purchase_for_normal_santri_still_works(): void
    {
        $santri = $this->makeSantri('23016');
        $staff = $this->makeUser('staff_kantin', ['must_change_password' => false]);
        $this->actAs($staff);

        $this->postJson('/api/pembelian', [
            'nis' => $santri->nis,
            'items' => [['barcode' => 'TEST001', 'qty' => 1]],
        ])->assertStatus(201);
    }

    // ---- Yang TETAP boleh ---------------------------------------------

    public function test_suspended_user_can_still_logout(): void
    {
        $user = $this->suspendedUser();
        $token = $user->createToken('test')->plainTextToken;
        $this->withHeader('Authorization', 'Bearer ' . $token);

        $this->postJson('/api/auth/logout')->assertStatus(200);
    }

    public function test_unsuspended_user_unaffected(): void
    {
        $user = $this->makeUser('staff_kantin', ['must_change_password' => false]);
        $this->actAs($user);

        $this->getJson('/api/auth/me')->assertStatus(200);
        $this->getJson('/api/produk')->assertStatus(200);
    }

    // ---- Perilaku toggle-suspend ---------------------------------------

    public function test_toggle_suspend_revokes_existing_tokens(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        $target = $this->makeUser('staff_kantin');
        $target->createToken('device-1')->plainTextToken;
        $target->createToken('device-2')->plainTextToken;
        $this->assertSame(2, $target->tokens()->count());

        $response = $this->postJson("/api/super-admin/users/{$target->id}/toggle-suspend");

        $response->assertStatus(200)
            ->assertJsonPath('suspended', true)
            ->assertJsonPath('tokens_revoked', 2);
        $this->assertSame(0, $target->fresh()->tokens()->count());
    }

    public function test_unsuspend_does_not_revoke_tokens(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        $target = $this->makeUser('staff_kantin');
        $target->suspended_at = now();
        $target->save();
        $target->createToken('device-1')->plainTextToken;

        $this->postJson("/api/super-admin/users/{$target->id}/toggle-suspend")
            ->assertStatus(200)
            ->assertJsonPath('suspended', false);

        $this->assertSame(1, $target->fresh()->tokens()->count());
    }

    public function test_super_admin_cannot_suspend_self(): void
    {
        $sa = $this->makeUser('super_admin');
        $this->actAs($sa);

        $response = $this->postJson("/api/super-admin/users/{$sa->id}/toggle-suspend");

        $response->assertStatus(422);
        $this->assertNull($sa->fresh()->suspended_at, 'Super admin tidak boleh mengunci dirinya sendiri');
    }

    public function test_suspended_user_cannot_login(): void
    {
        $user = $this->makeUser('staff_kantin', ['email' => 'blocked@test.local']);
        $user->suspended_at = now();
        $user->save();

        $this->postJson('/api/auth/login', [
            'login' => 'blocked@test.local',
            'password' => 'password123',
        ])->assertStatus(422);
    }
}
