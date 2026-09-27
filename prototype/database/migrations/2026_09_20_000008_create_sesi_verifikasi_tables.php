<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sesi_verifikasi', function (Blueprint $table) {
            $table->id();
            $table->string('nis', 20);
            $table->foreignId('petugas_id')->constrained('users');
            $table->timestamp('waktu_mulai')->useCurrent();
            $table->timestamp('waktu_selesai')->nullable();
            $table->integer('total_poin_change')->default(0);
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('nis')->references('nis')->on('santri');
            $table->index(['nis', 'waktu_mulai']);
        });

        Schema::create('sesi_verifikasi_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('id_sesi');
            $table->string('barcode', 50);
            $table->integer('qty_in');
            $table->integer('qty_open_at_time');
            $table->integer('qty_matched');
            $table->integer('qty_excess');
            $table->integer('qty_shortfall');
            // [v1.1] poin_delta = qty_matched × 2 (was qty_matched − qty_shortfall)
            $table->integer('poin_delta');
            $table->string('foto_bukti_path', 500)->nullable();
            $table->text('catatan')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('id_sesi')->references('id')->on('sesi_verifikasi')->cascadeOnDelete();
            $table->foreign('barcode')->references('barcode')->on('produk');
            $table->index(['id_sesi', 'barcode']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sesi_verifikasi_items');
        Schema::dropIfExists('sesi_verifikasi');
    }
};
