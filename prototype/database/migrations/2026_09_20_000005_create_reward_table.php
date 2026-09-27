<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reward', function (Blueprint $table) {
            $table->uuid('id_reward')->primary();
            $table->string('nama_reward', 100);
            $table->integer('biaya_poin');
            $table->integer('stok')->default(0);
            $table->boolean('status_aktif')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('status_aktif');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reward');
    }
};
