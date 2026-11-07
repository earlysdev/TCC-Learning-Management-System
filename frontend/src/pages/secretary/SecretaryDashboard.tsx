import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { lmsFetch, getLmsUser, extractCollection } from '../../lmsApi';
import type { User, ActivityLog, PaginatedResponse, Section, Subject } from '../../lib/types';
import {
  YEAR_LEVEL_BLOCKS,
  YEAR_LEVEL_OPTIONS,
  BSIT_SUBJECTS,
  getYearLevelFromBlock,
  type CurriculumSubjectItem,
} from '../../lib/constants';
import { 
  Users, UserPlus, BookOpen, Activity, ArrowRight,
  CheckCircle2, AlertCircle, FileText, BarChart3, 
  GraduationCap, Download, Layers, Plus, Trash2, Search, Sparkles
} from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import ProfileUpdateCard from '../../components/ui/ProfileUpdateCard';
import { useToastContext } from '../../contexts/ToastContext';

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

function getYearNumberPrefix(yearLevel: string): string {
  const match = yearLevel.match(/([1-9])/);
  return match ? match[1] : '1';
}

function computeNextBlockSuggestion(yearLevel: string, existingBlocks: string[]): string {
  const yrNum = getYearNumberPrefix(yearLevel);
  const usedLetters = new Set<string>();
  existingBlocks.forEach((blk) => {
    const m = blk.match(new RegExp(`${yrNum}([A-Z])`, 'i'));
    if (m?.[1]) {
      usedLetters.add(m[1].toUpperCase());
    }
  });
  for (let code = 65; code <= 90; code += 1) {
    const letter = String.fromCharCode(code);
    if (!usedLetters.has(letter)) {
      return `Block - ${yrNum}${letter}`;
    }
  }
  return `Block - ${yrNum}${existingBlocks.length + 1}`;
}

