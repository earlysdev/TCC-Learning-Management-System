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

class LmsAccountCreatedMail extends Mailable
{
    use Queueable, SerializesModels;

    public readonly string $portalUrl;
    public readonly string $issuedAt;
    public readonly string $issuerName;
    public readonly string $issuerRoleLabel;

    public function __construct(
        public readonly User $user,
        public readonly string $plainPassword,
        ?User $issuer = null,
        ?string $portalUrl = null
    ) {
        $this->portalUrl = LmsMailService::resolvePortalUrl($portalUrl);
        $this->issuedAt = now()->format('M d, Y h:i A');
        $this->issuerName = $issuer?->name ?: 'Office of the College Secretary';
        $rawIssuerRole = strtolower((string) ($issuer?->role ?? 'secretary'));
        $this->issuerRoleLabel = match ($rawIssuerRole) {
            'dean', 'principal' => 'College Dean',
            'secretary' => 'College Secretary',
            default => 'Institutional Administrator',
        };
    }

    public function subjectLine(): string
    {
        $roleTitle = $this->roleLabel();
        $schoolYear = $this->user->school_year ?: config('lms.school_year', '2026-2027');

        return "TCC LMS — Official {$roleTitle} Account Credentials (S.Y. {$schoolYear})";
    }

    public function roleLabel(): string
    {
        return LmsMailService::roleLabel($this->user->role);
    }

