<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['announcements', 'notifications'] as $tableName) {
            if (Schema::hasTable($tableName) && ! Schema::hasColumn($tableName, 'department')) {
                Schema::table($tableName, function (Blueprint $table): void {
                    $table->string('department', 16)->default('CIT')->index();
                });
            }
        }

        if (Schema::hasTable('security_logs') && ! Schema::hasColumn('security_logs', 'department')) {
            Schema::table('security_logs', function (Blueprint $table): void {
                $table->string('department', 16)->nullable()->index();
            });
        }

        if (Schema::hasTable('system_settings') && ! Schema::hasColumn('system_settings', 'department')) {
            Schema::table('system_settings', function (Blueprint $table): void {
                $table->string('department', 16)->nullable()->index();
                $table->dropUnique(['key']);
                $table->unique(['department', 'key']);
            });
        }

        if (Schema::hasTable('users') && ! Schema::hasColumn('users', 'dean_department')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->string('dean_department', 16)->nullable()->unique();
            });

            // Backfill dean_department so database uniqueness protects single Dean per department.
            DB::table('users')
                ->whereIn('role', ['dean', 'principal'])
                ->orderBy('id')
                ->get(['id', 'department'])
                ->each(function (object $row): void {
                    $dept = strtoupper(trim((string) ($row->department ?: config('lms.default_department', 'CIT'))));
                    $alreadyTaken = DB::table('users')->where('dean_department', $dept)->exists();
                    if (! $alreadyTaken) {
                        DB::table('users')->where('id', $row->id)->update(['dean_department' => $dept]);
                    }
                });
        }

        // Backfill department attribution on existing user-linked rows.
        foreach (['announcements', 'notifications', 'security_logs'] as $tableName) {
            if (Schema::hasTable($tableName) && Schema::hasColumn($tableName, 'department')) {
                DB::table($tableName)
                    ->whereNotNull('user_id')
                    ->orderBy('id')
                    ->get(['id', 'user_id'])
                    ->each(function (object $row) use ($tableName): void {
                        $dept = DB::table('users')->where('id', $row->user_id)->value('department');
                        if (is_string($dept) && trim($dept) !== '') {
                            DB::table($tableName)->where('id', $row->id)->update([
                                'department' => strtoupper(trim($dept)),
                            ]);
                        }
                    });
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('users') && Schema::hasColumn('users', 'dean_department')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->dropUnique(['dean_department']);
                $table->dropColumn('dean_department');
            });
        }

        if (Schema::hasTable('system_settings') && Schema::hasColumn('system_settings', 'department')) {
            Schema::table('system_settings', function (Blueprint $table): void {
                $table->dropUnique(['department', 'key']);
                $table->unique(['key']);
                $table->dropIndex(['department']);
                $table->dropColumn('department');
            });
        }

        foreach (['announcements', 'notifications', 'security_logs'] as $tableName) {
            if (Schema::hasTable($tableName) && Schema::hasColumn($tableName, 'department')) {
                Schema::table($tableName, function (Blueprint $table): void {
                    $table->dropIndex(['department']);
                    $table->dropColumn('department');
                });
            }
        }
    }
};
