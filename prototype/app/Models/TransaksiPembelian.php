<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TransaksiPembelian extends Model
{
    protected $table = 'transaksi_pembelian';

    protected $fillable = [
        'nis', 'barcode', 'qty', 'penalty_per_unit', 'status',
        'staff_id', 'waktu', 'settled_at', 'cancelled_at', 'catatan',
    ];

    protected $casts = [
        'qty' => 'integer',
        'penalty_per_unit' => 'integer',
        'waktu' => 'datetime',
        'settled_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function santri() { return $this->belongsTo(Santri::class, 'nis'); }
    public function produk() { return $this->belongsTo(Produk::class, 'barcode'); }
    public function staff() { return $this->belongsTo(User::class, 'staff_id'); }

    public function isOpen(): bool { return $this->status === 'open'; }
}
