<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\VerificationCode;
use App\Services\LmsDeviceService;
use App\Services\LmsOtpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    private const LEGACY_ALIASES = [
        'student.demo@lnhs.test' => 'student@tcc.edu.ph',
        'teacher.demo@lnhs.test' => 'teacher@tcc.edu.ph',
        'secretary.demo@lnhs.test' => 'secretary@tcc.edu.ph',
        'principal.demo@lnhs.test' => 'dean@tcc.edu.ph',
        'student.demo@tcc.test' => 'student@tcc.edu.ph',
        'teacher.demo@tcc.test' => 'teacher@tcc.edu.ph',
        'secretary.demo@tcc.test' => 'secretary@tcc.edu.ph',
        'dean.demo@tcc.test' => 'dean@tcc.edu.ph',
    ];

    public function __construct(
        private readonly LmsDeviceService $deviceService,
        private readonly LmsOtpService $otpService
    ) {}

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'identifier' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string'],
            'remember' => ['sometimes', 'boolean'],
            'device_id' => ['sometimes', 'nullable', 'string', 'max:120'],
            'device_name' => ['sometimes', 'nullable', 'string', 'max:120'],
        ]);

        $rawIdentifier = trim($credentials['identifier']);
        $normalizedIdentifier = self::LEGACY_ALIASES[strtolower($rawIdentifier)] ?? $rawIdentifier;
        $user = $this->resolveUserByIdentifier($normalizedIdentifier);

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            if ($user) {
                SecurityLog::create([
                    'user_id' => $user->id,
                    'event_type' => 'login_failed',
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                    'details' => ['identifier' => $normalizedIdentifier],
                ]);
            }

            throw ValidationException::withMessages([
                'identifier' => ['These credentials do not match our records.'],
            ]);
        }

        if ($user->status === 'inactive') {
            SecurityLog::create([
                'user_id' => $user->id,
                'event_type' => 'inactive_account_login_blocked',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            throw ValidationException::withMessages([
                'identifier' => ['This account has been deactivated. Please contact the College Secretary or Dean.'],
            ]);
        }

        $remember = (bool) ($credentials['remember'] ?? $request->boolean('remember'));
        $meta = $this->requestMeta($request);

        $deviceHash = null;
        $requiresOtp = false;

        try {
            $this->deviceService->ensureTablesExist();
            $deviceHash = $this->deviceService->computeDeviceHash($request);
            $isRecognized = $this->deviceService->isDeviceRecognized($user, $deviceHash);
            $requiresOtp = ! $isRecognized && $this->shouldRequireDeviceOtp();
        } catch (\Throwable $e) {
            Log::warning('Device check degraded during sign in: ' . $e->getMessage());
            $requiresOtp = $this->shouldRequireDeviceOtp();
        }

        if ($requiresOtp) {
            if (! Schema::hasTable('verification_codes')) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Device verification is temporarily unavailable. Please contact support.',
                ], 503);
            }

            try {
                if ($deviceHash !== null) {
                    $this->deviceService->logUnrecognizedDevice($user, $request, $deviceHash);
                }

                $otp = $this->otpService->issue(
                    $user,
                    VerificationCode::PURPOSE_LOGIN_DEVICE,
                    [
                        'remember' => $remember,
                        'device_hash' => $deviceHash,
                        'device_name' => $credentials['device_name'] ?? $meta['device_name'],
                    ],
                    $meta
                );
            } catch (\Throwable $e) {
                Log::error('Failed to issue login device OTP: ' . $e->getMessage());

                return response()->json([
                    'status' => 'error',
                    'message' => 'Could not dispatch your device verification code. Please try again shortly.',
                ], 503);
            }

            return response()->json($this->withOptionalDebugCode([
                'requires_otp' => true,
                'challenge' => $otp['challenge'],
                'email_hint' => $otp['email_hint'],
                'device_name' => $meta['device_name'],
                'message' => 'Unrecognized device detected. A 6-digit verification code has been dispatched to your registered institutional email.',
            ], $otp['debug_code'] ?? null));
        }

        if ($deviceHash !== null) {
            try {
                $this->deviceService->trustDevice(
                    $user,
                    $deviceHash,
                    $credentials['device_name'] ?? null,
                    $request->ip(),
                    $request->userAgent()
                );
            } catch (\Throwable $e) {
                Log::warning('Could not record trusted device: ' . $e->getMessage());
            }
        }

        return $this->finalizeLogin($user, $request, $remember);
    }

    /**
     * Complete login after unrecognized device OTP verification.
     */
    public function verifyLoginOtp(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'challenge' => ['required', 'string'],
            'code' => ['required', 'string', 'size:6'],
            'device_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'remember' => ['sometimes', 'boolean'],
        ], [
            'code.size' => 'The verification code must be exactly 6 digits.',
        ]);

        $result = $this->otpService->verify(
            trim($validated['challenge']),
            trim($validated['code']),
            VerificationCode::PURPOSE_LOGIN_DEVICE
        );

        if (! $result['success']) {
            return $this->otpErrorResponse($result);
        }

        /** @var User $user */
        $user = $result['user'];
        $payload = $result['payload'] ?? [];
        $deviceHash = $payload['device_hash'] ?? $this->deviceService->computeDeviceHash($request);
        $deviceName = $validated['device_name'] ?? ($payload['device_name'] ?? null);

        $this->deviceService->trustDevice(
            $user,
            $deviceHash,
            $deviceName,
            $request->ip(),
            $request->userAgent()
        );

        $this->deviceService->logOtpVerificationSuccess($user, $request, $deviceHash);

        $remember = (bool) ($validated['remember'] ?? $payload['remember'] ?? false);

        return $this->finalizeLogin($user, $request, $remember, 'Device verified and trusted. Signed in successfully.');
    }

    /**
     * Resend an OTP code for an active login verification challenge.
     */
    public function resendLoginOtp(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'challenge' => ['required', 'string'],
        ]);

        $res = $this->otpService->resend(
            trim($validated['challenge']),
            $this->requestMeta($request),
            VerificationCode::PURPOSE_LOGIN_DEVICE
        );

        if (! $res['success']) {
            $statusCode = isset($res['retry_after']) ? 429 : 422;

            return response()->json([
                'status' => 'error',
                'message' => $res['message'],
            ], $statusCode);
        }

        return response()->json($this->withOptionalDebugCode([
            'status' => 'success',
            'message' => $res['message'],
            'expires_at' => $res['expires_at'],
        ], $res['debug_code'] ?? null));
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userPayload($request->user())]);
    }

    /**
     * Request a one-time authorization code to authorize account settings updates.
     */
    public function requestPasswordChangeCode(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $cooldownRemaining = $this->otpService->activeCooldownRemaining(
            $user,
            VerificationCode::PURPOSE_PASSWORD_CHANGE
        );

        if ($cooldownRemaining > 0) {
            return response()->json([
                'status' => 'error',
                'message' => "Please wait {$cooldownRemaining}s before requesting another authorization code.",
                'retry_after' => $cooldownRemaining,
            ], 429);
        }

        try {
            $otp = $this->otpService->issue(
                $user,
                VerificationCode::PURPOSE_PASSWORD_CHANGE,
                ['action' => 'profile_settings_authorization'],
                $this->requestMeta($request)
            );
        } catch (\Throwable $e) {
            Log::error('Failed to issue profile authorization OTP: ' . $e->getMessage());

            return response()->json([
                'status' => 'error',
                'message' => 'Could not dispatch your 6-digit authorization code right now. Please try again shortly.',
            ], 503);
        }

        return response()->json($this->withOptionalDebugCode([
            'status' => 'success',
            'challenge' => $otp['challenge'],
            'email_hint' => $otp['email_hint'],
            'cooldown_seconds' => (int) config('lms.otp_resend_cooldown_seconds', 60),
            'message' => "A 6-digit authorization code has been dispatched to {$otp['email_hint']}. Enter it below with your current security password.",
        ], $otp['debug_code'] ?? null));
    }

    public function updateProfile(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['sometimes', 'string', 'email', 'max:255'],
            'current_password' => ['required', 'string'],
            'password' => ['nullable', 'string', 'min:8', 'confirmed'],
            'code' => ['required', 'string', 'size:6'],
            'challenge' => ['required', 'string'],
        ], [
            'current_password.required' => 'You are required to insert your current password before saving settings.',
            'password.min' => 'Your new password must be at least 8 characters long.',
            'password.confirmed' => 'New password confirmation does not match.',
            'code.required' => 'The exact 6-digit email authorization code is required before saving settings.',
            'code.size' => 'The authorization code must be exactly 6 digits.',
            'challenge.required' => 'Please request a 6-digit authorization code to your institutional email first.',
        ]);

        // Institutional email addresses are immutable by the user
        if (! empty($validated['email']) && strtolower(trim($validated['email'])) !== strtolower($user->email)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Institutional school email addresses cannot be altered. Please contact the College Secretary or Dean for record corrections.',
            ], 422);
        }

        if (! Hash::check($validated['current_password'], $user->password)) {
            SecurityLog::create([
                'user_id' => $user->id,
                'event_type' => 'profile_update_wrong_password',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            return response()->json([
                'status' => 'error',
                'message' => 'The current security password you entered is incorrect.',
            ], 422);
        }

        // Bind OTP challenge strictly to the authenticated user
        $verifyResult = $this->otpService->verify(
            trim($validated['challenge']),
            trim($validated['code']),
            VerificationCode::PURPOSE_PASSWORD_CHANGE,
            $user->id
        );

        if (! $verifyResult['success']) {
            return $this->otpErrorResponse($verifyResult);
        }

        $parts = preg_split('/\s+/', trim($validated['name']), 2);
        $updates = [
            'name' => trim($validated['name']),
            'first_name' => $parts[0] ?? '',
            'last_name' => $parts[1] ?? '',
        ];

        $passwordChanged = ! empty($validated['password']);
        if ($passwordChanged) {
            $updates['password'] = Hash::make($validated['password']);
        }

        $user->update($updates);

        if ($passwordChanged) {
            $currentTokenId = $request->user()->currentAccessToken()?->id;
            $user->tokens()
                ->when($currentTokenId, fn ($q) => $q->where('id', '!=', $currentTokenId))
                ->delete();
        }

        SecurityLog::create([
            'user_id' => $user->id,
            'event_type' => $passwordChanged ? 'password_changed_with_otp' : 'profile_updated_with_otp',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => [
                'method' => 'profile_settings_exact_otp',
                'password_changed' => $passwordChanged,
            ],
            'is_resolved' => true,
            'resolved_at' => now(),
        ]);

        return response()->json([
            'message' => $passwordChanged
                ? 'Settings and new security password updated successfully. Other active sessions were signed out.'
                : 'Account settings updated and authorized via 6-digit email verification.',
            'user' => $this->userPayload($user->fresh()),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Signed out.']);
    }

    /**
     * Request a password reset OTP code.
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $validated = $request->validate(['identifier' => ['required', 'string', 'max:255']]);
        $identifier = trim($validated['identifier']);
        $user = $this->resolveUserByIdentifier($identifier);

        $genericMessage = 'If an account matches our records, a 6-digit verification code has been dispatched to its institutional email.';

        if (! $user) {
            $syntheticHint = str_contains($identifier, '@')
                ? $this->otpService->maskEmail($identifier)
                : 'your registered institutional email';

            return response()->json([
                'status' => 'success',
                'requires_code' => true,
                'challenge' => Str::random(48),
                'email_hint' => $syntheticHint,
                'message' => $genericMessage,
            ]);
        }

        try {
            $otp = $this->otpService->issue(
                $user,
                VerificationCode::PURPOSE_PASSWORD_RESET,
                ['identifier' => $identifier],
                $this->requestMeta($request)
            );
        } catch (\Throwable $e) {
            Log::error('Failed to issue password reset OTP: ' . $e->getMessage());

            return response()->json([
                'status' => 'error',
                'message' => 'Unable to process password recovery right now. Please try again shortly.',
            ], 503);
        }

        SecurityLog::create([
            'user_id' => $user->id,
            'event_type' => 'password_reset_requested',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['email_hint' => $otp['email_hint']],
            'is_resolved' => true,
            'resolved_at' => now(),
        ]);

        return response()->json($this->withOptionalDebugCode([
            'status' => 'success',
            'requires_code' => true,
            'challenge' => $otp['challenge'],
            'email_hint' => $otp['email_hint'],
            'message' => "A 6-digit password reset verification code has been sent to {$otp['email_hint']}.",
        ], $otp['debug_code'] ?? null));
    }

    /**
     * Reset password using the verified 6-digit OTP code.
     */
    public function resetPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'challenge' => ['required', 'string'],
            'code' => ['required', 'string', 'size:6'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ], [
            'code.size' => 'The verification code must be exactly 6 digits.',
        ]);

        $result = $this->otpService->verify(
            trim($validated['challenge']),
            trim($validated['code']),
            VerificationCode::PURPOSE_PASSWORD_RESET
        );

        if (! $result['success']) {
            return $this->otpErrorResponse($result);
        }

        /** @var User $user */
        $user = $result['user'];
        $user->forceFill([
            'password' => Hash::make($validated['password']),
            'remember_token' => Str::random(60),
        ])->save();

        // Revoke all prior active sessions for security
        $user->tokens()->delete();

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'password_reset_completed',
            'description' => 'Password reset completed via email OTP verification',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        SecurityLog::create([
            'user_id' => $user->id,
            'event_type' => 'password_reset_success',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['method' => 'email_otp_verified'],
            'is_resolved' => true,
            'resolved_at' => now(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'Your password has been successfully reset. You may now sign in with your new password.',
        ]);
    }

    private function finalizeLogin(User $user, Request $request, bool $remember = false, ?string $customMessage = null): JsonResponse
    {
        try {
            ActivityLog::create([
                'user_id' => $user->id,
                'action' => 'login',
                'description' => "Signed in from {$this->deviceService->detectDeviceName($request->userAgent())}",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('ActivityLog error during login: ' . $e->getMessage());
        }

        try {
            SecurityLog::create([
                'user_id' => $user->id,
                'event_type' => 'login_success',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'details' => [
                    'remember' => $remember,
                    'device' => $this->deviceService->detectDeviceName($request->userAgent()),
                    'department' => $user->departmentCode(),
                ],
                'is_resolved' => true,
                'resolved_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('SecurityLog error during login: ' . $e->getMessage());
        }

        try {
            $user->update(['last_active_at' => now()]);
        } catch (\Throwable $e) {
            Log::warning('Could not update last_active_at: ' . $e->getMessage());
        }

        $tokenName = $remember ? 'lms-remembered-device' : 'lms-web-session';
        $expiresAt = $remember
            ? now()->addDays((int) config('lms.remember_days', 30))
            : now()->addHours((int) config('lms.session_hours', 12));
        $plainToken = $user->createToken($tokenName, ['*'], $expiresAt)->plainTextToken;

        return response()->json([
            'token' => $plainToken,
            'user' => $this->userPayload($user),
            'remember' => $remember,
            'message' => $customMessage ?? 'Signed in successfully.',
        ]);
    }

    private function resolveUserByIdentifier(string $identifier): ?User
    {
        $normalized = strtolower(trim($identifier));

        return User::query()
            ->whereRaw('LOWER(email) = ?', [$normalized])
            ->orWhere('lrn', trim($identifier))
            ->first();
    }

    private function shouldRequireDeviceOtp(): bool
    {
        $otpSetting = config('lms.device_otp', 'auto');

        if ($otpSetting === 'false' || $otpSetting === false) {
            return false;
        }

        if ($otpSetting === 'true' || $otpSetting === true) {
            return true;
        }

        // 'auto': require OTP when an external mail transport is configured
        return ! in_array(config('mail.default'), ['log', 'array'], true);
    }

    private function requestMeta(Request $request): array
    {
        return [
            'ip_address' => $request->ip(),
            'device_name' => $this->deviceService->detectDeviceName($request->userAgent()),
        ];
    }

    private function otpErrorResponse(array $verifyResult): JsonResponse
    {
        return response()->json([
            'status' => 'error',
            'message' => $verifyResult['message'] ?? 'Invalid or expired authorization code. Please enter the exact 6-digit code.',
            'attempts_remaining' => $verifyResult['attempts_remaining'] ?? 0,
        ], 422);
    }

    private function withOptionalDebugCode(array $payload, ?string $debugCode): array
    {
        if ($debugCode !== null && $debugCode !== '') {
            $payload['debug_code'] = $debugCode;
        }

        return $payload;
    }

    private function userPayload(User $user): array
    {
        $normalizedRole = ($user->role === 'principal') ? 'dean' : ($user->role ?? 'student');

        return [
            'id' => $user->id,
            'name' => $user->name,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'lrn' => $user->lrn,
            'role' => $normalizedRole,
            'grade' => $user->grade,
            'section' => $user->section,
            'department' => $user->departmentCode(),
            'school_year' => $user->school_year ?? config('lms.school_year', '2026-2027'),
            'status' => $user->status,
            'initials' => $user->initials,
        ];
    }
}
