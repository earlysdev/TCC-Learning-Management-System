<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quizzes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('teacher_id')->constrained('users')->cascadeOnDelete();
            $table->string('title');
            $table->string('subject');
            $table->string('topic');
            $table->text('instructions')->nullable();
            $table->json('questions');
            $table->boolean('is_published')->default(false);
            $table->boolean('allow_review')->default(true);
            $table->boolean('generated_by_ai')->default(false);
            $table->timestamps();
            $table->index(['is_published', 'subject']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quizzes');
    }
};
