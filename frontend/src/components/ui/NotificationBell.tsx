import { Bell } from 'lucide-react';

interface NotificationBellProps {
  unreadCount: number;
  onClick: () => void;
}

export default function NotificationBell({ unreadCount, onClick }: NotificationBellProps) {
  return (
    <button 
      type="button"
      onClick={onClick}
      className="topbar-icon-btn"
      aria-label="Notifications"
      title="Notifications"
    >
      <Bell size={18} />
      {unreadCount > 0 && (
        <span style={{
          position: 'absolute',
          top: '-3px',
          right: '-3px',
          background: 'var(--error)',
          color: '#ffffff',
          fontSize: '0.62rem',
          fontWeight: 700,
          minWidth: '16px',
          height: '16px',
          padding: '0 3px',
          borderRadius: '9999px',
          border: '1.5px solid #180408',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}>
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}
