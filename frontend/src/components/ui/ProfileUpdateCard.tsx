import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Save,
  Lock,
  ShieldCheck,
  KeyRound,
  Sparkles,
  Copy,
  Check,
  Mail,
  RefreshCw,
  Eye,
  EyeOff,
  User as UserIcon,
} from 'lucide-react';
import { LmsApiError, lmsFetch } from '../../lmsApi';
import type { User } from '../../lib/types';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToastContext } from '../../contexts/ToastContext';
import { generateStrongPassword, evaluatePasswordStrength } from '../../lib/passwordUtils';
import GlassCard from './GlassCard';
import Button from './Button';

const ROLE_FIELD_GUIDANCE: Record<string, { nameHelper: string; emailLockHelper: string }> = {
  secretary: {
    nameHelper: 'Official verified identity shown on enrollment records, sections, and audit logs.',
    emailLockHelper: 'Locked by institutional policy. Contact your College Dean to update.',
  },
  dean: {
    nameHelper: 'Official verified identity shown on college oversight, approvals, and audit trails.',
    emailLockHelper: 'Locked by institutional policy. Contact the System Administrator to update.',
  },
  principal: {
    nameHelper: 'Official verified identity shown on college oversight, approvals, and audit trails.',
    emailLockHelper: 'Locked by institutional policy. Contact the System Administrator to update.',
  },
  developer: {
    nameHelper: 'Official verified identity across institution-wide administration and audit logs.',
    emailLockHelper: 'Locked by institutional policy for system audit integrity.',
  },
  teacher: {
    nameHelper: 'Official verified identity across your classes, quizzes, and academic records.',
    emailLockHelper: 'Locked by institutional policy. Contact your College Secretary or Dean to update.',
  },
  student: {
    nameHelper: 'Official verified identity across your courses, assessments, and academic records.',
    emailLockHelper: 'Locked by institutional policy. Contact your College Secretary or Dean to update.',
  },
};

