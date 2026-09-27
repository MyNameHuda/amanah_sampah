<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SesiVerifikasi extends Model
{
    protected $table = 'sesi_verifikasi';
    public $timestamps = false;
    const CREATED_AT = 'created_at';
    const UPDATED_AT = null;

    protected $fillable = [
        'nis', 'petugas_id', 'waktu_mulai', 'waktu_selesai',
        'total_poin_change', 'created_at',
    ];

    protected $casts = [
        'waktu_mulai' => 'datetime',
        'waktu_selesai' => 'datetime',
        'created_at' => 'datetime',
        'total_poin_change' => 'integer',
    ];

    public function items() { return $this->hasMany(SesiVerifikasiItem::class, 'id_sesi'); }
    public function siswa() { return $this->belongsTo(Santri::class, 'nis'); }
    public function petugas() { return $this->belongsTo(User::class, 'petugas_id'); }

    public function isOpen(): bool { return $this->waktu_selesai === null; }
}
