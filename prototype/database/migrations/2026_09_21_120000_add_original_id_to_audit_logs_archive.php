<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Tambahkan kolom original_log_id untuk prevent duplicate inserts di audit_logs_archive.
        // Setiap audit_log.id hanya boleh ada di archive satu kali.
        Schema::table('audit_logs_archive', function (Blueprint $table) {
            $table->unsignedBigInteger('original_log_id')->nullable()->after('id');
            $table->unique('original_log_id');
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs_archive', function (Blueprint $table) {
            $table->dropUnique(['original_log_id']);
            $table->dropColumn('original_log_id');
        });
    }
};
