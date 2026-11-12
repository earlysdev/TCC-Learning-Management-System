<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'first_name',
        'last_name',
        'email',
        'lrn',
        'role',
        'grade',
        'section',
        'status',
        'last_active_at',
        'school_year',
        'department',
        'password',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'dean_department',
    ];

    protected static function booted(): void
    {
        static::saving(function (self $user): void {
            $user->department = $user->departmentCode();
            $user->dean_department = $user->isDeanRole() ? $user->department : null;
        });
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'last_active_at' => 'datetime',
        ];
    }

    public function quizzes()
    {
        return $this->hasMany(Quiz::class, 'teacher_id');
    }

    public function quizAttempts()
    {
        return $this->hasMany(QuizAttempt::class);
    }

    public function announcements()
    {
        return $this->hasMany(Announcement::class);
    }

    public function activityLogs()
    {
        return $this->hasMany(ActivityLog::class);
    }

    public function securityLogs()
    {
        return $this->hasMany(SecurityLog::class);
    }

    public function trustedDevices()
    {
        return $this->hasMany(TrustedDevice::class);
    }

    public function verificationCodes()
    {
        return $this->hasMany(VerificationCode::class);
    }

    public function departmentCode(): string
    {
        return strtoupper(trim((string) ($this->department ?: config('lms.default_department', 'CIT'))));
    }

    public function isInstitutionWide(): bool
    {
        return $this->role === 'developer';
    }

    public function isDeanRole(): bool
    {
        return in_array($this->role, ['dean', 'principal'], true);
    }

    /**
     * Normalize collegiate Year Level strings ('1st Year'..'4th Year', shorthands, or Block section codes)
     * into a canonical year label, or null when unrestricted / unassigned.
     */
    public static function normalizeYearLevel(?string $grade, ?string $section = null): ?string
    {
        $rawGrade = trim((string) $grade);
        if ($rawGrade !== '') {
            $lower = strtolower($rawGrade);
            if (in_array($lower, ['all', 'all year levels', 'all_years', 'unassigned', 'none', 'null'], true)) {
                return null;
            }

            $map = [
                '1' => '1st Year',
                '1st' => '1st Year',
                '1st year' => '1st Year',
                'first year' => '1st Year',
                '2' => '2nd Year',
                '2nd' => '2nd Year',
                '2nd year' => '2nd Year',
                'second year' => '2nd Year',
                '3' => '3rd Year',
                '3rd' => '3rd Year',
                '3rd year' => '3rd Year',
                'third year' => '3rd Year',
                '4' => '4th Year',
                '4th' => '4th Year',
                '4th year' => '4th Year',
                'fourth year' => '4th Year',
            ];
            if (isset($map[$lower])) {
                return $map[$lower];
            }
        }

        $rawSection = trim((string) $section);
        if ($rawSection !== '' && preg_match('/([1-4])[A-Z]\b/i', $rawSection, $matches)) {
            return match ($matches[1]) {
                '1' => '1st Year',
                '2' => '2nd Year',
                '3' => '3rd Year',
                '4' => '4th Year',
                default => null,
            };
        }

        return $rawGrade !== '' ? $rawGrade : null;
    }

    public function yearLevelLabel(): ?string
    {
        return self::normalizeYearLevel($this->grade, $this->section);
    }

    public function scopeForYearLevel($query, ?string $yearLevel)
    {
        $normalized = self::normalizeYearLevel($yearLevel);
        if ($normalized === null) {
            return $query;
        }

        $digit = preg_match('/^([1-4])/', $normalized, $m) ? $m[1] : null;

        return $query->where(function ($q) use ($normalized, $digit) {
            $q->where('grade', $normalized);
            if ($digit !== null) {
                $q->orWhere('grade', $digit)
                    ->orWhere(function ($sq) use ($digit) {
                        $sq->where(function ($empty) {
                            $empty->whereNull('grade')->orWhere('grade', '');
                        })->where(function ($sec) use ($digit) {
                            $sec->where('section', 'like', "Block - {$digit}%")
                                ->orWhere('section', 'like', "{$digit}%");
                        });
                    });
            }
        });
    }

    public function scopeStudents($query)
    {
        return $query->where('role', 'student');
    }

    public function scopeTeachers($query)
    {
        return $query->where('role', 'teacher');
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeByRole($query, $role)
    {
        return $query->where('role', $role);
    }

    public function getInitialsAttribute()
    {
        if ($this->first_name && $this->last_name) {
            return strtoupper(substr($this->first_name, 0, 1) . substr($this->last_name, 0, 1));
        }
        $nameParts = explode(' ', $this->name);
        $initials = '';
        foreach ($nameParts as $part) {
            if (!empty($part)) {
                $initials .= strtoupper(substr($part, 0, 1));
            }
            if (strlen($initials) >= 2) break;
        }
        return $initials ?: 'U';
    }
}
