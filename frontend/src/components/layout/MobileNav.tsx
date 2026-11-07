import { useState } from 'react';
import { Menu } from 'lucide-react';
import NotificationBell from '../ui/NotificationBell';
import NotificationPanel from '../ui/NotificationPanel';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToastContext } from '../../contexts/ToastContext';

interface MobileNavProps {
  onOpenSidebar: () => void;
  roleLabel: string;
}

export default function MobileNav({ onOpenSidebar, roleLabel }: MobileNavProps) {
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  const handleMarkRead = (id: number) => {
    markRead(id);
    showToast('Notification marked as read.', 'info');
  };

  const handleMarkAllRead = () => {
    markAllRead();
    showToast('All notifications marked as read.', 'success');
  };

  return (
    <div className="mobile-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
        <button 
          onClick={onOpenSidebar}
          aria-label="Open navigation menu"
          style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
        >
          <Menu size={24} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {roleLabel}
        </span>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ position: 'relative' }}>
          <NotificationBell 
            unreadCount={unreadCount} 
            onClick={() => setIsNotifOpen(!isNotifOpen)} 
          />
          <NotificationPanel 
            isOpen={isNotifOpen}
            onClose={() => setIsNotifOpen(false)}
            notifications={notifications}
            onMarkRead={handleMarkRead}
            onMarkAllRead={handleMarkAllRead}
          />
        </div>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.85rem', border: '1px solid var(--glass-border)' }}>
          {user?.initials || 'U'}
        </div>
      </div>
    </div>
  );
}
