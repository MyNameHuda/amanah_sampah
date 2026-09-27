<?php

namespace Tests\Feature;

use App\Models\SesiVerifikasi;
use App\Models\SesiVerifikasiItem;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Notifikasi sesi verifikasi yang menggantung.
 *
 * Kenapa ini penting dan bukan sekadar fitur tambahan:
 * sesi yang belum di-commit MEMBLOKIR opening sesi baru untuk NIS yang sama.
 * Jadi satu sesi yang tertinggal (petugas pergi, HP jatuh, browser ke-close)
 * tidak cuma jadi "data belum rapi" — siswa itu terkunci sampai sesi itu
 * diselesaikan atau dibatalkan.
 *
 * Dan sebelum endpoint ini ada, petugas yang refresh di tengah sesi tidak
 * punya cara apa pun untuk menemukan sesinya lagi: `openSesi` selalu membuat
 * sesi baru, dan `openSesi` juga menolak kalau sesi untuk NIS yang sama
 * masih terbuka. Item yang sudah dikerjakan jadi tidak bisa di-commit.
 */
class SesiMenggantungTest extends TestCase
{
    private function petugas(string $nama = 'Petugas A'): \App\Models\User
    {
        return $this->makeUser('petugas_kesantrian', [
            'name' => $nama,
            'must_change_password' => false,
        ]);
    }

    private function buatSesi(string $nis, \App\Models\User $petugas, ?int $itemAgoMenit = null): SesiVerifikasi
    {
        $sesi = SesiVerifikasi::create([
            'nis' => $nis,
            'petugas_id' => $petugas->id,
            'waktu_mulai' => now(),
        ]);

        if ($itemAgoMenit !== null) {
            SesiVerifikasiItem::create([
                'id_sesi' => $sesi->id,
                'barcode' => 'TEST001',
                'qty_in' => 1,
                'qty_open_at_time' => 1,
                'qty_matched' => 1,
                'qty_excess' => 0,
                'qty_shortfall' => 0,
                'poin_delta' => 2,
                'created_at' => now()->subMinutes($itemAgoMenit),
            ]);
        }

        return $sesi;
    }

    public function test_endpoint_menampilkan_sesi_terbuka(): void
    {
        $santri = $this->makeSantri('23200');
        $p = $this->petugas();
        $this->actAs($p);
        $this->buatSesi($santri->nis, $p, 3);

        $r = $this->getJson('/api/verifikasi/sesi-terbuka')->assertStatus(200);

        $this->assertSame(1, $r->json('count'));
        $this->assertSame(1, $r->json('count_mine'));
        $this->assertSame($santri->nis, $r->json('data.0.nis'));
    }

    public function test_sesi_yang_sudah_selesai_tidak_ditampilkan(): void
    {
        $santri = $this->makeSantri('23201');
        $p = $this->petugas();
        $this->actAs($p);

        $sesi = $this->buatSesi($santri->nis, $p);
        $sesi->update(['waktu_selesai' => now()]);

        $this->getJson('/api/verifikasi/sesi-terbuka')
            ->assertStatus(200)
            ->assertJsonPath('count', 0);
    }

    public function test_is_mine_membedakan_pemilik_sesi(): void
    {
        $santri = $this->makeSantri('23202');
        $saya = $this->petugas('Petugas Saya');
        $lain = $this->petugas('Petugas Lain');

        $this->buatSesi($santri->nis, $saya, 2);
        $this->buatSesi($this->makeSantri('23203')->nis, $lain, 2);

        $this->actAs($saya);
        $r = $this->getJson('/api/verifikasi/sesi-terbuka')->assertStatus(200);

        $this->assertSame(2, $r->json('count'));
        $this->assertSame(1, $r->json('count_mine'), 'Harus ada tepat 1 sesi milik sendiri');
        $this->assertSame(15, $r->json('idle_threshold_menit'));
    }

    public function test_sesi_kurang_dari_15_menit_belum_diangap_idle(): void
    {
        $santri = $this->makeSantri('23204');
        $p = $this->petugas();
        $this->actAs($p);
        $this->buatSesi($santri->nis, $p, 4);

        $r = $this->getJson('/api/verifikasi/sesi-terbuka')->assertStatus(200);

        $this->assertFalse($r->json('data.0.is_idle'), 'Sesi 4 menit tidak boleh ditandai idle');
        $this->assertSame(0, $r->json('count_idle_mine'));
    }

