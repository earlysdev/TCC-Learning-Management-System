import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { lmsFetch, getLmsUser, extractCollection } from '../../lmsApi';
import type { User, Quiz, SecurityLog, ActivityLog, PaginatedResponse, Announcement } from '../../lib/types';
import { 
  Users, ShieldCheck, AlertTriangle, TrendingUp, 
  CheckCircle2, AlertCircle, 
  Check, Activity, Send
} from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import ProfileUpdateCard from '../../components/ui/ProfileUpdateCard';

interface DeanMetrics {
  active_users: number;
  quiz_completion: number;
  avg_performance: number;
  security_alerts: number;
}

const pathToSection: Record<string, string> = {
  dashboard: 'overview',
  overview: 'overview',
  users: 'user_management',
  user_management: 'user_management',
  records: 'user_management',
  quizzes: 'quiz_oversight',
  quiz_oversight: 'quiz_oversight',
  security: 'security',
  analytics: 'analytics',
  logs: 'activity_logs',
  activity_logs: 'activity_logs',
  settings: 'settings',
};

const sectionToPath: Record<string, string> = {
  overview: '/dean/dashboard',
  user_management: '/dean/users',
  quiz_oversight: '/dean/quizzes',
  security: '/dean/security',
  analytics: '/dean/analytics',
  activity_logs: '/dean/logs',
  settings: '/dean/settings',
};

