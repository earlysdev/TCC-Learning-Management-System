import React, { useState } from 'react';
import {
  Mail,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Eye,
  EyeOff,
  Printer,
  ShieldCheck,
  ExternalLink,
  UserCheck,
  GraduationCap,
  Building2,
  Calendar,
  KeyRound,
  X,
} from 'lucide-react';
import Button from './Button';
import Badge from './Badge';
import { useToastContext } from '../../contexts/ToastContext';

export interface AccountEmailDispatchReceipt {
  sent: boolean;
  simulated?: boolean;
  mail_status?: 'sent' | 'simulated' | 'failed';
  mail_warning?: string | null;
  recipient: string;
  subject: string;
  account_name: string;
  role: string;
  role_label: string;
  department: string;
  department_label: string;
  school_year: string;
  lrn?: string | null;
  grade?: string | null;
  section?: string | null;
  plain_password: string;
  portal_url: string;
  issued_by: string;
  issued_by_role: string;
  issued_at: string;
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

function sanitizeHttpUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : `${window.location.origin}/login`;
  } catch {
    return `${window.location.origin}/login`;
  }
}

export function createFallbackAccountReceipt(params: {
  recipient: string;
  accountName: string;
  role: string;
  roleLabel: string;
  department: string;
  departmentLabel: string;
  schoolYear: string;
  plainPassword: string;
  issuedBy: string;
  issuedByRole: string;
  lrn?: string | null;
  grade?: string | null;
  section?: string | null;
}): AccountEmailDispatchReceipt {
  return {
    sent: false,
    mail_status: 'failed',
    mail_warning: 'Server response did not confirm email delivery; share or verify SMTP status manually.',
    recipient: params.recipient,
    subject: `TCC LMS — Official ${params.roleLabel} Account Credentials (S.Y. ${params.schoolYear})`,
    account_name: params.accountName,
    role: params.role,
    role_label: params.roleLabel,
    department: params.department,
    department_label: params.departmentLabel,
    school_year: params.schoolYear,
    lrn: params.lrn ?? null,
    grade: params.grade ?? null,
    section: params.section ?? null,
    plain_password: params.plainPassword,
    portal_url: `${window.location.origin}/login`,
    issued_by: params.issuedBy,
    issued_by_role: params.issuedByRole,
    issued_at: new Date().toLocaleString(),
  };
}

interface AccountCredentialsEmailReceiptProps {
  receipt: AccountEmailDispatchReceipt;
  onDismiss: () => void;
  onViewDirectory?: () => void;
  directoryButtonLabel?: string;
}

