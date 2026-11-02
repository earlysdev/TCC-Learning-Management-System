<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quizzes', function (Blueprint $table): void {
            if (! Schema::hasColumn('quizzes', 'reference_pdf_data')) {
                $table->longText('reference_pdf_data')->nullable()->after('reference_pdf_text');
            }
        });
    }

    public function down(): void
    {
        Schema::table('quizzes', function (Blueprint $table): void {
            if (Schema::hasColumn('quizzes', 'reference_pdf_data')) {
                $table->dropColumn('reference_pdf_data');
            }
        });
    }
};

