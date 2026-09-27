<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    public const ROLE_SANTRI = 'santri';
    public const ROLE_STAFF_KANTIN = 'staff_kantin';
    public const ROLE_PETUGAS = 'petugas_kesantrian';
    public const ROLE_ADMIN = 'admin_kesantrian';
    public const ROLE_SUPER_ADMIN = 'super_admin';
    public const ROLE_SUPER_ADMIN_TIER3 = 'super_admin_tier3';

    public const ROLES = [
        self::ROLE_SANTRI,
        self::ROLE_STAFF_KANTIN,
        self::ROLE_PETUGAS,
        self::ROLE_ADMIN,
        self::ROLE_SUPER_ADMIN,
        self::ROLE_SUPER_ADMIN_TIER3,
    ];

    protected $fillable = [
        'email', 'name', 'role', 'password',
        'suspended_at', 'must_change_password',
        'phone', 'gender', 'birth_place', 'birth_date', 'address',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'suspended_at' => 'datetime',
            'must_change_password' => 'boolean',
            'birth_date' => 'date',
        ];
    }

    public function isSantri(): bool { return $this->role === self::ROLE_SANTRI; }
    public function isPetugas(): bool { return $this->role === self::ROLE_PETUGAS; }
    public function isAdmin(): bool { return $this->role === self::ROLE_ADMIN; }
    public function isStaffKantin(): bool { return $this->role === self::ROLE_STAFF_KANTIN; }

    public function isSuperAdmin(): bool {
        return in_array($this->role, [self::ROLE_SUPER_ADMIN, self::ROLE_SUPER_ADMIN_TIER3], true);
    }
    public function isSuspended(): bool { return $this->suspended_at !== null; }

    public function getBiodataAttribute(): array {
        return [
            'phone' => $this->phone,
            'gender' => $this->gender,
            'birth_place' => $this->birth_place,
            'birth_date' => $this->birth_date?->format('Y-m-d'),
            'address' => $this->address,
        ];
    }

    public static function selfEditableFields(): array {
        return ['name', 'phone', 'gender', 'birth_place', 'birth_date', 'address'];
    }

    public function isSuperAdminTier1(): bool { return $this->role === self::ROLE_SUPER_ADMIN; }
    public function isSuperAdminTier3(): bool { return $this->role === self::ROLE_SUPER_ADMIN_TIER3; }
    public function needsPasswordReVerificationForDestructive(): bool { return $this->isSuperAdminTier3(); }
    public function canDoTier3(): bool { return $this->isSuperAdmin(); }
    public function canAccessSuperAdminTier1(): bool { return $this->isSuperAdmin(); }
    public function canAccessSuperAdminTier2(): bool { return $this->isSuperAdmin(); }

    public function santri()
    {
        return $this->hasOne(Santri::class);
    }
}