export const AccountCredentialsEmailReceipt: React.FC<AccountCredentialsEmailReceiptProps> = ({
  receipt,
  onDismiss,
  onViewDirectory,
  directoryButtonLabel = 'View in Directory',
}) => {
  const { showToast } = useToastContext();
  const [showPassword, setShowPassword] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const isStudent = receipt.role.toLowerCase() === 'student';

  const copyValue = async (value: string, label: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      showToast(`${label} copied to clipboard.`, 'success');
      setTimeout(() => {
        setCopiedField((prev) => (prev === key ? null : prev));
      }, 2000);
    } catch {
      showToast(`Could not copy ${label.toLowerCase()} automatically.`, 'warning');
    }
  };

  const buildFormattedEmailText = () => {
    const lines = [
      '============================================================',
      'TAGOLOAN COMMUNITY COLLEGE — OFFICIAL LMS ACCOUNT CREDENTIALS',
      `Academic Year: S.Y. ${receipt.school_year}`,
      '============================================================',
      `Email Subject : ${receipt.subject}`,
      `Dispatched To : ${receipt.recipient}`,
      `Issued By     : ${receipt.issued_by} (${receipt.issued_by_role})`,
      `Date & Time   : ${receipt.issued_at}`,
      '------------------------------------------------------------',
      '1. OFFICIAL ACCOUNT & ACADEMIC PROFILE',
      `   Account Holder     : ${receipt.account_name}`,
      `   Institutional Role : ${receipt.role_label}`,
      `   College Department : ${receipt.department_label}`,
      ...(isStudent
        ? [
            `   Student ID Number  : ${receipt.lrn || 'N/A'}`,
            `   Year & Section     : ${receipt.grade || '1st Year'} • ${receipt.section || 'Block - 1A'}`,
          ]
        : []),
      `   Academic Year      : S.Y. ${receipt.school_year}`,
      '------------------------------------------------------------',
      '2. OFFICIAL PORTAL SIGN-IN CREDENTIALS',
      `   Portal Login URL   : ${receipt.portal_url}`,
      `   Official Email     : ${receipt.recipient}`,
      ...(isStudent ? [`   Student ID Login   : ${receipt.lrn || 'N/A'}`] : []),
      `   Initial Password   : ${receipt.plain_password}`,
      '------------------------------------------------------------',
      '3. SECURITY & FIRST SIGN-IN GUIDELINES',
      '   • First sign-in on an unrecognized browser/device requires',
      `     a 6-digit OTP verification code sent to ${receipt.recipient}.`,
      '   • Update your initial password under Settings -> Account Security.',
      '============================================================',
    ];
    return lines.join('\n');
  };

  const handlePrintSlip = () => {
    const printWindow = window.open('', '_blank', 'width=760,height=840');
    if (!printWindow) {
      showToast('Pop-up blocked. Please allow pop-ups to print the credential slip.', 'warning');
      return;
    }

    const esc = escapeHtml;
    const safePortalUrl = sanitizeHttpUrl(receipt.portal_url);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(receipt.subject)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #120204;
      color: #f8fafc;
      margin: 0;
      padding: 28px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .card {
      max-width: 620px;
      margin: 0 auto;
      background: #26060b;
      border: 1px solid rgba(245, 158, 11, 0.48);
      border-radius: 14px;
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #7f121e 0%, #3e070d 100%);
      padding: 24px 28px;
      border-bottom: 2px solid #f59e0b;
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      background: rgba(245, 158, 11, 0.18);
      border: 1px solid rgba(245, 158, 11, 0.5);
      color: #fbbf24;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .header h1 { margin: 0; font-size: 22px; color: #fff; }
    .header p { margin: 6px 0 0; font-size: 12px; color: #fde68a; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; }
    .body { padding: 26px 28px; }
    .sec-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #fbbf24; margin: 0 0 10px; }
    .box {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 20px;
    }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 0; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    tr:last-child td { border-bottom: none; }
    td.lbl { color: #94a3b8; font-weight: 600; width: 42%; }
    td.val { color: #fff; font-weight: 700; text-align: right; }
    .cred-box {
      background: rgba(127, 18, 30, 0.32);
      border: 1px solid rgba(245, 158, 11, 0.45);
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 20px;
    }
    .pw-box {
      background: rgba(245, 158, 11, 0.12);
      border: 1px dashed #f59e0b;
      border-radius: 8px;
      padding: 12px;
      text-align: center;
      margin-top: 12px;
    }
    .pw-val {
      font-family: 'Courier New', monospace;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #fbbf24;
    }
    .footer {
      padding: 14px 24px;
      background: #1a0407;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 11px;
      color: #94a3b8;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="badge">Official LMS Account Dispatch</div>
      <h1>Tagoloan Community College</h1>
      <p>Learning Management System &bull; S.Y. ${esc(receipt.school_year)}</p>
    </div>
    <div class="body">
      <div class="sec-title">1. Official Account &amp; Academic Placement</div>
      <div class="box">
        <table>
          <tr><td class="lbl">Account Holder</td><td class="val">${esc(receipt.account_name)}</td></tr>
          <tr><td class="lbl">Institutional Role</td><td class="val">${esc(receipt.role_label)}</td></tr>
          <tr><td class="lbl">College Department</td><td class="val">${esc(receipt.department_label)}</td></tr>
          ${
            isStudent
              ? `<tr><td class="lbl">Student ID Number</td><td class="val">${esc(receipt.lrn || 'N/A')}</td></tr>
                 <tr><td class="lbl">Year Level &amp; Section</td><td class="val">${esc(receipt.grade || '1st Year')} &bull; ${esc(receipt.section || 'Block - 1A')}</td></tr>`
              : receipt.role === 'teacher'
                ? `<tr><td class="lbl">Handled Year Level</td><td class="val">${esc(receipt.grade || 'All Year Levels')}</td></tr>`
                : ''
          }
          <tr><td class="lbl">Academic Year</td><td class="val">S.Y. ${esc(receipt.school_year)}</td></tr>
          <tr><td class="lbl">Dispatched To Email</td><td class="val">${esc(receipt.recipient)}</td></tr>
          <tr><td class="lbl">Issued By / Date</td><td class="val">${esc(receipt.issued_by)} &bull; ${esc(receipt.issued_at)}</td></tr>
        </table>
      </div>
      <div class="sec-title">2. Official Sign-In Credentials</div>
      <div class="cred-box">
        <table>
          <tr><td class="lbl">Portal Login URL</td><td class="val">${esc(safePortalUrl)}</td></tr>
          <tr><td class="lbl">Official Email Login</td><td class="val">${esc(receipt.recipient)}</td></tr>
          ${isStudent ? `<tr><td class="lbl">Student ID Login</td><td class="val">${esc(receipt.lrn || 'N/A')}</td></tr>` : ''}
        </table>
        <div class="pw-box">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#fde68a;font-weight:700;">Initial Account Password</div>
          <div class="pw-val">${esc(receipt.plain_password)}</div>
        </div>
      </div>
    </div>
    <div class="footer">
      Tagoloan Community College &bull; Baluarte, Tagoloan, Misamis Oriental &bull; Vincit Omnia Veritas
    </div>
  </div>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const deliveryStatus = receipt.sent
    ? 'sent'
    : receipt.simulated || receipt.mail_status === 'simulated'
      ? 'simulated'
      : 'failed';

  const deliveryMeta = {
    sent: {
      bg: 'rgba(16, 185, 129, 0.2)',
      border: '1px solid rgba(16, 185, 129, 0.5)',
      color: '#6ee7b7',
      label: 'Official Email Dispatched',
      headline: `Official Account Credentials Sent to ${receipt.recipient}`,
      bannerBg: '',
      bannerBorder: '',
      bannerColor: '',
    },
    simulated: {
      bg: 'rgba(245, 158, 11, 0.22)',
      border: '1px solid rgba(245, 158, 11, 0.55)',
      color: '#fde68a',
      label: 'Local Mail Log Only (SMTP Off)',
      headline: `Account Created for ${receipt.recipient} (Email Not Sent to Inbox)`,
      bannerBg: 'rgba(245, 158, 11, 0.14)',
      bannerBorder: '1px solid rgba(245, 158, 11, 0.45)',
      bannerColor: '#fde68a',
    },
    failed: {
      bg: 'rgba(239, 68, 68, 0.22)',
      border: '1px solid rgba(239, 68, 68, 0.55)',
      color: '#fca5a5',
      label: 'SMTP Delivery Failed',
      headline: `Account Created for ${receipt.recipient} (Email Not Sent to Inbox)`,
      bannerBg: 'rgba(239, 68, 68, 0.14)',
      bannerBorder: '1px solid rgba(239, 68, 68, 0.45)',
      bannerColor: '#fecaca',
    },
  }[deliveryStatus];

  return (
    <div
      style={{
        borderRadius: '14px',
        background: 'linear-gradient(155deg, rgba(38, 6, 11, 0.96) 0%, rgba(18, 2, 4, 0.98) 100%)',
        border: '1px solid rgba(245, 158, 11, 0.5)',
        boxShadow: '0 16px 38px rgba(0, 0, 0, 0.48), 0 0 0 1px rgba(245, 158, 11, 0.15)',
        overflow: 'hidden',
      }}
    >
      {/* Top TCC Crimson & Gold Institutional Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #7f121e 0%, #3e070d 100%)',
          borderBottom: '2px solid #f59e0b',
          padding: '1.15rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', minWidth: 0 }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(245, 158, 11, 0.18)',
              border: '1px solid rgba(245, 158, 11, 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fbbf24',
              flexShrink: 0,
            }}
          >
            <Mail size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.9px',
                  padding: '0.18rem 0.6rem',
                  borderRadius: '999px',
                  background: deliveryMeta.bg,
                  border: deliveryMeta.border,
                  color: deliveryMeta.color,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                {deliveryStatus === 'sent' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {deliveryMeta.label}
              </span>
              <span style={{ fontSize: '0.74rem', color: '#fde68a', fontWeight: 700 }}>
                S.Y. {receipt.school_year}
              </span>
            </div>
            <h3 style={{ margin: '0.25rem 0 0', fontSize: '1.18rem', fontWeight: 800, color: '#ffffff' }}>
              {deliveryMeta.headline}
            </h3>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)' }}>
              Subject: <strong style={{ color: '#fde68a' }}>{receipt.subject}</strong> &bull; Issued by {receipt.issued_by} ({receipt.issued_at})
            </p>
          </div>
        </div>

        {/* Action Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button
            type="button"
            variant="warning"
            size="sm"
            onClick={() => copyValue(buildFormattedEmailText(), 'Complete email credential summary', 'all')}
          >
            {copiedField === 'all' ? <Check size={14} /> : <Copy size={14} />}
            {copiedField === 'all' ? 'Copied All Details' : 'Copy Email Details'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handlePrintSlip}>
            <Printer size={14} /> Print / Save Slip
          </Button>
          {onViewDirectory && (
            <Button type="button" variant="outline" size="sm" onClick={onViewDirectory}>
              <ExternalLink size={14} /> {directoryButtonLabel}
            </Button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close email dispatch receipt"
            style={{
              background: 'rgba(0,0,0,0.28)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: '#f8fafc',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!receipt.sent && (
        <div
          style={{
            margin: '1rem 1.5rem 0',
            padding: '0.85rem 1rem',
            borderRadius: '10px',
            background: deliveryMeta.bannerBg,
            border: deliveryMeta.bannerBorder,
            color: deliveryMeta.bannerColor,
            fontSize: '0.84rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.6rem',
          }}
        >
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
          <div>
            <strong>External Inbox Delivery Inactive:</strong>{' '}
            {receipt.mail_warning ||
              'SMTP delivery is currently disabled or failed. Copy or print the credentials below to share them manually, or configure live MAIL_MAILER=smtp credentials in backend/.env.'}
          </div>
        </div>
      )}

      {/* Main Organized Body: 2-Column System-Themed Email Layout */}
      <div
        style={{
          padding: '1.35rem 1.5rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.25rem',
          alignItems: 'stretch',
        }}
      >
        {/* Column 1: Official Account & Academic Profile */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.035)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '1.1rem 1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '0.85rem',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: '0.65rem',
                marginBottom: '0.75rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.9px',
                  color: '#fbbf24',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <UserCheck size={14} /> 1. Official Account &amp; Academic Profile
              </span>
              <Badge variant="success">Active Account</Badge>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.84rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'var(--neutral-400)', fontWeight: 600 }}>Account Holder</span>
                <span style={{ color: '#ffffff', fontWeight: 800, textAlign: 'right' }}>{receipt.account_name}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'var(--neutral-400)', fontWeight: 600 }}>Institutional Role</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    padding: '0.2rem 0.65rem',
                    borderRadius: '999px',
                    background: 'rgba(245, 158, 11, 0.16)',
                    border: '1px solid rgba(245, 158, 11, 0.45)',
                    color: '#fbbf24',
                  }}
                >
                  {receipt.role_label}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'var(--neutral-400)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Building2 size={13} /> Department
                </span>
                <span style={{ color: '#f8fafc', fontWeight: 700, textAlign: 'right' }}>{receipt.department_label}</span>
              </div>

              {isStudent && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: 'var(--neutral-400)', fontWeight: 600 }}>Student ID Number</span>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 800,
                        fontSize: '0.88rem',
                        color: '#ffffff',
                        background: 'rgba(255,255,255,0.08)',
                        padding: '0.15rem 0.55rem',
                        borderRadius: '6px',
                      }}
                    >
                      {receipt.lrn || 'N/A'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: 'var(--neutral-400)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <GraduationCap size={14} /> Year &amp; Assigned Section
                    </span>
                    <span style={{ color: '#6ee7b7', fontWeight: 800, textAlign: 'right' }}>
                      {receipt.grade || '1st Year'} &bull; {receipt.section || 'Block - 1A'}
                    </span>
                  </div>
                </>
              )}

              {!isStudent && receipt.role === 'teacher' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color: 'var(--neutral-400)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <GraduationCap size={14} /> Handled Year Level
                  </span>
                  <span style={{ color: '#fde68a', fontWeight: 800, textAlign: 'right' }}>
                    {receipt.grade || 'All Year Levels'}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: 'var(--neutral-400)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Calendar size={13} /> Academic Year
                </span>
                <span style={{ color: '#fde68a', fontWeight: 700 }}>S.Y. {receipt.school_year}</span>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.28)',
              fontSize: '0.75rem',
              color: 'var(--neutral-200)',
              lineHeight: 1.45,
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
            }}
          >
            <ShieldCheck size={15} style={{ color: '#6ee7b7', flexShrink: 0, marginTop: '0.1rem' }} />
            <span>
              First sign-in on an unrecognized device automatically sends a 6-digit OTP verification code to{' '}
              <strong style={{ color: '#ffffff' }}>{receipt.recipient}</strong>.
            </span>
          </div>
        </div>

        {/* Column 2: Dispatched Sign-In Credentials Box */}
        <div
          style={{
            background: 'linear-gradient(145deg, rgba(127, 18, 30, 0.34) 0%, rgba(18, 2, 4, 0.72) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.42)',
            borderRadius: '12px',
            padding: '1.1rem 1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '0.85rem',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: '0.65rem',
                marginBottom: '0.75rem',
                borderBottom: '1px solid rgba(245, 158, 11, 0.22)',
              }}
            >
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.9px',
                  color: '#fbbf24',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <KeyRound size={14} /> 2. Dispatched Login Credentials
              </span>
              <span style={{ fontSize: '0.72rem', color: '#fde68a', fontWeight: 600 }}>
                Included in Email Body
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {/* Official Email Row */}
              <div
                style={{
                  padding: '0.6rem 0.8rem',
                  borderRadius: '8px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--neutral-400)', fontWeight: 700 }}>
                    Official Email Address (Recipient &amp; Login)
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {receipt.recipient}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyValue(receipt.recipient, 'Email address', 'email')}
                >
                  {copiedField === 'email' ? <Check size={13} /> : <Copy size={13} />}
                  {copiedField === 'email' ? 'Copied' : 'Copy'}
                </Button>
              </div>

              {/* Student ID Login Row (if student) */}
              {isStudent && receipt.lrn && (
                <div
                  style={{
                    padding: '0.6rem 0.8rem',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--neutral-400)', fontWeight: 700 }}>
                      Student ID Login (Alternate Sign-In)
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
                      {receipt.lrn}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyValue(receipt.lrn || '', 'Student ID', 'lrn')}
                  >
                    {copiedField === 'lrn' ? <Check size={13} /> : <Copy size={13} />}
                    {copiedField === 'lrn' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              )}

              {/* Initial Password Highlight Box */}
              <div
                style={{
                  padding: '0.75rem 0.9rem',
                  borderRadius: '10px',
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px dashed #f59e0b',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.65rem',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.7px', color: '#fde68a', fontWeight: 800 }}>
                    Initial Account Password
                  </div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '1.18rem',
                      fontWeight: 800,
                      letterSpacing: '1.5px',
                      color: '#fbbf24',
                      marginTop: '0.15rem',
                    }}
                  >
                    {showPassword ? receipt.plain_password : '••••••••••••'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    {showPassword ? 'Hide' : 'Show'}
                  </Button>
                  <Button
                    type="button"
                    variant="warning"
                    size="sm"
                    onClick={() => copyValue(receipt.plain_password, 'Initial password', 'password')}
                  >
                    {copiedField === 'password' ? <Check size={13} /> : <Copy size={13} />}
                    {copiedField === 'password' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
              paddingTop: '0.55rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '0.75rem',
              color: 'var(--neutral-300)',
            }}
          >
            <span>
              Portal Login URL: <strong style={{ color: '#fde68a', fontFamily: 'monospace' }}>{receipt.portal_url}</strong>
            </span>
            <span style={{ color: '#a7f3d0', fontWeight: 700 }}>
              Tagoloan Community College LMS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
