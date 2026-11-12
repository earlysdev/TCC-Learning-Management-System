<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

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
        $setting = null;
        if ($department !== null) {
            $setting = self::where('department', strtoupper(trim($department)))
                ->where('key', $key)
                ->first();
        }
        $setting ??= self::whereNull('department')->where('key', $key)->first();

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

        $normalizedDept = $department !== null ? strtoupper(trim($department)) : null;

        return self::updateOrCreate(
            ['department' => $normalizedDept, 'key' => $key],
            [
                'value' => $stringValue,
                'type' => $type,
                'description' => $description ?? ''
            ]
        );
    }
}
