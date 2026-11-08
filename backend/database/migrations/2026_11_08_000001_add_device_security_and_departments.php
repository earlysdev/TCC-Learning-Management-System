<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Department (college) isolation
        foreach (['users', 'quizzes', 'sections'] as $tableName) {
            if (Schema::hasTable($tableName) && ! Schema::hasColumn($tableName, 'department')) {
                Schema::table($tableName, function (Blueprint $table): void {
                    $table->string('department', 16)->default('CIT')->index();
                });
            }
        }

        // Subjects already carry a program label ("BSIT"); the official BSIT curriculum belongs to CIT.
        if (Schema::hasTable('subjects') && Schema::hasColumn('subjects', 'department')) {
            DB::table('subjects')
                ->where(function ($query): void {
                    $query->whereNull('department')->orWhere('department', 'BSIT')->orWhere('department', '');
                })
                ->update(['department' => 'CIT']);
        }

        // Dean security log resolution tracking
        if (Schema::hasTable('security_logs') && ! Schema::hasColumn('security_logs', 'resolved_by')) {
            Schema::table('security_logs', function (Blueprint $table): void {
                $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            });
        }

        // Device recognition
        if (! Schema::hasTable('trusted_devices')) {
            Schema::create('trusted_devices', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('device_hash', 64);
                $table->string('device_name', 120)->nullable();
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->timestamp('last_used_at')->nullable();
                $table->timestamps();

                $table->unique(['user_id', 'device_hash']);
            });
        }

        // Emailed one-time codes (login device OTP, password reset, password change)
        if (! Schema::hasTable('verification_codes')) {
            Schema::create('verification_codes', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('purpose', 32);
                $table->string('challenge', 64)->unique();
                $table->string('code_hash', 64);
                $table->json('payload')->nullable();
                $table->unsignedTinyInteger('attempts')->default(0);
                $table->timestamp('sent_at')->nullable();
                $table->timestamp('expires_at');
                $table->timestamp('consumed_at')->nullable();
                $table->timestamps();

                $table->index(['user_id', 'purpose']);
            });
        }

        // School Year 2026-2027
        if (Schema::hasTable('system_settings')) {
            DB::table('system_settings')->where('key', 'school_year')->update(['value' => '2026-2027']);
        }
        if (Schema::hasTable('users') && Schema::hasColumn('users', 'school_year')) {
            DB::table('users')->where('school_year', '2025-2026')->update(['school_year' => '2026-2027']);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('verification_codes');
        Schema::dropIfExists('trusted_devices');

        if (Schema::hasTable('security_logs') && Schema::hasColumn('security_logs', 'resolved_by')) {
            Schema::table('security_logs', function (Blueprint $table): void {
                $table->dropConstrainedForeignId('resolved_by');
            });
        }

        foreach (['users', 'quizzes', 'sections'] as $tableName) {
            if (Schema::hasTable($tableName) && Schema::hasColumn($tableName, 'department')) {
                Schema::table($tableName, function (Blueprint $table): void {
                    $table->dropIndex(['department']);
                    $table->dropColumn('department');
                });
            }
        }
    }
};
