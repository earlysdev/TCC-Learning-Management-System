import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import StudentDashboard from './pages/student/StudentDashboard';
import StudentQuizTakePage from './pages/student/StudentQuizTakePage';
import TeacherDashboard from './pages/teacher/TeacherDashboard';
import SecretaryDashboard from './pages/secretary/SecretaryDashboard';
import PrincipalDashboard from './pages/principal/PrincipalDashboard';
import NotFoundPage from './pages/NotFoundPage';
import { getLmsToken, lmsFetch, signOut } from './lmsApi';

class ErrorBoundary extends Component<
  { children: ReactNode; fallbackTitle?: string },
  { hasError: boolean; error: Error | null }
> {
  state: { hasError: boolean; error: Error | null } = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ maxWidth: '520px', width: '100%', textAlign: 'center', background: 'rgba(26, 16, 43, 0.9)', border: '1px solid rgba(239, 83, 80, 0.4)', borderRadius: '1rem', padding: '2rem', color: 'white' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              {this.props.fallbackTitle || 'Something went wrong'}
            </h2>
            <p style={{ color: 'var(--neutral-300, #cbd5e1)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
              {this.state.error?.message || 'An unexpected error occurred while rendering this section.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '0.6rem 1.4rem', borderRadius: '0.5rem', background: 'var(--accent-purple, #7c3aed)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}


const validRoles = ['student', 'teacher', 'secretary', 'principal', 'dean', 'developer'];

function ProtectedRole({ expected, children }: { expected?: string; children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!getLmsToken()) {
      navigate('/login', { replace: true, state: { from: location.pathname } });
      return () => { mounted = false; };
    }

    void lmsFetch<{ user: { role: string } }>('/me')
      .then(({ user }) => {
        if (!mounted) return;
        const userRole = user.role;
        const matches = !expected || (expected === userRole) ||
          ((expected === 'principal' || expected === 'dean') && (userRole === 'principal' || userRole === 'dean'));

        if (!matches) {
          const targetPath = (userRole === 'principal' || userRole === 'dean') ? '/dean' : `/${userRole}`;
          navigate(targetPath, { replace: true });
          return;
        }
        setVerified(true);
      })
      .catch(() => {
        if (mounted) {
          void signOut();
          navigate('/login', { replace: true });
        }
      });

    return () => { mounted = false; };
  }, [expected, location.pathname, navigate]);

  return verified ? (
    <>{children}</>
  ) : (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1.1rem' }}>
      Verifying secure session…
    </div>
  );
}

function ProtectedRolePage() {
  const { role } = useParams<{ role: string }>();

  if (!role || !validRoles.includes(role)) {
    return <NotFoundPage />;
  }

  let dashboardNode: ReactNode = <NotFoundPage />;

  if (role === 'student') {
    dashboardNode = (
      <ProtectedRole expected="student">
        <StudentDashboard />
      </ProtectedRole>
    );
  } else if (role === 'teacher') {
    dashboardNode = (
      <ProtectedRole expected="teacher">
        <TeacherDashboard />
      </ProtectedRole>
    );
  } else if (role === 'secretary') {
    dashboardNode = (
      <ProtectedRole expected="secretary">
        <SecretaryDashboard />
      </ProtectedRole>
    );
  } else if (role === 'principal' || role === 'dean' || role === 'developer') {
    dashboardNode = (
      <ProtectedRole expected="principal">
        <PrincipalDashboard />
      </ProtectedRole>
    );
  }

  return (
    <ErrorBoundary fallbackTitle="Dashboard Error">
      {dashboardNode}
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/student/quizzes/:quizId/take"
        element={(
          <ProtectedRole expected="student">
            <StudentQuizTakePage />
          </ProtectedRole>
        )}
      />
      <Route path="/:role" element={<ProtectedRolePage />} />
      <Route path="/:role/:subpage" element={<ProtectedRolePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
                             