import { useState } from 'react';
import { Search } from 'lucide-react';
import NotificationBell from '../ui/NotificationBell';
import NotificationPanel from '../ui/NotificationPanel';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuthContext } from '../../contexts/AuthContext';

interface TopbarProps {
  roleLabel: string;
}

export default function Topbar({ roleLabel }: TopbarProps) {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const { user } = useAuthContext();

  return (
    <header className="dashboard-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--neutral-300)' }}>
        <span>LNHS LMS</span>
        <span>/</span>
        <span style={{ color: 'white', fontWeight: 500 }}>{roleLabel}</span>
      </div>

      <div className="dashboard-header-right">
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', color: 'var(--neutral-400)' }} />
          <input 
            type="text" 
            placeholder="Search..." 
            style={{ 
              background: 'rgba(0,0,0,0.2)', 
              border: '1px solid var(--glass-border)', 
              borderRadius: 'var(--radius-full)', 
              padding: '0.375rem 1rem 0.375rem 2.25rem',
              color: 'white',
              fontSize: '0.875rem',
              width: '200px',
              outline: 'none'
            }} 
          />
        </div>

        <div style={{ position: 'relative' }}>
          <NotificationBell 
            unreadCount={unreadCount} 
            onClick={() => setIsNotifOpen(!isNotifOpen)} 
          />
          <NotificationPanel 
            isOpen={isNotifOpen}
            onClose={() => setIsNotifOpen(false)}
            notifications={notifications}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
          />
        </div>

        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', border: '2px solid var(--glass-border)' }}>
          {user?.initials || 'U'}
        </div>
      </div>
    </header>
  );
}