    public function departmentLabel(): string
    {
        return LmsMailService::departmentLabel($this->user->department);
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

    public function toReceiptPayload(
        bool $emailSent,
        ?string $mailError = null,
        ?string $mailStatus = null,
        bool $simulated = false
    ): array {
        $schoolYear = (string) ($this->user->school_year ?: config('lms.school_year', '2026-2027'));
        $resolvedStatus = $mailStatus ?: ($emailSent ? 'sent' : ($simulated ? 'simulated' : 'failed'));

        return [
            'sent' => $emailSent,
            'simulated' => $simulated,
            'mail_status' => $resolvedStatus,
            'recipient' => $this->user->email,
            'subject' => $this->subjectLine(),
            'account_name' => $this->user->name,
            'role' => $this->user->role,
            'role_label' => $this->roleLabel(),
            'department' => $this->user->department ?: config('lms.default_department', 'CIT'),
            'department_label' => $this->departmentLabel(),
            'school_year' => $schoolYear,
            'lrn' => $this->user->lrn,
            'grade' => $this->user->grade,
            'section' => $this->user->section,
            'plain_password' => $this->plainPassword,
            'portal_url' => $this->portalUrl,
            'issued_by' => $this->issuerName,
            'issued_by_role' => $this->issuerRoleLabel,
            'issued_at' => $this->issuedAt,
            'mail_warning' => $mailError,
        ];
    }

    public function renderHtml(): string
    {
        $userName = htmlspecialchars($this->user->name ?: 'TCC Member');
        $userEmail = htmlspecialchars($this->user->email);
        $roleLabel = htmlspecialchars($this->roleLabel());
        $departmentLabel = htmlspecialchars($this->departmentLabel());
        $schoolYear = htmlspecialchars((string) ($this->user->school_year ?: config('lms.school_year', '2026-2027')));
        $plainPassword = htmlspecialchars($this->plainPassword);
        $portalUrl = htmlspecialchars($this->portalUrl);
        $issuerName = htmlspecialchars($this->issuerName);
        $issuerRole = htmlspecialchars($this->issuerRoleLabel);
        $issuedAt = htmlspecialchars($this->issuedAt);
        $isStudent = strtolower((string) $this->user->role) === 'student';
        $studentId = htmlspecialchars((string) ($this->user->lrn ?: 'N/A'));
        $yearLevel = htmlspecialchars((string) ($this->user->grade ?: '1st Year'));
        $sectionName = htmlspecialchars((string) ($this->user->section ?: 'Block - 1A'));

        $studentProfileRows = $isStudent
            ? <<<HTML
              <tr>
                <td class="meta-label">Student ID Number</td>
                <td class="meta-value"><span class="mono-pill">{$studentId}</span></td>
              </tr>
              <tr>
                <td class="meta-label">Year Level &amp; Section</td>
                <td class="meta-value"><strong style="color: #6ee7b7;">{$yearLevel} &bull; {$sectionName}</strong></td>
              </tr>
HTML
            : '';

        $studentCredentialRow = $isStudent
            ? <<<HTML
            <div class="cred-row">
              <div class="cred-label">Student ID (Alternate Sign-In)</div>
              <div class="cred-val mono">{$studentId}</div>
            </div>
HTML
            : '';

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Official Account Credentials - Tagoloan Community College LMS</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #120204;
      color: #f8fafc;
      margin: 0;
      padding: 24px 12px;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      max-width: 600px;
      margin: 0 auto;
      background-color: #26060b;
      border: 1px solid rgba(245, 158, 11, 0.42);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.55);
    }
    .header {
      background: linear-gradient(135deg, #7f121e 0%, #3e070d 100%);
      padding: 26px 28px;
      border-bottom: 2px solid #f59e0b;
      text-align: center;
    }
    .header-badge {
      display: inline-block;
      background: rgba(245, 158, 11, 0.16);
      border: 1px solid rgba(245, 158, 11, 0.45);
      color: #fbbf24;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      padding: 4px 12px;
      border-radius: 999px;
      margin-bottom: 10px;
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
      color: #ffffff;
      letter-spacing: 0.4px;
      font-weight: 800;
    }
    .header p {
      margin: 6px 0 0 0;
      font-size: 12px;
      color: #fde68a;
      text-transform: uppercase;
      letter-spacing: 0.9px;
      font-weight: 600;
    }
    .body {
      padding: 28px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 8px 0;
    }
    .desc {
      font-size: 14px;
      line-height: 1.6;
      color: #cbd5e1;
      margin: 0 0 22px 0;
    }
    .section-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #fbbf24;
      margin: 0 0 10px 0;
    }
    .profile-box {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 22px;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
    }
    .meta-table tr {
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .meta-table tr:last-child {
      border-bottom: none;
    }
    .meta-label {
      padding: 9px 6px 9px 0;
      font-size: 12px;
      color: #94a3b8;
      font-weight: 600;
      width: 42%;
      vertical-align: middle;
    }
    .meta-value {
      padding: 9px 0;
      font-size: 13px;
      color: #f8fafc;
      font-weight: 600;
      text-align: right;
      vertical-align: middle;
    }
    .role-pill {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      background: rgba(245, 158, 11, 0.18);
      border: 1px solid rgba(245, 158, 11, 0.45);
      color: #fbbf24;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .mono-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      font-family: 'Courier New', Courier, monospace;
      color: #ffffff;
      font-weight: 700;
      font-size: 13px;
    }
    .credentials-card {
      background: linear-gradient(145deg, rgba(127, 18, 30, 0.38) 0%, rgba(18, 2, 4, 0.75) 100%);
      border: 1px solid rgba(245, 158, 11, 0.45);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 22px;
    }
    .cred-row {
      padding: 10px 12px;
      background: rgba(0, 0, 0, 0.32);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      margin-bottom: 10px;
    }
    .cred-row:last-child {
      margin-bottom: 0;
    }
    .cred-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      color: #94a3b8;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .cred-val {
      font-size: 15px;
      font-weight: 700;
      color: #ffffff;
      word-break: break-all;
    }
    .cred-val.mono {
      font-family: 'Courier New', Courier, monospace;
      letter-spacing: 0.5px;
    }
    .password-highlight {
      background: rgba(245, 158, 11, 0.12);
      border: 1px dashed #f59e0b;
      border-radius: 8px;
      padding: 14px 16px;
      text-align: center;
      margin-top: 12px;
    }
    .password-value {
      font-family: 'Courier New', Courier, monospace;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #fbbf24;
      margin: 4px 0;
    }
    .cta-wrap {
      text-align: center;
      margin: 22px 0;
    }
    .cta-btn {
      display: inline-block;
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #120204 !important;
      text-decoration: none;
      font-weight: 800;
      font-size: 14px;
      padding: 12px 28px;
      border-radius: 8px;
      letter-spacing: 0.3px;
    }
    .security-box {
      background: rgba(16, 185, 129, 0.07);
      border: 1px solid rgba(16, 185, 129, 0.28);
      border-radius: 10px;
      padding: 14px 16px;
      font-size: 12px;
      color: #cbd5e1;
      line-height: 1.55;
    }
    .security-box strong {
      color: #6ee7b7;
    }
    .footer {
      padding: 18px 28px;
      background: #1a0407;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 11px;
      color: #94a3b8;
      text-align: center;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="header-badge">Official Institutional Dispatch</div>
      <h1>Tagoloan Community College</h1>
      <p>Learning Management System &bull; Academic Year {$schoolYear}</p>
    </div>

    <div class="body">
      <h2 class="greeting">Welcome, {$userName}!</h2>
      <p class="desc">
        Your official <strong>Tagoloan Community College LMS</strong> account has been registered and activated by
        <strong>{$issuerName}</strong> ({$issuerRole}). Below are your organized account details and sign-in credentials.
      </p>

      <div class="section-title">1. Official Account &amp; Academic Profile</div>
      <div class="profile-box">
        <table class="meta-table">
          <tr>
            <td class="meta-label">Account Holder</td>
            <td class="meta-value">{$userName}</td>
          </tr>
          <tr>
            <td class="meta-label">Institutional Role</td>
            <td class="meta-value"><span class="role-pill">{$roleLabel}</span></td>
          </tr>
          <tr>
            <td class="meta-label">College Department</td>
            <td class="meta-value">{$departmentLabel}</td>
          </tr>
          {$studentProfileRows}
          <tr>
            <td class="meta-label">Academic Year</td>
            <td class="meta-value">S.Y. {$schoolYear}</td>
          </tr>
          <tr>
            <td class="meta-label">Issued By / Date</td>
            <td class="meta-value">{$issuerName} &bull; {$issuedAt}</td>
          </tr>
        </table>
      </div>

      <div class="section-title">2. Official Portal Sign-In Credentials</div>
      <div class="credentials-card">
        <div class="cred-row">
          <div class="cred-label">Official Institutional Email</div>
          <div class="cred-val mono">{$userEmail}</div>
        </div>
        {$studentCredentialRow}
        <div class="password-highlight">
          <div class="cred-label" style="color: #fde68a;">Initial Account Password</div>
          <div class="password-value">{$plainPassword}</div>
          <div style="font-size: 11px; color: #cbd5e1;">Keep this password confidential and update it after your first login.</div>
        </div>
      </div>

      <div class="cta-wrap">
        <a href="{$portalUrl}" class="cta-btn">Sign In to TCC LMS Portal &rarr;</a>
      </div>

      <div class="security-box">
        <strong>Security &amp; First Sign-In Guidelines:</strong><br>
        &bull; <strong>Device Verification (OTP):</strong> Signing in from a new browser or device requires a 6-digit verification code sent to <strong>{$userEmail}</strong>.<br>
        &bull; <strong>Password Management:</strong> You can change your password anytime under <strong>Settings &rarr; Account Security</strong>. Your official school email address is permanent and cannot be modified.
      </div>
    </div>

    <div class="footer">
      Tagoloan Community College &bull; Baluarte, Tagoloan, Misamis Oriental<br>
      Vincit Omnia Veritas &bull; Official Academic Portal &bull; S.Y. {$schoolYear}
    </div>
  </div>
</body>
</html>
HTML;
    }
}
