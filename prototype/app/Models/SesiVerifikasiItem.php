<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SesiVerifikasiItem extends Model
{
    protected $table = 'sesi_verifikasi_items';
    public $timestamps = false;
    const CREATED_AT = 'created_at';
    const UPDATED_AT = null;

    protected $fillable = [
        'id_sesi', 'barcode', 'qty_in', 'qty_open_at_time',
        'qty_matched', 'qty_excess', 'qty_shortfall', 'poin_delta',
        'foto_bukti_path', 'catatan', 'created_at',
    ];

    protected $casts = [
        'qty_in' => 'integer', 'qty_open_at_time' => 'integer',
        'qty_matched' => 'integer', 'qty_excess' => 'integer', 'qty_shortfall' => 'integer',
        'poin_delta' => 'integer',
        'created_at' => 'datetime',
    ];

    public function sesi() { return $this->belongsTo(SesiVerifikasi::class, 'id_sesi'); }
    public function produk() { return $this->belongsTo(Produk::class, 'barcode'); }
}
