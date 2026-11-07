import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { lmsFetch, getLmsUser, extractCollection } from '../../lmsApi';
import type { User, Quiz, SecurityLog, ActivityLog, PaginatedResponse, Announcement, Section } from '../../lib/types';
import {
  YEAR_LEVEL_BLOCKS,
  YEAR_LEVEL_OPTIONS,
  getYearLevelFromBlock,
} from '../../lib/constants';
import { 
  Users, ShieldCheck, AlertTriangle, TrendingUp, 
  CheckCircle2, AlertCircle, 
  Check, Activity, Send, GraduationCap, Layers
} from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import ProfileUpdateCard from '../../components/ui/ProfileUpdateCard';
import { useToastContext } from '../../contexts/ToastContext';

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
  staff: 'user_management',
  students: 'student_management',
  student_management: 'student_management',
  records: 'student_management',
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
  student_management: '/dean/students',
  quiz_oversight: '/dean/quizzes',
  security: '/dean/security',
  analytics: '/dean/analytics',
  activity_logs: '/dean/logs',
  settings: '/dean/settings',
};

export default function PrincipalDashboard() {
  const user = getLmsUser();
  const { showToast } = useToastContext();
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
  const [sectionsList, setSectionsList] = useState<Section[]>([]);
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

  // LMSWO-00067: Separate Staff User Management filters (Teachers & Secretaries only, excluding Dean)
  const [staffSearch, setStaffSearch] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState<'' | 'teacher' | 'secretary'>('');
  const [staffStatusFilter, setStaffStatusFilter] = useState('');

  // LMSWO-00067: Separate Student Management filters (Students with Section & Year Level)
  const [studentSearch, setStudentSearch] = useState('');
  const [studentYearFilter, setStudentYearFilter] = useState('');
  const [studentSectionFilter, setStudentSectionFilter] = useState('');
  const [studentStatusFilter, setStudentStatusFilter] = useState('');

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

      const allUsers = await lmsFetch<PaginatedResponse<User> | { data?: { data?: User[] } | User[] } | User[]>('/users?per_page=500').catch(() => []);
      setUsersList(extractCollection<User>(allUsers));

      const secData = await lmsFetch<unknown>('/sections').catch(() => []);
      setSectionsList(extractCollection<Section>(secData));

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
      const msg = 'Security log marked as resolved.';
      setNotice(msg);
      showToast(msg, 'success');
      setSecurityLogs(prev => prev.map(l => l.id === logId ? { ...l, is_resolved: true, resolved_at: new Date().toISOString() } : l));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not resolve security log';
      setError(msg);
      showToast(msg, 'error');
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
      const msg = `Updated ${targetUser.name}'s status to ${newStatus}.`;
      setNotice(msg);
      showToast(msg, 'success');
      await loadDeanData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not update user status';
      setError(msg);
      showToast(msg, 'error');
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
      const msg = 'Campus-wide announcement broadcasted to all portals and notification bells.';
      setNotice(msg);
      showToast(msg, 'success');
      await loadDeanData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not broadcast announcement';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  // LMSWO-00067: Staff Users = ONLY Teachers and Secretaries (explicitly excluding Dean & Students)
  const staffUsers = useMemo(
    () => usersList.filter((u) => u.role === 'teacher' || u.role === 'secretary'),
    [usersList]
  );

  // LMSWO-00067: Student Users = All Students
  const studentUsers = useMemo(
    () => usersList.filter((u) => u.role === 'student'),
    [usersList]
  );

  // Build dynamic Year Level -> Section map for Student Management filters
  const yearLevelBlocksMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    YEAR_LEVEL_OPTIONS.forEach((yr) => {
      map[yr] = [...(YEAR_LEVEL_BLOCKS[yr] || [])];
    });
    sectionsList.forEach((sec) => {
      const yr = sec.grade?.trim() || getYearLevelFromBlock(sec.name);
      const blk = (sec.name || sec.display_name || '').trim();
      if (!blk) return;
      if (!map[yr]) map[yr] = [];
      if (!map[yr].some((existing) => existing.toLowerCase() === blk.toLowerCase())) {
        map[yr].push(blk);
      }
    });
    studentUsers.forEach((s) => {
      const blk = s.section?.trim();
      if (!blk) return;
      const yr = getYearLevelFromBlock(blk, s.grade);
      if (!map[yr]) map[yr] = [];
      if (!map[yr].some((existing) => existing.toLowerCase() === blk.toLowerCase())) {
        map[yr].push(blk);
      }
    });
    return map;
  }, [sectionsList, studentUsers]);

  const filteredStaffUsers = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    return staffUsers.filter((u) => {
      const matchesSearch =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q);
      const matchesRole = !staffRoleFilter || u.role === staffRoleFilter;
      const matchesStatus = !staffStatusFilter || (u.status || 'active') === staffStatusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [staffUsers, staffSearch, staffRoleFilter, staffStatusFilter]);

  const filteredStudentUsers = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return studentUsers.filter((u) => {
      const sYear = getYearLevelFromBlock(u.section, u.grade);
      const sSection = u.section || 'Block - 1A';
      const matchesSearch =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.lrn || '').toLowerCase().includes(q) ||
        sSection.toLowerCase().includes(q) ||
        sYear.toLowerCase().includes(q);
      const matchesYear = !studentYearFilter || sYear === studentYearFilter;
      const matchesSection = !studentSectionFilter || sSection === studentSectionFilter;
      const matchesStatus = !studentStatusFilter || (u.status || 'active') === studentStatusFilter;
      return matchesSearch && matchesYear && matchesSection && matchesStatus;
    });
  }, [studentUsers, studentSearch, studentYearFilter, studentSectionFilter, studentStatusFilter]);

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
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={() => handleSectionChange('user_management')}>
            <Users size={16} /> Staff Directory
          </Button>
          <Button variant="outline" onClick={() => handleSectionChange('student_management')}>
            <GraduationCap size={16} /> Student Directory
          </Button>
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
        <StatCard label="Staff Personnel" value={loading ? '…' : staffUsers.length} icon={<Users size={24} />} detail="Teachers & Secretaries" />
        <StatCard label="Enrolled Students" value={loading ? '…' : studentUsers.length} icon={<GraduationCap size={24} />} detail="1st–4th Year Learners" />
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

  // LMSWO-00067: Staff User Management (Teachers & Secretaries ONLY — excludes Dean & Students)
  const renderUserManagement = () => {
    const teachersCount = staffUsers.filter((u) => u.role === 'teacher').length;
    const secretariesCount = staffUsers.filter((u) => u.role === 'secretary').length;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
              STAFF PERSONNEL DIRECTORY (EXCLUDING DEAN)
            </span>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
              User Management
            </h1>
            <p style={{ color: 'var(--neutral-300)' }}>
              Manage Faculty Teachers and School Secretaries at Tagoloan Community College. Students are managed separately in Student Management.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <Button variant="accent" onClick={() => handleSectionChange('user_management')}>
              <Users size={16} /> Staff Management ({staffUsers.length})
            </Button>
            <Button variant="outline" onClick={() => handleSectionChange('student_management')}>
              <GraduationCap size={16} /> Student Management ({studentUsers.length})
            </Button>
          </div>
        </div>

        {notice && (
          <div style={{ background: 'rgba(67, 160, 71, 0.2)', border: '1px solid var(--success)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#c8e6c9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={18} /> {notice}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.15rem' }}>
          <StatCard label="Total Staff Users" value={staffUsers.length} icon={<Users size={22} />} detail="Teachers & Secretaries (Excl. Dean)" />
          <StatCard label="Faculty Teachers" value={teachersCount} icon={<Users size={22} />} detail="BSIT Course Instructors" />
          <StatCard label="School Secretaries" value={secretariesCount} icon={<ShieldCheck size={22} />} detail="Enrollment & Records Staff" />
        </div>

        {/* Aligned Filter Row */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search teachers or secretaries by name or official email..."
              value={staffSearch}
              onChange={e => setStaffSearch(e.target.value)}
              style={{ height: '42px', margin: 0, width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <select
            value={staffRoleFilter}
            onChange={e => setStaffRoleFilter(e.target.value as '' | 'teacher' | 'secretary')}
            className="form-select"
            style={{ width: '250px', height: '42px', margin: 0, boxSizing: 'border-box' }}
          >
            <option value="">All Staff (Teachers &amp; Secretaries)</option>
            <option value="teacher">Teachers Only</option>
            <option value="secretary">Secretaries Only</option>
          </select>
          <select
            value={staffStatusFilter}
            onChange={e => setStaffStatusFilter(e.target.value)}
            className="form-select"
            style={{ width: '165px', height: '42px', margin: 0, boxSizing: 'border-box' }}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive" style={{ margin: 0 }}>
            <table style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse', textAlign: 'left', color: 'white', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid var(--glass-border)' }}>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Staff Member Name</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Role</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Official Email</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Department / Office</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Status</th>
                  <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaffUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--neutral-400)' }}>
                      No teachers or secretaries found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredStaffUsers.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '0.85rem 1.25rem', fontWeight: 700 }}>{u.name}</td>
                      <td style={{ padding: '0.85rem 1.25rem' }}>
                        <Badge variant={u.role === 'teacher' ? 'primary' : 'warning'}>
                          {u.role.toUpperCase()}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem', color: 'var(--neutral-300)' }}>
                        {u.email}
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem', color: 'var(--neutral-300)' }}>
                        {u.role === 'teacher'
                          ? 'College of Information Technology (BSIT Faculty)'
                          : 'Office of the College Secretary & Registrar'}
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
  };

  // LMSWO-00067: Dedicated Student Management (All Students with Section & Year Level)
  const renderStudentManagement = () => {
    const activeStudentsCount = studentUsers.filter((s) => s.status !== 'inactive').length;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
              ENROLLED STUDENT DIRECTORY BY YEAR LEVEL &amp; SECTION
            </span>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
              Student Management
            </h1>
            <p style={{ color: 'var(--neutral-300)' }}>
              View and manage all enrolled BSIT students along with their assigned Class Section/Block and Year Level (1st to 4th Year).
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <Button variant="outline" onClick={() => handleSectionChange('user_management')}>
              <Users size={16} /> Staff Management ({staffUsers.length})
            </Button>
            <Button variant="accent" onClick={() => handleSectionChange('student_management')}>
              <GraduationCap size={16} /> Student Management ({studentUsers.length})
            </Button>
          </div>
        </div>

        {notice && (
          <div style={{ background: 'rgba(67, 160, 71, 0.2)', border: '1px solid var(--success)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#c8e6c9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={18} /> {notice}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.15rem' }}>
          <StatCard label="Total Enrolled Students" value={studentUsers.length} icon={<GraduationCap size={22} />} detail="All BSIT Learners" />
          <StatCard label="Active Student Accounts" value={activeStudentsCount} icon={<CheckCircle2 size={22} />} detail="Verified active learners" />
          <StatCard label="Year Levels Covered" value={Object.keys(yearLevelBlocksMap).length} icon={<Layers size={22} />} detail="1st Year to 4th Year" />
        </div>

        {/* Aligned Student Search & Filter Row */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search student by name, Student ID (e.g. 20273710), section, year level, or email..."
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              style={{ height: '42px', margin: 0, width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <select
            value={studentYearFilter}
            onChange={e => {
              setStudentYearFilter(e.target.value);
              setStudentSectionFilter('');
            }}
            className="form-select"
            style={{ width: '175px', height: '42px', margin: 0, boxSizing: 'border-box' }}
          >
            <option value="">All Year Levels</option>
            {Object.keys(yearLevelBlocksMap).map((yr) => (
              <option key={yr} value={yr}>{yr}</option>
            ))}
          </select>

          <select
            value={studentSectionFilter}
            onChange={e => setStudentSectionFilter(e.target.value)}
            className="form-select"
            style={{ width: '210px', height: '42px', margin: 0, boxSizing: 'border-box' }}
          >
            <option value="">All Sections / Blocks</option>
            {Object.entries(yearLevelBlocksMap)
              .filter(([yr]) => !studentYearFilter || yr === studentYearFilter)
              .map(([yr, blocks]) => (
                <optgroup key={yr} label={yr}>
                  {blocks.map((blk) => (
                    <option key={blk} value={blk}>{blk}</option>
                  ))}
                </optgroup>
              ))}
          </select>

          <select
            value={studentStatusFilter}
            onChange={e => setStudentStatusFilter(e.target.value)}
            className="form-select"
            style={{ width: '160px', height: '42px', margin: 0, boxSizing: 'border-box' }}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="graduated">Graduated</option>
          </select>
        </div>

        <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive" style={{ margin: 0 }}>
            <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse', textAlign: 'left', color: 'white', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid var(--glass-border)' }}>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Student Name</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Student ID</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Year Level</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Section / Block</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Email Address</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Status</th>
                  <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudentUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--neutral-400)' }}>
                      No students found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredStudentUsers.map(u => {
                    const resolvedYearLevel = getYearLevelFromBlock(u.section, u.grade);
                    const resolvedSection = u.section || 'Block - 1A';
                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '0.85rem 1.25rem', fontWeight: 700 }}>{u.name}</td>
                        <td style={{ padding: '0.85rem 1.25rem', fontFamily: 'monospace', color: '#fde68a', fontWeight: 600 }}>
                          {u.lrn || 'N/A'}
                        </td>
                        <td style={{ padding: '0.85rem 1.25rem' }}>
                          <Badge variant="primary">{resolvedYearLevel}</Badge>
                        </td>
                        <td style={{ padding: '0.85rem 1.25rem', fontWeight: 700, color: 'white', whiteSpace: 'nowrap' }}>
                          {resolvedSection}
                        </td>
                        <td style={{ padding: '0.85rem 1.25rem', color: 'var(--neutral-300)' }}>
                          {u.email}
                        </td>
                        <td style={{ padding: '0.85rem 1.25rem' }}>
                          <Badge variant={u.status === 'inactive' ? 'warning' : u.status === 'graduated' ? 'primary' : 'success'}>
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
                            <option value="graduated" style={{ background: '#1a1a2e' }}>Set Graduated</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>
    );
  };

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
                    {quiz.topic && quiz.topic.trim().toLowerCase() !== quiz.title.trim().toLowerCase() && <span style={{ fontSize: '0.85rem', color: 'var(--neutral-300)' }}>{quiz.topic}</span>}
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
          Security &amp; Access Logs
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
        <StatCard label="Registered Learners" value={studentUsers.length} icon={<GraduationCap size={24} />} detail="Total student body" />
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
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--neutral-300)' }}>{log.description || 'No description'}</td>
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
        {activeSection === 'student_management' && renderStudentManagement()}
        {activeSection === 'quiz_oversight' && renderQuizOversight()}
        {activeSection === 'security' && renderSecurity()}
        {activeSection === 'analytics' && renderAnalytics()}
        {activeSection === 'activity_logs' && renderActivityLogs()}
        {activeSection === 'settings' && renderSettings()}
      </div>
    </DashboardLayout>
  );
}
