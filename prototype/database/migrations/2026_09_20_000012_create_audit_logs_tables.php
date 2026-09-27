<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('role', 30);
            $table->string('action', 50);
            $table->string('resource_type', 50)->nullable();
            $table->unsignedBigInteger('resource_id')->nullable();
            $table->json('payload')->nullable();
            // [v1.1] for Tier 3 mandatory reason
            $table->text('admin_alasan')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamp('waktu')->useCurrent();
            $table->timestamp('archive_at')->nullable();
            $table->timestamp('purged_at')->nullable();

            $table->index(['waktu']);
            $table->index(['user_id', 'waktu']);
            $table->index(['action', 'waktu']);
            $table->index('archive_at');
            $table->index('purged_at');
        });

        Schema::create('audit_logs_archive', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('role', 30);
            $table->string('action', 50);
            $table->string('resource_type', 50)->nullable();
            $table->unsignedBigInteger('resource_id')->nullable();
            $table->json('payload')->nullable();
            $table->text('admin_alasan')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamp('waktu');
            $table->timestamp('archive_at');
            $table->timestamp('purged_at')->nullable();
            $table->timestamp('archived_to_table_at')->useCurrent();

            $table->index(['waktu']);
            $table->index('purged_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs_archive');
        Schema::dropIfExists('audit_logs');
    }
};
