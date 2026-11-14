import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}

export default function Modal({ isOpen, onClose, title, subtitle, children, footer, maxWidth }: ModalProps) {
  const titleId = useId();

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-content slide-in-up"
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
          ...(maxWidth ? { maxWidth } : {}),
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            padding: '1.15rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(24, 4, 8, 0.98)',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 id={titleId} style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </h2>
            {subtitle && (
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.75)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div
          style={{
            padding: '1.5rem',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          {children}
        </div>
        {footer && (
          <div
            style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(24, 4, 8, 0.98)',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '0.75rem',
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
