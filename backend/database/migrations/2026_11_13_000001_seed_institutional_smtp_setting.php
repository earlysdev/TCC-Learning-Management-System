<?php

use App\Models\SystemSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (! Schema::hasTable('system_settings')) {
            return;
        }

        SystemSetting::set(
            'institutional_smtp',
            [
                'mailer' => 'smtp',
                'host' => 'smtp.gmail.com',
                'port' => 587,
                'username' => 'tcclms4@gmail.com',
                'password' => 'qhxsarnndiyayuku',
                'encryption' => 'tls',
                'from_address' => 'tcclms4@gmail.com',
                'from_name' => 'Tagoloan Community College LMS',
            ],
            'json',
            'Global institutional Gmail SMTP credentials for reliable transactional dispatch and OTP delivery.'
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('system_settings')) {
            SystemSetting::whereNull('department')->where('key', 'institutional_smtp')->delete();
        }
    }
};
