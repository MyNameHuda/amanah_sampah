<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

/**
 * Bootstrap akun super admin PERTAMA dari environment variable.
 *
 * Kenapa command ini ada (dan kenapa `amanah:create-super-admin` tidak cukup):
 * Render free web service TIDAK menyediakan shell dashboard maupun SSH, dan
 * tidak ada one-off job. Artinya setelah deploy, tidak ada cara menjalankan
 * `php artisan amanah:create-super-admin`. Kalau tidak ada akun admin sama
 * sekali, aplikasi online tapi mustahil dimasuki.
 *
 * Solusinya: kredensial admin pertama ditaruh di environment variable Render,
 * lalu command ini dipanggil otomatis dari docker/entrypoint.sh setiap boot.
 *
 * Sifat penting — ini yang membuat pola ini aman:
 *  - TIDAK membuka endpoint HTTP. Tidak ada halaman yang bisa di-hit untuk
 *    membuat admin. Kredensial hanya hidup di env var Render.
 *  - HANYA membuat akun kalau BELUM ADA. Kalau email-nya sudah terdaftar,
 *    perintah ini no-op dan TIDAK PERNAH menimpa password. Ini penting
 *    karena entrypoint berjalan setiap kali container wake up dari sleep.
 *  - Menolak jalan kalau sudah ada super admin lain di sistem, supaya env var
 *    yang tidak sengaja tertinggal tidak membuat akun bayangan.
 */
class BootstrapAdmin extends Command
{
    protected $signature = 'amanah:bootstrap-admin';

    protected $description = 'Buat super admin pertama dari env var (dipanggil otomatis oleh entrypoint di hosting tanpa shell)';

    /** Password yang terlalu lemah dan tidak akan diterima. */
    private const MIN_STRENGTH = 12;

    public function handle(): int
    {
        $email = env('BOOTSTRAP_ADMIN_EMAIL');
        $password = env('BOOTSTRAP_ADMIN_PASSWORD');
        $name = env('BOOTSTRAP_ADMIN_NAME') ?: 'Super Admin';

        // --- Tidak dikonfigurasi: normal di semua boot berikutnya -------
        if (blank($email) || blank($password)) {
            $this->line('Bootstrap admin tidak dikonfigurasi — dilewati.');
            return self::SUCCESS;
        }

        // --- Sudah ada: no-op, JANGAN sentuh passwordnya -----------------
        $existing = User::where('email', $email)->first();
        if ($existing) {
            $this->line("Akun {$email} sudah ada — password tidak diubah.");
            return self::SUCCESS;
        }

        // --- Jangan buat akun bayangan kalau sudah ada super admin ------
        if (User::where('role', User::ROLE_SUPER_ADMIN)->exists()) {
            $this->warn('Sudah ada super admin lain. Bootstrap dilewati.');
            $this->warn('Kalau memang mau menambah admin baru, hapus BOOTSTRAP_ADMIN_* lalu jalankan manual.');
            return self::SUCCESS;
        }

        // --- Validasi kekuatan password -----------------------------------
        $problems = [];
        if (mb_strlen($password) < self::MIN_STRENGTH) {
            $problems[] = "minimal " . self::MIN_STRENGTH . ' karakter';
        }
        if (! preg_match('/[a-z]/', $password)) {
            $problems[] = 'harus ada huruf kecil';
        }
        if (! preg_match('/[A-Z]/', $password)) {
            $problems[] = 'harus ada huruf besar';
        }
        if (! preg_match('/[0-9]/', $password)) {
            $problems[] = 'harus ada angka';
        }

        if ($problems) {
            $this->error('BOOTSTRAP_ADMIN_PASSWORD ditolak: ' . implode(', ', $problems) . '.');
            $this->error('Akun TIDAK dibuat. Perbaiki env var lalu Save & Deploy ulang.');
            return self::FAILURE;
        }

        $validator = Validator::make(
            ['email' => $email],
            ['email' => 'required|email|max:255'],
            ['email.email' => 'Format email tidak valid.']
        );
        if ($validator->fails()) {
            $this->error('BOOTSTRAP_ADMIN_EMAIL: ' . $validator->errors()->first('email'));
            return self::FAILURE;
        }

        $user = User::create([
            'name' => $name,
            'email' => $email,
            'role' => User::ROLE_SUPER_ADMIN,
            'password' => Hash::make($password),
        ]);

        $this->info("Super admin dibuat: {$user->name} <{$user->email}> (#{$user->id})");
        $this->newLine();
        $this->warn('LANGKAH WAJIB SEBELUM DAPAT DIGUNAKAN:');
        $this->line('  1. Login di aplikasi, lalu GANTI password ini dari menu profil.');
        $this->line('  2. Di Render, HAPUS env var BOOTSTRAP_ADMIN_PASSWORD lalu Save & Deploy.');
        $this->line('     Kalau tidak dihapus, passwordnya tersimpan di dashboard Render');
        $this->line('     selamanya dan bisa terbaca siapa saja yang punya akses project.');

        return self::SUCCESS;
    }
}
