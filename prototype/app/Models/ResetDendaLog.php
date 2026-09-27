<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ResetDendaLog extends Model
{
    protected $table = 'reset_denda_log';

    protected $fillable = [
        'nis', 'admin_id', 'poin_sebelum', 'poin_sesudah',
        'verifikasi_step_1', 'verifikasi_step_2', 'completed_at', 'catatan',
    ];

    protected $casts = [
        'poin_sebelum' => 'integer',
        'poin_sesudah' => 'integer',
        'verifikasi_step_1' => 'boolean',
        'verifikasi_step_2' => 'boolean',
        'completed_at' => 'datetime',
    ];

    public function siswa() { return $this->belongsTo(Santri::class, 'nis'); }
    public function admin() { return $this->belongsTo(User::class, 'admin_id'); }
}
