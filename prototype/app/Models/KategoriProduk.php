<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KategoriProduk extends Model
{
    protected $table = 'kategori_produk';

    protected $fillable = ['nama_kategori', 'deskripsi', 'is_default_excluded'];

    protected $casts = ['is_default_excluded' => 'boolean'];

    public function produk() { return $this->hasMany(Produk::class, 'id_kategori'); }
}
