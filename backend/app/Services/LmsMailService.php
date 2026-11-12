<?php

namespace App\Services;

use Illuminate\Mail\Mailable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Testing\Fakes\MailFake;

class LmsMailService
{
    private const LOCAL_RELAY_HOSTS = ['127.0.0.1', 'localhost', 'mailpit', 'mailhog'];

    /**
     * Resolve the canonical frontend login URL for email CTAs.
     * Only explicit CORS/frontend allowlisted origins may override config('app.frontend_url').
     */
    public static function resolvePortalUrl(?string $origin = null): string
    {
        $configuredBase = self::normalizeOrigin((string) config('app.frontend_url', config('app.url', 'https://learning-ms.online')))
            ?? 'https://learning-ms.online';

        $candidateOrigin = is_string($origin) ? self::normalizeOrigin($origin) : null;
        $baseUrl = ($candidateOrigin !== null && in_array($candidateOrigin, self::allowedPortalOrigins($configuredBase), true))
            ? $candidateOrigin
            : $configuredBase;

        return str_ends_with($baseUrl, '/login') ? $baseUrl : $baseUrl . '/login';
    }

    /**
     * @return list<string>
     */
    private static function allowedPortalOrigins(string $configuredBase): array
    {
        $rawList = array_merge(
            [$configuredBase, (string) config('app.url', '')],
            (array) config('cors.allowed_origins', [])
        );

        $normalized = [];
        foreach ($rawList as $entry) {
            $origin = self::normalizeOrigin((string) $entry);
            if ($origin !== null) {
                $normalized[] = $origin;
            }
        }

        return array_values(array_unique($normalized));
    }

