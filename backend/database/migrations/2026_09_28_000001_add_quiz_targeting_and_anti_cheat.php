<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quizzes', function (Blueprint $table): void {
            $table->string('target_type', 24)->default('all')->after('is_published');
            $table->json('target_sections')->nullable()->after('target_type');
            $table->json('target_student_ids')->nullable()->after('target_sections');
            $table->unsignedSmallInteger('time_limit_minutes')->nullable()->after('target_student_ids');
        });

        Schema::table('quiz_attempts', function (Blueprint $table): void {
            $table->unsignedSmallInteger('cheating_attempts_count')->default(0)->after('percentage');
            $table->json('violations')->nullable()->after('cheating_attempts_count');
            $table->string('ip_address', 45)->nullable()->after('violations');
            $table->text('user_agent')->nullable()->after('ip_address');
            $table->timestamp('started_at')->nullable()->after('user_agent');
            $table->timestamp('completed_at')->nullable()->after('started_at');
        });

        Schema::create('sections', function (Blueprint $table): void {
            $table->id();
            $table->string('grade', 20);
            $table->string('name', 60);
            $table->string('display_name', 80);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sections');

        Schema::table('quiz_attempts', function (Blueprint $table): void {
            $table->dropColumn([
                'cheating_attempts_count',
                'violations',
                'ip_address',
                'user_agent',
                'started_at',
                'completed_at',
            ]);
        });

        Schema::table('quizzes', function (Blueprint $table): void {
            $table->dropColumn([
                'target_type',
                'target_sections',
                'target_student_ids',
                'time_limit_minutes',
            ]);
        });
    }
};
