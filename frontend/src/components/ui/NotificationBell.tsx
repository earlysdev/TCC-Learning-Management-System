import { Bell } from 'lucide-react';

interface NotificationBellProps {
  unreadCount: number;
  onClick: () => void;
}

export default function NotificationBell({ unreadCount, onClick }: NotificationBellProps) {
  return (
    <button 
      onClick={onClick}
      style={{
        position: 'relative',
        background: 'transparent',
        border: 'none',
        color: 'white',
        cursor: 'pointer',
        padding: '0.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Bell size={24} />
      {unreadCount > 0 && (
        <span style={{
          position: 'absolute',
          top: '2px',
          right: '2px',
          background: 'var(--error)',
          color: 'white',
          fontSize: '0.6rem',
          fontWeight: 'bold',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}
