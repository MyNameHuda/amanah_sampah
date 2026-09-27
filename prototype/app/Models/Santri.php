<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Santri extends Model
{
    protected $table = 'santri';
    protected $primaryKey = 'nis';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'nis', 'user_id', 'nama', 'kelas', 'asrama', 'current_poin',
        'is_blocked', 'block_reason', 'block_at', 'archived_at', 'reset_at',
    ];

    protected $casts = [
        'is_blocked' => 'boolean',
        'current_poin' => 'integer',
        'block_at' => 'datetime',
        'archived_at' => 'datetime',
        'reset_at' => 'datetime',
    ];

    public function user() { return $this->belongsTo(User::class); }
    public function transaksiPembelian() { return $this->hasMany(TransaksiPembelian::class, 'nis'); }
    public function sesiVerifikasi() { return $this->hasMany(SesiVerifikasi::class, 'nis'); }

    /**
     * Apakah akun login siswa ini sedang di-suspend?
     *
     * PENTING — beda dengan `is_blocked`:
     *  - `is_blocked` = Control Poin (D8). Poin <= -50. Siswa tidak boleh
     *    membeli plastik, tapi MASIH boleh Beli non-plastik & verifikasi
     *    pembuangan normal. Ini control otomatis berbasis saldo.
     *  - `is_suspended` = keputusan admin. Akun dinonaktifkan total; tidak ada
     *    aktivitas apa pun yang boleh tercatat untuk siswa ini, termasuk yang
     *    dicatat oleh staff kantin & petugas atas namanya.
     *
     * Guard ini dipakai di beberapa controller (Pembelian, Verifikasi), jadi
     * diletakkan di model supaya aturannya punya satu sumber kebenaran dan
     * tidak berubah-ubah antar tempat.
     */
    public function isAccountSuspended(): bool
    {
        return (bool) ($this->user?->isSuspended());
    }

    /**
     * Override `nama` accessor — always return from users.name (canonical source).
     * If user relationship missing (rare), fallback to local column.
     */
    public function getNamaAttribute(): string
    {
        return $this->user?->name ?? ($this->attributes['nama'] ?? '');
    }

    /**
     * Hitung prior_open_count: jumlah transaksi_pembelian dengan status='open' untuk NIS ini.
     * GLOBAL across all products per DECISION-LOG §D5.
     * Masih dipakai untuk UI logic (mis. tombol "Setor Sampah" disabled kalau ada open debt).
     */
    public function getPriorOpenCountAttribute(): int
    {
        return $this->transaksiPembelian()->where('status', 'open')->count();
    }

    /**
     * [F-change] Penalty tier system dihapus — setiap unit plastik = -1 poin FLAT,
     * tanpa escalation berdasarkan prior_open_count. Tier ini sekarang selalu -1
     * untuk backward compatibility (frontend mungkin masih baca accessor ini).
     */
    public function getCurrentPenaltyTierAttribute(): int
    {
        return -1;
    }
}
