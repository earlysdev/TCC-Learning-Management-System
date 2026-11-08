<?php

namespace App\Services;

use App\Mail\LmsVerificationMail;
use App\Models\User;
use App\Models\VerificationCode;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class LmsOtpService
{
    /**
     * Create and send a new verification code.
     */
    public function issue(User $user, string $purpose, array $payload = [], array $meta = []): array
    {
        // Invalidate any older unused codes for this user & purpose
        VerificationCode::where('user_id', $user->id)
            ->where('purpose', $purpose)
            ->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);

        $rawCode = str_pad((string) random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
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

        $mailSent = false;
        try {
            Mail::to($user->email)->send(new LmsVerificationMail($user, $rawCode, $purpose, $meta));
            $mailSent = true;
        } catch (\Throwable $e) {
            Log::warning("Failed to send LMS OTP email to {$user->email}: " . $e->getMessage());
        }

        // Masked email hint (e.g. j***z@tcc.edu.ph)
        $emailParts = explode('@', $user->email);
        $local = $emailParts[0] ?? 'user';
        $domain = $emailParts[1] ?? 'tcc.edu.ph';
        $maskedLocal = strlen($local) > 2
            ? substr($local, 0, 1) . str_repeat('*', max(3, strlen($local) - 2)) . substr($local, -1)
            : $local . '***';
        $maskedEmail = "{$maskedLocal}@{$domain}";

        return [
            'challenge' => $challenge,
            'email_hint' => $maskedEmail,
            'expires_at' => $record->expires_at->toIso8601String(),
            'mail_sent' => $mailSent,
            // Only expose raw code in local log or debug mode when mail is not smtp
            'debug_code' => config('app.debug') && config('mail.default') === 'log' ? $rawCode : null,
        ];
    }

    /**
     * Verify a submitted code against a challenge token.
     */
    public function verify(string $challenge, string $code, string $purpose): array
    {
        $record = VerificationCode::with('user')
            ->where('challenge', $challenge)
            ->where('purpose', $purpose)
            ->first();

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

        $maxAttempts = (int) config('lms.otp_max_attempts', 5);
        if ($record->attempts >= $maxAttempts) {
            return [
                'success' => false,
                'message' => 'Too many failed verification attempts. Please request a new code.',
            ];
        }

        $cleanCode = trim($code);
        if (! Hash::check($cleanCode, $record->code_hash)) {
            $record->increment('attempts');
            $remaining = max(0, $maxAttempts - $record->attempts);

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
    }

    /**
     * Resend a fresh OTP for an existing challenge.
     */
    public function resend(string $challenge, array $meta = []): array
    {
        $record = VerificationCode::with('user')
            ->where('challenge', $challenge)
            ->whereNull('consumed_at')
            ->first();

        if (! $record || ! $record->user) {
            return [
                'success' => false,
                'message' => 'Verification session expired. Please sign in again.',
            ];
        }

        $cooldown = (int) config('lms.otp_resend_cooldown_seconds', 60);
        if ($record->sent_at && $record->sent_at->diffInSeconds(now()) < $cooldown) {
            $wait = $cooldown - $record->sent_at->diffInSeconds(now());
            return [
                'success' => false,
                'message' => "Please wait {$wait}s before requesting a new code.",
            ];
        }

        $rawCode = str_pad((string) random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
        $ttl = (int) config('lms.otp_ttl_minutes', 10);

        $record->update([
            'code_hash' => Hash::make($rawCode),
            'attempts' => 0,
            'sent_at' => now(),
            'expires_at' => now()->addMinutes($ttl),
        ]);

        try {
            Mail::to($record->user->email)->send(
                new LmsVerificationMail($record->user, $rawCode, $record->purpose, $meta)
            );
        } catch (\Throwable $e) {
            Log::warning("Failed to resend LMS OTP to {$record->user->email}: " . $e->getMessage());
        }

        return [
            'success' => true,
            'message' => 'A new 6-digit verification code has been dispatched to your email.',
            'expires_at' => $record->expires_at->toIso8601String(),
            'debug_code' => config('app.debug') && config('mail.default') === 'log' ? $rawCode : null,
        ];
    }
}
