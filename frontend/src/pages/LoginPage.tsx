import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert, 
  KeyRound, 
  Sparkles, 
  Copy, 
  Check, 
  RefreshCw 
} from 'lucide-react';
import { API_BASE, getDeviceId } from '../lmsApi';
import CaptchaVerification from '../components/auth/CaptchaVerification';
import Button from '../components/ui/Button';
import { useToastContext } from '../contexts/ToastContext';
import { generateStrongPassword } from '../lib/passwordUtils';

export default function LoginPage() {
  const navigate = useNavigate();
  const { showToast } = useToastContext();

  // Login form state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Unrecognized Device OTP challenge state
  const [isOtpStep, setIsOtpStep] = useState(false);
  const [otpChallenge, setOtpChallenge] = useState<string | null>(null);
  const [otpEmailHint, setOtpEmailHint] = useState<string | null>(null);
  const [otpDeviceName, setOtpDeviceName] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpDebugCode, setOtpDebugCode] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Forgot / Reset Password flow state
  const [isResetStep, setIsResetStep] = useState(false);
  const [resetStage, setResetStage] = useState<'request' | 'verify'>('request');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetChallenge, setResetChallenge] = useState<string | null>(null);
  const [resetEmailHint, setResetEmailHint] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState('');
  const [resetDebugCode, setResetDebugCode] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [copiedResetPwd, setCopiedResetPwd] = useState(false);

  // Cooldown timer for OTP resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleLoginSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      const deviceId = getDeviceId();
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Accept: 'application/json',
          'X-Device-Id': deviceId,
        },
        body: JSON.stringify({ 
          identifier: identifier.trim(), 
          password, 
          remember,
          device_id: deviceId 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Invalid email/ID or password.');
      }

      // Check if unrecognized device requires OTP verification
      if (data.requires_otp) {
        setIsOtpStep(true);
        setOtpChallenge(data.challenge);
        setOtpEmailHint(data.email_hint);
        setOtpDeviceName(data.device_name || 'Unrecognized Web Client');
        setResendCooldown(45);
        if (data.debug_code) {
          setOtpDebugCode(data.debug_code);
          setOtpCode(data.debug_code);
          showToast(`Demo verification code: ${data.debug_code}`, 'info');
        }
        showToast('Unrecognized device detected. Please verify using your 6-digit OTP code.', 'warning');
        return;
      }

      // Direct sign in
      handleLoginSuccess(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in. Please verify your connection.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleLoginSuccess = (data: { token?: string; user?: Record<string, unknown>; message?: string }) => {
    if (data.token) {
      localStorage.removeItem('lms-token');
      localStorage.removeItem('lms-user');
      sessionStorage.removeItem('lms-token');
      sessionStorage.removeItem('lms-user');

      const storage = remember ? localStorage : sessionStorage;
      storage.setItem('lms-token', data.token);
      storage.setItem('lms-user', JSON.stringify(data.user));
    }

    const userName = (data.user as { name?: string })?.name || 'User';
    showToast(`Signed in successfully. Welcome, ${userName}!`, 'success');
    const rawRole = String((data.user as { role?: string })?.role || 'student').toLowerCase();
    const role = rawRole === 'principal' ? 'dean' : rawRole;
    navigate(`/${role}`);
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!otpChallenge || !otpCode.trim()) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const deviceId = getDeviceId();
      const response = await fetch(`${API_BASE}/verify-login-otp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Accept: 'application/json',
          'X-Device-Id': deviceId,
        },
        body: JSON.stringify({
          challenge: otpChallenge,
          code: otpCode.trim(),
          device_name: otpDeviceName,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Invalid or expired OTP verification code.');
      }

      handleLoginSuccess(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'OTP verification failed.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleResendOtp = async () => {
    if (!otpChallenge || resendCooldown > 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/resend-login-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ challenge: otpChallenge }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not resend OTP code.');
      setResendCooldown(60);
      setNotice(data.message || 'A new verification code has been dispatched.');
      showToast('Verification code resent to your email.', 'success');
      if (data.debug_code) {
        setOtpDebugCode(data.debug_code);
        setOtpCode(data.debug_code);
        showToast(`Verification code: ${data.debug_code}`, 'info');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend code.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenForgotPassword = () => {
    setIsResetStep(true);
    setResetStage('request');
    setResetIdentifier(identifier || '');
    setError(null);
    setNotice(null);
  };

  const handleRequestPasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetIdentifier.trim()) {
      setError('Please provide your registered institutional email or Student ID.');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`${API_BASE}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ identifier: resetIdentifier.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not request password reset.');

      setResetChallenge(data.challenge);
      setResetEmailHint(data.email_hint);
      setResetStage('verify');
      const msg = data.message || `Reset code dispatched to ${data.email_hint}`;
      setNotice(msg);
      showToast(msg, 'success');

      if (data.debug_code) {
        setResetDebugCode(data.debug_code);
        setResetCode(data.debug_code);
        showToast(`Demo reset code: ${data.debug_code}`, 'info');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to request password reset.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCompletePasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetChallenge || !resetCode.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`${API_BASE}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          challenge: resetChallenge,
          code: resetCode.trim(),
          password: newPassword,
          password_confirmation: confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to reset password.');

      // Return to sign in
      setIsResetStep(false);
      setResetStage('request');
      setIdentifier(resetIdentifier);
      setPassword('');
      setNotice('Password updated successfully! You may now sign in using your new credentials.');
      showToast('Password reset complete. Please sign in.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not reset password.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateResetPassword = () => {
    const pwd = generateStrongPassword(12);
    setNewPassword(pwd);
    setConfirmPassword(pwd);
    showToast('Suggested strong password generated!', 'info');
  };

  const handleCopyResetPassword = async () => {
    if (!newPassword) return;
    try {
      await navigator.clipboard.writeText(newPassword);
      setCopiedResetPwd(true);
      showToast('Password copied to clipboard.', 'success');
      setTimeout(() => setCopiedResetPwd(false), 2500);
    } catch {
      showToast('Clipboard copy failed.', 'warning');
    }
  };

  return (
    <div className="login-container">
      {/* Return to Home link */}
      <Link to="/" className="login-back-btn">
        <ChevronLeft size={18} /> Back to TCC Home
      </Link>

      <div className="login-glass-card">
        {/* Constrained School Logo */}
        <img 
          src="/assets/images/logo.png" 
          alt="Tagoloan Community College Logo" 
          className="login-logo" 
        />

        {notice && (
          <div className="login-success-notice">
            <CheckCircle2 size={16} style={{ display: 'inline', marginRight: '6px' }} />
            {notice}
          </div>
        )}

        {error && (
          <div className="login-error-alert">
            <AlertCircle size={16} style={{ display: 'inline', marginRight: '6px' }} />
            {error}
          </div>
        )}

        {/* =========================================================================
            STATE 1: UNRECOGNIZED DEVICE OTP VERIFICATION
        ========================================================================= */}
        {isOtpStep ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.4rem', color: '#f59e0b' }}>
              <ShieldAlert size={26} />
              <h2 className="login-card-title" style={{ margin: 0, fontSize: '1.35rem' }}>
                Device Verification
              </h2>
            </div>
            <p className="login-card-subtitle" style={{ marginBottom: '1.1rem' }}>
              Unrecognized device detected. Enter the 6-digit OTP code sent to <strong>{otpEmailHint}</strong> to authorize this session.
            </p>

            {otpDebugCode && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: '8px',
                padding: '0.65rem 0.85rem',
                marginBottom: '1rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.74rem', color: '#fef08a', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                  Institutional Demo Verification Code
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginTop: '0.35rem' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '1.35rem', fontWeight: 800, letterSpacing: '6px', color: '#fde047' }}>
                    {otpDebugCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpCode(otpDebugCode);
                      showToast('Code auto-filled!', 'success');
                    }}
                    style={{
                      background: 'var(--primary-600)',
                      color: 'white',
                      border: 'none',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Auto-Fill
                  </button>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.7)', marginTop: '0.3rem' }}>
                  Demo institutional account simulation. Click Auto-Fill or enter code above.
                </div>
              </div>
            )}

            <form onSubmit={handleVerifyOtp}>
              <div className="login-form-group">
                <label className="login-form-label" htmlFor="otpCode" style={{ textAlign: 'center' }}>
                  6-Digit Email Verification Code
                </label>
                <input 
                  id="otpCode"
                  type="text"
                  maxLength={6}
                  className="login-input"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 581942"
                  style={{
                    letterSpacing: '5px',
                    fontWeight: 700,
                    fontSize: '1.25rem',
                    textAlign: 'center',
                  }}
                  autoFocus
                  required
                />
              </div>

              <Button 
                variant="accent" 
                size="lg" 
                type="submit" 
                disabled={busy || otpCode.trim().length < 6}
                style={{ width: '100%', marginTop: '0.5rem' }}
              >
                {busy ? 'Verifying Code...' : 'Authorize Device & Sign In'} <ArrowRight size={18} />
              </Button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', fontSize: '0.82rem' }}>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={busy || resendCooldown > 0}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: resendCooldown > 0 ? '#94a3b8' : 'var(--primary-300)',
                    cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontWeight: 600
                  }}
                >
                  <RefreshCw size={13} /> {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend Code'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsOtpStep(false);
                    setOtpCode('');
                    setError(null);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : isResetStep ? (
          /* =========================================================================
             STATE 2: RESET PASSWORD FLOW (Step 1 Request -> Step 2 Verify & Set)
          ========================================================================= */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.4rem', color: '#f59e0b' }}>
              <KeyRound size={24} />
              <h2 className="login-card-title" style={{ margin: 0, fontSize: '1.35rem' }}>
                Reset Password
              </h2>
            </div>
            <p className="login-card-subtitle" style={{ marginBottom: '1.1rem' }}>
              {resetStage === 'request' 
                ? 'Enter your institutional email or Student ID to receive a 6-digit reset code.' 
                : `Enter the 6-digit code sent to ${resetEmailHint} and choose a new password.`}
            </p>

            {resetStage === 'request' ? (
              <form onSubmit={handleRequestPasswordReset}>
                <div className="login-form-group">
                  <label className="login-form-label" htmlFor="resetIdentifier">
                    Email or Student ID
                  </label>
                  <input 
                    id="resetIdentifier"
                    type="text"
                    className="login-input"
                    value={resetIdentifier}
                    onChange={e => setResetIdentifier(e.target.value)}
                    placeholder="e.g. 20273710 or student@tcc.edu.ph"
                    autoFocus
                    required
                  />
                </div>

                <Button 
                  variant="accent" 
                  size="lg" 
                  type="submit" 
                  disabled={busy}
                  style={{ width: '100%', marginTop: '0.5rem' }}
                >
                  {busy ? 'Dispatching Code...' : 'Send 6-Digit Reset Code'} <ArrowRight size={18} />
                </Button>

                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetStep(false);
                      setError(null);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--neutral-300)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      textDecoration: 'underline'
                    }}
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCompletePasswordReset}>
                {resetDebugCode && (
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    borderRadius: '8px',
                    padding: '0.65rem 0.85rem',
                    marginBottom: '1rem',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.74rem', color: '#fef08a', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                      Institutional Demo Reset Code
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginTop: '0.35rem' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '1.35rem', fontWeight: 800, letterSpacing: '6px', color: '#fde047' }}>
                        {resetDebugCode}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setResetCode(resetDebugCode);
                          showToast('Reset code auto-filled!', 'success');
                        }}
                        style={{
                          background: 'var(--primary-600)',
                          color: 'white',
                          border: 'none',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Auto-Fill
                      </button>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.7)', marginTop: '0.3rem' }}>
                      Demo institutional account simulation. Click Auto-Fill or enter code below.
                    </div>
                  </div>
                )}

                <div className="login-form-group">
                  <label className="login-form-label" htmlFor="resetCode">
                    6-Digit Verification Code
                  </label>
                  <input 
                    id="resetCode"
                    type="text"
                    maxLength={6}
                    className="login-input"
                    value={resetCode}
                    onChange={e => setResetCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 581942"
                    style={{ letterSpacing: '4px', textAlign: 'center', fontWeight: 700 }}
                    autoFocus
                    required
                  />
                </div>

                <div className="login-form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label className="login-form-label" htmlFor="newPassword" style={{ margin: 0 }}>
                      New Password
                    </label>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        type="button"
                        onClick={handleGenerateResetPassword}
                        style={{
                          background: 'rgba(234, 179, 8, 0.15)',
                          color: '#fde047',
                          border: '1px solid rgba(234, 179, 8, 0.35)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                      >
                        <Sparkles size={11} /> Suggest Strong
                      </button>
                      {newPassword && (
                        <button
                          type="button"
                          onClick={handleCopyResetPassword}
                          style={{
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                        >
                          {copiedResetPwd ? <Check size={11} style={{ color: '#4ade80' }} /> : <Copy size={11} />}
                          {copiedResetPwd ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="password-input-wrap">
                    <input 
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      className="login-input"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      required
                    />
                    <button 
                      type="button" 
                      className="password-toggle-btn"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="login-form-group">
                  <label className="login-form-label" htmlFor="confirmPassword">
                    Confirm New Password
                  </label>
                  <input 
                    id="confirmPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    className="login-input"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-type new password"
                    required
                  />
                </div>

                <Button 
                  variant="accent" 
                  size="lg" 
                  type="submit" 
                  disabled={busy}
                  style={{ width: '100%', marginTop: '0.5rem' }}
                >
                  {busy ? 'Updating Password...' : 'Save New Password & Sign In'} <ArrowRight size={18} />
                </Button>

                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetStep(false);
                      setResetStage('request');
                      setError(null);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--neutral-300)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      textDecoration: 'underline'
                    }}
                  >
                    Cancel &amp; Return to Sign In
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* =========================================================================
             STATE 3: STANDARD LOGIN FORM
          ========================================================================= */
          <>
            <h1 className="login-card-title">Sign In</h1>
            <p className="login-card-subtitle">
              Tagoloan Community College LMS
            </p>

            <form onSubmit={handleLoginSubmit}>
              <div className="login-form-group">
                <label className="login-form-label" htmlFor="identifier">
                  Email or ID
                </label>
                <input 
                  id="identifier"
                  type="text"
                  className="login-input"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="e.g. 20273710 or teacher@tcc.edu.ph"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="login-form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label className="login-form-label" htmlFor="password" style={{ margin: 0 }}>
                    Password
                  </label>
                  <button 
                    type="button" 
                    className="forgot-password-link"
                    onClick={handleOpenForgotPassword}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="password-input-wrap">
                  <input 
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="login-input"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your account password"
                    autoComplete="current-password"
                    required
                  />
                  <button 
                    type="button" 
                    className="password-toggle-btn"
                    onClick={() => {
                      const next = !showPassword;
                      setShowPassword(next);
                      showToast(next ? 'Password visible.' : 'Password hidden.', 'info');
                    }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Math CAPTCHA security verification */}
              <div style={{ marginTop: '0.5rem' }}>
                <CaptchaVerification onVerified={setCaptchaVerified} />
              </div>

              <div className="login-checkbox-row">
                <label className="login-checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={remember} 
                    onChange={e => {
                      const checked = e.target.checked;
                      setRemember(checked);
                      showToast(checked ? 'Session will remain active on this device (30 days).' : 'Session will end when browser closes.', 'info');
                    }}
                    style={{ accentColor: 'var(--primary-400)', width: '16px', height: '16px' }}
                  />
                  <span>Keep me signed in</span>
                </label>
              </div>

              <Button 
                variant="accent" 
                size="lg" 
                type="submit" 
                disabled={busy || !captchaVerified}
                style={{ width: '100%', marginTop: '0.5rem' }}
              >
                {busy ? 'Authenticating...' : 'Sign In'} <ArrowRight size={18} />
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