    public function test_sesi_lebih_dari_15_menit_ditandai_idle(): void
    {
        $santri = $this->makeSantri('23205');
        $p = $this->petugas();
        $this->actAs($p);
        $this->buatSesi($santri->nis, $p, 40);

        $r = $this->getJson('/api/verifikasi/sesi-terbuka')->assertStatus(200);

        $this->assertTrue($r->json('data.0.is_idle'));
        $this->assertSame(1, $r->json('count_idle_mine'));
        $this->assertGreaterThanOrEqual(40, $r->json('data.0.idle_menit'));
    }

    public function test_idle_dihitung_dari_item_terakhir_bukan_dari_mulai_sesi(): void
    {
        // Sesi dimulai 3 jam lalu tapi masih ada aktivitas 2 menit lalu.
        // Ini SEDANG bekerja — harusnya tidak ditandai menggantung, kalau
        // hanya lihat waktu mulai akan salah dan membuat petugas dibohongi.
        $santri = $this->makeSantri('23206');
        $p = $this->petugas();
        $this->actAs($p);

        $sesi = $this->buatSesi($santri->nis, $p, 2);
        $sesi->update(['waktu_mulai' => now()->subHours(3)]);

        $r = $this->getJson('/api/verifikasi/sesi-terbuka')->assertStatus(200);

        $this->assertFalse($r->json('data.0.is_idle'));
    }

    public function test_poin_belum_tercatat_tampil(): void
    {
        // Poin yang sudah diinput tapi belum di-commit. Ini yang paling
        // berbahaya kalau sesi terlantar: pembukuan yang belum masuk saldo.
        $santri = $this->makeSantri('23207');
        $p = $this->petugas();
        $this->actAs($p);
        $this->buatSesi($santri->nis, $p, 30);

        $r = $this->getJson('/api/verifikasi/sesi-terbuka')->assertStatus(200);

        $this->assertSame(1, $r->json('data.0.items_count'));
        $this->assertSame(2, $r->json('data.0.poin_belum_tercatat'));
    }

    public function test_showSesi_bisa_dipakai_untuk_melanjutkan_sesi(): void
    {
        $santri = $this->makeSantri('23208');
        $p = $this->petugas();
        $this->actAs($p);
        $sesi = $this->buatSesi($santri->nis, $p, 5);

        $r = $this->getJson("/api/verifikasi/sesi/{$sesi->id}")->assertStatus(200);

        // Wajib ada open_debts + intérimwa: tanpa keduanya, frontend tidak
        // bisa melanjutkan sesi yang terputus.
        $this->assertNotNull($r->json('open_debts'), 'open_debts tidak ada — sesi tidak bisa dilanjutkan');
        $this->assertNotNull($r->json('santri'), 'data siswa tidak ada');
        $this->assertSame($santri->nis, $r->json('santri.nis'));
        $this->assertCount(1, $r->json('sesi.items'), 'items sesi yang sudah ada harus ikut ter-load');
    }

    public function test_petugas_lain_tidak_bisa_melihat_detail_sesi(): void
    {
        $santri = $this->makeSantri('23209');
        $pemilik = $this->petugas('Pemilik');
        $orangLain = $this->petugas('Orang Lain');
        $sesi = $this->buatSesi($santri->nis, $pemilik);

        $this->actAs($orangLain);
        $this->getJson("/api/verifikasi/sesi/{$sesi->id}")->assertStatus(422);
    }

    public function test_pesan_422_menyebut_petugas_yang_memegang_sesi(): void
    {
        $santri = $this->makeSantri('23210');
        $pemegang = $this->petugas('Bu Sari');
        $this->buatSesi($santri->nis, $pemegang);

        $pencoba = $this->petugas('Pak Budi');
        $this->actAs($pencoba);

        $r = $this->postJson('/api/verifikasi/sesi', ['nis' => $santri->nis])
            ->assertStatus(422);

        // Petugas harus tahu harus minta siapa — bukan cuma "ID: 7".
        $this->assertStringContainsString('Bu Sari', $r->json('errors.nis.0'));
    }

    public function test_pesan_422_milik_sendiri_mengarah_ke_lanjutkan(): void
    {
        $santri = $this->makeSantri('23211');
        $p = $this->petugas();
        $this->buatSesi($santri->nis, $p);
        $this->actAs($p);

        $r = $this->postJson('/api/verifikasi/sesi', ['nis' => $santri->nis])
            ->assertStatus(422);

        $this->assertStringContainsString('Lanjutkan', $r->json('errors.nis.0'));
    }

    public function test_petugas_tidak_bisa_akses_endpoint_ini(): void
    {
        $staff = $this->makeUser('staff_kantin', ['must_change_password' => false]);
        $this->actAs($staff);

        $this->getJson('/api/verifikasi/sesi-terbuka')->assertStatus(403);
    }
}