export default function PrincipalDashboard() {
  const user = getLmsUser();
  const { subpage } = useParams<{ subpage?: string }>();
  const navigate = useNavigate();
  const initialSection = subpage ? (pathToSection[subpage] || 'overview') : 'overview';
  const [activeSection, setActiveSection] = useState(initialSection);
  const [metrics, setMetrics] = useState<DeanMetrics>({
    active_users: 0,
    quiz_completion: 0,
    avg_performance: 0,
    security_alerts: 0,
  });
  const [usersList, setUsersList] = useState<User[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [securityLogs, setSecurityLogs] = useState<SecurityLog[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Filters
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const loadDeanData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await lmsFetch<{ data?: Record<string, number> } & Record<string, number>>('/dean/dashboard').catch(() => null);
      const d = res?.data || res || {};
      setMetrics({
        active_users: Number(d.active_users ?? 0),
        quiz_completion: Number(d.quiz_completion ?? 0),
        avg_performance: Number(d.average_score_percentage ?? d.avg_performance ?? 0),
        security_alerts: Number(d.unresolved_security_alerts ?? d.security_alerts ?? 0),
      });

      const allUsers = await lmsFetch<PaginatedResponse<User> | { data?: { data?: User[] } | User[] } | User[]>('/users').catch(() => []);
      setUsersList(extractCollection<User>(allUsers));

      const secLogs = await lmsFetch<unknown>('/dean/security-logs').catch(() => []);
      setSecurityLogs(extractCollection<SecurityLog>(secLogs));

      const actLogs = await lmsFetch<unknown>('/activity-logs').catch(() => []);
      setActivityLogs(extractCollection<ActivityLog>(actLogs));

      const annData = await lmsFetch<unknown>('/announcements').catch(() => []);
      setAnnouncements(extractCollection<Announcement>(annData));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dean dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const loadQuizzes = async () => {
    try {
      const data = await lmsFetch<{ quizzes: Quiz[] }>('/teacher/dashboard').catch(() => ({ quizzes: [] }));
      setQuizzes(data.quizzes || []);
    } catch {
      // Optional
    }
  };

  useEffect(() => {
    loadDeanData();
    loadQuizzes();
  }, []);

  useEffect(() => {
    if (subpage && pathToSection[subpage]) {
      setActiveSection(pathToSection[subpage]);
    }
  }, [subpage]);

  const handleResolveSecurityLog = async (logId: number) => {
    setBusy(true);
    setError(null);
    try {
      await lmsFetch(`/security-logs/${logId}/resolve`, { method: 'PATCH' });
      setNotice('Security log marked as resolved.');
      setSecurityLogs(prev => prev.map(l => l.id === logId ? { ...l, is_resolved: true, resolved_at: new Date().toISOString() } : l));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resolve security log');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleUserStatus = async (targetUser: User, newStatus: string) => {
    setBusy(true);
    setError(null);
    try {
      await lmsFetch(`/users/${targetUser.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setNotice(`Updated ${targetUser.name}'s status to ${newStatus}.`);
      await loadDeanData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update user status');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementTitle.trim() || !announcementContent.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await lmsFetch('/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: announcementTitle.trim(),
          content: announcementContent.trim(),
          target_role: null,
          is_pinned: true,
        }),
      });
      setAnnouncementTitle('');
      setAnnouncementContent('');
      setNotice('Campus-wide announcement broadcasted to all portals and notification bells.');
      await loadDeanData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not broadcast announcement');
    } finally {
      setBusy(false);
    }
  };

  const filteredUsers = usersList.filter(u => {
    const q = userSearch.toLowerCase();
    const matchesSearch = !userSearch || 
      u.name.toLowerCase().includes(q) || 
      u.email.toLowerCase().includes(q) ||
      (u.lrn || '').toLowerCase().includes(q) ||
      (u.section || '').toLowerCase().includes(q);
    const matchesRole = !roleFilter || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const renderOverview = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--error)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
            DEAN EXECUTIVE OVERSIGHT
          </span>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
            Welcome, Dean {user?.name || ''}!
          </h1>
          <p style={{ color: 'var(--neutral-300)', marginTop: '0.25rem' }}>
            Tagoloan Community College administrative command, proctoring surveillance, and institutional analytics.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="outline" onClick={() => handleSectionChange('security')}>
            <ShieldCheck size={16} /> Security Audit
          </Button>
          <Button variant="accent" onClick={() => handleSectionChange('analytics')}>
            <TrendingUp size={16} /> School Analytics
          </Button>
        </div>
      </div>

      {notice && (
        <div style={{ background: 'rgba(67, 160, 71, 0.2)', border: '1px solid var(--success)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#c8e6c9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} /> {notice}
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239, 83, 80, 0.2)', border: '1px solid var(--error)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#ffcdd2', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        <StatCard label="Active LMS Users" value={loading ? '…' : (metrics.active_users || usersList.length)} icon={<Users size={24} />} detail="Staff and learners" />
        <StatCard label="Quiz Completion" value={loading ? '…' : `${metrics.quiz_completion}%`} icon={<TrendingUp size={24} />} detail="Overall completion rate" />
        <StatCard label="Avg Performance" value={loading ? '…' : `${metrics.avg_performance}%`} icon={<Activity size={24} />} detail="College composite score" />
        <StatCard 
          label="Security Alerts" 
          value={loading ? '…' : securityLogs.filter(l => !l.is_resolved).length} 
          icon={<AlertTriangle size={24} />} 
          detail={securityLogs.filter(l => !l.is_resolved).length > 0 ? 'Requires review' : 'All clear'} 
        />
      </div>

      {/* Campus-Wide Announcement Broadcasting (LMSWO-00038) */}
      <GlassCard>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white', marginBottom: '0.25rem' }}>
          Campus-Wide Announcement Broadcast
        </h3>
        <p style={{ color: 'var(--neutral-300)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Publish an official TCC announcement to student and faculty dashboards and trigger real-time notification bells.
        </p>
        <form onSubmit={handleCreateAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <Input
            label="Announcement Title"
            placeholder="e.g., Midterm BSIT Online Examination Schedule"
            value={announcementTitle}
            onChange={(e) => setAnnouncementTitle(e.target.value)}
            required
          />
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--neutral-200)', marginBottom: '0.4rem' }}>
              Announcement Message
            </label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Write the official campus announcement message..."
              value={announcementContent}
              onChange={(e) => setAnnouncementContent(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
              required
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="submit" variant="primary" disabled={busy}>
              <Send size={15} /> {busy ? 'Broadcasting...' : 'Broadcast Announcement'}
            </Button>
          </div>
        </form>

        {announcements.length > 0 && (
          <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 700 }}>
              Recent Campus Announcements ({announcements.length})
            </div>
            {announcements.slice(0, 3).map((ann) => (
              <div key={ann.id} style={{ background: 'rgba(255,255,255,0.04)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--primary-400)' }}>
                <div style={{ fontWeight: 600, color: 'white', fontSize: '0.9rem' }}>{ann.title}</div>
                <div style={{ color: 'var(--neutral-300)', fontSize: '0.82rem', marginTop: '0.2rem' }}>{ann.content}</div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );

  const renderUserManagement = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          PERSONNEL & DIRECTORY
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          User Management
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          School-wide directory of administrative staff, teachers, and learners.
        </p>
      </div>

      {notice && (
        <div style={{ background: 'rgba(67, 160, 71, 0.2)', border: '1px solid var(--success)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#c8e6c9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} /> {notice}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <Input 
            placeholder="Search by name, email, ID (e.g. 20273710), or Block..."
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
          />
        </div>
        <div style={{ width: '180px' }}>
          <Select 
            value={roleFilter} 
            onChange={setRoleFilter}
            options={[
              { value: '', label: 'All Roles' },
              { value: 'student', label: 'Students' },
              { value: 'teacher', label: 'Teachers' },
              { value: 'secretary', label: 'Secretaries' },
              { value: 'dean', label: 'Deans' }
            ]}
          />
        </div>
      </div>

      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive" style={{ margin: 0 }}>
          <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left', color: 'white', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid var(--glass-border)' }}>
              <th style={{ padding: '0.85rem 1.25rem' }}>Name</th>
              <th style={{ padding: '0.85rem 1.25rem' }}>Role</th>
              <th style={{ padding: '0.85rem 1.25rem' }}>Email / ID</th>
              <th style={{ padding: '0.85rem 1.25rem' }}>Block</th>
              <th style={{ padding: '0.85rem 1.25rem' }}>Status</th>
              <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--neutral-400)' }}>
                  No users found matching your filters.
                </td>
              </tr>
            ) : (
              filteredUsers.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.85rem 1.25rem', fontWeight: 600 }}>{u.name}</td>
                  <td style={{ padding: '0.85rem 1.25rem' }}>
                    <Badge variant={u.role === 'dean' ? 'error' : u.role === 'teacher' ? 'primary' : u.role === 'secretary' ? 'warning' : 'success'}>
                      {u.role.toUpperCase()}
                    </Badge>
                  </td>
                  <td style={{ padding: '0.85rem 1.25rem', color: 'var(--neutral-300)' }}>
                    <div>{u.email}</div>
                    {u.lrn && <div style={{ fontSize: '0.78rem', color: 'var(--neutral-400)', fontFamily: 'monospace' }}>ID: {u.lrn}</div>}
                  </td>
                  <td style={{ padding: '0.85rem 1.25rem', color: 'var(--neutral-300)' }}>
                    {u.section ? `${u.section}${u.grade ? ` (${u.grade})` : ''}` : '—'}
                  </td>
                  <td style={{ padding: '0.85rem 1.25rem' }}>
                    <Badge variant={u.status === 'inactive' ? 'warning' : 'success'}>
                      {u.status || 'Active'}
                    </Badge>
                  </td>
                  <td style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>
                    <select
                      value={u.status || 'active'}
                      onChange={e => handleToggleUserStatus(u, e.target.value)}
                      disabled={busy}
                      style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid var(--glass-border)',
                        color: 'white',
                        padding: '0.25rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="active" style={{ background: '#1a1a2e' }}>Set Active</option>
                      <option value="inactive" style={{ background: '#1a1a2e' }}>Set Inactive</option>
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </GlassCard>
    </div>
  );

  const renderQuizOversight = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          CURRICULUM OVERSIGHT
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Quiz Oversight
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Review all instructional assessments and quizzes prepared across all academic departments.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {quizzes.length === 0 ? (
          <GlassCard style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ color: 'var(--neutral-300)' }}>No faculty quizzes currently on record.</p>
          </GlassCard>
        ) : (
          quizzes.map(quiz => (
            <GlassCard key={quiz.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <Badge variant="primary">{quiz.subject}</Badge>
                    <span style={{ fontSize: '0.85rem', color: 'var(--neutral-300)' }}>{quiz.topic}</span>
                    <Badge variant={quiz.is_published ? 'success' : 'warning'}>
                      {quiz.is_published ? 'Published' : 'Draft'}
                    </Badge>
                  </div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>{quiz.title}</h3>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white' }}>
                    {quiz.attempts_count || 0} Submissions • {quiz.average || 0}% Avg
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--neutral-400)' }}>
                    {quiz.question_count} Questions total
                  </span>
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </div>
    </div>
  );

  const renderSecurity = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--error)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          SECURITY SURVEILLANCE
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Security & Access Logs
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Monitor authentication events, failed logins, and suspicious activities.
        </p>
      </div>

      {notice && (
        <div style={{ background: 'rgba(67, 160, 71, 0.2)', border: '1px solid var(--success)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#c8e6c9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} /> {notice}
        </div>
      )}

      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive" style={{ margin: 0 }}>
          <table style={{ width: '100%', minWidth: '650px', borderCollapse: 'collapse', textAlign: 'left', color: 'white', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid var(--glass-border)' }}>
              <th style={{ padding: '0.75rem 1rem' }}>Event Type</th>
              <th style={{ padding: '0.75rem 1rem' }}>User</th>
              <th style={{ padding: '0.75rem 1rem' }}>IP Address</th>
              <th style={{ padding: '0.75rem 1rem' }}>Timestamp</th>
              <th style={{ padding: '0.75rem 1rem' }}>Status</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {securityLogs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--neutral-400)' }}>
                  No security events on record. System secure.
                </td>
              </tr>
            ) : (
              securityLogs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: log.event_type.includes('fail') ? '#ef5350' : '#66bb6a' }}>
                    {log.event_type}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{log.user?.name || `User #${log.user_id || 'Unknown'}`}</td>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>{log.ip_address || '127.0.0.1'}</td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--neutral-400)' }}>
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Badge variant={log.is_resolved ? 'success' : 'error'}>
                      {log.is_resolved ? 'Resolved' : 'Pending Review'}
                    </Badge>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    {!log.is_resolved && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        disabled={busy}
                        onClick={() => handleResolveSecurityLog(log.id)}
                      >
                        <Check size={14} /> Resolve
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </GlassCard>
    </div>
  );

  const renderAnalytics = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          INSTITUTIONAL METRICS
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          School-Wide Analytics
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Comprehensive statistics on student participation, faculty engagement, and curriculum progress.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        <StatCard label="Registered Learners" value={usersList.filter(u => u.role === 'student').length} icon={<Users size={24} />} detail="Total student body" />
        <StatCard label="Faculty Teachers" value={usersList.filter(u => u.role === 'teacher').length} icon={<Users size={24} />} detail="Active educators" />
        <StatCard label="Assessments Built" value={quizzes.length} icon={<Activity size={24} />} detail="Published quizzes" />
      </div>
    </div>
  );

  const renderActivityLogs = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          SYSTEM AUDITING
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Activity Log Master Audit
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Complete log of events across students, teachers, secretaries, and system services.
        </p>
      </div>

      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive" style={{ margin: 0 }}>
          <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left', color: 'white', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid var(--glass-border)' }}>
              <th style={{ padding: '0.75rem 1rem' }}>Action</th>
              <th style={{ padding: '0.75rem 1rem' }}>User</th>
              <th style={{ padding: '0.75rem 1rem' }}>Description</th>
              <th style={{ padding: '0.75rem 1rem' }}>IP Address</th>
              <th style={{ padding: '0.75rem 1rem' }}>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {activityLogs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--neutral-400)' }}>
                  No logs available.
                </td>
              </tr>
            ) : (
              activityLogs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--primary-300)' }}>{log.action}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{log.user?.name || `User #${log.user_id || 'System'}`}</td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--neutral-300)' }}>{log.description || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>{log.ip_address || '127.0.0.1'}</td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--neutral-400)' }}>
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </GlassCard>
    </div>
  );

  const renderSettings = () => (
    <div style={{ maxWidth: '650px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--error)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          EXECUTIVE CREDENTIALS
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Dean Profile
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          College executive leadership credentials at Tagoloan Community College.
        </p>
      </div>

      <GlassCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--error), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800, color: 'white' }}>
            {user?.initials || 'D'}
          </div>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'white' }}>{user?.name || 'College Dean'}</h2>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <Badge variant="error">College Dean</Badge>
              <Badge variant="success">Active</Badge>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Email Address</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              {user?.email || 'dean@tcc.edu.ph'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Office</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              Office of the Dean
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Institution</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              Tagoloan Community College
            </div>
          </div>
        </div>
      </GlassCard>

      <ProfileUpdateCard />
    </div>
  );

  const handleSectionChange = (sectionId: string) => {
    setActiveSection(sectionId);
    const path = sectionToPath[sectionId] || '/dean/dashboard';
    navigate(path, { replace: true });
  };

  return (
    <DashboardLayout role="dean">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', minWidth: 0 }}>
        {activeSection === 'overview' && renderOverview()}
        {activeSection === 'user_management' && renderUserManagement()}
        {activeSection === 'quiz_oversight' && renderQuizOversight()}
        {activeSection === 'security' && renderSecurity()}
        {activeSection === 'analytics' && renderAnalytics()}
        {activeSection === 'activity_logs' && renderActivityLogs()}
        {activeSection === 'settings' && renderSettings()}
      </div>
    </DashboardLayout>
  );
}
