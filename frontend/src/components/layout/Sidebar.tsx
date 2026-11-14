import type { UserRole } from '../../lib/types';
import { ROLE_CONFIGS } from '../../lib/constants';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToastContext } from '../../contexts/ToastContext';
import { deriveUserInitials } from '../../lmsApi';
import { LogOut } from 'lucide-react';
import Badge from '../ui/Badge';

interface SidebarProps {
  role: UserRole;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ role, isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuthContext();
  const { showToast } = useToastContext();
  const config = ROLE_CONFIGS[role];
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    showToast('You have signed out safely.', 'info');
    navigate('/login');
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-brand">
        <img src="/assets/images/logo.png" alt="TCC Logo" />
        <div style={{ minWidth: 0 }}>
          <div className="sidebar-brand-text">TCC LMS</div>
          <Badge variant={config.badgeColor} className="mt-1" style={{ fontSize: '0.64rem', padding: '0.16rem 0.52rem' }}>
            {config.label}
          </Badge>
        </div>
      </div>

      <nav className="sidebar-nav no-scrollbar">
        <div className="sidebar-nav-label">WORKSPACE</div>
        {config.navItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <NavLink 
              key={idx}
              to={item.path}
              className={({ isActive }) => `sidebar-item ${isActive ? 'sidebar-item-active' : ''}`}
              onClick={() => {
                if (window.innerWidth <= 1024) onClose();
              }}
            >
              <span className="sidebar-item-icon">
                <Icon size={18} />
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user-card">
          <div className="sidebar-user-avatar">
            {user?.profile_picture ? (
              <img src={user.profile_picture} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              deriveUserInitials(user?.name, user?.initials || 'U')
            )}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">
              {user?.name || 'User'}
            </div>
            <div className="sidebar-user-role" style={{ textTransform: 'none', color: 'var(--neutral-400)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.email}
            </div>
          </div>
        </div>
        <button 
          type="button"
          onClick={handleLogout}
          className="sidebar-logout-btn"
        >
          <LogOut size={15} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
