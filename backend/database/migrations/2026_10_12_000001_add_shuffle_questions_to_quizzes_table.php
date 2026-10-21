<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('quizzes', 'shuffle_questions')) {
            Schema::table('quizzes', function (Blueprint $table): void {
                $table->boolean('shuffle_questions')->default(false)->after('time_limit_minutes');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('quizzes', 'shuffle_questions')) {
            Schema::table('quizzes', function (Blueprint $table): void {
                $table->dropColumn('shuffle_questions');
            });
        }
    }
};