export default function SecretaryDashboard() {
  const user = getLmsUser();
  const { showToast } = useToastContext();
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
  const [sectionsList, setSectionsList] = useState<Section[]>([]);
  const [customSubjects, setCustomSubjects] = useState<Subject[]>([]);
  const [customYearLevels, setCustomYearLevels] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('tcc_secretary_custom_year_levels');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter((y) => typeof y === 'string' && y.trim().length > 0) : [];
    } catch {
      return [];
    }
  });
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

  // LMSWO-00064: Manual Section & Year Level Creation state
  const [newSectionYearMode, setNewSectionYearMode] = useState<'existing' | 'custom'>('existing');
  const [newSectionYearLevel, setNewSectionYearLevel] = useState('1st Year');
  const [newCustomYearLevelInput, setNewCustomYearLevelInput] = useState('');
  const [newSectionName, setNewSectionName] = useState('Block - 1F');
  const [creatingSection, setCreatingSection] = useState(false);
  const [deletingSectionId, setDeletingSectionId] = useState<number | null>(null);

  // Curriculum Subjects Explorer state
  const [curriculumYearFilter, setCurriculumYearFilter] = useState<string>('ALL');
  const [curriculumSearch, setCurriculumSearch] = useState('');
  const [showAddSubjectForm, setShowAddSubjectForm] = useState(false);
  const [newSubjCode, setNewSubjCode] = useState('');
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjYear, setNewSubjYear] = useState<'1st Year' | '2nd Year' | '3rd Year' | '4th Year'>('1st Year');
  const [newSubjSemester, setNewSubjSemester] = useState<'1st Semester' | '2nd Semester' | 'Summer'>('1st Semester');
  const [newSubjLec, setNewSubjLec] = useState(2);
  const [newSubjLab, setNewSubjLab] = useState(1);
  const [newSubjUnits, setNewSubjUnits] = useState(3);
  const [newSubjPreq, setNewSubjPreq] = useState('none');

  // Combine default Year Levels + custom Year Levels + backend sections into an organized map
  const yearLevelBlocksMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    YEAR_LEVEL_OPTIONS.forEach((yr) => {
      map[yr] = [...(YEAR_LEVEL_BLOCKS[yr] || [])];
    });
    customYearLevels.forEach((yr) => {
      if (!map[yr]) {
        map[yr] = [];
      }
    });
    sectionsList.forEach((sec) => {
      const yr = sec.grade?.trim() || getYearLevelFromBlock(sec.name);
      const blkName = (sec.name || sec.display_name || '').trim();
      if (!blkName) return;
      if (!map[yr]) {
        map[yr] = [];
      }
      if (!map[yr].some((existing) => existing.toLowerCase() === blkName.toLowerCase())) {
        map[yr].push(blkName);
      }
    });
    // Also include any student section that might exist
    students.forEach((stu) => {
      const blkName = stu.section?.trim();
      if (!blkName) return;
      const yr = getYearLevelFromBlock(blkName, stu.grade);
      if (!map[yr]) {
        map[yr] = [];
      }
      if (!map[yr].some((existing) => existing.toLowerCase() === blkName.toLowerCase())) {
        map[yr].push(blkName);
      }
    });
    return map;
  }, [sectionsList, customYearLevels, students]);

  const allAvailableYearLevels = useMemo(() => Object.keys(yearLevelBlocksMap), [yearLevelBlocksMap]);
  const allAvailableBlocks = useMemo(() => Object.values(yearLevelBlocksMap).flat(), [yearLevelBlocksMap]);

  // Keep suggested block name updated when Secretary changes the Year Level in the creation form
  useEffect(() => {
    const targetYear = newSectionYearMode === 'custom'
      ? (newCustomYearLevelInput.trim() || '1st Year')
      : newSectionYearLevel;
    const currentBlocks = yearLevelBlocksMap[targetYear] || [];
    setNewSectionName(computeNextBlockSuggestion(targetYear, currentBlocks));
  }, [newSectionYearLevel, newSectionYearMode, newCustomYearLevelInput, yearLevelBlocksMap]);

  const loadSections = async () => {
    try {
      const data = await lmsFetch<unknown>('/sections');
      const list = extractCollection<Section>(data);
      setSectionsList(Array.isArray(list) ? list : []);
    } catch {
      // Fallback to default blocks if offline
    }
  };

  const loadSubjects = async () => {
    try {
      const data = await lmsFetch<unknown>('/subjects');
      const list = extractCollection<Subject>(data);
      setCustomSubjects(Array.isArray(list) ? list : []);
    } catch {
      // Optional
    }
  };

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
    loadSections();
    loadSubjects();
    loadActivityLogs();
  }, []);

  useEffect(() => {
    if (subpage && pathToSection[subpage]) {
      setActiveSection(pathToSection[subpage]);
    }
  }, [subpage]);

  const handleCreateSectionAndYearLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const targetYear = newSectionYearMode === 'custom'
      ? newCustomYearLevelInput.trim()
      : newSectionYearLevel.trim();

    if (!targetYear) {
      const msg = 'Please select or enter a Year Level (e.g., 1st Year to 4th Year).';
      setError(msg);
      showToast(msg, 'warning');
      return;
    }

    const cleanBlockName = newSectionName.trim();
    if (!cleanBlockName) {
      const msg = 'Please enter a Class Section / Block name (e.g., Block - 1F).';
      setError(msg);
      showToast(msg, 'warning');
      return;
    }

    setCreatingSection(true);
    try {
      const res = await lmsFetch<{ section?: Section; data?: Section; message?: string }>('/sections', {
        method: 'POST',
        body: JSON.stringify({
          grade: targetYear,
          name: cleanBlockName,
          display_name: cleanBlockName,
        }),
      });

      if (newSectionYearMode === 'custom' && !YEAR_LEVEL_OPTIONS.includes(targetYear) && !customYearLevels.includes(targetYear)) {
        const updatedCustomYears = [...customYearLevels, targetYear];
        setCustomYearLevels(updatedCustomYears);
        try {
          localStorage.setItem('tcc_secretary_custom_year_levels', JSON.stringify(updatedCustomYears));
        } catch {
          // Ignore storage error
        }
      }

      const createdSec = res?.section || res?.data;
      if (createdSec) {
        setSectionsList((prev) => [...prev, createdSec]);
      } else {
        await loadSections();
      }

      setNewSectionYearMode('existing');
      setNewSectionYearLevel(targetYear);
      setNewCustomYearLevelInput('');

      const msg = res?.message || `Section "${cleanBlockName}" created under ${targetYear}!`;
      setNotice(msg);
      showToast(msg, 'success');
      await loadActivityLogs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not create section.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setCreatingSection(false);
    }
  };

  const handleDeleteSection = async (sec: Section) => {
    setError(null);
    setNotice(null);
    setDeletingSectionId(sec.id);
    try {
      const res = await lmsFetch<{ message?: string }>(`/sections/${sec.id}`, {
        method: 'DELETE',
      });
      setSectionsList((prev) => prev.filter((item) => item.id !== sec.id));
      const msg = res?.message || `Section "${sec.name}" removed from ${sec.grade}.`;
      setNotice(msg);
      showToast(msg, 'info');
      await loadActivityLogs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not remove section.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setDeletingSectionId(null);
    }
  };

  const handleAddCurriculumSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const code = newSubjCode.trim();
    const name = newSubjName.trim();
    if (!code || !name) {
      const msg = 'Course Code and Subject Description are required.';
      setError(msg);
      showToast(msg, 'warning');
      return;
    }

    if (/^prac/i.test(code) || /practicum/i.test(name)) {
      const msg = '4th Year Practicum (Prac 101) is excluded from online quiz curriculum subjects.';
      setError(msg);
      showToast(msg, 'warning');
      return;
    }

    setBusy(true);
    try {
      const description = `${newSubjSemester} • ${newSubjUnits} Units (${newSubjLec} Lec / ${newSubjLab} Lab) • Preq: ${newSubjPreq || 'none'}`;
      await lmsFetch('/subjects', {
        method: 'POST',
        body: JSON.stringify({
          code,
          name,
          grade: newSubjYear,
          department: 'BSIT',
          description,
        }),
      });
      const msg = `Added "${code} — ${name}" to ${newSubjYear} (${newSubjSemester}) curriculum!`;
      setNotice(msg);
      showToast(msg, 'success');
      setNewSubjCode('');
      setNewSubjName('');
      setNewSubjPreq('none');
      setShowAddSubjectForm(false);
      await loadSubjects();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not add curriculum subject.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    if (newUserRole === 'student' && lrn.trim().length < 4) {
      const msg = 'Student ID is required (e.g. 20273710).';
      setError(msg);
      showToast(msg, 'warning');
      setBusy(false);
      return;
    }

    try {
      const fullName = `${firstName} ${lastName}`.trim();
      const computedYearLevel = newUserRole === 'student'
        ? (yearLevel || getYearLevelFromBlock(section))
        : null;
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

      const msg = `Account for ${fullName} (${newUserRole}) created successfully!`;
      setNotice(msg);
      showToast(msg, 'success');
      // Reset form
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setLrn('');
      await loadSecretaryData();
      await loadSections();
      setActiveSection('student_records');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create user account';
      setError(msg);
      showToast(msg, 'error');
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
      const msg = `Status for ${student.name} updated to "${newStatus}".`;
      setNotice(msg);
      showToast(msg, 'success');
      await loadSecretaryData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update student status';
      setError(msg);
      showToast(msg, 'error');
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
    const studentYear = getYearLevelFromBlock(s.section, s.grade);
    const matchesBlock = !blockFilter || s.section === blockFilter || studentYear === blockFilter;
    const matchesStatus = !statusFilter || s.status === statusFilter;
    return matchesSearch && matchesBlock && matchesStatus;
  });

  // Merge official 58 BSIT subjects (excluding Practicum) with any extra custom subjects added via API
  const allCurriculumSubjects: CurriculumSubjectItem[] = useMemo(() => {
    const baseList = [...BSIT_SUBJECTS];
    const knownCodes = new Set(baseList.map((item) => item.code.toLowerCase()));
    customSubjects.forEach((subj) => {
      const code = (subj.code || '').trim();
      const name = (subj.name || '').trim();
      if (!code || !name) return;
      if (/^prac/i.test(code) || /practicum/i.test(name)) return;
      if (knownCodes.has(code.toLowerCase())) return;
      knownCodes.add(code.toLowerCase());
      const yr = (['1st Year', '2nd Year', '3rd Year', '4th Year'].includes(subj.grade || '')
        ? subj.grade
        : '1st Year') as CurriculumSubjectItem['yearLevel'];
      const semMatch = subj.description?.match(/(1st Semester|2nd Semester|Summer)/i);
      const sem = (semMatch ? semMatch[1] : '1st Semester') as CurriculumSubjectItem['semester'];
      baseList.push({
        code,
        name,
        yearLevel: yr,
        semester: sem,
        lec: 2,
        lab: 1,
        units: 3,
        prerequisite: 'none',
      });
    });
    return baseList;
  }, [customSubjects]);

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
            School Secretary operations, Year Level &amp; Section management, and institutional enrollment records.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="accent" onClick={() => handleSectionChange('create_account')}>
            <UserPlus size={16} /> Register Account
          </Button>
          <Button variant="outline" onClick={() => handleSectionChange('blocks')}>
            <Layers size={16} /> Manage Sections &amp; Years
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1.25rem' }}>
        <StatCard label="Total Students" value={loading ? '…' : students.length} icon={<GraduationCap size={24} />} detail="Enrolled learners" />
        <StatCard label="Total Teachers" value={loading ? '…' : metrics.total_teachers} icon={<Users size={24} />} detail="Faculty members" />
        <StatCard label="Class Sections" value={allAvailableBlocks.length} icon={<Layers size={24} />} detail={`${allAvailableYearLevels.length} Year Levels (1st–4th Yr)`} />
        <StatCard label="BSIT Subjects" value={allCurriculumSubjects.length} icon={<BookOpen size={24} />} detail="1st–4th Yr (Excl. Practicum)" />
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
                <th style={{ padding: '0.75rem 1rem' }}>Block &amp; Year Level</th>
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
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>{s.lrn || 'N/A'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {s.section || 'Block - 1A'}{' '}
                      <span style={{ color: 'var(--neutral-400)', fontSize: '0.8rem' }}>
                        ({getYearLevelFromBlock(s.section, s.grade)})
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
                      const availableBlocks = yearLevelBlocksMap[nextYear] || YEAR_LEVEL_BLOCKS['1st Year'];
                      setSection(availableBlocks[0] || 'Block - 1A');
                    }}
                    className="form-select"
                  >
                    {allAvailableYearLevels.map((yrLbl) => {
                      const blks = yearLevelBlocksMap[yrLbl] || [];
                      return (
                        <option key={yrLbl} value={yrLbl}>
                          {yrLbl} ({blks.length} {blks.length === 1 ? 'Section' : 'Sections'})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--neutral-300)', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Class Section / Block
                  </label>
                  <select 
                    value={section}
                    onChange={e => setSection(e.target.value)}
                    className="form-select"
                  >
                    {(yearLevelBlocksMap[yearLevel] || YEAR_LEVEL_BLOCKS['1st Year']).map(blk => (
                      <option key={blk} value={blk}>{blk}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '-0.35rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--neutral-400)' }}>
                  Need a new Block or Year Level? You can manually create custom sections in the Sections &amp; Year Levels tab.
                </span>
                <button
                  type="button"
                  onClick={() => handleSectionChange('blocks')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-purple-light)',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  + Manage Sections &amp; Year Levels
                </button>
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

  const renderBlocks = () => {
    const filteredCurriculum = allCurriculumSubjects.filter((item) => {
      const matchesYear = curriculumYearFilter === 'ALL' || item.yearLevel === curriculumYearFilter;
      const q = curriculumSearch.trim().toLowerCase();
      const matchesQuery =
        !q ||
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.semester.toLowerCase().includes(q) ||
        item.prerequisite.toLowerCase().includes(q);
      return matchesYear && matchesQuery;
    });

    const displayedYears: Array<'1st Year' | '2nd Year' | '3rd Year' | '4th Year'> =
      curriculumYearFilter === 'ALL'
        ? ['1st Year', '2nd Year', '3rd Year', '4th Year']
        : ([curriculumYearFilter] as Array<'1st Year' | '2nd Year' | '3rd Year' | '4th Year'>);

    const activeTargetYear = newSectionYearMode === 'custom'
      ? (newCustomYearLevelInput.trim() || '1st Year')
      : newSectionYearLevel;
    const suggestedBlock = computeNextBlockSuggestion(
      activeTargetYear,
      yearLevelBlocksMap[activeTargetYear] || []
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
              ACADEMIC STRUCTURE &amp; CURRICULUM MANAGEMENT
            </span>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
              Year Levels, Class Sections &amp; BSIT Subjects
            </h1>
            <p style={{ color: 'var(--neutral-300)' }}>
              Manually create and manage Year Levels (1st to 4th Year), Class Sections/Blocks, and official TCC BSIT Curriculum Subjects (excluding 4th Year Practicum).
            </p>
          </div>
          <Button variant="accent" onClick={() => handleSectionChange('create_account')}>
            <UserPlus size={16} /> Enroll Student to Block
          </Button>
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

        {/* LMSWO-00064: Manual Section & Year Level Creation Form */}
        <GlassCard style={{ borderLeft: '4px solid var(--accent-purple-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.1rem' }}>
            <div>
              <span style={{ fontSize: '0.74rem', color: 'var(--accent-purple-light)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                MANUAL SECTION &amp; YEAR LEVEL BUILDER
              </span>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'white', margin: '0.2rem 0 0.25rem' }}>
                Create Class Section / Block &amp; Year Level
              </h2>
              <p style={{ color: 'var(--neutral-300)', fontSize: '0.88rem', margin: 0 }}>
                Add a new Class Section/Block (e.g., <code style={{ color: '#c4b5fd' }}>Block - 1F</code>, <code style={{ color: '#c4b5fd' }}>Block - 2F</code>) under 1st to 4th Year or define a custom Year Level.
              </p>
            </div>
            <Badge variant="primary">{allAvailableBlocks.length} Active Sections</Badge>
          </div>

          <form onSubmit={handleCreateSectionAndYearLevel} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem', alignItems: 'end' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{ fontSize: '0.84rem', color: 'var(--neutral-200)', fontWeight: 700 }}>
                    Year Level (1st – 4th Year)
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewSectionYearMode((m) => (m === 'existing' ? 'custom' : 'existing'))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#c4b5fd',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    {newSectionYearMode === 'existing' ? '+ Custom Year Level' : 'Select Standard Year (1st–4th)'}
                  </button>
                </div>

                {newSectionYearMode === 'existing' ? (
                  <select
                    value={newSectionYearLevel}
                    onChange={(e) => setNewSectionYearLevel(e.target.value)}
                    className="form-select"
                  >
                    {allAvailableYearLevels.map((yrLbl) => (
                      <option key={yrLbl} value={yrLbl}>
                        {yrLbl}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    placeholder="e.g. 1st Year, 4th Year, or Bridging Year"
                    value={newCustomYearLevelInput}
                    onChange={(e) => setNewCustomYearLevelInput(e.target.value)}
                    required
                  />
                )}
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{ fontSize: '0.84rem', color: 'var(--neutral-200)', fontWeight: 700 }}>
                    Class Section / Block Name
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewSectionName(suggestedBlock)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#a5d6a7',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Suggested: {suggestedBlock}
                  </button>
                </div>
                <Input
                  placeholder="e.g. Block - 1F or 1F"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  required
                />
              </div>

              <div>
                <Button
                  type="submit"
                  variant="accent"
                  disabled={creatingSection}
                  style={{ width: '100%', height: '42px' }}
                >
                  <Plus size={17} /> {creatingSection ? 'Creating Section...' : 'Create Section / Block'}
                </Button>
              </div>
            </div>

            {/* Quick-fill chips for 1st to 4th Year next blocks */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
              <span style={{ fontSize: '0.76rem', color: 'var(--neutral-400)', fontWeight: 600 }}>
                Quick Presets:
              </span>
              {(['1st Year', '2nd Year', '3rd Year', '4th Year'] as const).map((yr) => {
                const nextBlk = computeNextBlockSuggestion(yr, yearLevelBlocksMap[yr] || []);
                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => {
                      setNewSectionYearMode('existing');
                      setNewSectionYearLevel(yr);
                      setNewSectionName(nextBlk);
                    }}
                    style={{
                      padding: '0.25rem 0.65rem',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: newSectionYearLevel === yr && newSectionName === nextBlk
                        ? 'rgba(139, 92, 246, 0.32)'
                        : 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(139, 92, 246, 0.35)',
                      color: '#ddd6fe',
                      cursor: 'pointer',
                    }}
                  >
                    {yr}: {nextBlk}
                  </button>
                );
              })}
            </div>
          </form>
        </GlassCard>

        {/* Year Levels & Class Sections Grid (1st to 4th Year + Custom) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1.25rem' }}>
          {Object.entries(yearLevelBlocksMap).map(([yearLbl, blocks]) => {
            const yearStudentsCount = students.filter(
              (s) => getYearLevelFromBlock(s.section, s.grade) === yearLbl
            ).length;
            const yearCourses = allCurriculumSubjects.filter((c) => c.yearLevel === yearLbl);
            const yearUnits = yearCourses.reduce((sum, c) => sum + c.units, 0);

            return (
              <GlassCard key={yearLbl} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'white', margin: 0 }}>{yearLbl}</h3>
                      <span style={{ fontSize: '0.78rem', color: 'var(--neutral-300)' }}>
                        {yearCourses.length > 0
                          ? `${yearCourses.length} BSIT Subjects • ${yearUnits} Total Units`
                          : 'Custom Academic Year Level'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <Badge variant="primary">{blocks.length} Sections</Badge>
                      <Badge variant="success">{yearStudentsCount} Students</Badge>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.85rem' }}>
                    {blocks.length === 0 ? (
                      <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--neutral-400)', fontSize: '0.85rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)' }}>
                        No sections created for {yearLbl} yet.
                      </div>
                    ) : (
                      blocks.map((blk) => {
                        const count = students.filter((s) => s.section === blk).length;
                        const dbSection = sectionsList.find(
                          (sec) =>
                            sec.grade === yearLbl &&
                            (sec.name.toLowerCase() === blk.toLowerCase() ||
                              sec.display_name?.toLowerCase() === blk.toLowerCase())
                        );
                        const isDefaultBlock = (YEAR_LEVEL_BLOCKS[yearLbl] || []).includes(blk);

                        return (
                          <div
                            key={blk}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.6rem 0.85rem',
                              background: 'rgba(255,255,255,0.04)',
                              border: isDefaultBlock
                                ? '1px solid var(--glass-border)'
                                : '1px solid rgba(139, 92, 246, 0.45)',
                              borderRadius: 'var(--radius-sm)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                              <span style={{ fontWeight: 700, color: 'white', fontSize: '0.9rem' }}>{blk}</span>
                              {!isDefaultBlock && (
                                <span
                                  style={{
                                    fontSize: '0.66rem',
                                    fontWeight: 700,
                                    padding: '0.1rem 0.4rem',
                                    borderRadius: '999px',
                                    background: 'rgba(139, 92, 246, 0.22)',
                                    color: '#c4b5fd',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  Custom
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                              <span style={{ fontSize: '0.78rem', color: 'var(--neutral-300)', fontWeight: 600 }}>
                                {count} {count === 1 ? 'Student' : 'Students'}
                              </span>
                              <button
                                type="button"
                                title={`Enroll a student into ${blk} (${yearLbl})`}
                                onClick={() => {
                                  setNewUserRole('student');
                                  setYearLevel(yearLbl);
                                  setSection(blk);
                                  handleSectionChange('create_account');
                                }}
                                style={{
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '6px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  background: 'rgba(63, 81, 181, 0.25)',
                                  border: '1px solid rgba(99, 102, 241, 0.4)',
                                  color: '#c7d2fe',
                                  cursor: 'pointer',
                                }}
                              >
                                + Enroll
                              </button>
                              {dbSection && count === 0 && !isDefaultBlock && (
                                <button
                                  type="button"
                                  disabled={deletingSectionId === dbSection.id}
                                  onClick={() => handleDeleteSection(dbSection)}
                                  title={`Remove ${blk}`}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '0.25rem',
                                    borderRadius: '6px',
                                    background: 'rgba(239, 68, 68, 0.16)',
                                    border: '1px solid rgba(239, 68, 68, 0.35)',
                                    color: '#fca5a5',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const nextSuggested = computeNextBlockSuggestion(yearLbl, blocks);
                    setNewSectionYearMode('existing');
                    setNewSectionYearLevel(yearLbl);
                    setNewSectionName(nextSuggested);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  style={{ width: '100%' }}
                >
                  <Plus size={14} /> Add New Section to {yearLbl}
                </Button>
              </GlassCard>
            );
          })}
        </div>

        {/* Official TCC BSIT Curriculum Subjects by Year Level & Semester (Excluding 4th Year Practicum) */}
        <GlassCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--primary-300)', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                TAGOLOAN COMMUNITY COLLEGE • CMO 25, S. 2015 BSIT CURRICULUM
              </span>
              <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'white', margin: '0.25rem 0' }}>
                BSIT Year Level &amp; Subjects Prospectus (1st – 4th Year)
              </h2>
              <p style={{ color: 'var(--neutral-300)', fontSize: '0.88rem', margin: 0 }}>
                Organized by Year Level and Semester with Course Code, Descriptive Title, Lecture/Lab/Total Units (TU), and Prerequisite.{' '}
                <strong style={{ color: '#fde68a' }}>4th Year 2nd Semester Practicum (Prac 101 — 486 Hours) is excluded.</strong>
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddSubjectForm((prev) => !prev)}
            >
              <Plus size={15} /> {showAddSubjectForm ? 'Close Subject Form' : 'Add Subject to Curriculum'}
            </Button>
          </div>

          {showAddSubjectForm && (
            <form
              onSubmit={handleAddCurriculumSubject}
              style={{
                padding: '1.1rem',
                marginBottom: '1.25rem',
                borderRadius: '12px',
                background: 'rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.35)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.9rem',
              }}
            >
              <div style={{ fontWeight: 700, color: '#ddd6fe', fontSize: '0.92rem' }}>
                Register Additional Curriculum Subject
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
                <Input
                  label="Course Code"
                  placeholder="e.g. IT 133"
                  value={newSubjCode}
                  onChange={(e) => setNewSubjCode(e.target.value)}
                  required
                />
                <Input
                  label="Subject Description"
                  placeholder="e.g. Cloud Computing Architecture"
                  value={newSubjName}
                  onChange={(e) => setNewSubjName(e.target.value)}
                  required
                />
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--neutral-300)', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Year Level
                  </label>
                  <select
                    className="form-select"
                    value={newSubjYear}
                    onChange={(e) => setNewSubjYear(e.target.value as typeof newSubjYear)}
                  >
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--neutral-300)', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Semester / Term
                  </label>
                  <select
                    className="form-select"
                    value={newSubjSemester}
                    onChange={(e) => setNewSubjSemester(e.target.value as typeof newSubjSemester)}
                  >
                    <option value="1st Semester">1st Semester</option>
                    <option value="2nd Semester">2nd Semester</option>
                    <option value="Summer">Summer</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.85rem', alignItems: 'end' }}>
                <Input
                  label="Lec Units"
                  type="number"
                  min={0}
                  max={6}
                  value={String(newSubjLec)}
                  onChange={(e) => {
                    const lec = Number(e.target.value) || 0;
                    setNewSubjLec(lec);
                    setNewSubjUnits(lec + newSubjLab);
                  }}
                />
                <Input
                  label="Lab Units"
                  type="number"
                  min={0}
                  max={6}
                  value={String(newSubjLab)}
                  onChange={(e) => {
                    const lab = Number(e.target.value) || 0;
                    setNewSubjLab(lab);
                    setNewSubjUnits(newSubjLec + lab);
                  }}
                />
                <Input
                  label="Total Units (TU)"
                  type="number"
                  min={1}
                  max={12}
                  value={String(newSubjUnits)}
                  onChange={(e) => setNewSubjUnits(Number(e.target.value) || 3)}
                />
                <Input
                  label="Prerequisite"
                  placeholder="none or Course Code"
                  value={newSubjPreq}
                  onChange={(e) => setNewSubjPreq(e.target.value)}
                />
                <Button type="submit" variant="accent" disabled={busy}>
                  <Plus size={16} /> Save Subject
                </Button>
              </div>
            </form>
          )}

          {/* Filter Tabs & Search */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[
                { id: 'ALL', label: `All Years (${allCurriculumSubjects.length})` },
                { id: '1st Year', label: `1st Year (${allCurriculumSubjects.filter((s) => s.yearLevel === '1st Year').length})` },
                { id: '2nd Year', label: `2nd Year (${allCurriculumSubjects.filter((s) => s.yearLevel === '2nd Year').length})` },
                { id: '3rd Year', label: `3rd Year (${allCurriculumSubjects.filter((s) => s.yearLevel === '3rd Year').length})` },
                { id: '4th Year', label: `4th Year (${allCurriculumSubjects.filter((s) => s.yearLevel === '4th Year').length} • No Practicum)` },
              ].map((tab) => {
                const active = curriculumYearFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCurriculumYearFilter(tab.id)}
                    style={{
                      padding: '0.45rem 0.9rem',
                      borderRadius: '999px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: active ? 'var(--accent-purple)' : 'rgba(255, 255, 255, 0.06)',
                      border: active ? '1px solid #c4b5fd' : '1px solid rgba(255, 255, 255, 0.12)',
                      color: active ? 'white' : 'var(--neutral-200)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div style={{ position: 'relative', minWidth: '260px', flex: '0 1 320px' }}>
              <Search size={15} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
              <input
                type="text"
                value={curriculumSearch}
                onChange={(e) => setCurriculumSearch(e.target.value)}
                placeholder="Search course code, subject, or preq..."
                style={{
                  width: '100%',
                  padding: '0.55rem 0.85rem 0.55rem 2.3rem',
                  borderRadius: '999px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: 'white',
                  fontSize: '0.85rem',
                }}
              />
            </div>
          </div>

          {/* Grouped Year Level & Semester Tables */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {displayedYears.map((yrLevel) => {
              const yearItems = filteredCurriculum.filter((item) => item.yearLevel === yrLevel);
              if (yearItems.length === 0) return null;

              const semestersOrder: Array<'1st Semester' | '2nd Semester' | 'Summer'> = [
                '1st Semester',
                '2nd Semester',
                'Summer',
              ];

              return (
                <div
                  key={yrLevel}
                  style={{
                    borderRadius: '14px',
                    background: 'rgba(255, 255, 255, 0.025)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '1.15rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                      paddingBottom: '0.75rem',
                      marginBottom: '1rem',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span
                        style={{
                          padding: '0.3rem 0.75rem',
                          borderRadius: '8px',
                          background: 'rgba(139, 92, 246, 0.25)',
                          border: '1px solid rgba(139, 92, 246, 0.5)',
                          color: '#ede9fe',
                          fontWeight: 800,
                          fontSize: '0.85rem',
                          letterSpacing: '0.6px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {yrLevel.toUpperCase()}
                      </span>
                      <span style={{ color: 'var(--neutral-300)', fontSize: '0.85rem', fontWeight: 600 }}>
                        BSIT Official Curriculum Prospectus
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Badge variant="primary">{yearItems.length} Subjects</Badge>
                      <Badge variant="success">
                        {yearItems.reduce((sum, i) => sum + i.units, 0)} Total Credits (TU)
                      </Badge>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.15rem' }}>
                    {semestersOrder.map((sem) => {
                      const semItems = yearItems.filter((i) => i.semester === sem);
                      if (semItems.length === 0) return null;

                      const totalLec = semItems.reduce((acc, i) => acc + i.lec, 0);
                      const totalLab = semItems.reduce((acc, i) => acc + i.lab, 0);
                      const totalTu = semItems.reduce((acc, i) => acc + i.units, 0);

                      return (
                        <div
                          key={sem}
                          style={{
                            borderRadius: '10px',
                            background: 'rgba(15, 23, 42, 0.55)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              padding: '0.65rem 1rem',
                              background: sem === 'Summer'
                                ? 'rgba(245, 158, 11, 0.16)'
                                : 'rgba(63, 81, 181, 0.22)',
                              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <span style={{ fontWeight: 800, fontSize: '0.86rem', color: 'white', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              {yrLevel} • {sem}
                            </span>
                            <span style={{ fontSize: '0.76rem', color: '#cbd5e1', fontWeight: 700 }}>
                              {semItems.length} Courses • {totalTu} TU
                            </span>
                          </div>

                          <div className="table-responsive" style={{ margin: 0 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'white', fontSize: '0.82rem' }}>
                              <thead>
                                <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--neutral-300)' }}>
                                  <th style={{ padding: '0.55rem 0.75rem', whiteSpace: 'nowrap' }}>Course Code</th>
                                  <th style={{ padding: '0.55rem 0.75rem' }}>Descriptive Title</th>
                                  <th style={{ padding: '0.55rem 0.45rem', textAlign: 'center' }}>Lec</th>
                                  <th style={{ padding: '0.55rem 0.45rem', textAlign: 'center' }}>Lab</th>
                                  <th style={{ padding: '0.55rem 0.45rem', textAlign: 'center' }}>TU</th>
                                  <th style={{ padding: '0.55rem 0.75rem' }}>Preq</th>
                                </tr>
                              </thead>
                              <tbody>
                                {semItems.map((subj) => (
                                  <tr key={subj.code} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                                    <td style={{ padding: '0.55rem 0.75rem', whiteSpace: 'nowrap' }}>
                                      <span
                                        style={{
                                          fontFamily: 'monospace',
                                          fontWeight: 800,
                                          fontSize: '0.79rem',
                                          padding: '0.15rem 0.45rem',
                                          borderRadius: '6px',
                                          background: 'rgba(139, 92, 246, 0.18)',
                                          border: '1px solid rgba(139, 92, 246, 0.35)',
                                          color: '#ddd6fe',
                                        }}
                                      >
                                        {subj.code}
                                      </span>
                                    </td>
                                    <td style={{ padding: '0.55rem 0.75rem', fontWeight: 600, color: '#f8fafc', lineHeight: 1.35 }}>
                                      {subj.name}
                                    </td>
                                    <td style={{ padding: '0.55rem 0.45rem', textAlign: 'center', color: '#cbd5e1' }}>{subj.lec}</td>
                                    <td style={{ padding: '0.55rem 0.45rem', textAlign: 'center', color: '#cbd5e1' }}>{subj.lab}</td>
                                    <td style={{ padding: '0.55rem 0.45rem', textAlign: 'center', fontWeight: 800, color: '#fbbf24' }}>{subj.units}</td>
                                    <td style={{ padding: '0.55rem 0.75rem', color: subj.prerequisite === 'none' ? 'var(--neutral-400)' : '#93c5fd', fontSize: '0.76rem', fontFamily: 'monospace' }}>
                                      {subj.prerequisite}
                                    </td>
                                  </tr>
                                ))}
                                <tr style={{ background: 'rgba(255, 255, 255, 0.05)', fontWeight: 800 }}>
                                  <td colSpan={2} style={{ padding: '0.55rem 0.75rem', textAlign: 'right', color: '#cbd5e1', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Total Credits
                                  </td>
                                  <td style={{ padding: '0.55rem 0.45rem', textAlign: 'center', color: 'white' }}>{totalLec}</td>
                                  <td style={{ padding: '0.55rem 0.45rem', textAlign: 'center', color: 'white' }}>{totalLab}</td>
                                  <td style={{ padding: '0.55rem 0.45rem', textAlign: 'center', color: '#a5d6a7' }}>{totalTu}</td>
                                  <td style={{ padding: '0.55rem 0.75rem' }} />
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {yrLevel === '1st Year' && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--neutral-400)', fontStyle: 'italic' }}>
                      Note: Math Prep (Pre-Calculus for NON-STEM: Algebra &amp; Trigo) for GAS, HUMSS, ABM to be taken as bridging where applicable.
                    </div>
                  )}
                  {yrLevel === '4th Year' && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#fde68a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Sparkles size={14} />
                      <span>4th Year Second Semester Practicum (Prac 101 — 486 Hours) is excluded from online quiz subjects per system curriculum configuration.</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>
    );
  };

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
            Search, verify, and manage official enrollment status of TCC learners by Block and Year Level.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={() => handleSectionChange('blocks')}>
            <Layers size={16} /> Manage Sections
          </Button>
          <Button variant="accent" onClick={() => handleSectionChange('create_account')}>
            <UserPlus size={16} /> New Registration
          </Button>
        </div>
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
          style={{ width: '220px' }}
        >
          <option value="">All Year Levels &amp; Blocks</option>
          {Object.entries(yearLevelBlocksMap).map(([yearLbl, blocks]) => (
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
              <th style={{ padding: '0.85rem 1.25rem' }}>Block &amp; Year</th>
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
                  <td style={{ padding: '0.85rem 1.25rem', fontFamily: 'monospace' }}>{student.lrn || 'N/A'}</td>
                  <td style={{ padding: '0.85rem 1.25rem' }}>
                    {student.section || 'Block - 1A'}{' '}
                    <span style={{ color: 'var(--neutral-400)', fontSize: '0.8rem' }}>
                      ({getYearLevelFromBlock(student.section, student.grade)})
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
        <StatCard label="School Blocks" value={allAvailableBlocks.length} icon={<BarChart3 size={24} />} detail={`${allAvailableYearLevels.length} Year Levels`} />
      </div>

      <GlassCard>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white', marginBottom: '1rem' }}>Block Enrollment Distribution by Year Level</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {Object.entries(yearLevelBlocksMap).map(([yearLbl, blocks]) => {
            const count = students.filter(s => getYearLevelFromBlock(s.section, s.grade) === yearLbl).length;
            const pct = students.length > 0 ? (count / students.length) * 100 : 0;
            const rangeText = blocks.length > 0 ? `${blocks[0]} – ${blocks[blocks.length - 1]}` : 'No blocks';
            return (
              <div key={yearLbl}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem', color: 'white' }}>
                  <span>{yearLbl} ({rangeText})</span>
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
          DATA EXPORT &amp; REPORTING
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
          <Button variant="outline" size="sm" onClick={() => showToast('Exporting Student Masterlist CSV...', 'success')}>
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
          <Button variant="outline" size="sm" onClick={() => showToast('Generating Graduating Students Report PDF...', 'success')}>
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
          Immutable log of administrative account events, section creations, registrations, and logins.
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
              Secretary &amp; Student Records Office
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
