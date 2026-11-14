<?php

use App\Services\LmsAccountCleanupService;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        if (app()->runningUnitTests()) {
            return;
        }

        LmsAccountCleanupService::ensureProvisioned();
    }

    public function down(): void
    {
        // One-time repair migration for real @gmail.com account provisioning (v2)
    }
};
