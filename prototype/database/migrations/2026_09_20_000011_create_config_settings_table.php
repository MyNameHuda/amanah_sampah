<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('config_settings', function (Blueprint $table) {
            $table->string('key', 50)->primary();
            $table->string('value', 255);
            $table->text('description')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('updated_at')->useCurrent();
        });

        // Seed default values (per DECISION-LOG v2.0 §D)
        DB::table('config_settings')->insert([
            ['key' => 'default_starting_poin', 'value' => '0', 'description' => 'Starting poin saat siswa didaftarkan (D1)'],
            ['key' => 'default_negative_limit', 'value' => '-50', 'description' => 'Batas minus untuk blokir pembelian plastik (D8)'],
            ['key' => 'reset_target_poin', 'value' => '0', 'description' => 'Target poin setelah reset denda (D10)'],
            ['key' => 'pesantren_name', 'value' => 'Pesantren Amanah', 'description' => 'Nama pesantren'],
            // [v1.1] Super Admin Tier 1 mode toggles
            ['key' => 'is_maintenance', 'value' => 'false', 'description' => '[v1.1] Maintenance mode toggle'],
            ['key' => 'is_readonly', 'value' => 'false', 'description' => '[v1.1] Read-only mode toggle'],
            ['key' => 'verify_idle_timeout_minutes', 'value' => '30', 'description' => 'Sesi verifikasi auto-cancel timeout'],
            ['key' => 'bulk_photo_export_rate_limit_minutes', 'value' => '60', 'description' => 'Rate limit bulk download foto [v1.1]'],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('config_settings');
    }
};
