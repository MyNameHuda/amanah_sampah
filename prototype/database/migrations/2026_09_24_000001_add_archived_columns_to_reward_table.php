<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tambah kolom archive ke reward untuk soft-delete.
 * Reward yang di-archive tidak muncul di catalog Santri tapi masih bisa di-restore.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reward', function (Blueprint $table) {
            $table->timestamp('archived_at')->nullable()->after('status_aktif');
            $table->foreignId('archived_by')->nullable()->after('archived_at')->constrained('users')->nullOnDelete();

            $table->index('archived_at');
            $table->index(['status_aktif', 'archived_at']);
        });
    }

    public function down(): void
    {
        Schema::table('reward', function (Blueprint $table) {
            $table->dropIndex(['status_aktif', 'archived_at']);
            $table->dropIndex(['archived_at']);
            $table->dropConstrainedForeignId('archived_by');
            $table->dropColumn('archived_at');
        });
    }
};
