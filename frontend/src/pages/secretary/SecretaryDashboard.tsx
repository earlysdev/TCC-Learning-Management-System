import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { lmsFetch, getLmsUser } from '../../lmsApi';
import type { User, ActivityLog, PaginatedResponse } from '../../lib/types';
import { 
  Users, UserPlus, BookOpen, Activity, ArrowRight,
  CheckCircle2, AlertCircle, FileText, BarChart3, 
  GraduationCap, Download
} from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';

interface SecretaryMetrics {
  total_students: number;
  total_teachers: number;
  recent_registrations: number;
  system_status?: string;
}

const pathToSection: Record<string, string> = {
  dashboard: 'overview',
  overview: 'overview',
  accounts: 'create_account',
  create_account: 'create_account',
  records: 'student_records',
  student_records: 'student_records',
  performance: 'performance',
  reports: 'reports',
  logs: 'activity_logs',
  activity_logs: 'activity_logs',
  settings: 'settings',
};

const sectionToPath: Record<string, string> = {
  overview: '/secretary/dashboard',
  create_account: '/secretary/accounts',
  student_records: '/secretary/records',
  performance: '/secretary/performance',
  reports: '/secretary/reports',
  activity_logs: '/secretary/logs',
  settings: '/secretary/settings',
};

export default function SecretaryDashboard() {
  const user = getLmsUser();
  const { subpage } = useParams<{ subpage?: string }>();
  const navigate = useNavigate();
  const initialSection = subpage ? (pathToSection[subpage] || 'overview') : 'overview';
  const [activeSection, setActiveSection] = useState(initialSection);
  const [metrics, setMetrics] = useState<SecretaryMetrics>({
    total_students: 0,
    total_teachers: 0,
    recent_registrations: 0,
    system_status: 'Active',
  });
  const [students, setStudents] = useState<User[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Student filter
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Create account form state
  const [newUserRole, setNewUserRole] = useState<'student' | 'teacher'>('student');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('LnhsDemo!2026');
  const [lrn, setLrn] = useState('');
  const [grade, setGrade] = useState('Grade 10');
  const [section, setSection] = useState('Emerald');

  const loadSecretaryData = async () => {
    try {
      setLoading(true);
      setError(null);
      const metricsData = await lmsFetch<SecretaryMetrics>('/secretary/dashboard').catch(() => ({
        total_students: 0,
        total_teachers: 0,
        recent_registrations: 0,
        system_status: 'Active',
      }));
      setMetrics(metricsData);

      const studentsData = await lmsFetch<PaginatedResponse<User> | User[]>('/users?role=student').catch(() => []);
      if (Array.isArray(studentsData)) {
        setStudents(studentsData);
      } else if (studentsData && Array.isArray(studentsData.data)) {
        setStudents(studentsData.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load secretary data');
    } finally {
      setLoading(false);
    }
  };

  const loadActivityLogs = async () => {
    try {
      const logsData = await lmsFetch<PaginatedResponse<ActivityLog> | ActivityLog[]>('/activity-logs').catch(() => []);
      if (Array.isArray(logsData)) {
        setActivityLogs(logsData);
      } else if (logsData && Array.isArray(logsData.data)) {
        setActivityLogs(logsData.data);
      }
    } catch {
      // Optional logs
    }
  };

  useEffect(() => {
    loadSecretaryData();
    loadActivityLogs();
  }, []);

  useEffect(() => {
    if (subpage && pathToSection[subpage]) {
      setActiveSection(pathToSection[subpage]);
    }
  }, [subpage]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    if (newUserRole === 'student' && lrn.length !== 12) {
      setError('Student LRN must be exactly 12 digits.');
      setBusy(false);
      return;
    }

    try {
      const fullName = `${firstName} ${lastName}`.trim();
      await lmsFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: fullName,
          first_name: firstName,
          last_name: lastName,
          email,
          password,
          role: newUserRole,
          lrn: newUserRole === 'student' ? lrn : null,
          grade: newUserRole === 'student' ? grade : null,
          section: newUserRole === 'student' ? section : null,
        }),
      });

      setNotice(`Account for ${fullName} (${newUserRole}) created successfully!`);
      // Reset form
      setFirstName('');
      setLastName('');
      setEmail('');
      setLrn('');
      await loadSecretaryData();
      setActiveSection('student_records');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user account');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStatus = async (student: User, newStatus: string) => {
    setBusy(true);
    setError(null);
    try {
      await lmsFetch(`/users/${student.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setNotice(`Status for ${student.name} updated to "${newStatus}".`);
      await loadSecretaryData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update student status');
    } finally {
      setBusy(false);
    }
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = !searchQuery || 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (s.lrn && s.lrn.includes(searchQuery)) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGrade = !gradeFilter || s.grade === gradeFilter;
    const matchesStatus = !statusFilter || s.status === statusFilter;
    return matchesSearch && matchesGrade && matchesStatus;
  });

  const renderOverview = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
            SECRETARY PORTAL
          </span>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
            Welcome, {user?.name || 'Secretary'}!
          </h1>
          <p style={{ color: 'var(--neutral-300)', marginTop: '0.25rem' }}>
            School registrar operations, learner accounts, and institutional enrollment records.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="accent" onClick={() => setActiveSection('create_account')}>
            <UserPlus size={16} /> Register Account
          </Button>
          <Button variant="outline" onClick={() => setActiveSection('student_records')}>
            <BookOpen size={16} /> Student Records
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
        <StatCard label="Total Students" value={loading ? '…' : (metrics.total_students || students.length)} icon={<GraduationCap size={24} />} detail="Enrolled learners" />
        <StatCard label="Total Teachers" value={loading ? '…' : (metrics.total_teachers || 1)} icon={<Users size={24} />} detail="Faculty members" />
        <StatCard label="Registrations" value={loading ? '…' : (metrics.recent_registrations || students.length)} icon={<UserPlus size={24} />} detail="Current academic period" />
        <StatCard label="System Status" value="Online" icon={<Activity size={24} />} detail="School portal active" />
      </div>

      {/* Quick Access to Recent Students */}
      <GlassCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>Recently Enrolled Students</h2>
          <Button variant="outline" size="sm" onClick={() => setActiveSection('student_records')}>
            Full Directory <ArrowRight size={14} />
          </Button>
        </div>

        <div className="table-responsive">
          <table style={{ width: '100%', minWidth: '500px', borderCollapse: 'collapse', textAlign: 'left', color: 'white', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid var(--glass-border)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Name</th>
                <th style={{ padding: '0.75rem 1rem' }}>LRN</th>
                <th style={{ padding: '0.75rem 1rem' }}>Grade & Section</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {students.slice(0, 5).map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>{s.lrn || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{s.grade || 'Grade 10'} • {s.section || 'Emerald'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Badge variant={s.status === 'inactive' ? 'warning' : 'success'}>
                      {s.status || 'Active'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );

  const renderCreateAccount = () => (
    <div style={{ maxWidth: '750px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          REGISTRATION
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Create New Account
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Register a verified student learner or faculty teacher to the LNHS LMS database.
        </p>
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

      <GlassCard>
        <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--neutral-300)', fontWeight: 600, marginBottom: '0.4rem' }}>
              Account Role
            </label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="role" 
                  value="student" 
                  checked={newUserRole === 'student'} 
                  onChange={() => setNewUserRole('student')}
                  style={{ accentColor: 'var(--primary-400)' }}
                />
                Student
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="role" 
                  value="teacher" 
                  checked={newUserRole === 'teacher'} 
                  onChange={() => setNewUserRole('teacher')}
                  style={{ accentColor: 'var(--primary-400)' }}
                />
                Teacher
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <Input 
              label="First Name"
              placeholder="e.g. Maria"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              required
            />
            <Input 
              label="Last Name"
              placeholder="e.g. Santos"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              required
            />
          </div>

          <Input 
            label="Email Address"
            type="email"
            placeholder="e.g. maria.santos@lnhs.edu.ph"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <Input 
            label="Initial Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            helpText="Minimum 8 characters. The user can change this later."
          />

          {newUserRole === 'student' && (
            <>
              <Input 
                label="Learner Reference Number (LRN)"
                placeholder="12-digit LRN (e.g. 123456789012)"
                value={lrn}
                onChange={e => setLrn(e.target.value.replace(/\D/g, '').slice(0, 12))}
                maxLength={12}
                required
                helpText="Students can use their 12-digit LRN as their login username."
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--neutral-300)', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Grade Level
                  </label>
                  <select 
                    value={grade}
                    onChange={e => setGrade(e.target.value)}
                    className="form-select"
                  >
                    <option value="Grade 7">Grade 7</option>
                    <option value="Grade 8">Grade 8</option>
                    <option value="Grade 9">Grade 9</option>
                    <option value="Grade 10">Grade 10</option>
                    <option value="Grade 11">Grade 11</option>
                    <option value="Grade 12">Grade 12</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--neutral-300)', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Section
                  </label>
                  <select 
                    value={section}
                    onChange={e => setSection(e.target.value)}
                    className="form-select"
                  >
                    <option value="Emerald">Emerald</option>
                    <option value="Diamond">Diamond</option>
                    <option value="Sapphire">Sapphire</option>
                    <option value="Ruby">Ruby</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <Button variant="accent" size="lg" type="submit" disabled={busy} style={{ marginTop: '0.5rem' }}>
            <UserPlus size={18} /> {busy ? 'Creating User Account...' : 'Register Account'}
          </Button>
        </form>
      </GlassCard>
    </div>
  );

  const renderStudentRecords = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
            STUDENT REGISTRY
          </span>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
            Student Records
          </h1>
          <p style={{ color: 'var(--neutral-300)' }}>
            Search, verify, and manage official enrollment status of LNHS learners.
          </p>
        </div>
        <Button variant="accent" onClick={() => setActiveSection('create_account')}>
          <UserPlus size={16} /> New Registration
        </Button>
      </div>

      {notice && (
        <div style={{ background: 'rgba(67, 160, 71, 0.2)', border: '1px solid var(--success)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#c8e6c9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} /> {notice}
        </div>
      )}

      {/* Filters row */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <Input 
            placeholder="Search by student name, LRN, or email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <select 
          value={gradeFilter} 
          onChange={e => setGradeFilter(e.target.value)}
          className="form-select"
          style={{ width: '160px' }}
        >
          <option value="">All Grades</option>
          <option value="Grade 7">Grade 7</option>
          <option value="Grade 8">Grade 8</option>
          <option value="Grade 9">Grade 9</option>
          <option value="Grade 10">Grade 10</option>
          <option value="Grade 11">Grade 11</option>
          <option value="Grade 12">Grade 12</option>
        </select>
        <select 
          value={statusFilter} 
          onChange={e => setStatusFilter(e.target.value)}
          className="form-select"
          style={{ width: '160px' }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="graduated">Graduated</option>
        </select>
      </div>

      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive" style={{ margin: 0 }}>
          <table style={{ width: '100%', minWidth: '680px', borderCollapse: 'collapse', textAlign: 'left', color: 'white', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid var(--glass-border)' }}>
              <th style={{ padding: '0.85rem 1.25rem' }}>Student Name</th>
              <th style={{ padding: '0.85rem 1.25rem' }}>LRN</th>
              <th style={{ padding: '0.85rem 1.25rem' }}>Grade & Section</th>
              <th style={{ padding: '0.85rem 1.25rem' }}>Email</th>
              <th style={{ padding: '0.85rem 1.25rem' }}>Status</th>
              <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--neutral-400)' }}>
                  No students found matching your filters.
                </td>
              </tr>
            ) : (
              filteredStudents.map(student => (
                <tr key={student.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.85rem 1.25rem', fontWeight: 600 }}>{student.name}</td>
                  <td style={{ padding: '0.85rem 1.25rem', fontFamily: 'monospace' }}>{student.lrn || '—'}</td>
                  <td style={{ padding: '0.85rem 1.25rem' }}>{student.grade || 'Grade 10'} • {student.section || 'Emerald'}</td>
                  <td style={{ padding: '0.85rem 1.25rem', color: 'var(--neutral-300)' }}>{student.email}</td>
                  <td style={{ padding: '0.85rem 1.25rem' }}>
                    <Badge variant={student.status === 'inactive' ? 'warning' : student.status === 'graduated' ? 'primary' : 'success'}>
                      {student.status || 'Active'}
                    </Badge>
                  </td>
                  <td style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>
                    <select
                      value={student.status || 'active'}
                      onChange={e => handleToggleStatus(student, e.target.value)}
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
              ))
            )}
          </tbody>
        </table>
        </div>
      </GlassCard>
    </div>
  );

  const renderPerformance = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          INSTITUTIONAL PERFORMANCE
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Learner Performance Overview
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          High-level overview of active enrollment and quiz participation by grade level.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        <StatCard label="Enrolled Students" value={students.length} icon={<GraduationCap size={24} />} detail="Registered in directory" />
        <StatCard label="Active Rate" value="98%" icon={<Activity size={24} />} detail="Regular participation" />
        <StatCard label="School Sections" value="16" icon={<BarChart3 size={24} />} detail="Active curriculum classes" />
      </div>

      <GlassCard>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white', marginBottom: '1rem' }}>Grade Level Enrollment Distribution</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'].map(g => {
            const count = students.filter(s => s.grade === g).length;
            const pct = students.length > 0 ? (count / students.length) * 100 : 0;
            return (
              <div key={g}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem', color: 'white' }}>
                  <span>{g}</span>
                  <span style={{ fontWeight: 600 }}>{count} Students ({pct.toFixed(0)}%)</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(pct, 5)}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary-500), var(--accent-purple-light))' }} />
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );

  const renderReports = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          DATA EXPORT & REPORTING
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Official School Reports
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Generate printable enrollment rosters and official DepEd compliance records.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        <GlassCard>
          <FileText size={32} style={{ color: 'var(--primary-400)', marginBottom: '0.75rem' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white', marginBottom: '0.4rem' }}>
            Complete Student Masterlist
          </h3>
          <p style={{ color: 'var(--neutral-300)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Export full student roster including LRN, grade, section, and status.
          </p>
          <Button variant="outline" size="sm" onClick={() => alert('Exporting student masterlist CSV...')}>
            <Download size={14} /> Export CSV
          </Button>
        </GlassCard>

        <GlassCard>
          <FileText size={32} style={{ color: 'var(--accent-purple-light)', marginBottom: '0.75rem' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white', marginBottom: '0.4rem' }}>
            Graduating Students Roster
          </h3>
          <p style={{ color: 'var(--neutral-300)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Summary of Senior High School completers for S.Y. 2025–2026.
          </p>
          <Button variant="outline" size="sm" onClick={() => alert('Generating Graduating Students Report...')}>
            <Download size={14} /> Export PDF
          </Button>
        </GlassCard>
      </div>
    </div>
  );

  const renderActivityLogs = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          AUDIT TRAIL
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Activity Logs
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Immutable log of administrative account events, registrations, and logins.
        </p>
      </div>

      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive" style={{ margin: 0 }}>
          <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left', color: 'white', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid var(--glass-border)' }}>
              <th style={{ padding: '0.75rem 1rem' }}>Action</th>
              <th style={{ padding: '0.75rem 1rem' }}>User / Account</th>
              <th style={{ padding: '0.75rem 1rem' }}>Description</th>
              <th style={{ padding: '0.75rem 1rem' }}>IP Address</th>
              <th style={{ padding: '0.75rem 1rem' }}>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {activityLogs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--neutral-400)' }}>
                  No activity log entries recorded yet.
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
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          ACCOUNT DETAILS
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Secretary Profile
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Registrar and administrative credentials at Tagoloan Community College.
        </p>
      </div>

      <GlassCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--warning), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800, color: 'white' }}>
            {user?.initials || 'S'}
          </div>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'white' }}>{user?.name || 'School Secretary'}</h2>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <Badge variant="warning">School Registrar</Badge>
              <Badge variant="success">Active</Badge>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Email Address</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              {user?.email || 'secretary.demo@lnhs.test'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Office</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              Registrar & Student Records Office
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Current School Year</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              2025–2026
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );

  const handleSectionChange = (sectionId: string) => {
    setActiveSection(sectionId);
    const path = sectionToPath[sectionId] || '/secretary/dashboard';
    navigate(path, { replace: true });
  };

  return (
    <DashboardLayout role="secretary">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', minWidth: 0 }}>
        {/* Navigation Tabs Bar */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', overflowX: 'auto' }}>
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'create_account', label: 'Create Account' },
            { id: 'student_records', label: 'Student Records' },
            { id: 'performance', label: 'Performance' },
            { id: 'reports', label: 'Reports' },
            { id: 'activity_logs', label: 'Activity Logs' },
            { id: 'settings', label: 'Settings' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => handleSectionChange(tab.id)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: activeSection === tab.id ? 'var(--primary-600)' : 'transparent',
                color: activeSection === tab.id ? 'white' : 'var(--neutral-300)',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeSection === 'overview' && renderOverview()}
        {activeSection === 'create_account' && renderCreateAccount()}
        {activeSection === 'student_records' && renderStudentRecords()}
        {activeSection === 'performance' && renderPerformance()}
        {activeSection === 'reports' && renderReports()}
        {activeSection === 'activity_logs' && renderActivityLogs()}
        {activeSection === 'settings' && renderSettings()}
      </div>
    </DashboardLayout>
  );
}
