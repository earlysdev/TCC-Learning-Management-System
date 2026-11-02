<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quizzes', function (Blueprint $table): void {
            if (! Schema::hasColumn('quizzes', 'reference_pdf_name')) {
                $table->string('reference_pdf_name')->nullable()->after('instructions');
            }
            if (! Schema::hasColumn('quizzes', 'reference_pdf_text')) {
                $table->longText('reference_pdf_text')->nullable()->after('reference_pdf_name');
            }
        });
    }

    public function down(): void
    {
        Schema::table('quizzes', function (Blueprint $table): void {
            if (Schema::hasColumn('quizzes', 'reference_pdf_text')) {
                $table->dropColumn('reference_pdf_text');
            }
            if (Schema::hasColumn('quizzes', 'reference_pdf_name')) {
                $table->dropColumn('reference_pdf_name');
            }
        });
    }
};

