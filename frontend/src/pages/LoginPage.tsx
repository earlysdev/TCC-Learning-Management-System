import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Eye, EyeOff, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { API_BASE } from '../lmsApi';
import CaptchaVerification from '../components/auth/CaptchaVerification';
import Button from '../components/ui/Button';

export default function LoginPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Invalid email/ID or password.');
      }

      if (data.token) {
        localStorage.removeItem('lms-token');
        localStorage.removeItem('lms-user');
        sessionStorage.removeItem('lms-token');
        sessionStorage.removeItem('lms-user');

        const storage = remember ? localStorage : sessionStorage;
        storage.setItem('lms-token', data.token);
        storage.setItem('lms-user', JSON.stringify(data.user));
      }

      const rawRole = String(data.user?.role || 'student').toLowerCase();
      const role = rawRole === 'principal' ? 'dean' : rawRole;
      navigate(`/${role}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to sign in. Please verify your connection.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!identifier) {
      setError('Please enter your email or ID first to request password reset instructions.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${API_BASE}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not request password reset.');
      setNotice(data.message || 'Reset instructions have been processed.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to request password reset.');
    } finally {
      setBusy(false);
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
        <h1 className="login-card-title">Sign In</h1>
        <p className="login-card-subtitle">
          Tagoloan Community College LMS
        </p>

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

        <form onSubmit={handleSubmit}>
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
                onClick={handleForgotPassword}
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
                onClick={() => setShowPassword(!showPassword)}
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
                onChange={e => setRemember(e.target.checked)}
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
            {busy ? 'Authenticating...' : 'Sign In to Workspace'} <ArrowRight size={18} />
          </Button>
        </form>
      </div>
    </div>
  );
}
