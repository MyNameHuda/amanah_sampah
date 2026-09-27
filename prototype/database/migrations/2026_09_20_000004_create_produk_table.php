<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('produk', function (Blueprint $table) {
            $table->string('barcode', 50)->primary();
            $table->string('nama_produk', 100);
            $table->foreignId('id_kategori')->constrained('kategori_produk');
            $table->boolean('is_excluded_from_debit')->default(false);
            $table->string('image_url', 500)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('id_kategori');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('produk');
    }
};
