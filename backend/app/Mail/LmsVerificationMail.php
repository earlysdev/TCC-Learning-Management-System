<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class LmsVerificationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly string $code,
        public readonly string $purpose,
        public readonly array $meta = []
    ) {}

    public function envelope(): Envelope
    {
        $subject = match ($this->purpose) {
            'login_device' => 'TCC LMS - Unrecognized Device Security Code',
            'password_reset' => 'TCC LMS - Password Reset Verification Code',
            'password_change' => 'TCC LMS - Profile Password Change Authorization Code',
            default => 'TCC LMS - Security Verification Code',
        };

        $fromAddress = config('mail.from.address', 'portal@tcc.edu.ph');
        $fromName = config('mail.from.name', 'Tagoloan Community College LMS');

        return new Envelope(
            from: new Address($fromAddress, $fromName),
            subject: $subject,
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: $this->renderHtml(),
        );
    }

    private function renderHtml(): string
    {
        $userName = htmlspecialchars($this->user->name ?: 'Learner / Faculty');
        $code = htmlspecialchars($this->code);
        $purposeTitle = match ($this->purpose) {
            'login_device' => 'Unrecognized Device Login Verification',
            'password_reset' => 'Account Password Reset Request',
            'password_change' => 'Profile Password Change Authorization',
            default => 'Institutional Security Verification',
        };

        $purposeDesc = match ($this->purpose) {
            'login_device' => 'We detected a sign-in attempt from an unrecognized device or browser. To verify your identity and protect your academic records, enter the 6-digit one-time code below.',
            'password_reset' => 'A password reset request was initiated for your Tagoloan Community College LMS account. Enter the verification code below to set a new password.',
            'password_change' => 'A request to update your account password was submitted from your settings portal. Enter this code to authorize the password update.',
            default => 'Use the one-time verification code below to complete your requested action.',
        };

        $deviceName = htmlspecialchars($this->meta['device_name'] ?? 'Web Browser');
        $ipAddress = htmlspecialchars($this->meta['ip_address'] ?? 'Unknown IP');
        $timeStr = now()->format('M d, Y h:i A');

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{$purposeTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #120204; color: #f8fafc; margin: 0; padding: 24px; }
    .card { max-width: 540px; margin: 0 auto; background: #26060b; border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
    .header { background: linear-gradient(135deg, #7f121e 0%, #3e070d 100%); padding: 22px 28px; border-bottom: 2px solid #f59e0b; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; color: #ffffff; letter-spacing: 0.5px; }
    .header p { margin: 4px 0 0 0; font-size: 12px; color: #fbbf24; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
    .body { padding: 28px; }
    .greeting { font-size: 16px; font-weight: 600; color: #ffffff; margin-top: 0; }
    .desc { font-size: 14px; line-height: 1.6; color: #cbd5e1; }
    .code-box { background: rgba(0, 0, 0, 0.35); border: 1px dashed #f59e0b; border-radius: 8px; text-align: center; padding: 18px; margin: 24px 0; }
    .code { font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #fbbf24; }
    .code-hint { font-size: 12px; color: #94a3b8; margin-top: 8px; }
    .meta-box { background: rgba(255, 255, 255, 0.05); border-radius: 6px; padding: 12px 16px; font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 18px 0; }
    .meta-box strong { color: #e2e8f0; }
    .footer { padding: 18px 28px; background: #1a0407; border-top: 1px solid rgba(255, 255, 255, 0.08); font-size: 11px; color: #94a3b8; text-align: center; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Tagoloan Community College</h1>
      <p>LMS Security & Identity Verification · S.Y. 2026-2027</p>
    </div>
    <div class="body">
      <h2 class="greeting">Hello, {$userName}</h2>
      <p class="desc">{$purposeDesc}</p>
      <div class="code-box">
        <div class="code">{$code}</div>
        <div class="code-hint">Valid for 10 minutes · Do not share this code with anyone</div>
      </div>
      <div class="meta-box">
        <div><strong>Action:</strong> {$purposeTitle}</div>
        <div><strong>Device / Browser:</strong> {$deviceName}</div>
        <div><strong>IP Address:</strong> {$ipAddress}</div>
        <div><strong>Timestamp:</strong> {$timeStr} (PHT)</div>
      </div>
      <p class="desc" style="font-size: 12px; color: #94a3b8;">
        If you did not initiate this request, your account password may be compromised. Please sign in and update your password or immediately notify the College Secretary or Dean.
      </p>
    </div>
    <div class="footer">
      Tagoloan Community College · Baluarte, Tagoloan, Misamis Oriental<br>
      Vincit Omnia Veritas · Official Academic Portal
    </div>
  </div>
</body>
</html>
HTML;
    }
}
