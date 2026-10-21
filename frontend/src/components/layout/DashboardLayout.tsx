import { useState } from 'react';
import type { UserRole } from '../../lib/types';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileNav from './MobileNav';
import { ROLE_CONFIGS } from '../../lib/constants';
import { useAuthContext } from '../../contexts/AuthContext';
import { useIdleTimeout } from '../../hooks/useIdleTimeout';
import SessionTimeoutModal from '../security/SessionTimeoutModal';

interface DashboardLayoutProps {
  role?: UserRole;
  children: React.ReactNode;
}

export default function DashboardLayout({ role, children }: DashboardLayoutProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { user, logout } = useAuthContext();
  const activeRole: UserRole = role || user?.role || 'student';
  const config = ROLE_CONFIGS[activeRole] || ROLE_CONFIGS.student;

  const { showWarning, remainingSeconds, stayActive } = useIdleTimeout({
    role: activeRole,
    onTimeout: () => logout(),
    timeoutMinutes: 10,
    warningMinutes: 9,
  });

  return (
    <div className="dashboard-layout fade-in">
      {/* Session Timeout Warning Modal for Students */}
      <SessionTimeoutModal 
        isOpen={showWarning}
        remainingSeconds={remainingSeconds}
        onStayLoggedIn={stayActive}
        onSignOut={logout}
      />

      {/* Mobile Sidebar Overlay */}
      <div 
        className={`sidebar-overlay ${isMobileSidebarOpen ? 'open' : ''}`}
        onClick={() => setIsMobileSidebarOpen(false)}
      />

      {/* Sidebar */}
      <Sidebar 
        role={activeRole} 
        isOpen={isMobileSidebarOpen} 
        onClose={() => setIsMobileSidebarOpen(false)} 
      />

      {/* Main Content */}
      <div className="main-content">
        <MobileNav 
          onOpenSidebar={() => setIsMobileSidebarOpen(true)} 
          roleLabel={config.label}
        />
        
        <Topbar roleLabel={config.label} />
        
        <main className="dashboard-body">
          {children}
        </main>
      </div>
    </div>
  );
}
