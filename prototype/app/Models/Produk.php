<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Produk extends Model
{
    protected $table = 'produk';
    protected $primaryKey = 'barcode';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'barcode', 'nama_produk', 'id_kategori',
        'is_excluded_from_debit', 'image_url',
        'created_by', 'updated_by',
        'archived_at', 'archived_by',
    ];

    protected $casts = [
        'is_excluded_from_debit' => 'boolean',
        'archived_at' => 'datetime',
    ];

    public function kategori() { return $this->belongsTo(KategoriProduk::class, 'id_kategori'); }
    public function transaksiPembelian() { return $this->hasMany(TransaksiPembelian::class, 'barcode'); }
}
