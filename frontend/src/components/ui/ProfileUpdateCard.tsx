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
import { lmsFetch } from '../../lmsApi';
import type { User } from '../../lib/types';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToastContext } from '../../contexts/ToastContext';
import { generateStrongPassword, evaluatePasswordStrength } from '../../lib/passwordUtils';
import GlassCard from './GlassCard';
import Button from './Button';

export default function ProfileUpdateCard() {
  const { user: authUser, syncUser } = useAuthContext();
  const { showToast } = useToastContext();

  const [name, setName] = useState(authUser?.name || '');
  const email = authUser?.email || '';

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
      showToast(msg, 'success');

      if (res.debug_code) {
        setDebugCode(res.debug_code);
        setCode(res.debug_code);
        showToast(`Demo authorization code: ${res.debug_code}`, 'info');
      }
    } catch (err: unknown) {
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
        email: email.trim(),
        current_password: currentPassword,
        code: code.trim(),
        challenge,
      };

      if (newPassword) {
        payload.password = newPassword;
        payload.password_confirmation = confirmPassword;
      }

      const res = await lmsFetch<{ message: string; user?: User }>('/profile', {
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

      const msg = res.message || 'Account settings updated successfully.';
      setNotice(msg);
      showToast(msg, 'success');
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
            <ShieldCheck size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.01em' }}>
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

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Symmetrical 2-Column Grid: Full Name and Locked Institutional Email */}
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
              Official verified identity across your courses, assessments, and academic records.
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
              Locked by institutional policy. Contact the Registrar or Secretary to update.
            </p>
          </div>
        </div>

        {/* Security Password & Mandatory Email Authorization Box */}
        <div className="settings-password-box">
          <div className="settings-password-box-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <div className="settings-password-icon-badge">
                <KeyRound size={16} />
              </div>
              <div>
                <span style={{ fontWeight: 800, fontSize: '0.98rem', color: '#ffffff' }}>
                  Password Verification &amp; Email Authorization
                </span>
                <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Required to Save
                </span>
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
                Current Security Password <span style={{ color: '#fbbf24', fontWeight: 700 }}>* (Required)</span>
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
                  New Password <span style={{ color: 'var(--neutral-400)', fontWeight: 500 }}>(Optional)</span>
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

          {/* Mandatory Exact 6-Digit Email Authorization Code Box */}
          <div className="settings-otp-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
              <label
                htmlFor="settings-otp-code"
                style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#fde68a', fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer' }}
              >
                <Mail size={16} /> Exact 6-Digit Email Authorization Code <span style={{ color: '#fbbf24' }}>* (Required)</span>
              </label>
              <button
                type="button"
                onClick={handleRequestCode}
                disabled={requestingCode || cooldown > 0}
                className="settings-btn-otp"
              >
                <RefreshCw size={12} className={requestingCode ? 'spin' : ''} />
                {cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : challenge
                    ? 'Resend Code'
                    : 'Request 6-Digit Code'}
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--neutral-200)', lineHeight: 1.5 }}>
              Click <strong>&quot;Request 6-Digit Code&quot;</strong> to receive your one-time code at <strong>{emailHint || email}</strong>. Both your current password and exact 6-digit code are required to save changes.
            </p>

            {debugCode && (
              <div className="settings-demo-banner">
                <div style={{ fontSize: '0.76rem', color: '#fef08a' }}>
                  <strong>Demo Code:</strong>{' '}
                  <span style={{ fontFamily: 'monospace', fontSize: '1.08rem', fontWeight: 800, letterSpacing: '4px', color: '#fbbf24', marginLeft: '0.4rem' }}>
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
                    background: 'rgba(245, 158, 11, 0.25)',
                    color: '#ffffff',
                    border: '1px solid #fbbf24',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Auto-Fill
                </button>
              </div>
            )}

            <div>
              <input
                id="settings-otp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="Enter 6-digit code (e.g. 581942)"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="form-input settings-otp-input"
                required
              />
            </div>
          </div>
        </div>

        {/* Footer Action Bar */}
        <div className="settings-card-footer">
          <span style={{ fontSize: '0.78rem', color: 'var(--neutral-400)', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <ShieldCheck size={15} style={{ color: '#4ade80', flexShrink: 0 }} />
            Current password and exact 6-digit email code are required to save settings.
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <Button type="submit" variant="accent" size="lg" isLoading={saving} disabled={!canSubmit}>
              <Save size={16} /> Save Settings &amp; Security Changes
            </Button>
          </div>
        </div>
      </form>
    </GlassCard>
  );
}
