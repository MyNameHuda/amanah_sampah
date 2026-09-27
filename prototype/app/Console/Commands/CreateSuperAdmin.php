<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

/**
 * Buat akun Super Admin dari command line.
 *
 * Kenapa command ini perlu ada:
 * `DatabaseSeeder` sengaja memakai password demo yang PUBLIK
 * (admin12345, super12345, dst) supaya orang bisa login cepat saat demo.
 * Menjalankan seeder di produksi berarti tinggal masuk dengan password
 * yang tertulis di repo. Command ini memberi jalur yang aman:
 * super admin pertama dibuat lewat CLI dengan password pilihan sendiri.
 *
 * Dipakai di Render karena free tier tidak menyediakan shell, jadi login
 * dashboard untuk pertama kali harus lewat command di log container.
 */
class CreateSuperAdmin extends Command
{
    protected $signature = 'amanah:create-super-admin
        {--name= : Nama lengkap super admin}
        {--email= : Email (opsional, boleh kosong untuk super admin)}
        {--password= : Password minimal 12 karakter}
        {--password-confirm= : Ulangi password (wajib bila --password dipakai)}
        {--force : Jangan tanya konfirmasi}';

    protected $description = 'Buat akun Super Admin pertama dengan password aman (dipakai untuk setup produksi)';

    public function handle(): int
    {
        $name = (string) ($this->option('name') ?: $this->ask('Nama lengkap'));
        $email = $this->option('email') ?: $this->ask('Email (boleh kosong)');
        $password = (string) $this->option('password');

        if ($password === '') {
            $password = (string) $this->secret('Password (min 12 karakter)');
            $confirm = (string) $this->secret('Ulangi password');
            if ($password !== $confirm) {
                $this->error('Dua password tidak cocok.');
                return self::FAILURE;
            }
        } else {
            // Mode non-interaktif (dipakai Render: tidak ada shell, jadi
            // command dijalankan dari log container dengan flag eksplisit).
            // Konfirmasi wajib supaya salah ketik tidak jadi password akun.
            $confirm = (string) $this->option('password-confirm');
            if ($confirm === '') {
                $this->error('--password wajib diikuti --password-confirm.');
                return self::FAILURE;
            }
            if ($password !== $confirm) {
                $this->error('--password dan --password-confirm tidak cocok.');
                return self::FAILURE;
            }
        }

        $validator = Validator::make(
            ['name' => $name, 'email' => $email, 'password' => $password],
            [
                'name' => 'required|string|max:255',
                'email' => 'nullable|email|max:255|unique:users,email',
                // 12 karakter + kombinasi kelas karakter. Ini password
                // minimum yang layak untuk akun dengan akses penuh.
                'password' => ['required', 'string', 'min:12',
                    'regex:/[a-z]/', 'regex:/[A-Z]/', 'regex:/[0-9]/'],
            ],
            [
                'password.min' => 'Password minimal 12 karakter.',
                'password.regex' => 'Password harus punya huruf besar, huruf kecil, dan angka.',
                'email.unique' => 'Email tersebut sudah dipakai.',
            ]
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $err) {
                $this->error($err);
            }
            return self::FAILURE;
        }

        $existing = User::where('role', User::ROLE_SUPER_ADMIN)->count();
        if ($existing > 0 && ! $this->option('force')) {
            $this->error("Sudah ada {$existing} akun super admin.");
            $this->line('Kalau memang ingin menambah, ulangi dengan --force.');
            return self::FAILURE;
        }

        $user = User::create([
            'name' => $name,
            'email' => $email ?: null,
            'role' => User::ROLE_SUPER_ADMIN,
            'password' => Hash::make($password),
        ]);

        $this->info("Super admin dibuat: {$user->name} (#{$user->id})");
        $this->line('  Login pakai email/NIS + password di atas.');
        $this->newLine();
        $this->warn('JANGAN pernah menjalankan `php artisan db:seed` di produksi.');
        $this->line('  Seeder berisi password demo yang publik. Pakai `migrate:fresh --seed`');
        $this->line('  HANYA di mesin lokal.');

        return self::SUCCESS;
    }
}
