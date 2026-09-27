<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class ConfigSetting extends Model
{
    protected $table = 'config_settings';
    protected $primaryKey = 'key';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;
    const UPDATED_AT = 'updated_at';

    protected $fillable = ['key', 'value', 'description', 'updated_by', 'updated_at'];

    public static function get(string $key, $default = null)
    {
        $cached = Cache::remember("config:$key", 60, fn() =>
            self::where('key', $key)->value('value') ?? $default
        );
        return $cached;
    }

    public static function isMaintenance(): bool
    {
        return filter_var(self::get('is_maintenance', 'false'), FILTER_VALIDATE_BOOLEAN);
    }

    public static function isReadOnly(): bool
    {
        return filter_var(self::get('is_readonly', 'false'), FILTER_VALIDATE_BOOLEAN);
    }

    public static function getNegativeLimit(): int
    {
        return (int) self::get('default_negative_limit', -50);
    }
}
