import type { LmsNotification } from '../../lib/types';
import { Check, X } from 'lucide-react';

interface NotificationPanelProps {
  notifications: LmsNotification[];
  isOpen: boolean;
  onClose: () => void;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
}

export default function NotificationPanel({ notifications, isOpen, onClose, onMarkRead, onMarkAllRead }: NotificationPanelProps) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '100%',
      right: '0',
      marginTop: '0.5rem',
      width: 'min(320px, calc(100vw - 2rem))',
      background: 'var(--glass-bg-dark)',
      backdropFilter: 'var(--glass-blur)',
      border: '1px solid var(--glass-border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-xl)',
      zIndex: 50,
      maxHeight: '400px',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid var(--glass-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: 'white' }}>Notifications</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={onMarkAllRead} style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--primary-300)',
            fontSize: '0.75rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}>
            <Check size={14} /> Mark read
          </button>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--neutral-400)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {notifications.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--neutral-400)', fontSize: '0.875rem' }}>
            No notifications
          </div>
        ) : (
          notifications.map(notif => (
            <div
              key={notif.id}
              onClick={() => onMarkRead(notif.id)}
              style={{
                padding: '1rem',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                background: notif.is_read ? 'transparent' : 'rgba(255,255,255,0.05)',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            >
              <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', color: notif.is_read ? 'var(--neutral-200)' : 'white' }}>
                {notif.title}
              </h4>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--neutral-400)' }}>
                {notif.message}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
