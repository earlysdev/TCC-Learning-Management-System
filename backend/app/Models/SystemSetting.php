<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

class SystemSetting extends Model
{
    use HasFactory;

    protected $fillable = [
        'department',
        'key',
        'value',
        'type',
        'description'
    ];

    public static function get(string $key, $default = null, ?string $department = null)
    {
        $hasDeptColumn = Schema::hasColumn('system_settings', 'department');
        $setting = null;
        if ($hasDeptColumn && $department !== null) {
            $setting = self::where('department', strtoupper(trim($department)))
                ->where('key', $key)
                ->first();
        }
        $setting ??= $hasDeptColumn
            ? self::whereNull('department')->where('key', $key)->first()
            : self::where('key', $key)->first();

        if (!$setting) {
            return $default;
        }

        return match ($setting->type) {
            'boolean' => filter_var($setting->value, FILTER_VALIDATE_BOOLEAN),
            'json' => json_decode($setting->value, true),
            default => $setting->value,
        };
    }

    public static function set(string $key, $value, string $type = 'string', ?string $description = null, ?string $department = null)
    {
        $stringValue = match ($type) {
            'boolean' => $value ? '1' : '0',
            'json' => json_encode($value),
            default => (string) $value,
        };

        $hasDeptColumn = Schema::hasColumn('system_settings', 'department');
        $normalizedDept = $department !== null ? strtoupper(trim($department)) : null;

        return self::updateOrCreate(
            $hasDeptColumn ? ['department' => $normalizedDept, 'key' => $key] : ['key' => $key],
            [
                'value' => $stringValue,
                'type' => $type,
                'description' => $description ?? ''
            ]
        );
    }
}
