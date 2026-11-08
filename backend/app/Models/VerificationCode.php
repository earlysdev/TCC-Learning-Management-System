<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VerificationCode extends Model
{
    public const PURPOSE_LOGIN_DEVICE = 'login_device';

    public const PURPOSE_PASSWORD_RESET = 'password_reset';

    public const PURPOSE_PASSWORD_CHANGE = 'password_change';

    protected $fillable = [
        'user_id',
        'purpose',
        'challenge',
        'code_hash',
        'payload',
        'attempts',
        'sent_at',
        'expires_at',
        'consumed_at',
    ];

    protected $hidden = [
        'code_hash',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'attempts' => 'integer',
            'sent_at' => 'datetime',
            'expires_at' => 'datetime',
            'consumed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isUsable(): bool
    {
        return $this->consumed_at === null
            && $this->expires_at->isFuture()
            && $this->attempts < config('lms.otp_max_attempts', 5);
    }
}
