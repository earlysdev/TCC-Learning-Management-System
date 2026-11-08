<?php

namespace App\Services;

use App\Models\SecurityLog;
use App\Models\TrustedDevice;
use App\Models\User;
use Illuminate\Http\Request;

class LmsDeviceService
{
    /**
     * Compute a deterministic device hash based on the client device token and user agent.
     */
    public function computeDeviceHash(Request $request): string
    {
        $clientDeviceId = trim((string) (
            $request->header('X-Device-Id')
            ?? $request->input('device_id')
            ?? $request->cookie('tcc_device_id')
            ?? ''
        ));

        $ua = (string) $request->userAgent();

        if (! empty($clientDeviceId)) {
            return hash('sha256', $clientDeviceId . '|' . $ua);
        }

        // Fallback: derive hash from user-agent and IP block
        $ip = (string) $request->ip();
        $ipSubnet = preg_replace('/(\.\d+)$/', '.0', $ip);

        return hash('sha256', $ua . '|' . $ipSubnet);
    }

    /**
     * Check if this device is already recognized and trusted for this user.
     */
    public function isDeviceRecognized(User $user, string $deviceHash): bool
    {
        return TrustedDevice::where('user_id', $user->id)
            ->where('device_hash', $deviceHash)
            ->exists();
    }

    /**
     * Record or refresh a trusted device for a user.
     */
    public function trustDevice(
        User $user,
        string $deviceHash,
        ?string $deviceName = null,
        ?string $ip = null,
        ?string $userAgent = null
    ): TrustedDevice {
        $resolvedName = $deviceName ?: $this->detectDeviceName($userAgent);

        $device = TrustedDevice::updateOrCreate(
            ['user_id' => $user->id, 'device_hash' => $deviceHash],
            [
                'device_name' => $resolvedName,
                'ip_address' => $ip,
                'user_agent' => $userAgent,
                'last_used_at' => now(),
            ]
        );

        return $device;
    }

    /**
     * Determine a human-readable device name from User-Agent.
     */
    public function detectDeviceName(?string $ua): string
    {
        if (empty($ua)) {
            return 'Institutional Web Terminal';
        }

        $os = 'Unknown OS';
        if (preg_match('/Windows NT 10\.0/i', $ua)) $os = 'Windows 10/11';
        elseif (preg_match('/Windows/i', $ua)) $os = 'Windows PC';
        elseif (preg_match('/Macintosh|Mac OS X/i', $ua)) $os = 'macOS';
        elseif (preg_match('/Android/i', $ua)) $os = 'Android Device';
        elseif (preg_match('/iPhone|iPad/i', $ua)) $os = 'iOS Device';
        elseif (preg_match('/Linux/i', $ua)) $os = 'Linux Desktop';

        $browser = 'Web Browser';
        if (preg_match('/Edg\/([0-9]+)/i', $ua, $m)) $browser = "Edge {$m[1]}";
        elseif (preg_match('/Chrome\/([0-9]+)/i', $ua, $m)) $browser = "Chrome {$m[1]}";
        elseif (preg_match('/Firefox\/([0-9]+)/i', $ua, $m)) $browser = "Firefox {$m[1]}";
        elseif (preg_match('/Safari\/([0-9]+)/i', $ua)) $browser = 'Safari';

        return "{$browser} ({$os})";
    }

    /**
     * Log an unrecognized device event into Dean security surveillance.
     */
    public function logUnrecognizedDevice(User $user, Request $request, string $deviceHash): SecurityLog
    {
        $deviceName = $this->detectDeviceName($request->userAgent());

        return SecurityLog::create([
            'user_id' => $user->id,
            'event_type' => 'unrecognized_device_login_attempt',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => [
                'device_name' => $deviceName,
                'device_hash' => substr($deviceHash, 0, 16) . '...',
                'department' => $user->departmentCode(),
                'role' => $user->role,
                'requires_otp' => true,
            ],
            'is_resolved' => false,
        ]);
    }

    /**
     * Log a successful OTP verification and device trust resolution.
     */
    public function logOtpVerificationSuccess(User $user, Request $request, string $deviceHash): SecurityLog
    {
        $deviceName = $this->detectDeviceName($request->userAgent());

        return SecurityLog::create([
            'user_id' => $user->id,
            'event_type' => 'device_otp_verified_and_trusted',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => [
                'device_name' => $deviceName,
                'device_hash' => substr($deviceHash, 0, 16) . '...',
                'department' => $user->departmentCode(),
                'role' => $user->role,
                'status' => 'device_registered_as_trusted',
            ],
            'is_resolved' => true,
            'resolved_at' => now(),
        ]);
    }
}
