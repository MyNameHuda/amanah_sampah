<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('poin_ledger', function (Blueprint $table) {
            $table->id();
            $table->string('nis', 20);
            // [v1.1] enum updated: drop 'shortfall', rename 'match'→'return_match', add 'purchase'
            $table->string('source_type', 30);
            $table->unsignedBigInteger('source_id')->nullable();
            $table->integer('poin_delta');
            $table->integer('saldo_sebelum');
            $table->integer('saldo_sesudah');
            $table->timestamp('waktu')->useCurrent();
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('nis')->references('nis')->on('santri');
            $table->index(['nis', 'waktu']);
            $table->index(['source_type', 'source_id']);
            $table->index('waktu');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('poin_ledger');
    }
};
