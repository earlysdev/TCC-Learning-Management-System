<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('lrn', 32)->nullable()->unique()->after('email');
            $table->string('role', 32)->default('student')->after('lrn');
            $table->string('school_year', 32)->nullable()->after('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['lrn']);
            $table->dropColumn(['lrn', 'role', 'school_year']);
        });
    }
};
