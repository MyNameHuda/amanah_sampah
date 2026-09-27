<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PoinLedger extends Model
{
    protected $table = 'poin_ledger';
    public $timestamps = false;
    const CREATED_AT = 'created_at';
    const UPDATED_AT = null;

    public const SOURCE_INITIAL = 'initial';
    public const SOURCE_PURCHASE = 'purchase';
    public const SOURCE_RETURN_MATCH = 'return_match';
    public const SOURCE_REDEEM = 'redeem';
    public const SOURCE_RESET = 'reset';
    public const SOURCE_ADMIN_ADJUSTMENT = 'admin_adjustment';

    public const SOURCES = [
        self::SOURCE_INITIAL, self::SOURCE_PURCHASE, self::SOURCE_RETURN_MATCH,
        self::SOURCE_REDEEM, self::SOURCE_RESET, self::SOURCE_ADMIN_ADJUSTMENT,
    ];

    protected $fillable = [
        'nis', 'source_type', 'source_id', 'poin_delta',
        'saldo_sebelum', 'saldo_sesudah', 'waktu', 'created_at',
    ];

    protected $casts = [
        'poin_delta' => 'integer',
        'saldo_sebelum' => 'integer',
        'saldo_sesudah' => 'integer',
        'waktu' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function siswa() { return $this->belongsTo(Santri::class, 'nis'); }
}
