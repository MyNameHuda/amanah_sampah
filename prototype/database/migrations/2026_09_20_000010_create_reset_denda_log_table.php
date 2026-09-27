<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reset_denda_log', function (Blueprint $table) {
            $table->id();
            $table->string('nis', 20);
            $table->foreignId('admin_id')->constrained('users');
            $table->integer('poin_sebelum');
            // [v1.1] target poin setelah reset = 0 (was +10)
            $table->integer('poin_sesudah')->default(0);
            $table->boolean('verifikasi_step_1')->default(false);
            $table->boolean('verifikasi_step_2')->default(false);
            $table->timestamp('completed_at')->nullable();
            $table->text('catatan')->nullable();
            $table->timestamps();

            $table->foreign('nis')->references('nis')->on('santri');
            $table->index(['nis', 'completed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reset_denda_log');
    }
};
