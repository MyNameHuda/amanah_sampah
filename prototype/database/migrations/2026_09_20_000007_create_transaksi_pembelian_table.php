<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transaksi_pembelian', function (Blueprint $table) {
            $table->id();
            $table->string('nis', 20);
            $table->string('barcode', 50);
            $table->integer('qty');
            // [v1.1] snapshot immutable penalty per unit
            $table->smallInteger('penalty_per_unit')->default(1);
            $table->string('status', 20)->default('open');
            $table->foreignId('staff_id')->constrained('users');
            $table->timestamp('waktu')->useCurrent();
            $table->timestamp('settled_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->text('catatan')->nullable();
            $table->timestamps();

            $table->foreign('nis')->references('nis')->on('santri');
            $table->foreign('barcode')->references('barcode')->on('produk');
            $table->index(['nis', 'barcode', 'status']);
            $table->index(['status', 'waktu']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transaksi_pembelian');
    }
};