export default function ProfileUpdateCard() {
  const { user: authUser, syncUser } = useAuthContext();
  const { showToast } = useToastContext();
  const roleKey = (authUser?.role || 'student').toLowerCase();
  const fieldGuidance = ROLE_FIELD_GUIDANCE[roleKey] ?? ROLE_FIELD_GUIDANCE.student;

  const [name, setName] = useState(authUser?.name || '');
  const [syncedUserId, setSyncedUserId] = useState(authUser?.id);
  const email = authUser?.email || '';

  if (authUser?.id && authUser.id !== syncedUserId) {
    setSyncedUserId(authUser.id);
    setName(authUser.name || '');
  }

  // Current password is always required to authorize settings changes; new password is optional
  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  // Mandatory exact 6-digit email OTP verification state
  const [code, setCode] = useState('');
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [requestingCode, setRequestingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const strength = evaluatePasswordStrength(newPassword);

  const handleGeneratePassword = () => {
    const generated = generateStrongPassword(12);
    setNewPassword(generated);
    setConfirmPassword(generated);
    setShowNewPassword(true);
    showToast('Suggested strong institutional password generated!', 'info');
  };

  const handleCopyPassword = async () => {
    if (!newPassword) return;
    try {
      await navigator.clipboard.writeText(newPassword);
      setCopied(true);
      showToast('New password copied to clipboard.', 'success');
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast('Could not access clipboard.', 'warning');
    }
  };

  const handleRequestCode = async () => {
    if (cooldown > 0 || requestingCode) return;

    setRequestingCode(true);
    setError(null);
    setNotice(null);
    setCode('');
    setDebugCode(null);

    try {
      const res = await lmsFetch<{
        status: string;
        challenge: string;
        email_hint: string;
        cooldown_seconds?: number;
        mail_status?: string;
        mail_warning?: string | null;
        message: string;
        debug_code?: string;
      }>('/profile/request-password-code', {
        method: 'POST',
      });

      setChallenge(res.challenge);
      setEmailHint(res.email_hint);
      setCooldown(res.cooldown_seconds ?? 60);

      const msg = res.message || `Verification code sent to ${res.email_hint}`;
      setNotice(msg);
      showToast(msg, res.mail_status && res.mail_status !== 'sent' ? 'warning' : 'success');

      if (res.debug_code && import.meta.env.DEV) {
        setDebugCode(res.debug_code);
        showToast(`Demo authorization code: ${res.debug_code}`, 'info');
      }
    } catch (err: unknown) {
      if (err instanceof LmsApiError && err.status === 429 && err.retryAfter) {
        setCooldown(err.retryAfter);
      }
      const msg = err instanceof Error ? err.message : 'Failed to send authorization code.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setRequestingCode(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);

    try {
      if (!name.trim()) {
        throw new Error('Please enter your full name.');
      }
      if (!currentPassword) {
        throw new Error('You are required to insert your current security password before saving settings.');
      }
      if (newPassword) {
        if (newPassword.length < 8) {
          throw new Error('New password must be at least 8 characters long.');
        }
        if (newPassword !== confirmPassword) {
          throw new Error('New password and confirmation do not match.');
        }
      }
      if (!challenge) {
        throw new Error('Please click "Request 6-Digit Code" to receive the required authorization code first.');
      }
      if (code.trim().length !== 6) {
        throw new Error('Please enter the exact 6-digit email authorization code sent to your institutional email.');
      }

      const payload: Record<string, string> = {
        name: name.trim(),
        current_password: currentPassword,
        code: code.trim(),
        challenge,
      };

      if (email.trim()) {
        payload.email = email.trim();
      }

      if (newPassword) {
        payload.password = newPassword;
        payload.password_confirmation = confirmPassword;
      }

      const res = await lmsFetch<{
        message: string;
        user?: User;
        email_dispatch?: { sent?: boolean; mail_status?: string; mail_warning?: string | null };
      }>('/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (res.user) {
        syncUser(res.user);
        setName(res.user.name);
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setCode('');
      setChallenge(null);
      setEmailHint(null);
      setDebugCode(null);
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setCooldown(0);

      const baseMsg = res.message || 'Account settings updated successfully.';
      const dispatch = res.email_dispatch;
      const msg = dispatch
        ? dispatch.sent
          ? `${baseMsg} Confirmation emailed to your institutional address.`
          : `${baseMsg} (${dispatch.mail_warning || 'Email confirmation was logged locally rather than sent externally.'})`
        : baseMsg;
      setNotice(msg);
      showToast(msg, dispatch && !dispatch.sent ? 'warning' : 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not update profile information.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    Boolean(name.trim()) &&
    Boolean(currentPassword) &&
    Boolean(challenge) &&
    code.trim().length === 6 &&
    (!newPassword || (newPassword.length >= 8 && newPassword === confirmPassword));

  return (
    <GlassCard style={{ overflow: 'hidden' }}>
      <div className="settings-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
          <div className="settings-header-emblem">
            <ShieldCheck size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: '1.18rem', fontWeight: 700, color: '#ffffff', margin: 0, letterSpacing: '-0.01em' }}>
              Account Settings &amp; Security
            </h3>
            <p style={{ color: 'var(--neutral-300)', fontSize: '0.84rem', margin: '0.2rem 0 0', lineHeight: 1.45 }}>
              Manage your verified collegiate identity, institutional credentials, and email-authorized security updates.
            </p>
          </div>
        </div>

        <span className="settings-policy-pill">
          <ShieldCheck size={13} /> TCC Security Policy Active
        </span>
      </div>

      {notice && (
        <div className="settings-alert settings-alert--success" role="status">
          <CheckCircle2 size={18} style={{ color: '#4ade80', flexShrink: 0 }} />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="settings-alert settings-alert--error" role="alert">
          <AlertCircle size={18} style={{ color: '#f87171', flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
        {/* Section 1: Verified Identity Details */}
        <div className="settings-section-block">
          <div className="settings-section-heading">
            <h4 className="settings-section-title">1. Verified Identity Details</h4>
          </div>

          <div className="settings-grid-2">
            <div className="form-group" style={{ margin: 0 }}>
              <div className="settings-label-row">
                <label className="form-label" htmlFor="settings-user-name">
                  Full Name / Display Name
                </label>
              </div>
              <div className="settings-input-wrap">
                <UserIcon size={16} className="input-icon-left" />
                <input
                  id="settings-user-name"
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="e.g. Juan Dela Cruz"
                />
              </div>
              <p className="settings-field-helper">
                {fieldGuidance.nameHelper}
              </p>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <div className="settings-label-row">
                <label className="form-label" htmlFor="settings-user-email">
                  Institutional Email
                </label>
                <span className="settings-lock-badge">
                  <Lock size={10} /> Locked
                </span>
              </div>
              <div className="settings-input-wrap">
                <Mail size={16} className="input-icon-left" />
                <input
                  id="settings-user-email"
                  type="email"
                  value={email}
                  disabled
                  readOnly
                  className="form-input settings-input-locked"
                  aria-label="Institutional email address (locked)"
                />
                <Lock size={14} className="input-icon-right" />
              </div>
              <p className="settings-field-helper">
                {fieldGuidance.emailLockHelper}
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Password Verification & Optional Update */}
        <div className="settings-password-box">
          <div className="settings-password-box-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div className="settings-password-icon-badge">
                <KeyRound size={16} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.94rem', color: '#ffffff' }}>
                    2. Password Verification &amp; Credentials
                  </span>
                  <span className="settings-lock-badge" style={{ textTransform: 'none', fontWeight: 600 }}>
                    Required to Save
                  </span>
                </div>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.76rem', color: 'var(--neutral-400)' }}>
                  Confirm your current password to authorize changes, or set a new password below.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={handleGeneratePassword} className="settings-btn-suggest">
                <Sparkles size={13} /> Suggest Strong Password
              </button>
              {newPassword && (
                <button type="button" onClick={handleCopyPassword} className="settings-btn-copy">
                  {copied ? <Check size={13} style={{ color: '#4ade80' }} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
          </div>

          {/* Current Security Password (Always Required) */}
          <div className="form-group" style={{ margin: 0 }}>
            <div className="settings-label-row">
              <label className="form-label" htmlFor="settings-current-password">
                Current Security Password <span style={{ color: '#fbbf24', fontWeight: 600 }}>* (Required)</span>
              </label>
            </div>
            <div className="settings-input-wrap has-right-control">
              <Lock size={16} className="input-icon-left" />
              <input
                id="settings-current-password"
                type={showCurrentPassword ? 'text' : 'password'}
                placeholder="Enter your current password to authorize saving settings"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="form-input"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((prev) => !prev)}
                aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                className="settings-password-toggle"
              >
                {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="settings-field-helper">
              Verified against your existing password on every settings update.
            </p>
          </div>

          {/* Optional Password Change (New + Confirmation) */}
          <div className="settings-grid-2">
            <div className="form-group" style={{ margin: 0 }}>
              <div className="settings-label-row">
                <label className="form-label" htmlFor="settings-new-password">
                  New Password <span style={{ color: 'var(--neutral-400)', fontWeight: 500, fontSize: '0.76rem' }}>(Optional)</span>
                </label>
              </div>
              <div className="settings-input-wrap has-right-control">
                <KeyRound size={16} className="input-icon-left" />
                <input
                  id="settings-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Leave blank to keep current password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="form-input"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                  className="settings-password-toggle"
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <div className="settings-label-row">
                <label className="form-label" htmlFor="settings-confirm-password">
                  Confirm New Password
                </label>
              </div>
              <div className="settings-input-wrap">
                <KeyRound size={16} className="input-icon-left" />
                <input
                  id="settings-confirm-password"
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="form-input"
                  autoComplete="new-password"
                  disabled={!newPassword}
                />
              </div>
            </div>
          </div>

          {newPassword && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--neutral-400)' }}>New Password Complexity:</span>
                <span style={{ color: strength.color, fontWeight: 700 }}>{strength.label}</span>
              </div>
              <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${strength.score}%`, height: '100%', background: strength.color, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Mandatory Exact 6-Digit Email Authorization Code Box */}
        <div className="settings-otp-box">
          <div className="settings-otp-row">
            <div style={{ minWidth: 0, flex: '1 1 280px' }}>
              <label
                htmlFor="settings-otp-code"
                style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#fde68a', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', marginBottom: '0.25rem' }}
              >
                <Mail size={16} /> 3. Email Authorization Code <span style={{ color: '#fbbf24', fontWeight: 600 }}>* (Required)</span>
              </label>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--neutral-200)', lineHeight: 1.5 }}>
                Click <strong>&quot;Request 6-Digit Code&quot;</strong> to send a one-time verification code to <strong>{emailHint || email}</strong>.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <input
                id="settings-otp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="form-input settings-otp-input"
                required
              />
              <button
                type="button"
                onClick={handleRequestCode}
                disabled={requestingCode || cooldown > 0}
                className="settings-btn-otp"
              >
                <RefreshCw size={13} className={requestingCode ? 'spin' : ''} />
                {cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : challenge
                    ? 'Resend Code'
                    : 'Request 6-Digit Code'}
              </button>
            </div>
          </div>

          {debugCode && (
            <div className="settings-demo-banner">
              <div style={{ fontSize: '0.76rem', color: '#fef08a' }}>
                <strong>Demo Code:</strong>{' '}
                <span style={{ fontFamily: 'monospace', fontSize: '1.04rem', fontWeight: 700, letterSpacing: '4px', color: '#fbbf24', marginLeft: '0.4rem' }}>
                  {debugCode}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCode(debugCode);
                  showToast('Demo code auto-filled!', 'success');
                }}
                style={{
                  background: 'rgba(245, 158, 11, 0.22)',
                  color: '#ffffff',
                  border: '1px solid #fbbf24',
                  padding: '0.25rem 0.65rem',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Auto-Fill
              </button>
            </div>
          )}
        </div>

        {/* Footer Action Bar */}
        <div className="settings-card-footer">
          <span className="settings-requirements-note">
            <ShieldCheck size={15} style={{ color: '#4ade80', flexShrink: 0 }} />
            Current password and exact 6-digit email code are required to save settings.
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <Button type="submit" variant="accent" size="md" isLoading={saving} disabled={!canSubmit}>
              <Save size={15} /> Save Settings &amp; Security Changes
            </Button>
          </div>
        </div>
      </form>
    </GlassCard>
  );
}
