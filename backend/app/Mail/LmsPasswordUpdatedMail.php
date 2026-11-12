<?php

namespace App\Mail;

use App\Models\User;
use App\Services\LmsMailService;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class LmsPasswordUpdatedMail extends Mailable
{
    use Queueable, SerializesModels;

    public readonly string $portalUrl;
    public readonly string $updatedAt;

    public function __construct(
        public readonly User $user,
        public readonly string $changeSource = 'password_reset',
        ?string $portalUrl = null,
        public readonly ?string $ipAddress = null,
        public readonly ?string $deviceName = null
    ) {
        $this->portalUrl = LmsMailService::resolvePortalUrl($portalUrl);
        $this->updatedAt = now()->format('M d, Y h:i A') . ' (PHT)';
    }

    public function subjectLine(): string
    {
        return $this->changeSource === 'profile_password_change'
            ? 'TCC LMS — Account Password & Security Credentials Updated'
            : 'TCC LMS — Password Reset Confirmed & Account Credentials Summary';
    }

    public function envelope(): Envelope
    {
        $fromAddress = config('mail.from.address', 'portal@tcc.edu.ph');
        $fromName = config('mail.from.name', 'Tagoloan Community College LMS');

        return new Envelope(
            from: new Address($fromAddress, $fromName),
            subject: $this->subjectLine(),
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: $this->renderHtml(),
        );
    }

    /**
     * Build a structured API response summary of the dispatched credential confirmation.
     */
    public function toDispatchSummary(array $dispatch): array
    {
        return [
            'sent' => (bool) ($dispatch['sent'] ?? false),
            'simulated' => (bool) ($dispatch['simulated'] ?? false),
            'mail_status' => (string) ($dispatch['status'] ?? 'failed'),
            'mail_warning' => $dispatch['warning'] ?? null,
            'recipient' => $this->user->email,
            'subject' => $this->subjectLine(),
            'portal_url' => $this->portalUrl,
            'updated_at' => $this->updatedAt,
        ];
    }

    public function renderHtml(): string
    {
        $name = htmlspecialchars($this->user->name ?: 'TCC Member');
        $email = htmlspecialchars($this->user->email);
        $role = htmlspecialchars(LmsMailService::roleLabel($this->user->role));
        $department = htmlspecialchars(LmsMailService::departmentLabel($this->user->department));
        $lrnRow = $this->user->lrn
            ? "<tr><td style=\"padding:6px 0;color:#64748b;font-size:13px;\">Student ID / LRN</td><td style=\"padding:6px 0;color:#0f172a;font-weight:700;font-size:13px;font-family:monospace;\">" . htmlspecialchars($this->user->lrn) . "</td></tr>"
            : '';
        $headline = $this->changeSource === 'profile_password_change'
            ? 'Account Password Updated'
            : 'Password Reset Completed';
        $leadCopy = $this->changeSource === 'profile_password_change'
            ? 'Your TCC LMS account password was successfully updated inside Account Settings &amp; Security. For your protection, all other active sessions were signed out.'
            : 'Your TCC LMS password reset has been verified and applied. Below is your active institutional sign-in summary. For your security, your new password itself is never stored or re-sent in plaintext.';
        $portalUrl = htmlspecialchars($this->portalUrl);
        $updatedAt = htmlspecialchars($this->updatedAt);
        $ip = htmlspecialchars($this->ipAddress ?: 'Unavailable');
        $device = htmlspecialchars($this->deviceName ?: 'Web Browser');

        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{$headline} — Tagoloan Community College LMS</title>
</head>
<body style="margin:0;padding:24px;background-color:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 8px 24px rgba(15,23,42,0.06);">
    <tr>
      <td style="background:linear-gradient(135deg,#78080e,#a81018);padding:24px 28px;color:#ffffff;">
        <div style="font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#fde68a;">Tagoloan Community College • Academic Portal</div>
        <h1 style="margin:6px 0 0;font-size:21px;font-weight:800;line-height:1.25;">{$headline}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:26px 28px;">
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hello <strong>{$name}</strong>,</p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#334155;">{$leadCopy}</p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
          <div style="font-size:11px;font-weight:800;letter-spacing:0.8px;text-transform:uppercase;color:#78080e;margin-bottom:10px;">Active Institutional Sign-In Summary</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr><td style="padding:6px 0;color:#64748b;font-size:13px;width:42%;">Sign-In Email</td><td style="padding:6px 0;color:#0f172a;font-weight:700;font-size:13px;">{$email}</td></tr>
            {$lrnRow}
            <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Assigned Role</td><td style="padding:6px 0;color:#0f172a;font-weight:600;font-size:13px;">{$role}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">College / Department</td><td style="padding:6px 0;color:#0f172a;font-weight:600;font-size:13px;">{$department}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Password Status</td><td style="padding:6px 0;color:#15803d;font-weight:700;font-size:13px;">Updated &amp; Active (Use your new password)</td></tr>
          </table>
        </div>

        <div style="text-align:center;margin:22px 0;">
          <a href="{$portalUrl}" style="display:inline-block;background:#78080e;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;">Open TCC LMS Sign-In Portal</a>
        </div>

        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;font-size:12px;line-height:1.55;color:#78350f;">
          <strong>Security Audit Notice:</strong> Completed at <strong>{$updatedAt}</strong> via <strong>{$device}</strong> (IP: <code>{$ip}</code>). If you did not authorize this change, contact your College Dean or IT Administrator immediately.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;
    }
}
