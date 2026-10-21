import { useState, useEffect, type ChangeEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import Input from '../ui/Input';

interface CaptchaVerificationProps {
  onVerified: (isValid: boolean) => void;
}

export default function CaptchaVerification({ onVerified }: CaptchaVerificationProps) {
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [answer, setAnswer] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const generateCaptcha = () => {
    setNum1(Math.floor(Math.random() * 10) + 1);
    setNum2(Math.floor(Math.random() * 10) + 1);
    setAnswer('');
    setIsCorrect(null);
    onVerified(false);
  };

  useEffect(() => {
    generateCaptcha();
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
    setIsCorrect(correct);
    onVerified(correct);
  };

  let inputClass = '';
  if (isCorrect === true) inputClass = '!border-success';
  if (isCorrect === false) inputClass = '!border-error';

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', marginBottom: '1rem' }}>
      <div style={{ flex: 1 }}>
        <Input
          label={`What is ${num1} + ${num2}?`}
          type="number"
          value={answer}
          onChange={handleChange}
          placeholder="Answer"
          className={inputClass}
          style={{ borderColor: isCorrect === true ? 'var(--success)' : isCorrect === false ? 'var(--error)' : undefined }}
        />
      </div>
      <button 
        type="button" 
        onClick={generateCaptcha}
        style={{ 
          background: 'rgba(255,255,255,0.1)', 
          border: '1px solid var(--glass-border)', 
          borderRadius: 'var(--radius-md)', 
          height: '42px', 
          width: '42px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: 'white',
          cursor: 'pointer',
          marginBottom: '1rem'
        }}
      >
        <RefreshCw size={18} />
      </button>
    </div>
  );
}
