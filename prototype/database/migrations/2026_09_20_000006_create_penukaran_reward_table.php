<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('penukaran_reward', function (Blueprint $table) {
            $table->id();
            $table->string('nis', 20);
            $table->uuid('id_reward');
            $table->integer('poin_used');
            $table->string('status', 20)->default('redeemed');
            $table->timestamp('waktu')->useCurrent();
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('nis')->references('nis')->on('santri');
            $table->foreign('id_reward')->references('id_reward')->on('reward');
            $table->index(['nis', 'waktu']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('penukaran_reward');
    }
};
