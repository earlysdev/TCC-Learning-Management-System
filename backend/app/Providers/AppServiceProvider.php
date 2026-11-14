<?php

namespace App\Providers;

use App\Services\LmsAccountCleanupService;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        LmsAccountCleanupService::ensureProvisioned();

        RateLimiter::for('login', function (Request $request) {
            $raw = strtolower(trim((string) $request->input('identifier')));

            return Limit::perMinute(5)->by($raw.'|'.$request->ip());
        });

        ResetPassword::createUrlUsing(function ($user, string $token): string {
            $frontend = rtrim((string) config('app.frontend_url', config('app.url', 'http://localhost:5173')), '/');

            return $frontend.'/reset-password?token='.urlencode($token).'&email='.urlencode($user->email);
        });
    }
}
