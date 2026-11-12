<?php

namespace App\Models;

use App\Models\Concerns\BelongsToDepartment;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SecurityLog extends Model
{
    use BelongsToDepartment, HasFactory;

    protected $fillable = [
        'user_id',
        'department',
        'event_type',
        'ip_address',
        'user_agent',
        'details',
        'is_resolved',
        'resolved_at',
        'resolved_by',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $log): void {
            if (is_string($log->department) && trim($log->department) !== '') {
                $log->department = strtoupper(trim($log->department));
                return;
            }

            if ($log->user_id !== null) {
                $dept = User::whereKey($log->user_id)->value('department');
                if (is_string($dept) && trim($dept) !== '') {
                    $log->department = strtoupper(trim($dept));
                    return;
                }
            }

            $detailDept = $log->details['department'] ?? null;
            if (is_string($detailDept) && trim($detailDept) !== '') {
                $log->department = strtoupper(trim($detailDept));
            }
        });
    }

    protected $casts = [
        'details' => 'array',
        'is_resolved' => 'boolean',
        'resolved_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function resolver()
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
