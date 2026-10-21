import { useState, useRef, useEffect, type KeyboardEvent, type ClipboardEvent, type FormEvent } from 'react';
import Button from '../ui/Button';

interface OtpVerificationProps {
  emailHint: string;
  onVerify: (code: string) => void;
  onResend: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function OtpVerification({ emailHint, onVerify, onResend, onCancel, isLoading }: OtpVerificationProps) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [cooldown, setCooldown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (cooldown > 0) {
      timer = setInterval(() => setCooldown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-advance
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text/plain').slice(0, 6);
    if (!/^\d+$/.test(pastedData)) return;

    const newOtp = [...otp];
    for (let i = 0; i < pastedData.length; i++) {
      newOtp[i] = pastedData[i];
    }
    setOtp(newOtp);
    
    const nextIndex = Math.min(pastedData.length, 5);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleResendClick = () => {
    if (cooldown === 0) {
      onResend();
      setCooldown(60);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length === 6) {
      onVerify(code);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ textAlign: 'center' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Two-Step Verification</h2>
      <p style={{ color: 'var(--neutral-300)', marginBottom: '2rem', fontSize: '0.875rem' }}>
        We sent a 6-digit verification code to<br/>
        <strong>{emailHint}</strong>
      </p>

      <div className="otp-container" style={{ marginBottom: '2rem' }}>
        {otp.map((digit, idx) => (
          <input
            key={idx}
            ref={el => { inputRefs.current[idx] = el; }}
            type="text"
            maxLength={1}
            value={digit}
            onChange={e => handleChange(idx, e.target.value)}
            onKeyDown={e => handleKeyDown(idx, e)}
            onPaste={handlePaste}
            className="form-input otp-digit"
          />
        ))}
      </div>

      <Button 
        type="submit" 
        variant="primary" 
        size="lg" 
        style={{ width: '100%', marginBottom: '1rem' }}
        disabled={otp.join('').length !== 6 || isLoading}
        isLoading={isLoading}
      >
        Verify Account
      </Button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.5rem' }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--neutral-300)', margin: 0 }}>
          Didn't receive the code?{' '}
          <button 
            type="button"
            onClick={handleResendClick}
            disabled={cooldown > 0}
            style={{ 
              background: 'none', border: 'none', color: cooldown > 0 ? 'var(--neutral-500)' : 'var(--primary-300)', 
              fontWeight: 600, cursor: cooldown > 0 ? 'not-allowed' : 'pointer', textDecoration: 'underline' 
            }}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend now'}
          </button>
        </p>
        
        <button 
          type="button" 
          onClick={onCancel}
          style={{ background: 'none', border: 'none', color: 'var(--neutral-400)', fontSize: '0.875rem', cursor: 'pointer', marginTop: '1rem' }}
        >
          ← Back to login
        </button>
      </div>
    </form>
  );
}
