import { useState, useEffect, type ChangeEvent } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToastContext } from '../../contexts/ToastContext';

interface CaptchaVerificationProps {
  onVerified: (isValid: boolean) => void;
}

export default function CaptchaVerification({ onVerified }: CaptchaVerificationProps) {
  const { showToast } = useToastContext();
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [answer, setAnswer] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);

  const generateCaptcha = (notify = false) => {
    setNum1(Math.floor(Math.random() * 10) + 1);
    setNum2(Math.floor(Math.random() * 10) + 1);
    setAnswer('');
    setIsCorrect(null);
    onVerified(false);
    if (notify) {
      setIsSpinning(true);
      showToast('New security question generated.', 'info');
      setTimeout(() => setIsSpinning(false), 450);
    }
  };

  useEffect(() => {
    generateCaptcha(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAnswer(val);

    if (val === '') {
      setIsCorrect(null);
      onVerified(false);
      return;
    }

    const correct = parseInt(val, 10) === num1 + num2;
    if (correct && isCorrect !== true) {
      showToast('Security verification passed.', 'success');
    }
    setIsCorrect(correct);
    onVerified(correct);
  };

  return (
    <div className="login-form-group" style={{ marginBottom: '1.15rem', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.38rem' }}>
        <label className="login-form-label" htmlFor="security-question-input" style={{ margin: 0 }}>
          What is {num1} + {num2}?
        </label>
        {isCorrect === true && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.76rem', fontWeight: 600, color: '#81c784' }}>
            <CheckCircle2 size={13} /> Verified
          </span>
        )}
        {isCorrect === false && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.76rem', fontWeight: 600, color: '#ef9a9a' }}>
            <AlertCircle size={13} /> Try again
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <input
          id="security-question-input"
          type="number"
          inputMode="numeric"
          className="login-input"
          value={answer}
          onChange={handleChange}
          placeholder="Answer"
          style={{
            flex: 1,
            height: '44px',
            margin: 0,
            borderColor: isCorrect === true ? 'var(--success)' : isCorrect === false ? 'var(--error)' : undefined,
            boxShadow: isCorrect === true ? '0 0 0 2px rgba(67, 160, 71, 0.25)' : isCorrect === false ? '0 0 0 2px rgba(229, 57, 53, 0.25)' : undefined,
          }}
        />
        <button
          type="button"
          onClick={() => generateCaptcha(true)}
          title="Refresh security question"
          aria-label="Refresh security question"
          className="captcha-refresh-btn"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.22)',
            borderRadius: 'var(--radius-md)',
            height: '44px',
            width: '44px',
            minWidth: '44px',
            margin: 0,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 180ms ease',
          }}
        >
          <RefreshCw
            size={18}
            style={{
              transition: 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
              transform: isSpinning ? 'rotate(360deg)' : 'rotate(0deg)',
            }}
          />
        </button>
      </div>
    </div>
  );
}
