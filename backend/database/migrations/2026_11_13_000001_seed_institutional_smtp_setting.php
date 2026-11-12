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

        $password = (string) env('MAIL_PASSWORD', '');
        $username = (string) env('MAIL_USERNAME', '');
        $host = (string) env('MAIL_HOST', 'smtp.gmail.com');
        $port = (int) env('MAIL_PORT', 587);
        $encryption = (string) env('MAIL_ENCRYPTION', 'tls');
        $fromAddress = (string) env('MAIL_FROM_ADDRESS', $username ?: 'tcclms4@gmail.com');
        $fromName = (string) env('MAIL_FROM_NAME', 'Tagoloan Community College LMS');

        // Only persist if configured in environment, avoiding committing secrets to repository
        if ($password !== '' && $username !== '') {
            SystemSetting::set(
                'institutional_smtp',
                [
                    'mailer' => 'smtp',
                    'host' => $host,
                    'port' => $port,
                    'username' => $username,
                    'password' => $password,
                    'encryption' => $encryption,
                    'from_address' => $fromAddress,
                    'from_name' => $fromName,
                ],
                'json',
                'Global institutional SMTP credentials for reliable transactional dispatch and OTP delivery.'
            );
        }
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