    private static function normalizeOrigin(string $url): ?string
    {
        $trimmed = trim($url);
        if ($trimmed === '') {
            return null;
        }

        $parts = parse_url($trimmed);
        if (! is_array($parts)) {
            return null;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));
        if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
            return null;
        }

        $port = isset($parts['port']) ? ':' . (int) $parts['port'] : '';

        return "{$scheme}://{$host}{$port}";
    }

    /**
     * Format the institutional department label from config/lms.php.
     */
    public static function departmentLabel(?string $departmentCode): string
    {
        $code = strtoupper(trim((string) ($departmentCode ?: config('lms.default_department', 'CIT'))));
        $departments = config('lms.departments', []);
        $name = is_array($departments) ? ($departments[$code] ?? null) : null;

        return $name ? "{$code} — {$name}" : "{$code} Department";
    }

    /**
     * Format the institutional role display title.
     */
    public static function roleLabel(?string $role): string
    {
        return match (strtolower(trim((string) $role))) {
            'student' => 'Student Learner',
            'teacher' => 'Faculty Teacher',
            'secretary' => 'College Secretary',
            'dean', 'principal' => 'College Dean',
            'developer' => 'Lead Developer',
            default => ucfirst(strtolower(trim((string) $role)) ?: 'Member'),
        };
    }

    /**
     * Ensure institutional SMTP transport is active, falling back to database credentials
     * if the server environment has not configured or populated live MAIL_* credentials.
     */
    public static function bootstrapInstitutionalTransport(): void
    {
        if (app()->runningUnitTests() || Mail::getFacadeRoot() instanceof MailFake) {
            return;
        }

        $currentDefault = strtolower(trim((string) config('mail.default', 'log')));
        $smtpHost = trim((string) config('mail.mailers.smtp.host', ''));
        $smtpUser = trim((string) config('mail.mailers.smtp.username', ''));
        $smtpPass = (string) config('mail.mailers.smtp.password', '');

        // If .env or runtime config already provided a live working SMTP configuration, respect it.
        if ($currentDefault === 'smtp' && $smtpHost !== '' && $smtpUser !== '' && $smtpPass !== '') {
            return;
        }

        // Fall back to institutional credentials stored in system_settings
        try {
            if (! \Illuminate\Support\Facades\Schema::hasTable('system_settings')) {
                return;
            }

            $dbSmtp = \App\Models\SystemSetting::get('institutional_smtp');
            if (is_array($dbSmtp) && ! empty($dbSmtp['host']) && ! empty($dbSmtp['username']) && ! empty($dbSmtp['password'])) {
                $host = trim((string) $dbSmtp['host']);
                $port = (int) ($dbSmtp['port'] ?? 587);
                $encryption = strtolower(trim((string) ($dbSmtp['encryption'] ?? 'tls')));
                $scheme = match ($encryption) {
                    'ssl', 'smtps' => 'smtps',
                    default => ($port === 465 ? 'smtps' : 'smtp'),
                };

                config([
                    'mail.default' => 'smtp',
                    'mail.mailers.smtp.transport' => 'smtp',
                    'mail.mailers.smtp.scheme' => $scheme,
                    'mail.mailers.smtp.host' => $host,
                    'mail.mailers.smtp.port' => $port,
                    'mail.mailers.smtp.username' => trim((string) $dbSmtp['username']),
                    'mail.mailers.smtp.password' => (string) $dbSmtp['password'],
                    'mail.mailers.smtp.encryption' => $encryption,
                    'mail.mailers.smtp.timeout' => (int) ($dbSmtp['timeout'] ?? 15),
                    'mail.from.address' => trim((string) ($dbSmtp['from_address'] ?? $dbSmtp['username'])),
                    'mail.from.name' => trim((string) ($dbSmtp['from_name'] ?? 'Tagoloan Community College LMS')),
                ]);

                Mail::purge('smtp');
            }
        } catch (\Throwable) {
            // Ignore if DB not ready or during early bootstrap
        }
    }

    /**
     * Inspect active mail transport readiness before attempting delivery.
     *
     * @return array{ready: bool, simulated: bool, mailer: string, reason: ?string}
     */
    public static function inspectTransport(): array
    {
        self::bootstrapInstitutionalTransport();

        if (Mail::getFacadeRoot() instanceof MailFake) {
            return [
                'ready' => true,
                'simulated' => false,
                'mailer' => 'fake',
                'reason' => null,
            ];
        }

        $mailer = strtolower(trim((string) config('mail.default', 'log')));
        $effectiveMailer = $mailer === 'failover'
            ? strtolower(trim((string) config('mail.mailers.failover.mailers.0', 'smtp')))
            : $mailer;

        if (in_array($effectiveMailer, ['log', 'array'], true)) {
            return [
                'ready' => false,
                'simulated' => true,
                'mailer' => $mailer,
                'reason' => "Mail driver is set to '{$mailer}'; emails are logged locally in storage/logs/laravel.log instead of an external inbox.",
            ];
        }

        if ($effectiveMailer === 'smtp') {
            $host = trim((string) config('mail.mailers.smtp.host', ''));
            $username = trim((string) config('mail.mailers.smtp.username', ''));
            $password = (string) config('mail.mailers.smtp.password', '');
            $isLocalRelay = in_array(strtolower($host), self::LOCAL_RELAY_HOSTS, true);

            if ($host === '') {
                return [
                    'ready' => false,
                    'simulated' => false,
                    'mailer' => $mailer,
                    'reason' => 'Live SMTP delivery is not configured (MAIL_HOST is empty).',
                ];
            }

            if (! $isLocalRelay && ($username === '' || $password === '')) {
                return [
                    'ready' => false,
                    'simulated' => false,
                    'mailer' => $mailer,
                    'reason' => "SMTP host '{$host}' is missing MAIL_USERNAME or MAIL_PASSWORD credentials.",
                ];
            }
        }

        return [
            'ready' => true,
            'simulated' => false,
            'mailer' => $mailer,
            'reason' => null,
        ];
    }

    /**
     * Dispatch a Mailable and return an honest delivery status payload.
     *
     * @return array{sent: bool, simulated: bool, status: string, mailer: string, warning: ?string}
     */
    public static function dispatch(string $recipient, Mailable $mailable, string $context = 'LMS email'): array
    {
        $transport = self::inspectTransport();

        if (! $transport['ready'] && ! $transport['simulated']) {
            Log::warning("{$context} skipped for {$recipient}: {$transport['reason']}");

            return [
                'sent' => false,
                'simulated' => false,
                'status' => 'failed',
                'mailer' => $transport['mailer'],
                'warning' => $transport['reason'],
            ];
        }

        try {
            Mail::to($recipient)->send($mailable);

            if ($transport['simulated']) {
                Log::info("{$context} recorded in '{$transport['mailer']}' mail log for {$recipient}.");

                return [
                    'sent' => false,
                    'simulated' => true,
                    'status' => 'simulated',
                    'mailer' => $transport['mailer'],
                    'warning' => $transport['reason'],
                ];
            }

            return [
                'sent' => true,
                'simulated' => false,
                'status' => 'sent',
                'mailer' => $transport['mailer'],
                'warning' => null,
            ];
        } catch (\Throwable $e) {
            Log::warning("Failed to deliver {$context} to {$recipient}: " . $e->getMessage());

            return [
                'sent' => false,
                'simulated' => false,
                'status' => 'failed',
                'mailer' => $transport['mailer'],
                'warning' => 'Live SMTP delivery failed. Verify MAIL_HOST, MAIL_PORT, MAIL_USERNAME, and MAIL_PASSWORD in backend/.env and inspect storage/logs/laravel.log.',
            ];
        }
    }
}
