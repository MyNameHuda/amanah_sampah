<?php

namespace Tests\Feature;

use App\Models\KategoriProduk;
use App\Models\PoinLedger;
use App\Models\Produk;
use App\Models\Reward;
use App\Models\Santri;
use App\Models\User;
use Tests\TestCase;

/**
 * Seeder WAJIB idempotent.
 *
 * Di platform yang me-restart container otomatis (Render free bangun dari
 * sleep setelah 15 menit), start command bisa dieksekusi berulang. Seeder
 * yang asal `create()` akan menumpuk kategori & produk duplikat setiap kali
 * container bangun, dan yang lebih buruk: mengembalikan password demo pada
 * akun yang sudah diganti admin.
 */
class SeederIdempotencyTest extends TestCase
{
    public function test_seeding_twice_creates_no_duplicates(): void
    {
        $this->artisan('db:seed')->assertExitCode(0);
        $first = [
            'users' => User::count(),
            'kategori' => KategoriProduk::count(),
            'produk' => Produk::count(),
            'reward' => Reward::count(),
            'santri' => Santri::count(),
            'ledger' => PoinLedger::count(),
        ];

        // Jalankan LAGI — ini yang terjadi setiap kali container Render wake up.
        $this->artisan('db:seed')->assertExitCode(0);
        $second = [
            'users' => User::count(),
            'kategori' => KategoriProduk::count(),
            'produk' => Produk::count(),
            'reward' => Reward::count(),
            'santri' => Santri::count(),
            'ledger' => PoinLedger::count(),
        ];

        $this->assertSame($first, $second, 'Seed kedua mengubah jumlah baris');
    }

    public function test_no_duplicate_kategori_or_produk_names(): void
    {
        $this->artisan('db:seed');
        $this->artisan('db:seed');

        $dupKat = KategoriProduk::selectRaw('nama_kategori, COUNT(*) c')
            ->groupBy('nama_kategori')->havingRaw('c > 1')->get();
        $this->assertCount(0, $dupKat, 'Ada kategori duplikat: ' . $dupKat->pluck('nama_kategori')->implode(', '));

        $dupProd = Produk::selectRaw('barcode, COUNT(*) c')
            ->groupBy('barcode')->havingRaw('c > 1')->get();
        $this->assertCount(0, $dupProd, 'Ada produk duplikat');
    }

    public function test_reseeding_does_not_reset_changed_password(): void
    {
        $this->artisan('db:seed');

        $admin = User::where('email', 'admin@amanah.id')->firstOrFail();
        $admin->password = bcrypt('PASSWORD-YANG-SUDAH-DI-GANTI-ADMIN');
        $admin->save();

        // Seeder jalan lagi — password admin harus TIDAK balik ke "admin12345".
        $this->artisan('db:seed');

        $this->assertTrue(
            password_verify('PASSWORD-YANG-SUDAH-DI-GANTI-ADMIN', $admin->fresh()->password),
            'Re-seed mengembalikan password lama akun yang sudah diganti admin'
        );
    }
}
