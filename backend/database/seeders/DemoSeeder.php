<?php

namespace Database\Seeders;

use App\Services\LmsAccountCleanupService;
use Illuminate\Database\Seeder;

class DemoSeeder extends Seeder
{
    public function run(): void
    {
        LmsAccountCleanupService::executeCleanupAndProvision(dispatchEmails: false);
    }
}
