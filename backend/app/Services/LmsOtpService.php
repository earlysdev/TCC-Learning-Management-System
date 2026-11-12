<?php

namespace App\Services;

use App\Mail\LmsVerificationMail;
use App\Models\User;
use App\Models\VerificationCode;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class LmsOtpService
{
    /**
     * Exact seeded institutional demo accounts (excluding real @tcc.edu.ph user accounts).
     */
    private const SEEDED_DEMO_EMAILS = [
        'student@tcc.edu.ph',
        'teacher@tcc.edu.ph',
        'secretary@tcc.edu.ph',
        'dean@tcc.edu.ph',
    ];

    /**
     * Ensure database tables for OTP verification exist.
     */
    public function ensureTablesExist(): void
    {
        if (! Schema::hasTable('verification_codes')) {
            try {
                Artisan::call('migrate', ['--force' => true]);
            } catch (\Throwable $e) {
                Log::warning('LmsOtpService auto-migrate check failed: ' . $e->getMessage());
            }
        }
    }

    /**
     * Remaining cooldown seconds for an active unconsumed OTP challenge of the given purpose.
     */
    public function activeCooldownRemaining(User $user, string $purpose): int
    {
        $this->ensureTablesExist();

        if (! Schema::hasTable('verification_codes')) {
            return 0;
        }

        $latest = VerificationCode::where('user_id', $user->id)
            ->where('purpose', $purpose)
            ->whereNull('consumed_at')
            ->where('expires_at', '>', now())
            ->latest('sent_at')
            ->first();

        if (! $latest || ! $latest->sent_at) {
            return 0;
        }

        $cooldown = (int) config('lms.otp_resend_cooldown_seconds', 60);
        $elapsed = (int) floor($latest->sent_at->diffInSeconds(now(), true));

        return max(0, $cooldown - $elapsed);
    }

    /**
     * Create and send a new verification code.
     */
    public function issue(User $user, string $purpose, array $payload = [], array $meta = []): array
    {
        $this->ensureTablesExist();

        if (! Schema::hasTable('verification_codes')) {
            throw new \RuntimeException('Verification codes table is pending database migration.');
        }

        // Invalidate any older unused codes for this user & purpose
        VerificationCode::where('user_id', $user->id)
            ->where('purpose', $purpose)
            ->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);

        $rawCode = $this->generateOtpCode();
        $challenge = Str::random(48);
        $ttl = (int) config('lms.otp_ttl_minutes', 10);

        $record = VerificationCode::create([
            'user_id' => $user->id,
            'purpose' => $purpose,
            'challenge' => $challenge,
            'code_hash' => Hash::make($rawCode),
            'payload' => $payload,
            'attempts' => 0,
            'sent_at' => now(),
            'expires_at' => now()->addMinutes($ttl),
        ]);

        $mailSent = $this->dispatchVerificationMail($user, $rawCode, $purpose, $meta);
        $exposeDemo = $this->shouldExposeDemoCode($user);

        if (! $mailSent && ! $exposeDemo) {
            throw new \RuntimeException('Unable to dispatch verification email at this time. Please try again shortly.');
        }

        return [
            'challenge' => $challenge,
            'email_hint' => $this->maskEmail($user->email),
            'expires_at' => $record->expires_at->toIso8601String(),
            'mail_sent' => $mailSent,
            'debug_code' => $exposeDemo ? $rawCode : null,
        ];
    }

    /**
     * Verify a submitted code against a challenge token inside a row lock.
     */
    public function verify(
        string $challenge,
        string $code,
        string $purpose,
        ?int $expectedUserId = null
    ): array {
        $this->ensureTablesExist();

        if (! Schema::hasTable('verification_codes')) {
            return [
                'success' => false,
                'message' => 'Verification service unavailable. Please try again.',
            ];
        }

        $cleanChallenge = trim($challenge);
        $cleanCode = trim($code);
        $maxAttempts = (int) config('lms.otp_max_attempts', 5);

        return DB::transaction(function () use ($cleanChallenge, $cleanCode, $purpose, $expectedUserId, $maxAttempts): array {
            $query = VerificationCode::with('user')
                ->where('challenge', $cleanChallenge)
                ->where('purpose', $purpose);

            if ($expectedUserId !== null) {
                $query->where('user_id', $expectedUserId);
            }

            $record = $query->lockForUpdate()->first();

            if (! $record) {
                return [
                    'success' => false,
                    'message' => 'Verification session not found or expired. Please request a new code.',
                ];
            }

            if ($record->consumed_at !== null) {
                return [
                    'success' => false,
                    'message' => 'This verification code has already been used. Please request a new code.',
                ];
            }

            if ($record->expires_at->isPast()) {
                return [
                    'success' => false,
                    'message' => 'Verification code has expired. Please request a new code.',
                ];
            }

            if ($record->attempts >= $maxAttempts) {
                return [
                    'success' => false,
                    'message' => 'Too many failed verification attempts. Please request a new code.',
                ];
            }

            if (! Hash::check($cleanCode, $record->code_hash)) {
                $record->increment('attempts');
                $remaining = max(0, $maxAttempts - ($record->attempts));

                return [
                    'success' => false,
                    'message' => "Invalid verification code. {$remaining} attempt(s) remaining.",
                    'attempts_remaining' => $remaining,
                ];
            }

            $record->update(['consumed_at' => now()]);

            return [
                'success' => true,
                'user' => $record->user,
                'payload' => $record->payload ?? [],
                'record' => $record,
            ];
        });
    }

    /**
     * Resend a fresh OTP for an existing unconsumed challenge.
     */
    public function resend(
        string $challenge,
        array $meta = [],
        ?string $expectedPurpose = null,
        ?int $expectedUserId = null
    ): array {
        $this->ensureTablesExist();

        if (! Schema::hasTable('verification_codes')) {
            return [
                'success' => false,
                'message' => 'Verification service unavailable. Please try again.',
            ];
        }

        $cleanChallenge = trim($challenge);
        $cooldown = (int) config('lms.otp_resend_cooldown_seconds', 60);
        $ttl = (int) config('lms.otp_ttl_minutes', 10);

        return DB::transaction(function () use ($cleanChallenge, $meta, $expectedPurpose, $expectedUserId, $cooldown, $ttl): array {
            $query = VerificationCode::with('user')
                ->where('challenge', $cleanChallenge)
                ->whereNull('consumed_at')
                ->where('expires_at', '>', now());

            if ($expectedPurpose !== null) {
                $query->where('purpose', $expectedPurpose);
            }

            if ($expectedUserId !== null) {
                $query->where('user_id', $expectedUserId);
            }

            $record = $query->lockForUpdate()->first();

            if (! $record || ! $record->user) {
                return [
                    'success' => false,
                    'message' => 'Verification session expired. Please request a new code.',
                ];
            }

            if ($record->sent_at) {
                $elapsed = (int) floor($record->sent_at->diffInSeconds(now(), true));
                if ($elapsed < $cooldown) {
                    $wait = max(1, $cooldown - $elapsed);

                    return [
                        'success' => false,
                        'message' => "Please wait {$wait}s before requesting a new code.",
                        'retry_after' => $wait,
                    ];
                }
            }

            $rawCode = $this->generateOtpCode();

            $record->update([
                'code_hash' => Hash::make($rawCode),
                'attempts' => 0,
                'sent_at' => now(),
                'expires_at' => now()->addMinutes($ttl),
            ]);

            $mailSent = $this->dispatchVerificationMail($record->user, $rawCode, $record->purpose, $meta);
            $exposeDemo = $this->shouldExposeDemoCode($record->user);

            if (! $mailSent && ! $exposeDemo) {
                return [
                    'success' => false,
                    'message' => 'Unable to send verification email right now. Please try again shortly.',
                ];
            }

            return [
                'success' => true,
                'message' => 'A new 6-digit verification code has been dispatched to your email.',
                'expires_at' => $record->expires_at->toIso8601String(),
                'mail_sent' => $mailSent,
                'debug_code' => $exposeDemo ? $rawCode : null,
            ];
        });
    }

    private function generateOtpCode(): string
    {
        return str_pad((string) random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
    }

    private function dispatchVerificationMail(User $user, string $rawCode, string $purpose, array $meta): bool
    {
        try {
            Mail::to($user->email)->send(new LmsVerificationMail($user, $rawCode, $purpose, $meta));

            return true;
        } catch (\Throwable $e) {
            Log::warning("Failed to send LMS OTP email to {$user->email}: " . $e->getMessage());

            return false;
        }
    }

    /**
     * Expose OTP codes only in local/testing environments or when demo_otp_visible
     * is explicitly enabled for seeded/test demo accounts.
     */
    private function shouldExposeDemoCode(User $user): bool
    {
        if (app()->environment(['local', 'testing'])
            && (config('app.debug') || in_array(config('mail.default'), ['log', 'array'], true))
        ) {
            return true;
        }

        if (! (bool) config('lms.demo_otp_visible', false)) {
            return false;
        }

        $email = strtolower(trim($user->email));

        return in_array($email, self::SEEDED_DEMO_EMAILS, true)
            || str_ends_with($email, '@tcc.test')
            || str_ends_with($email, '@lnhs.test');
    }

    public function maskEmail(string $email): string
    {
        $parts = explode('@', trim($email), 2);
        $local = $parts[0] ?? '';
        $domain = $parts[1] ?? 'tcc.edu.ph';

        if (strlen($local) <= 2) {
            $prefix = $local !== '' ? substr($local, 0, 1) : '*';

            return "{$prefix}***@{$domain}";
        }

        $maskedLocal = substr($local, 0, 1)
            . str_repeat('*', max(3, strlen($local) - 2))
            . substr($local, -1);

        return "{$maskedLocal}@{$domain}";
    }
}
