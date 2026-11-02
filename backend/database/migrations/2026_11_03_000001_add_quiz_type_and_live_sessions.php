<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quizzes', function (Blueprint $table): void {
            if (! Schema::hasColumn('quizzes', 'quiz_type')) {
                $table->string('quiz_type', 32)->default('formative')->after('topic');
            }
        });

        if (! Schema::hasTable('quiz_live_sessions')) {
            Schema::create('quiz_live_sessions', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('quiz_id')->index();
                $table->unsignedBigInteger('student_id')->index();
                $table->string('status', 32)->default('in_progress');
                $table->unsignedInteger('current_question')->default(1);
                $table->unsignedInteger('answered_count')->default(0);
                $table->unsignedInteger('total_questions')->default(0);
                $table->json('answers')->nullable();
                $table->unsignedInteger('current_score')->default(0);
                $table->unsignedInteger('max_score')->default(0);
                $table->integer('time_remaining_seconds')->nullable();
                $table->unsignedInteger('cheating_attempts_count')->default(0);
                $table->timestamp('started_at')->nullable();
                $table->timestamp('last_active_at')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->timestamps();
                $table->unique(['quiz_id', 'student_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('quiz_live_sessions');

        Schema::table('quizzes', function (Blueprint $table): void {
            if (Schema::hasColumn('quizzes', 'quiz_type')) {
                $table->dropColumn('quiz_type');
            }
        });
    }
};

