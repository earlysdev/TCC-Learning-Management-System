import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import type { ToastType } from '../../hooks/useToast';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

export default function Toast({ message, type, onClose }: ToastProps) {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle size={19} style={{ color: '#4ade80', flexShrink: 0 }} />;
      case 'error':
        return <AlertCircle size={19} style={{ color: '#f87171', flexShrink: 0 }} />;
      case 'warning':
        return <AlertTriangle size={19} style={{ color: '#fbbf24', flexShrink: 0 }} />;
      default:
        return <Info size={19} style={{ color: '#60a5fa', flexShrink: 0 }} />;
    }
  };

  return (
    <div className={`toast toast-${type}`} role="status" aria-live="polite">
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, minWidth: 0 }}>
        {getIcon()}
        <p style={{ margin: 0, fontSize: '0.86rem', fontWeight: 500, color: '#f8fafc', lineHeight: 1.4, wordBreak: 'break-word' }}>
          {message}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss notification"
        style={{
          background: 'rgba(255, 255, 255, 0.06)',
          border: 'none',
          borderRadius: '6px',
          color: 'var(--neutral-300)',
          cursor: 'pointer',
          padding: '4px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
