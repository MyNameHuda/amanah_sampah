<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Reward extends Model
{
    protected $table = 'reward';
    protected $primaryKey = 'id_reward';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_reward', 'nama_reward', 'biaya_poin', 'stok',
        'status_aktif', 'archived_at', 'archived_by',
        'created_by', 'updated_by',
    ];

    protected $casts = [
        'biaya_poin' => 'integer',
        'stok' => 'integer',
        'status_aktif' => 'boolean',
        'archived_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function ($reward) {
            if (empty($reward->id_reward)) {
                $reward->id_reward = (string) Str::uuid();
            }
        });
    }

    public function penukaran() { return $this->hasMany(PenukaranReward::class, 'id_reward'); }

    /**
     * Check apakah reward punya stock cukup untuk redeem qty unit.
     * Reward yang di-archive atau non-aktif otomatis gagal.
     */
    public function hasStock(int $qty = 1): bool
    {
        return $this->status_aktif && $this->archived_at === null && $this->stok >= $qty;
    }
}
