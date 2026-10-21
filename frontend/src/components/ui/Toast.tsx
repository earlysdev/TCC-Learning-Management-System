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
      case 'success': return <CheckCircle color="var(--success)" />;
      case 'error': return <AlertCircle color="var(--error)" />;
      case 'warning': return <AlertTriangle color="var(--warning)" />;
      default: return <Info color="var(--info)" />;
    }
  };

  return (
    <div className={`toast toast-${type}`}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flex: 1 }}>
        {getIcon()}
        <p style={{ margin: 0, fontSize: '0.875rem' }}>{message}</p>
      </div>
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--neutral-400)', cursor: 'pointer', padding: 0 }}>
        <X size={16} />
      </button>
    </div>
  );
}
