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
import Input from './Input';
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
      {/* Header with Title and Protected Policy Badge */}
      <div style={{ marginBottom: '1.25rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'white', margin: 0 }}>
              Account Settings &amp; Security
            </h3>
            <p style={{ color: 'var(--neutral-400)', fontSize: '0.85rem', marginTop: '0.25rem', margin: 0 }}>
              Manage your verified display name, institutional credentials, and security password authorization.
            </p>
          </div>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.3rem 0.65rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: 'rgba(234, 179, 8, 0.12)',
            color: '#fef08a',
            border: '1px solid rgba(234, 179, 8, 0.3)'
          }}>
            <ShieldCheck size={14} /> TCC Security Policy Active
          </span>
        </div>
      </div>

      {notice && (
        <div style={{
          background: 'rgba(67, 160, 71, 0.2)',
          border: '1px solid var(--success)',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-md)',
          color: '#c8e6c9',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1rem',
          fontSize: '0.88rem'
        }}>
          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div style={{
          background: 'rgba(239, 83, 80, 0.2)',
          border: '1px solid var(--error)',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-md)',
          color: '#ffcdd2',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1rem',
          fontSize: '0.88rem'
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Name and Protected Email Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          <Input
            label="Full Name / Display Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Juan Dela Cruz"
          />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--neutral-300)' }}>
                Institutional Email Address
              </label>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.72rem',
                color: '#94a3b8',
                background: 'rgba(255,255,255,0.06)',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.08)'
              }}>
                <Lock size={11} /> Locked &bull; Institutional Policy
              </span>
            </div>
            <input
              type="email"
              value={email}
              disabled
              readOnly
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#94a3b8',
                fontSize: '0.9rem',
                cursor: 'not-allowed',
                boxSizing: 'border-box'
              }}
            />
            <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.75rem', color: 'var(--neutral-400)' }}>
              Official school email is locked for academic audit integrity. Contact the Registrar or Secretary to update.
            </p>
          </div>
        </div>

        {/* Password Management Box */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-md)',
          padding: '1.1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.9rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <KeyRound size={17} style={{ color: 'var(--primary-300)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'white' }}>
                Change Security Password
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={handleGeneratePassword}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  background: 'rgba(234, 179, 8, 0.15)',
                  color: '#fde047',
                  border: '1px solid rgba(234, 179, 8, 0.35)',
                  padding: '0.35rem 0.65rem',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer'
                }}
              >
                <Sparkles size={13} /> Suggest Strong Password
              </button>
              {password && (
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#e2e8f0',
                    border: '1px solid var(--glass-border)',
                    padding: '0.35rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer'
                  }}
                >
                  {copied ? <Check size={13} style={{ color: '#4ade80' }} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--neutral-300)', marginBottom: '0.35rem' }}>
              New Password (Leave blank to keep existing password)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new password (minimum 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--neutral-400)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {password && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--neutral-400)' }}>Password Strength:</span>
                <span style={{ color: strength.color, fontWeight: 700 }}>{strength.label}</span>
              </div>
              <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${strength.percent}%`, height: '100%', background: strength.color, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          {/* If user types a new password, authorization code is required */}
          {password.trim().length > 0 && (
            <div style={{
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px dashed rgba(234, 179, 8, 0.4)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.9rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              marginTop: '0.35rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#fef08a', fontSize: '0.85rem', fontWeight: 600 }}>
                  <Mail size={15} /> 6-Digit Email Authorization Code Required
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
                    fontWeight: 600,
                    background: 'var(--primary-500)',
                    color: 'white',
                    border: 'none',
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    cursor: requestingCode ? 'not-allowed' : 'pointer'
                  }}
                >
                  <RefreshCw size={12} className={requestingCode ? 'spin' : ''} />
                  {challenge ? 'Resend Code' : 'Request 6-Digit Code'}
                </button>
              </div>

              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--neutral-300)' }}>
                For security compliance, changing your account password requires a 6-digit one-time code dispatched to {emailHint || email}.
              </p>

              {debugCode && (
                <div style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: '6px',
                  padding: '0.55rem 0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  flexWrap: 'wrap'
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#fef08a' }}>
                    <strong>Demo Code:</strong> <span style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 800, letterSpacing: '3px', color: '#fde047', marginLeft: '0.35rem' }}>{debugCode}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCode(debugCode);
                      showToast('Code auto-filled!', 'success');
                    }}
                    style={{
                      background: 'var(--primary-600)',
                      color: 'white',
                      border: 'none',
                      padding: '0.2rem 0.55rem',
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
                    width: '200px',
                    letterSpacing: '3px',
                    fontWeight: 700,
                    fontSize: '1rem',
                    textAlign: 'center',
                    boxSizing: 'border-box'
                  }}
                  required={password.trim().length > 0}
                />
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <Button type="submit" variant="accent" isLoading={saving}>
            <Save size={16} /> Save Settings &amp; Security Changes
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
