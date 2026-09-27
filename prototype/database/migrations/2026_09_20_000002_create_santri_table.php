<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('santri', function (Blueprint $table) {
            $table->string('nis', 20)->primary();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->string('nama', 100);
            $table->string('kelas', 30);
            $table->string('asrama', 50)->nullable();
            // [v2] starting poin = 0 (was 50)
            $table->integer('current_poin')->default(0);
            $table->boolean('is_blocked')->default(false);
            $table->string('block_reason', 255)->nullable();
            $table->timestamp('block_at')->nullable();
            $table->timestamp('archived_at')->nullable();
            $table->timestamp('reset_at')->nullable();
            $table->timestamps();

            // Partial indexes are emulated using regular indexes since SQLite doesn't support them natively
            $table->index(['nis', 'is_blocked']);
            $table->index('archived_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('santri');
    }
};
