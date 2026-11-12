<?php

namespace App\Providers;

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
        RateLimiter::for('login', function (Request $request) {
            $raw = strtolower(trim((string) $request->input('identifier')));
            $aliases = [
                'student.demo@lnhs.test' => 'student@tcc.edu.ph',
                'teacher.demo@lnhs.test' => 'teacher@tcc.edu.ph',
                'secretary.demo@lnhs.test' => 'secretary@tcc.edu.ph',
                'principal.demo@lnhs.test' => 'dean@tcc.edu.ph',
                'student.demo@tcc.test' => 'student@tcc.edu.ph',
                'teacher.demo@tcc.test' => 'teacher@tcc.edu.ph',
                'secretary.demo@tcc.test' => 'secretary@tcc.edu.ph',
                'dean.demo@tcc.test' => 'dean@tcc.edu.ph',
            ];
            $normalized = $aliases[$raw] ?? $raw;

            return Limit::perMinute(5)->by($normalized.'|'.$request->ip());
        });

        ResetPassword::createUrlUsing(function ($user, string $token): string {
            $frontend = rtrim((string) config('app.frontend_url', config('app.url', 'http://localhost:5173')), '/');

            return $frontend.'/reset-password?token='.urlencode($token).'&email='.urlencode($user->email);
        });
    }
}
