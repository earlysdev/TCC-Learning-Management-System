import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import NotificationBell from '../ui/NotificationBell';
import NotificationPanel from '../ui/NotificationPanel';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToastContext } from '../../contexts/ToastContext';
import { deriveUserInitials } from '../../lmsApi';

interface TopbarProps {
  roleLabel: string;
}

export default function Topbar({ roleLabel }: TopbarProps) {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const navigate = useNavigate();

  const handleOpenProfile = () => {
    const roleSlug = user?.role === 'dean' ? 'dean' : (user?.role || 'student');
    if (roleSlug === 'developer') return;
    navigate(`/${roleSlug}/settings`);
  };

  const handleMarkRead = (id: number) => {
    markRead(id);
    showToast('Notification marked as read.', 'info');
  };

  const handleMarkAllRead = () => {
    markAllRead();
    showToast('All notifications marked as read.', 'success');
  };

  return (
    <header className="dashboard-header">
      <div className="topbar-breadcrumb">
        <span className="topbar-breadcrumb-brand">TCC LMS</span>
        <span className="topbar-breadcrumb-sep">/</span>
        <span className="topbar-breadcrumb-current">{roleLabel}</span>
      </div>

      <div className="dashboard-header-right">
        <div className="topbar-search-wrap">
          <Search size={15} className="topbar-search-icon" />
          <input 
            type="text" 
            placeholder="Search..." 
            className="topbar-search-input"
            aria-label="Search"
          />
        </div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
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

        <button
          type="button"
          onClick={handleOpenProfile}
          className="topbar-avatar-btn"
          title={user?.name || 'Account Profile'}
          aria-label="Open Account Profile"
        >
          {user?.profile_picture ? (
            <img src={user.profile_picture} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            deriveUserInitials(user?.name, user?.initials || 'U')
          )}
        </button>
      </div>
    </header>
  );
}
