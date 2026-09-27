<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PenukaranReward extends Model
{
    protected $table = 'penukaran_reward';
    public $timestamps = false;
    const CREATED_AT = 'created_at';
    const UPDATED_AT = null;

    protected $fillable = ['nis', 'id_reward', 'poin_used', 'status', 'waktu', 'created_at'];

    protected $casts = [
        'poin_used' => 'integer',
        'waktu' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function reward() { return $this->belongsTo(Reward::class, 'id_reward'); }
    public function santri() { return $this->belongsTo(Santri::class, 'nis'); }
}
