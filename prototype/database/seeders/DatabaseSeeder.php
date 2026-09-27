<?php

namespace Database\Seeders;

use App\Models\KategoriProduk;
use App\Models\PoinLedger;
use App\Models\Produk;
use App\Models\Reward;
use App\Models\Santri;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seeder INI IDEMPOTENT — boleh dijalankan berulang tanpa efek samping.
     *
     * Kenapa itu penting: di platform yang me-restart container secara
     * otomatis (Render free bangun dari sleep setelah 15 menit), start
     * command bisa dieksekusi berkali-kali. Seeder yang asal `create()`
     * akan membuat 5 kategori "Snack Plastik" tambahan dan 5 produk dengan
     * barcode yang sama di setiap wake-up.
     *
     * Semua operasi create sudah diganti ke firstOrCreate/updateOrCreate.
     */
    public function run(): void
    {
        DB::transaction(function () {
            $this->seedUsers();
            $this->seedKategoriDanProduk();
            $this->seedReward();
        });
    }

    /**
     * Seed 5 super-admin/staff/petugas/admin + 1 sample siswa (others via separate seeder).
     */
    private function seedUsers(): void
    {
        $users = [
            [
                'email' => 'admin@amanah.id',
                'name' => 'Pak Admin (Admin Kesantrian)',
                'role' => User::ROLE_ADMIN,
                'password' => 'admin12345',
            ],
            [
                'email' => 'staff@amanah.id',
                'name' => 'Staff Kantin 1',
                'role' => User::ROLE_STAFF_KANTIN,
                'password' => 'staff12345',
            ],
            [
                'email' => 'petugas@amanah.id',
                'name' => 'Petugas 1',
                'role' => User::ROLE_PETUGAS,
                'password' => 'petugas12345',
            ],
            [
                'email' => 'super@amanah.id',
                'name' => 'Super Admin (Developer)',
                'role' => User::ROLE_SUPER_ADMIN,
                'password' => 'super12345',
            ],
            // 1 demo siswa
            [
                'email' => null,
                'name' => 'Ahmad Santri (demo)',
                'role' => User::ROLE_SANTRI,
                'password' => 'demo12345',
                'nis' => '23001',
                'kelas' => 'XII-A',
                'asrama' => 'Asrama A',
            ],
        ];

        foreach ($users as $u) {
            // firstOrCreate, bukan create. Kalau akun sudah ada, password-nya
            // TIDAK disentuh — kalau tidak, menjalankan seeder dua kali akan
            // mengembalikan password demo pada akun yang sudah diganti admin.
            if (! empty($u['email'])) {
                $user = User::firstOrCreate(
                    ['email' => $u['email']],
                    [
                        'name' => $u['name'],
                        'role' => $u['role'],
                        'password' => Hash::make($u['password']),
                    ]
                );
            } else {
                // Siswa demo di-lookup lewat relasi Santri, karena NIS ada di
                // tabel `santri`, bukan di `users`.
                $santri = Santri::where('nis', $u['nis'])->first();
                $user = $santri?->user;
                if (! $user) {
                    $user = User::create([
                        'email' => null,
                        'name' => $u['name'],
                        'role' => $u['role'],
                        'password' => Hash::make($u['password']),
                    ]);
                    Santri::create([
                        'nis' => $u['nis'],
                        'user_id' => $user->id,
                        'nama' => $user->name,
                        'kelas' => $u['kelas'],
                        'asrama' => $u['asrama'] ?? null,
                        'current_poin' => 0,
                    ]);
                }
            }

            // Poin ledger awal hanya dibuat kalau belum ada — supaya tidak
            // duplikat setiap kali seeder dijalankan ulang.
            if ($user->isSantri() && ! empty($u['nis']) && ! PoinLedger::where('nis', $u['nis'])->exists()) {
                PoinLedger::create([
                    'nis' => $u['nis'],
                    'source_type' => PoinLedger::SOURCE_INITIAL,
                    'source_id' => null,
                    'poin_delta' => 0,
                    'saldo_sebelum' => 0,
                    'saldo_sesudah' => 0,
                    'waktu' => now(),
                ]);
            }
        }

        // Generate 50 demo siswa dengan auto NIS
        $this->command?->info('Seeding 50 demo siswa...');
        for ($i = 2; $i <= 50; $i++) {
            $nis = sprintf('23%03d', $i);

            if (Santri::where('nis', $nis)->exists()) {
                continue;   // sudah ada — jangan buat duplikat
            }

            $user = User::create([
                'email' => null,
                'name' => 'Santri ' . sprintf('%03d', $i),
                'role' => User::ROLE_SANTRI,
                'password' => Hash::make('demo12345'),
            ]);
            Santri::create([
                'nis' => $nis,
                'user_id' => $user->id,
                'nama' => 'Santri ' . sprintf('%03d', $i),
                'kelas' => collect(['X-A', 'X-B', 'XI-A', 'XI-B', 'XII-A', 'XII-B'])->random(),
                'asrama' => collect(['Asrama A', 'Asrama B', 'Asrama C'])->random(),
                'current_poin' => 0,
            ]);
            PoinLedger::create([
                'nis' => $nis,
                'source_type' => PoinLedger::SOURCE_INITIAL,
                'poin_delta' => 0,
                'saldo_sebelum' => 0,
                'saldo_sesudah' => 0,
                'waktu' => now(),
            ]);
        }
    }

    private function seedKategoriDanProduk(): void
    {
        $kategoris = [
            ['nama_kategori' => 'Snack Plastik', 'deskripsi' => 'Snack dengan kemasan plastik', 'is_default_excluded' => false],
            ['nama_kategori' => 'Minuman Sachet', 'deskripsi' => 'Minuman sachet plastik', 'is_default_excluded' => false],
            ['nama_kategori' => 'Bumbu Dapur', 'deskripsi' => 'Bumbu dapur sachet plastik', 'is_default_excluded' => true],
            ['nama_kategori' => 'Galon', 'deskripsi' => 'Galon air minum (reusable, exclude)', 'is_default_excluded' => true],
            ['nama_kategori' => 'Sirup', 'deskripsi' => 'Sirup botol kaca (exclude)', 'is_default_excluded' => true],
        ];
        foreach ($kategoris as $k) {
            KategoriProduk::firstOrCreate(
                ['nama_kategori' => $k['nama_kategori']],
                ['deskripsi' => $k['deskripsi'], 'is_default_excluded' => $k['is_default_excluded']]
            );
        }

        // Produk plastik (included) + produk non-plastik (excluded)
        $produkList = [
            ['barcode' => 'CHITATO68', 'nama_produk' => 'Chitato 68g', 'kategori' => 'Snack Plastik'],
            ['barcode' => 'INDOMIE40', 'nama_produk' => 'Indomie Goreng', 'kategori' => 'Snack Plastik'],
            ['barcode' => 'AQUA600', 'nama_produk' => 'Aqua 600ml', 'kategori' => 'Minuman Sachet'],
            ['barcode' => 'TEHPANG', 'nama_produk' => 'Teh Pucuk 350ml', 'kategori' => 'Minuman Sachet'],
            ['barcode' => 'KOPIKITA', 'nama_produk' => 'Kopi Sachet', 'kategori' => 'Minuman Sachet'],
            ['barcode' => 'GORENG2', 'nama_produk' => 'Gorengan 2 (Mie)', 'kategori' => 'Bumbu Dapur'],
            ['barcode' => 'ROYCO', 'nama_produk' => 'Royco Ayam', 'kategori' => 'Bumbu Dapur'],
            ['barcode' => 'GALON19L', 'nama_produk' => 'Galon 19L', 'kategori' => 'Galon'],
            ['barcode' => 'SIRUPABC', 'nama_produk' => 'Sirup ABC 600ml', 'kategori' => 'Sirup'],
        ];
        foreach ($produkList as $p) {
            $kat = KategoriProduk::where('nama_kategori', $p['kategori'])->firstOrFail();
            Produk::firstOrCreate(
                ['barcode' => $p['barcode']],
                [
                    'nama_produk' => $p['nama_produk'],
                    'id_kategori' => $kat->id,
                    'is_excluded_from_debit' => $kat->is_default_excluded,
                ]
            );
        }
    }

    private function seedReward(): void
    {
        $rewards = [
            ['nama' => 'Buku Tulis', 'biaya' => 30, 'stok' => 50],
            ['nama' => 'Es Teh Manis', 'biaya' => 20, 'stok' => 100],
            ['nama' => 'Snack Premium', 'biaya' => 50, 'stok' => 25],
            ['nama' => 'Al-Quran Mini', 'biaya' => 200, 'stok' => 5],
            ['nama' => 'Pulsa 10rb', 'biaya' => 100, 'stok' => 0], // habis, untuk test stok habis
        ];
        foreach ($rewards as $r) {
            Reward::firstOrCreate(
                ['nama_reward' => $r['nama']],
                ['biaya_poin' => $r['biaya'], 'stok' => $r['stok'], 'status_aktif' => true]
            );
        }
    }
}
