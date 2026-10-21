<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Quiz extends Model
{
    protected $fillable = [
        'teacher_id',
        'title',
        'subject',
        'topic',
        'instructions',
        'questions',
        'is_published',
        'allow_review',
        'generated_by_ai',
        'target_type',
        'target_sections',
        'target_student_ids',
        'time_limit_minutes',
    ];

    protected function casts(): array
    {
        return [
            'questions' => 'array',
            'is_published' => 'boolean',
            'allow_review' => 'boolean',
            'generated_by_ai' => 'boolean',
            'target_sections' => 'array',
            'target_student_ids' => 'array',
            'time_limit_minutes' => 'integer',
        ];
    }

    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    public function attempts(): HasMany
    {
        return $this->hasMany(QuizAttempt::class);
    }
}
