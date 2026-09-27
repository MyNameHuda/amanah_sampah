<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    protected $table = 'audit_logs';
    public $timestamps = false;

    protected $fillable = [
        'user_id', 'role', 'action', 'resource_type', 'resource_id',
        'payload', 'admin_alasan', 'ip_address', 'user_agent',
        'waktu', 'archive_at', 'purged_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'waktu' => 'datetime',
        'archive_at' => 'datetime',
        'purged_at' => 'datetime',
    ];

    public function user() { return $this->belongsTo(User::class); }

    public static function record(string $action, array $payload = [], array $opts = []): self
    {
        // Allow explicit user override — penting untuk login (token baru belum aktif)
        // dan logout (token sudah di-delete), di mana auth()->user() = null.
        $user = $opts['user'] ?? auth()->user();
        return self::create([
            'user_id' => $user?->id,
            'role' => $user?->role ?? 'system',
            'action' => $action,
            'resource_type' => $opts['resource_type'] ?? null,
            'resource_id' => $opts['resource_id'] ?? null,
            'payload' => $payload,
            'admin_alasan' => $opts['admin_alasan'] ?? null,
            'ip_address' => request()?->ip(),
            'user_agent' => request()?->userAgent(),
            'waktu' => now(),
        ]);
    }
}

class AuditLogArchive extends Model
{
    protected $table = 'audit_logs_archive';
    public $timestamps = false;
}
