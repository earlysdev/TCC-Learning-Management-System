import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { lmsFetch, getLmsUser, extractCollection } from '../../lmsApi';
import type { User, ActivityLog, PaginatedResponse } from '../../lib/types';
import { YEAR_LEVEL_BLOCKS, ALL_BLOCKS, getYearLevelFromBlock } from '../../lib/constants';
import { 
  Users, UserPlus, BookOpen, Activity, ArrowRight,
  CheckCircle2, AlertCircle, FileText, BarChart3, 
  GraduationCap, Download, Layers
} from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import ProfileUpdateCard from '../../components/ui/ProfileUpdateCard';

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
  sections: 'blocks',
  blocks: 'blocks',
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
  blocks: '/secretary/sections',
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
  const [blockFilter, setBlockFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Create account form state
  const [newUserRole, setNewUserRole] = useState<'student' | 'teacher'>('student');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [lrn, setLrn] = useState('');
  const [yearLevel, setYearLevel] = useState('1st Year');
  const [section, setSection] = useState('Block - 1A');

  const loadSecretaryData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await lmsFetch<{ data?: SecretaryMetrics } & Partial<SecretaryMetrics>>('/secretary/dashboard').catch(() => null);
      const metricsPayload = res?.data || res;
      setMetrics({
        total_students: Number(metricsPayload?.total_students ?? 0),
        total_teachers: Number(metricsPayload?.total_teachers ?? 0),
        recent_registrations: Array.isArray(metricsPayload?.recent_registrations)
          ? metricsPayload.recent_registrations.length
          : Number(metricsPayload?.recent_registrations ?? 0),
        system_status: 'Active',
      });

      const studentsData = await lmsFetch<PaginatedResponse<User> | { data?: { data?: User[] } | User[] } | User[]>('/users?role=student').catch(() => []);
      if (Array.isArray(studentsData)) {
        setStudents(studentsData);
      } else if (studentsData && 'data' in studentsData) {
        const inner = studentsData.data;
        if (Array.isArray(inner)) {
          setStudents(inner);
        } else if (inner && 'data' in inner && Array.isArray(inner.data)) {
          setStudents(inner.data);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load secretary data');
    } finally {
      setLoading(false);
    }
  };

  const loadActivityLogs = async () => {
    try {
      const logsData = await lmsFetch<unknown>('/activity-logs').catch(() => []);
      setActivityLogs(extractCollection<ActivityLog>(logsData));
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

    if (newUserRole === 'student' && lrn.trim().length < 4) {
      setError('Student ID is required (e.g. 20273710).');
      setBusy(false);
      return;
    }

    try {
      const fullName = `${firstName} ${lastName}`.trim();
      const computedYearLevel = newUserRole === 'student' ? getYearLevelFromBlock(section) : null;
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
          grade: computedYearLevel,
          section: newUserRole === 'student' ? section : null,
        }),
      });

      setNotice(`Account for ${fullName} (${newUserRole}) created successfully!`);
      // Reset form
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
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
      (s.section && s.section.toLowerCase().includes(searchQuery.toLowerCase())) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBlock = !blockFilter || s.section === blockFilter || getYearLevelFromBlock(s.section) === blockFilter;
    const matchesStatus = !statusFilter || s.status === statusFilter;
    return matchesSearch && matchesBlock && matchesStatus;
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
            School Secretary operations, learner accounts, and institutional enrollment records.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="accent" onClick={() => handleSectionChange('create_account')}>
            <UserPlus size={16} /> Register Account
          </Button>
          <Button variant="outline" onClick={() => handleSectionChange('student_records')}>
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
        <StatCard label="Total Students" value={loading ? '…' : students.length} icon={<GraduationCap size={24} />} detail="Enrolled learners" />
        <StatCard label="Total Teachers" value={loading ? '…' : metrics.total_teachers} icon={<Users size={24} />} detail="Faculty members" />
        <StatCard label="College Blocks" value={ALL_BLOCKS.length} icon={<Layers size={24} />} detail="1st Year – 4th Year (A–E)" />
        <StatCard label="System Status" value="Online" icon={<Activity size={24} />} detail="College portal active" />
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
                <th style={{ padding: '0.75rem 1rem' }}>ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>Block</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '1.75rem', textAlign: 'center', color: 'var(--neutral-400)' }}>
                    No students enrolled yet.
                  </td>
                </tr>
              ) : (
                students.slice(0, 5).map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{s.name}</td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>{s.lrn || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {s.section || 'Block - 1A'}{' '}
                      <span style={{ color: 'var(--neutral-400)', fontSize: '0.8rem' }}>
                        ({getYearLevelFromBlock(s.section)})
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant={s.status === 'inactive' ? 'warning' : 'success'}>
                        {s.status || 'Active'}
                      </Badge>
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
          Register a verified student learner or faculty teacher to the Tagoloan Community College LMS database.
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
              placeholder="e.g. Juan"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              required
            />
            <Input 
              label="Last Name"
              placeholder="e.g. Dela Cruz"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              required
            />
          </div>

          <Input 
            label="Email Address"
            type="email"
            placeholder="e.g. juan.delacruz@tcc.edu.ph"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <Input 
            label="Initial Password"
            type="password"
            placeholder="Enter initial password (min. 8 characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            helpText="Minimum 8 characters. The user can change this later."
          />

          {newUserRole === 'student' && (
            <>
              <Input 
                label="Student ID"
                placeholder="e.g. 20273710"
                value={lrn}
                onChange={e => setLrn(e.target.value.replace(/\D/g, '').slice(0, 12))}
                maxLength={12}
                required
                helpText="Students can use their Student ID (e.g. 20273710) as their login username."
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--neutral-300)', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Year Level
                  </label>
                  <select 
                    value={yearLevel}
                    onChange={e => {
                      const nextYear = e.target.value;
                      setYearLevel(nextYear);
                      const availableBlocks = YEAR_LEVEL_BLOCKS[nextYear] || YEAR_LEVEL_BLOCKS['1st Year'];
                      setSection(availableBlocks[0]);
                    }}
                    className="form-select"
                  >
                    <option value="1st Year">1st Year (Blocks 1A–1E)</option>
                    <option value="2nd Year">2nd Year (Blocks 2A–2E)</option>
                    <option value="3rd Year">3rd Year (Blocks 3A–3E)</option>
                    <option value="4th Year">4th Year (Blocks 4A–4E)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--neutral-300)', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Block
                  </label>
                  <select 
                    value={section}
                    onChange={e => setSection(e.target.value)}
                    className="form-select"
                  >
                    {(YEAR_LEVEL_BLOCKS[yearLevel] || YEAR_LEVEL_BLOCKS['1st Year']).map(blk => (
                      <option key={blk} value={blk}>{blk}</option>
                    ))}
                  </select>
                </div>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--neutral-400)', marginTop: '-0.5rem' }}>
                Block number corresponds to Year Level: 1A–1E (1st Year), 2A–2E (2nd Year), 3A–3E (3rd Year), 4A–4E (4th Year).
              </span>
            </>
          )}

          <Button variant="accent" size="lg" type="submit" disabled={busy} style={{ marginTop: '0.5rem' }}>
            <UserPlus size={18} /> {busy ? 'Creating User Account...' : 'Register Account'}
          </Button>
        </form>
      </GlassCard>
    </div>
  );

  const renderBlocks = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
            ACADEMIC BLOCKS
          </span>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
            College Blocks (1st – 4th Year)
          </h1>
          <p style={{ color: 'var(--neutral-300)' }}>
            Block numbers correspond to Year Levels: 1A–1E (1st Year), 2A–2E (2nd Year), 3A–3E (3rd Year), and 4A–4E (4th Year).
          </p>
        </div>
        <Button variant="accent" onClick={() => setActiveSection('create_account')}>
          <UserPlus size={16} /> Enroll Student to Block
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        {Object.entries(YEAR_LEVEL_BLOCKS).map(([yearLbl, blocks]) => (
          <GlassCard key={yearLbl}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white', margin: 0 }}>{yearLbl}</h3>
              <Badge variant="primary">{blocks.length} Blocks</Badge>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {blocks.map(blk => {
                const count = students.filter(s => s.section === blk).length;
                return (
                  <div
                    key={blk}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.6rem 0.85rem',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: 'white', fontSize: '0.9rem' }}>{blk}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--neutral-300)' }}>
                      {count} {count === 1 ? 'Student' : 'Students'}
                    </span>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        ))}
      </div>
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
            Search, verify, and manage official enrollment status of TCC learners by Block.
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
            placeholder="Search by student name, ID, block, or email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <select 
          value={blockFilter} 
          onChange={e => setBlockFilter(e.target.value)}
          className="form-select"
          style={{ width: '200px' }}
        >
          <option value="">All Blocks</option>
          {Object.entries(YEAR_LEVEL_BLOCKS).map(([yearLbl, blocks]) => (
            <optgroup key={yearLbl} label={yearLbl}>
              <option value={yearLbl}>All {yearLbl}</option>
              {blocks.map(blk => (
                <option key={blk} value={blk}>{blk}</option>
              ))}
            </optgroup>
          ))}
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
              <th style={{ padding: '0.85rem 1.25rem' }}>ID</th>
              <th style={{ padding: '0.85rem 1.25rem' }}>Block</th>
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
                  <td style={{ padding: '0.85rem 1.25rem' }}>
                    {student.section || 'Block - 1A'}{' '}
                    <span style={{ color: 'var(--neutral-400)', fontSize: '0.8rem' }}>
                      ({getYearLevelFromBlock(student.section)})
                    </span>
                  </td>
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

  const activeStudentsCount = students.filter(s => s.status !== 'inactive').length;
  const activeRatePct = students.length > 0 ? Math.round((activeStudentsCount / students.length) * 100) : 0;

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
          High-level overview of active enrollment and participation across college blocks.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        <StatCard label="Enrolled Students" value={students.length} icon={<GraduationCap size={24} />} detail="Registered in directory" />
        <StatCard label="Active Rate" value={`${activeRatePct}%`} icon={<Activity size={24} />} detail="Active student accounts" />
        <StatCard label="School Blocks" value={ALL_BLOCKS.length} icon={<BarChart3 size={24} />} detail="Blocks 1A–1E to 4A–4E" />
      </div>

      <GlassCard>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white', marginBottom: '1rem' }}>Block Enrollment Distribution by Year Level</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {Object.entries(YEAR_LEVEL_BLOCKS).map(([yearLbl, blocks]) => {
            const count = students.filter(s => getYearLevelFromBlock(s.section) === yearLbl).length;
            const pct = students.length > 0 ? (count / students.length) * 100 : 0;
            return (
              <div key={yearLbl}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem', color: 'white' }}>
                  <span>{yearLbl} ({blocks[0]} – {blocks[blocks.length - 1]})</span>
                  <span style={{ fontWeight: 600 }}>{count} Students ({pct.toFixed(0)}%)</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary-500), var(--accent-purple-light))' }} />
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
          Official College Reports
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Generate printable enrollment rosters and official TCC Secretary compliance records.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        <GlassCard>
          <FileText size={32} style={{ color: 'var(--primary-400)', marginBottom: '0.75rem' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white', marginBottom: '0.4rem' }}>
            Complete Student Masterlist
          </h3>
          <p style={{ color: 'var(--neutral-300)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Export full student roster including ID, block, and status.
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
            Summary of 4th Year graduating students (Blocks 4A–4E) for S.Y. 2025–2026.
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
          Secretary and administrative credentials at Tagoloan Community College.
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
              <Badge variant="warning">School Secretary</Badge>
              <Badge variant="success">Active</Badge>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Email Address</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              {user?.email || 'secretary@tcc.edu.ph'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Office</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              Secretary & Student Records Office
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

      <ProfileUpdateCard />
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
        {activeSection === 'overview' && renderOverview()}
        {activeSection === 'create_account' && renderCreateAccount()}
        {activeSection === 'blocks' && renderBlocks()}
        {activeSection === 'student_records' && renderStudentRecords()}
        {activeSection === 'performance' && renderPerformance()}
        {activeSection === 'reports' && renderReports()}
        {activeSection === 'activity_logs' && renderActivityLogs()}
        {activeSection === 'settings' && renderSettings()}
      </div>
    </DashboardLayout>
  );
}
