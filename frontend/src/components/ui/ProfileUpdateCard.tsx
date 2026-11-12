import { useState, type FormEvent } from 'react';
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
  EyeOff
} from 'lucide-react';
import { getLmsUser, lmsFetch } from '../../lmsApi';
import { useToastContext } from '../../contexts/ToastContext';
import { generateStrongPassword, evaluatePasswordStrength } from '../../lib/passwordUtils';
import GlassCard from './GlassCard';
import Button from './Button';

export default function ProfileUpdateCard() {
  const currentUser = getLmsUser();
  const { showToast } = useToastContext();

  const [name, setName] = useState(currentUser?.name || '');
  const email = currentUser?.email || '';

  // Password & Verification Code State
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [requestingCode, setRequestingCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const strength = evaluatePasswordStrength(password);

  const handleGeneratePassword = () => {
    const generated = generateStrongPassword(12);
    setPassword(generated);
    setShowPassword(true);
    showToast('Suggested strong institutional password generated!', 'info');
  };

  const handleCopyPassword = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      showToast('Password copied to clipboard.', 'success');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast('Could not access clipboard.', 'warning');
    }
  };

  const handleRequestCode = async () => {
    setRequestingCode(true);
    setError(null);
    setNotice(null);
    try {
      const res = await lmsFetch<{
        status: string;
        challenge: string;
        email_hint: string;
        message: string;
        debug_code?: string;
      }>('/profile/request-password-code', {
        method: 'POST',
      });

      setChallenge(res.challenge);
      setEmailHint(res.email_hint);
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
      const payload: Record<string, string> = {
        name: name.trim(),
        email: email.trim(),
      };

      if (password.trim()) {
        if (password.trim().length < 8) {
          throw new Error('New password must be at least 8 characters long.');
        }
        if (!challenge) {
          throw new Error('Please click "Request 6-Digit Code" to dispatch the verification code to your email.');
        }
        if (!code.trim()) {
          throw new Error('Please enter the 6-digit authorization code dispatched to your institutional email.');
        }
        payload.password = password.trim();
        payload.code = code.trim();
        payload.challenge = challenge;
      }

      const res = await lmsFetch<{ message: string; user: Record<string, unknown> }>('/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (res.user) {
        const serialized = JSON.stringify(res.user);
        if (localStorage.getItem('lms-user')) {
          localStorage.setItem('lms-user', serialized);
        } else {
          sessionStorage.setItem('lms-user', serialized);
        }
      }

      setPassword('');
      setCode('');
      setChallenge(null);
      setEmailHint(null);
      setDebugCode(null);
      setShowPassword(false);

      const msg = res.message || 'Profile information updated successfully.';
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

  return (
    <GlassCard>
      {/* Refined Header: Integrated icon, title, and persistent policy pill */}
      <div style={{ marginBottom: '1.35rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(245, 158, 11, 0.14)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fbbf24',
              flexShrink: 0
            }}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.01em' }}>
                  Account Settings &amp; Security
                </h3>
                <span className="settings-policy-pill">
                  <ShieldCheck size={13} /> TCC Security Policy Active
                </span>
              </div>
              <p style={{ color: 'var(--neutral-300)', fontSize: '0.84rem', margin: '0.2rem 0 0', lineHeight: 1.45 }}>
                Manage your verified collegiate identity, institutional credentials, and security password authorization.
              </p>
            </div>
          </div>
        </div>
      </div>

      {notice && (
        <div style={{
          background: 'rgba(46, 125, 50, 0.22)',
          border: '1px solid rgba(74, 222, 128, 0.4)',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-md)',
          color: '#dcfce7',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          marginBottom: '1.25rem',
          fontSize: '0.88rem'
        }}>
          <CheckCircle2 size={18} style={{ color: '#4ade80', flexShrink: 0 }} />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div style={{
          background: 'rgba(211, 47, 47, 0.22)',
          border: '1px solid rgba(248, 113, 113, 0.4)',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-md)',
          color: '#fee2e2',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          marginBottom: '1.25rem',
          fontSize: '0.88rem'
        }}>
          <AlertCircle size={18} style={{ color: '#f87171', flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>
        {/* Symmetrical 2-Column Grid: Full Name and Protected Email */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem',
          alignItems: 'start'
        }}>
          {/* Left Column: Full Name */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="settings-user-name">
              Full Name / Display Name
            </label>
            <input
              id="settings-user-name"
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Juan Dela Cruz"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <p className="settings-field-helper">
              Official verified identity across your courses, assessments, and academic records.
            </p>
          </div>

          {/* Right Column: Institutional Email (Locked) */}
          <div className="form-group" style={{ margin: 0 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.42rem'
            }}>
              <label className="form-label" htmlFor="settings-user-email" style={{ margin: 0, whiteSpace: 'nowrap' }}>
                Institutional Email Address
              </label>
              <span className="settings-lock-badge">
                <Lock size={10} /> Locked &bull; Institutional Policy
              </span>
            </div>
            <div className="settings-locked-input-wrap">
              <Mail size={16} style={{ color: '#fbbf24', flexShrink: 0 }} />
              <input
                id="settings-user-email"
                type="email"
                value={email}
                disabled
                readOnly
                className="settings-locked-input"
                aria-label="Institutional email address (locked)"
              />
              <Lock size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
            </div>
            <p className="settings-field-helper">
              Official school email is locked for academic audit integrity. Contact the Registrar or Secretary to update.
            </p>
          </div>
        </div>

        {/* Change Security Password Box */}
        <div className="settings-password-box">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fbbf24',
                flexShrink: 0
              }}>
                <KeyRound size={16} />
              </div>
              <span style={{ fontWeight: 800, fontSize: '0.98rem', color: '#ffffff' }}>
                Change Security Password
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="settings-btn-suggest"
              >
                <Sparkles size={13} /> Suggest Strong Password
              </button>
              {password && (
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  className="settings-btn-copy"
                >
                  {copied ? <Check size={13} style={{ color: '#4ade80' }} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="settings-new-password"
              style={{
                display: 'block',
                fontSize: '0.84rem',
                fontWeight: 600,
                color: 'var(--neutral-200)',
                marginBottom: '0.4rem'
              }}
            >
              New Password <span style={{ color: 'var(--neutral-400)', fontWeight: 400 }}>(Leave blank to keep existing password)</span>
            </label>
            <div className="settings-password-input-wrap">
              <Lock size={16} className="input-icon-left" />
              <input
                id="settings-new-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new password (minimum 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="settings-password-toggle"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {password && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--neutral-400)' }}>Password Complexity:</span>
                <span style={{ color: strength.color, fontWeight: 700 }}>{strength.label}</span>
              </div>
              <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${strength.percent}%`, height: '100%', background: strength.color, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}

          {/* When password is entered, email authorization code is required */}
          {password.trim().length > 0 && (
            <div className="settings-otp-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#fde68a', fontSize: '0.86rem', fontWeight: 700 }}>
                  <Mail size={16} /> 6-Digit Email Authorization Code Required
                </div>
                <button
                  type="button"
                  onClick={handleRequestCode}
                  disabled={requestingCode}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#120204',
                    border: 'none',
                    padding: '0.4rem 0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    cursor: requestingCode ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <RefreshCw size={12} className={requestingCode ? 'spin' : ''} />
                  {challenge ? 'Resend Code' : 'Request 6-Digit Code'}
                </button>
              </div>

              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--neutral-200)', lineHeight: 1.5 }}>
                For security compliance, changing your account password requires a 6-digit one-time code dispatched to <strong>{emailHint || email}</strong>.
              </p>

              {debugCode && (
                <div style={{
                  background: 'rgba(245, 158, 11, 0.16)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  borderRadius: '8px',
                  padding: '0.6rem 0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.6rem',
                  flexWrap: 'wrap'
                }}>
                  <div style={{ fontSize: '0.76rem', color: '#fef08a' }}>
                    <strong>Demo Code:</strong> <span style={{ fontFamily: 'monospace', fontSize: '1.08rem', fontWeight: 800, letterSpacing: '4px', color: '#fbbf24', marginLeft: '0.4rem' }}>{debugCode}</span>
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
                      cursor: 'pointer'
                    }}
                  >
                    Auto-Fill
                  </button>
                </div>
              )}

              <div>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="Enter 6-digit code (e.g. 581942)"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="form-input"
                  style={{
                    width: '240px',
                    letterSpacing: '4px',
                    fontWeight: 800,
                    fontSize: '1.05rem',
                    textAlign: 'center',
                    boxSizing: 'border-box'
                  }}
                  required={password.trim().length > 0}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Action Bar: Audit notice on left, polished Save button on right */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--neutral-400)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={15} style={{ color: '#4ade80' }} />
            All settings updates are cryptographically logged for collegiate audit trails.
          </span>
          <Button type="submit" variant="accent" size="md" isLoading={saving}>
            <Save size={16} /> Save Settings &amp; Security Changes
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
