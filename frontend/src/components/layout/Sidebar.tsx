import type { UserRole } from '../../lib/types';
import { ROLE_CONFIGS } from '../../lib/constants';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { LogOut } from 'lucide-react';
import Badge from '../ui/Badge';

interface SidebarProps {
  role: UserRole;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ role, isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuthContext();
  const config = ROLE_CONFIGS[role];
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-brand">
        <img src="/assets/images/logo.png" alt="TCC Logo" />
        <div>
          <div className="sidebar-brand-text">TCC LMS</div>
          <Badge variant={config.badgeColor} className="mt-1" style={{ fontSize: '0.65rem' }}>
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
              <Icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
            {user?.initials || 'U'}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {user?.name || 'User'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {user?.email}
            </div>
          </div>
        </div>
        <button 
          onClick={handleLogout}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--neutral-200)', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
