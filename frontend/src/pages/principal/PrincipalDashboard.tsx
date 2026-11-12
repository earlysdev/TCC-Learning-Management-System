import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { lmsFetch, getLmsUser, extractCollection } from '../../lmsApi';
import type { User, Quiz, SecurityLog, ActivityLog, PaginatedResponse, Announcement, Section } from '../../lib/types';
import {
  YEAR_LEVEL_BLOCKS,
  YEAR_LEVEL_OPTIONS,
  getYearLevelFromBlock,
  getDepartmentName,
  CURRENT_SCHOOL_YEAR,
} from '../../lib/constants';
import { 
  Users, ShieldCheck, AlertTriangle, TrendingUp, 
  CheckCircle2, AlertCircle, 
  Check, Activity, Send, GraduationCap, Layers,
  UserPlus, KeyRound, Copy, Eye, EyeOff, Pencil, X, Plus, Sparkles, Briefcase
} from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import ProfileUpdateCard from '../../components/ui/ProfileUpdateCard';
import SecurityLogsPanel from '../../components/security/SecurityLogsPanel';
import {
  AccountCredentialsEmailReceipt,
  createFallbackAccountReceipt,
  type AccountEmailDispatchReceipt,
} from '../../components/ui/AccountCredentialsEmailReceipt';
import { useToastContext } from '../../contexts/ToastContext';
import { generateStrongPassword, evaluatePasswordStrength } from '../../lib/passwordUtils';

interface DeanMetrics {
  active_users: number;
  quiz_completion: number;
  avg_performance: number;
  security_alerts: number;
}

type CreatableRole = 'student' | 'teacher' | 'secretary';

// LMSWO-00068: 50 students per section (same enrollment policy as the Secretary portal)
const MAX_STUDENTS_PER_SECTION = 50;

function computeNextBlockName(yearLevel: string, existingBlocks: string[]): string {
  const yrNum = (yearLevel.match(/([1-9])/) || [])[1] || '1';
  const used = new Set<string>();
  existingBlocks.forEach((blk) => {
    const m = blk.match(new RegExp(`${yrNum}([A-Z])`, 'i'));
    if (m?.[1]) used.add(m[1].toUpperCase());
  });
  for (let code = 65; code <= 90; code += 1) {
    const letter = String.fromCharCode(code);
    if (!used.has(letter)) return `Block - ${yrNum}${letter}`;
  }
  return `Block - ${yrNum}${existingBlocks.length + 1}`;
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
  accounts: 'create_account',
  create_account: 'create_account',
  enroll: 'create_account',
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
  create_account: '/dean/accounts',
  quiz_oversight: '/dean/quizzes',
  security: '/dean/security',
  analytics: '/dean/analytics',
  activity_logs: '/dean/logs',
  settings: '/dean/settings',
};

export default function PrincipalDashboard() {
  const user = getLmsUser();
  const departmentCode = (user?.department || 'CIT').toUpperCase();
  const departmentName = getDepartmentName(departmentCode);
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

  // LMSWO-00068: Dean Create Account & Enrollment controls
  const [newRole, setNewRole] = useState<CreatableRole>('student');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newStudentId, setNewStudentId] = useState('');
  const [newYearLevel, setNewYearLevel] = useState('1st Year');
  const [placementMode, setPlacementMode] = useState<'auto' | 'manual'>('auto');
  const [manualSection, setManualSection] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [creatingSection, setCreatingSection] = useState(false);
  const [dispatchedAccountReceipt, setDispatchedAccountReceipt] = useState<AccountEmailDispatchReceipt | null>(null);

  // LMSWO-00068: Student Year Level / Section reassignment modal
  const [editingStudent, setEditingStudent] = useState<User | null>(null);
  const [editYearLevel, setEditYearLevel] = useState('1st Year');
  const [editSection, setEditSection] = useState('auto');
  const [savingPlacement, setSavingPlacement] = useState(false);

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

  const runSecurityResolution = async <T extends { message?: string }>(
    endpoint: string,
    fallbackSuccess: string,
    fallbackError: string,
    onSuccess: (res: T) => void
  ) => {
    setBusy(true);
    setError(null);
    try {
      const res = await lmsFetch<T>(endpoint, { method: 'PATCH' });
      const msg = res.message || fallbackSuccess;
      setNotice(msg);
      showToast(msg, 'success');
      onSuccess(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : fallbackError;
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleResolveSecurityLog = (logId: number) =>
    runSecurityResolution<{
      message?: string;
      data?: SecurityLog;
      already_resolved?: boolean;
      unresolved_remaining?: number;
    }>(
      `/security-logs/${logId}/resolve`,
      'Security log marked as resolved.',
      'Could not resolve security log',
      (res) => {
        const updated = res.data;
        const resolvedAt = updated?.resolved_at || new Date().toISOString();
        setSecurityLogs(prev => prev.map(l => (
          l.id === logId
            ? {
                ...l,
                is_resolved: true,
                resolved_at: l.resolved_at || resolvedAt,
                resolved_by: l.resolved_by ?? updated?.resolved_by ?? null,
                resolver: l.resolver ?? updated?.resolver ?? null,
              }
            : l
        )));
        setMetrics(prev => ({
          ...prev,
          security_alerts: typeof res.unresolved_remaining === 'number'
            ? res.unresolved_remaining
            : res.already_resolved
              ? prev.security_alerts
              : Math.max(0, (Number(prev.security_alerts) || 1) - 1),
        }));
      }
    );

  const handleResolveAllSecurityLogs = () =>
    runSecurityResolution<{
      message?: string;
      resolved_count?: number;
      unresolved_remaining?: number;
      resolved_at?: string;
      resolver?: { id: number; name: string } | null;
    }>(
      '/security-logs/resolve-all',
      'All unresolved security alerts have been successfully resolved.',
      'Could not resolve security logs',
      async (res) => {
        const resolvedAt = res.resolved_at || new Date().toISOString();
        setSecurityLogs(prev => prev.map(l => (
          l.is_resolved
            ? l
            : {
                ...l,
                is_resolved: true,
                resolved_at: resolvedAt,
                resolved_by: res.resolver?.id ?? null,
                resolver: res.resolver ?? null,
              }
        )));
        setMetrics(prev => ({
          ...prev,
          security_alerts: typeof res.unresolved_remaining === 'number' ? res.unresolved_remaining : 0,
        }));
        const refreshed = await lmsFetch<unknown>('/dean/security-logs').catch(() => null);
        if (refreshed) {
          setSecurityLogs(extractCollection<SecurityLog>(refreshed));
        }
      }
    );

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

  // ===================================================================
  // LMSWO-00068: Section capacity & enrollment helpers
  // ===================================================================
  const countStudentsInBlock = (block: string, excludeId?: number) =>
    studentUsers.filter(
      (s) => (s.section || '').trim().toLowerCase() === block.trim().toLowerCase() && s.id !== excludeId
    ).length;

  const getBlockUsage = (yearLevel: string, excludeId?: number) =>
    (yearLevelBlocksMap[yearLevel] || []).map((block) => {
      const count = countStudentsInBlock(block, excludeId);
      return { block, count, isFull: count >= MAX_STUDENTS_PER_SECTION, vacant: Math.max(0, MAX_STUDENTS_PER_SECTION - count) };
    });

  const newYearUsage = useMemo(() => getBlockUsage(newYearLevel), [newYearLevel, yearLevelBlocksMap, studentUsers]);

  const autoAssignedBlock = useMemo(() => {
    const firstVacant = newYearUsage.find((b) => !b.isFull);
    if (firstVacant) return firstVacant;
    const overflow = computeNextBlockName(newYearLevel, newYearUsage.map((b) => b.block));
    return { block: overflow, count: 0, isFull: false, vacant: MAX_STUDENTS_PER_SECTION };
  }, [newYearUsage, newYearLevel]);

  const targetPlacement = placementMode === 'manual' && manualSection
    ? newYearUsage.find((b) => b.block === manualSection) || autoAssignedBlock
    : autoAssignedBlock;

  const nextBlockSuggestion = useMemo(
    () => computeNextBlockName(newYearLevel, yearLevelBlocksMap[newYearLevel] || []),
    [newYearLevel, yearLevelBlocksMap]
  );

  // Reset manual selection when Year Level changes
  useEffect(() => {
    setManualSection('');
  }, [newYearLevel]);

  const passwordStrength = evaluatePasswordStrength(newPassword);

  const resetCreateForm = () => {
    setNewFirstName('');
    setNewLastName('');
    setNewEmail('');
    setNewPassword('');
    setShowNewPassword(false);
    setNewStudentId('');
    setPlacementMode('auto');
    setManualSection('');
  };

  const openCreateAccount = (role: CreatableRole) => {
    setNewRole(role);
    handleSectionChange('create_account');
  };

  const handleGeneratePassword = () => {
    setNewPassword(generateStrongPassword(12));
    setShowNewPassword(true);
    showToast('Generated strong institutional password.', 'info');
  };

  const handleCopyPassword = async () => {
    if (!newPassword) return;
    try {
      await navigator.clipboard.writeText(newPassword);
      showToast('Password copied to clipboard.', 'success');
    } catch {
      showToast('Could not copy automatically — please copy from the visible field.', 'warning');
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (newPassword.length < 8) {
      const msg = 'Initial password must be at least 8 characters. Use "Generate Strong Password".';
      setError(msg);
      showToast(msg, 'warning');
      return;
    }
    if (newRole === 'student' && newStudentId.trim().length < 4) {
      const msg = 'Student ID is required for student enrollment (e.g. 20273710).';
      setError(msg);
      showToast(msg, 'warning');
      return;
    }
    if (newRole === 'student' && placementMode === 'manual' && targetPlacement.isFull) {
      const msg = `${targetPlacement.block} is already full (50/50). Choose another section or use auto-assignment.`;
      setError(msg);
      showToast(msg, 'warning');
      return;
    }

    setCreatingAccount(true);
    try {
      const fullName = `${newFirstName} ${newLastName}`.trim();
      const res = await lmsFetch<{
        data?: User;
        message?: string;
        email_dispatch?: AccountEmailDispatchReceipt;
      }>('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: fullName,
          first_name: newFirstName.trim(),
          last_name: newLastName.trim(),
          email: newEmail.trim(),
          password: newPassword,
          role: newRole,
          lrn: newRole === 'student' ? newStudentId.trim() : null,
          grade: newRole === 'student' ? newYearLevel : null,
          section: newRole === 'student' ? (placementMode === 'manual' && manualSection ? manualSection : 'auto') : null,
        }),
      });

      const finalSection = res?.data?.section || targetPlacement.block;
      const receiptDepartment = (res?.data?.department || departmentCode).toUpperCase();
      const roleLabel = newRole === 'secretary' ? 'College Secretary' : newRole === 'teacher' ? 'Faculty Teacher' : 'Student Learner';
      const fallbackReceipt = res?.email_dispatch || createFallbackAccountReceipt({
        recipient: newEmail.trim(),
        accountName: fullName,
        role: newRole,
        roleLabel,
        department: receiptDepartment,
        departmentLabel: `${receiptDepartment} — ${getDepartmentName(receiptDepartment)}`,
        schoolYear: res?.data?.school_year || CURRENT_SCHOOL_YEAR,
        lrn: newRole === 'student' ? newStudentId.trim() : null,
        grade: newRole === 'student' ? newYearLevel : null,
        section: newRole === 'student' ? finalSection : null,
        plainPassword: newPassword,
        issuedBy: user?.name || 'Office of the College Dean',
        issuedByRole: 'College Dean',
      });

      setDispatchedAccountReceipt(fallbackReceipt);

      const emailDelivered = Boolean(fallbackReceipt.sent);
      const baseMsg = newRole === 'student'
        ? `Student ${fullName} enrolled into ${newYearLevel} • ${finalSection}`
        : `${roleLabel} account for ${fullName} created`;
      const msg = emailDelivered
        ? `${baseMsg} and official credentials dispatched to ${newEmail.trim()}.`
        : `${baseMsg}. ${fallbackReceipt.mail_warning || res?.message || 'Email was not sent to external inbox — share the slip below.'}`;
      setNotice(msg);
      showToast(msg, emailDelivered ? 'success' : 'warning');
      resetCreateForm();
      await loadDeanData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create account.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleCreateNextSection = async () => {
    setError(null);
    setNotice(null);
    setCreatingSection(true);
    try {
      const res = await lmsFetch<{ section?: Section; data?: Section; message?: string }>('/sections', {
        method: 'POST',
        body: JSON.stringify({ grade: newYearLevel, name: nextBlockSuggestion, display_name: nextBlockSuggestion }),
      });
      const created = res?.section || res?.data;
      if (created) {
        setSectionsList((prev) => [...prev, created]);
      }
      const msg = res?.message || `${nextBlockSuggestion} opened under ${newYearLevel}.`;
      setNotice(msg);
      showToast(msg, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not create section.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setCreatingSection(false);
    }
  };

  const openPlacementEditor = (student: User) => {
    setEditingStudent(student);
    setEditYearLevel(getYearLevelFromBlock(student.section, student.grade));
    setEditSection(student.section || 'auto');
  };

  const handleSavePlacement = async () => {
    if (!editingStudent) return;
    setSavingPlacement(true);
    setError(null);
    setNotice(null);
    try {
      const res = await lmsFetch<{ message?: string }>(`/users/${editingStudent.id}`, {
        method: 'PUT',
        body: JSON.stringify({ grade: editYearLevel, section: editSection || 'auto' }),
      });
      const msg = res?.message || `${editingStudent.name} reassigned successfully.`;
      setNotice(msg);
      showToast(msg, 'success');
      setEditingStudent(null);
      await loadDeanData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not update student placement.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSavingPlacement(false);
    }
  };

  // ===================================================================
  // LMSWO-00068: Shared, consistent page chrome for every Dean tab
  // ===================================================================
  const renderPageHeader = (
    eyebrow: string,
    title: string,
    description: string,
    actions?: React.ReactNode,
    eyebrowColor = 'var(--primary-300)'
  ) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
      <div style={{ minWidth: 0, flex: '1 1 380px' }}>
        <span style={{ fontSize: '0.78rem', color: eyebrowColor, letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700 }}>
          {eyebrow}
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', margin: '0.25rem 0 0' }}>{title}</h1>
        <p style={{ color: 'var(--neutral-300)', margin: '0.3rem 0 0' }}>{description}</p>
      </div>
      {actions && <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );

  const renderAlerts = () => (
    <>
      {notice && (
        <div style={{ background: 'rgba(67, 160, 71, 0.2)', border: '1px solid var(--success)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#c8e6c9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>
      )}
      {error && (
        <div style={{ background: 'rgba(239, 83, 80, 0.2)', border: '1px solid var(--error)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#ffcdd2', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );

  const renderOverview = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {renderPageHeader(
        `${departmentCode} DEAN EXECUTIVE OVERSIGHT`,
        `Welcome, Dean ${user?.name || ''}!`,
        `${departmentName} (${departmentCode}) administrative command, enrollment, proctoring surveillance, and departmental analytics • SY ${CURRENT_SCHOOL_YEAR}.`,
        <>
          <Button variant="outline" onClick={() => handleSectionChange('security')}>
            <ShieldCheck size={16} /> Security Audit
          </Button>
          <Button variant="accent" onClick={() => handleSectionChange('analytics')}>
            <TrendingUp size={16} /> School Analytics
          </Button>
        </>,
        'var(--error)'
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

      {/* LMSWO-00068: Organized Dean Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {[
          { icon: <UserPlus size={20} />, title: 'Enroll Student', desc: 'Create a student account with automatic 50-max section placement.', onClick: () => openCreateAccount('student') },
          { icon: <Briefcase size={20} />, title: 'Add Staff Account', desc: 'Register a Faculty Teacher or College Secretary.', onClick: () => openCreateAccount('teacher') },
          { icon: <Layers size={20} />, title: 'Assign Sections', desc: 'Reassign Year Levels and Sections for enrolled students.', onClick: () => handleSectionChange('student_management') },
          { icon: <Users size={20} />, title: 'Manage Staff', desc: 'Activate or deactivate teacher and secretary accounts.', onClick: () => handleSectionChange('user_management') },
        ].map((action) => (
          <button
            key={action.title}
            type="button"
            onClick={action.onClick}
            className="glass-card"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.85rem', textAlign: 'left', cursor: 'pointer',
              padding: '1rem 1.1rem', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)',
              background: 'rgba(255,255,255,0.04)', color: 'white', width: '100%',
            }}
          >
            <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, var(--primary-600), #d97706)', color: 'white' }}>
              {action.icon}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem' }}>{action.title}</span>
              <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--neutral-300)', marginTop: '0.2rem', lineHeight: 1.4 }}>{action.desc}</span>
            </span>
          </button>
        ))}
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
        {renderPageHeader(
          'STAFF PERSONNEL DIRECTORY (EXCLUDING DEAN)',
          'User Management',
          'Manage Faculty Teachers and College Secretaries. Students are managed separately in Student Management.',
          <>
            <Button variant="outline" onClick={() => handleSectionChange('student_management')}>
              <GraduationCap size={16} /> Student Management ({studentUsers.length})
            </Button>
            <Button variant="accent" onClick={() => openCreateAccount('teacher')}>
              <UserPlus size={16} /> Add Staff Account
            </Button>
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.15rem' }}>
          <StatCard label="Total Staff Users" value={staffUsers.length} icon={<Users size={22} />} detail="Teachers & Secretaries (Excl. Dean)" />
          <StatCard label="Faculty Teachers" value={teachersCount} icon={<Users size={22} />} detail={`${departmentCode} Course Instructors`} />
          <StatCard label="Department Secretaries" value={secretariesCount} icon={<ShieldCheck size={22} />} detail={`${departmentCode} Enrollment & Records`} />
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
                          ? `${getDepartmentName(u.department || departmentCode)} (${u.department || departmentCode} Faculty)`
                          : `Office of the ${u.department || departmentCode} Secretary`}
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
        {renderPageHeader(
          'ENROLLED STUDENT DIRECTORY BY YEAR LEVEL & SECTION',
          'Student Management',
          'View all enrolled students, reassign Year Levels and Sections (50 students max per section), and update enrollment status.',
          <>
            <Button variant="outline" onClick={() => handleSectionChange('user_management')}>
              <Users size={16} /> Staff Management ({staffUsers.length})
            </Button>
            <Button variant="accent" onClick={() => openCreateAccount('student')}>
              <UserPlus size={16} /> Enroll Student
            </Button>
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.15rem' }}>
          <StatCard label="Total Enrolled Students" value={studentUsers.length} icon={<GraduationCap size={22} />} detail={`${departmentCode} Learners`} />
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
            <table style={{ width: '100%', minWidth: '880px', borderCollapse: 'collapse', textAlign: 'left', color: 'white', fontSize: '0.9rem' }}>
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
                          <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end' }}>
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => openPlacementEditor(u)}>
                            <Pencil size={13} /> Reassign
                          </Button>
                          <select
                            value={u.status || 'active'}
                            onChange={e => handleToggleUserStatus(u, e.target.value)}
                            disabled={busy}
                            aria-label={`Status for ${u.name}`}
                            style={{
                              background: 'rgba(255,255,255,0.1)',
                              border: '1px solid var(--glass-border)',
                              color: 'white',
                              padding: '0.3rem 0.5rem',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.8rem',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="active" style={{ background: '#1a1a2e' }}>Set Active</option>
                            <option value="inactive" style={{ background: '#1a1a2e' }}>Set Inactive</option>
                            <option value="graduated" style={{ background: '#1a1a2e' }}>Set Graduated</option>
                          </select>
                          </div>
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
      {renderPageHeader(
        'CURRICULUM OVERSIGHT',
        'Quiz Oversight',
        'Review instructional assessments and quizzes prepared by faculty within your department.'
      )}

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
    <SecurityLogsPanel
      logs={securityLogs}
      totalPendingMetrics={metrics.security_alerts}
      busy={busy}
      onResolveOne={handleResolveSecurityLog}
      onResolveAll={handleResolveAllSecurityLogs}
      header={(actionSlot) =>
        renderPageHeader(
          'INSTITUTIONAL SURVEILLANCE & ALL-IN-ONE RESOLUTION',
          'Security & Access Logs',
          'Monitor authentication events, unrecognized device alerts, and failed login incidents across your department.',
          actionSlot,
          '#fbbf24'
        )
      }
    />
  );

  const renderAnalytics = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {renderPageHeader(
        'INSTITUTIONAL METRICS',
        'School-Wide Analytics',
        'Comprehensive statistics on student participation, faculty engagement, and curriculum progress.'
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        <StatCard label="Registered Learners" value={studentUsers.length} icon={<GraduationCap size={24} />} detail="Total student body" />
        <StatCard label="Faculty Teachers" value={usersList.filter(u => u.role === 'teacher').length} icon={<Users size={24} />} detail="Active educators" />
        <StatCard label="Assessments Built" value={quizzes.length} icon={<Activity size={24} />} detail="Published quizzes" />
      </div>
    </div>
  );

  const renderActivityLogs = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {renderPageHeader(
        'SYSTEM AUDITING',
        'Activity Log Master Audit',
        'Complete log of events across students, teachers, secretaries, and system services.'
      )}

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
    <div style={{ maxWidth: '760px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {renderPageHeader(
        'EXECUTIVE CREDENTIALS',
        'Dean Profile',
        'College executive leadership credentials at Tagoloan Community College.',
        undefined,
        'var(--error)'
      )}

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
              Office of the Dean ({departmentCode})
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Department</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              {departmentCode} — {departmentName}
            </div>
          </div>
        </div>
      </GlassCard>

      <ProfileUpdateCard />
    </div>
  );

  // ===================================================================
  // LMSWO-00068: Dean Create Account & Full Student Enrollment Controls
  // ===================================================================
  const fieldLabelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--neutral-200)', marginBottom: '0.4rem',
  };
  const fieldInputStyle: React.CSSProperties = { width: '100%', height: '42px', margin: 0, boxSizing: 'border-box' };

  const renderCreateAccount = () => {
    const isStudent = newRole === 'student';
    const roleOptions: { id: CreatableRole; label: string; icon: React.ReactNode }[] = [
      { id: 'student', label: 'Student', icon: <GraduationCap size={15} /> },
      { id: 'teacher', label: 'Teacher', icon: <Users size={15} /> },
      { id: 'secretary', label: 'Secretary', icon: <Briefcase size={15} /> },
    ];
    const submitLabel = isStudent
      ? `Enroll Student into ${targetPlacement.block}`
      : `Create ${newRole === 'teacher' ? 'Teacher' : 'Secretary'} Account`;
    const recentStaff = staffUsers.slice(0, 5);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {renderPageHeader(
          'DEAN ENROLLMENT & ACCOUNT CONTROLS',
          'Create Account',
          'Register students, faculty teachers, and college secretaries. Students are placed into the first vacant section of their Year Level (50 students max per section).',
          <>
            <Button variant="outline" onClick={() => handleSectionChange('student_management')}>
              <GraduationCap size={16} /> Student Management
            </Button>
            <Button variant="outline" onClick={() => handleSectionChange('user_management')}>
              <Users size={16} /> Staff Management
            </Button>
          </>
        )}

        {dispatchedAccountReceipt && (
          <AccountCredentialsEmailReceipt
            receipt={dispatchedAccountReceipt}
            onDismiss={() => setDispatchedAccountReceipt(null)}
            onViewDirectory={() =>
              handleSectionChange(
                dispatchedAccountReceipt.role === 'student' ? 'student_management' : 'user_management'
              )
            }
            directoryButtonLabel={
              dispatchedAccountReceipt.role === 'student' ? 'View in Student Management' : 'View in Staff Management'
            }
          />
        )}

        <div className="dean-enroll-grid">
          {/* LEFT: Account form */}
          <GlassCard>
            <form onSubmit={handleCreateAccount} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <span style={fieldLabelStyle}>Account Role</span>
                <div className="dean-role-switch" role="radiogroup" aria-label="Account role">
                  {roleOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={newRole === opt.id}
                      className={newRole === opt.id ? 'active' : ''}
                      onClick={() => setNewRole(opt.id)}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={fieldLabelStyle} htmlFor="dean-first-name">First Name</label>
                  <input id="dean-first-name" className="form-input" style={fieldInputStyle} placeholder="e.g. Juan" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} required />
                </div>
                <div>
                  <label style={fieldLabelStyle} htmlFor="dean-last-name">Last Name</label>
                  <input id="dean-last-name" className="form-input" style={fieldInputStyle} placeholder="e.g. Dela Cruz" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} required />
                </div>
              </div>

              <div>
                <label style={fieldLabelStyle} htmlFor="dean-email">Institutional Email Address</label>
                <input id="dean-email" type="email" className="form-input" style={fieldInputStyle} placeholder="e.g. juan.delacruz@tcc.edu.ph" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <label style={{ ...fieldLabelStyle, marginBottom: 0 }} htmlFor="dean-password">Initial Password</label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <Button type="button" variant="warning" size="sm" onClick={handleGeneratePassword}>
                      <KeyRound size={13} /> Generate Strong Password
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={handleCopyPassword} disabled={!newPassword}>
                      <Copy size={13} /> Copy
                    </Button>
                  </div>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    id="dean-password"
                    type={showNewPassword ? 'text' : 'password'}
                    className="form-input"
                    style={{ ...fieldInputStyle, paddingRight: '2.6rem' }}
                    placeholder="Minimum 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    style={{ position: 'absolute', right: '0.7rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--neutral-300)', cursor: 'pointer', display: 'flex' }}
                  >
                    {showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                  <span style={{ color: 'var(--neutral-400)' }}>Share this credential securely with the account owner.</span>
                  <span style={{ color: passwordStrength.color, fontWeight: 700 }}>{passwordStrength.label}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', marginTop: '0.35rem', overflow: 'hidden' }}>
                  <div style={{ width: `${passwordStrength.score}%`, height: '100%', background: passwordStrength.color, transition: 'width 0.3s' }} />
                </div>
              </div>

              {isStudent && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={fieldLabelStyle} htmlFor="dean-student-id">Student ID</label>
                      <input id="dean-student-id" className="form-input" style={fieldInputStyle} placeholder="e.g. 20273710" value={newStudentId} onChange={(e) => setNewStudentId(e.target.value.replace(/\s/g, ''))} required />
                    </div>
                    <div>
                      <label style={fieldLabelStyle} htmlFor="dean-year-level">Year Level</label>
                      <select id="dean-year-level" className="form-select" style={fieldInputStyle} value={newYearLevel} onChange={(e) => setNewYearLevel(e.target.value)}>
                        {Object.keys(yearLevelBlocksMap).map((yr) => (
                          <option key={yr} value={yr}>{yr} ({(yearLevelBlocksMap[yr] || []).length} Sections)</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <span style={fieldLabelStyle}>Section Placement</span>
                    <div className="dean-role-switch" role="radiogroup" aria-label="Section placement">
                      <button type="button" role="radio" aria-checked={placementMode === 'auto'} className={placementMode === 'auto' ? 'active' : ''} onClick={() => setPlacementMode('auto')}>
                        <Sparkles size={14} /> Auto-Assign (First Vacant)
                      </button>
                      <button type="button" role="radio" aria-checked={placementMode === 'manual'} className={placementMode === 'manual' ? 'active' : ''} onClick={() => setPlacementMode('manual')}>
                        <Layers size={14} /> Choose Section
                      </button>
                    </div>
                    {placementMode === 'manual' && (
                      <select
                        className="form-select"
                        style={{ ...fieldInputStyle, marginTop: '0.65rem' }}
                        value={manualSection}
                        onChange={(e) => setManualSection(e.target.value)}
                        aria-label="Choose section"
                      >
                        <option value="">Select a section…</option>
                        {newYearUsage.map((b) => (
                          <option key={b.block} value={b.block} disabled={b.isFull}>
                            {b.block} — {b.count}/{MAX_STUDENTS_PER_SECTION}{b.isFull ? ' (Full)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.8rem 1rem', borderRadius: 'var(--radius-md)', background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.3)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.72rem', color: '#6ee7b7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {placementMode === 'auto' ? 'Automatic Placement' : 'Selected Placement'}
                      </div>
                      <div style={{ fontWeight: 800, color: 'white', fontSize: '1.05rem' }}>{newYearLevel} • {targetPlacement.block}</div>
                    </div>
                    <Badge variant={targetPlacement.isFull ? 'error' : 'success'}>
                      {targetPlacement.count}/{MAX_STUDENTS_PER_SECTION} • {targetPlacement.vacant} vacant
                    </Badge>
                  </div>
                </>
              )}

              <Button type="submit" variant="accent" size="lg" disabled={creatingAccount} style={{ width: '100%' }}>
                <UserPlus size={17} /> {creatingAccount ? 'Creating Account…' : submitLabel}
              </Button>
            </form>
          </GlassCard>

          {/* RIGHT: Capacity board / staff snapshot */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>
            {isStudent ? (
              <GlassCard>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'white' }}>Section Capacity Board</h3>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--neutral-400)' }}>{newYearLevel} • 50 students per section</p>
                  </div>
                  <Badge variant="primary">{newYearUsage.length} Sections</Badge>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {newYearUsage.map((b) => {
                    const isTarget = b.block === targetPlacement.block;
                    const pct = Math.min(100, Math.round((b.count / MAX_STUDENTS_PER_SECTION) * 100));
                    const barColor = b.isFull ? '#f87171' : pct >= 80 ? '#fbbf24' : '#34d399';
                    const selectable = placementMode === 'manual' && !b.isFull;
                    return (
                      <button
                        key={b.block}
                        type="button"
                        disabled={!selectable}
                        onClick={() => selectable && setManualSection(b.block)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '0.6rem 0.75rem',
                          borderRadius: 'var(--radius-md)', color: 'white',
                          background: isTarget ? 'rgba(52, 211, 153, 0.1)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isTarget ? 'rgba(52, 211, 153, 0.45)' : 'var(--glass-border)'}`,
                          cursor: selectable ? 'pointer' : 'default',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                          <span style={{ fontWeight: 700 }}>
                            {b.block}
                            {isTarget && <span style={{ marginLeft: '0.45rem', fontSize: '0.68rem', color: '#6ee7b7', fontWeight: 800 }}>• NEXT</span>}
                          </span>
                          <span style={{ color: b.isFull ? '#fca5a5' : 'var(--neutral-300)', fontWeight: 600 }}>
                            {b.isFull ? 'FULL' : `${b.count}/${MAX_STUDENTS_PER_SECTION}`}
                          </span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginTop: '0.4rem', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: barColor }} />
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginTop: '1rem', paddingTop: '0.9rem', borderTop: '1px solid var(--glass-border)' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--neutral-400)' }}>
                    Next available block: <strong style={{ color: 'white' }}>{nextBlockSuggestion}</strong>
                  </span>
                  <Button type="button" variant="outline" size="sm" disabled={creatingSection} onClick={handleCreateNextSection}>
                    <Plus size={13} /> {creatingSection ? 'Opening…' : `Open ${nextBlockSuggestion}`}
                  </Button>
                </div>
              </GlassCard>
            ) : (
              <GlassCard>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'white' }}>Staff Directory Snapshot</h3>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--neutral-400)' }}>
                      {staffUsers.filter((u) => u.role === 'teacher').length} Teachers • {staffUsers.filter((u) => u.role === 'secretary').length} Secretaries
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => handleSectionChange('user_management')}>View All</Button>
                </div>
                {recentStaff.length === 0 ? (
                  <p style={{ color: 'var(--neutral-400)', fontSize: '0.85rem', margin: 0 }}>No staff accounts on record yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {recentStaff.map((s) => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--neutral-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</div>
                        </div>
                        <Badge variant={s.role === 'teacher' ? 'primary' : 'warning'}>{s.role.toUpperCase()}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            )}

            <GlassCard>
              <h3 style={{ margin: '0 0 0.65rem', fontSize: '1rem', fontWeight: 700, color: 'white' }}>Enrollment Policy</h3>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--neutral-300)', lineHeight: 1.45 }}>
                <li>Each section holds a maximum of <strong style={{ color: 'white' }}>50 students</strong>; the next student moves to the following block automatically.</li>
                <li>Accounts are created under your department and SY <strong style={{ color: 'white' }}>{CURRENT_SCHOOL_YEAR}</strong>.</li>
                <li>Students sign in with their Student ID or institutional email; first sign-in on a new device requires email OTP.</li>
                <li>Year Level and Section can be reassigned anytime from <strong style={{ color: 'white' }}>Student Management</strong>.</li>
              </ul>
            </GlassCard>
          </div>
        </div>
      </div>
    );
  };

  const renderPlacementModal = () => {
    if (!editingStudent) return null;
    const usage = getBlockUsage(editYearLevel, editingStudent.id);
    const firstVacant = usage.find((b) => !b.isFull)?.block || computeNextBlockName(editYearLevel, usage.map((b) => b.block));

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dean-reassign-title"
        onClick={() => !savingPlacement && setEditingStudent(null)}
        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10, 2, 4, 0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      >
        <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '480px' }}>
          <GlassCard>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <h3 id="dean-reassign-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'white' }}>Reassign Year Level & Section</h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--neutral-300)' }}>
                  {editingStudent.name} • {editingStudent.lrn || 'No Student ID'} • Currently {getYearLevelFromBlock(editingStudent.section, editingStudent.grade)} • {editingStudent.section || 'Unassigned'}
                </p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setEditingStudent(null)} style={{ background: 'none', border: 'none', color: 'var(--neutral-300)', cursor: 'pointer', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div>
                <label style={fieldLabelStyle} htmlFor="dean-edit-year">Year Level</label>
                <select
                  id="dean-edit-year"
                  className="form-select"
                  style={fieldInputStyle}
                  value={editYearLevel}
                  onChange={(e) => { setEditYearLevel(e.target.value); setEditSection('auto'); }}
                >
                  {Object.keys(yearLevelBlocksMap).map((yr) => <option key={yr} value={yr}>{yr}</option>)}
                </select>
              </div>
              <div>
                <label style={fieldLabelStyle} htmlFor="dean-edit-section">Section / Block</label>
                <select
                  id="dean-edit-section"
                  className="form-select"
                  style={fieldInputStyle}
                  value={editSection}
                  onChange={(e) => setEditSection(e.target.value)}
                >
                  <option value="auto">Auto-assign first vacant ({firstVacant})</option>
                  {usage.map((b) => (
                    <option key={b.block} value={b.block} disabled={b.isFull && b.block !== editingStudent.section}>
                      {b.block} — {b.count}/{MAX_STUDENTS_PER_SECTION}{b.isFull ? ' (Full)' : ''}
                    </option>
                  ))}
                </select>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: 'var(--neutral-400)' }}>
                  Full sections (50/50) cannot accept additional students.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.25rem' }}>
              <Button type="button" variant="outline" onClick={() => setEditingStudent(null)} disabled={savingPlacement}>Cancel</Button>
              <Button type="button" variant="accent" onClick={handleSavePlacement} disabled={savingPlacement}>
                <Check size={15} /> {savingPlacement ? 'Saving…' : 'Save Placement'}
              </Button>
            </div>
          </GlassCard>
        </div>
      </div>
    );
  };

  const handleSectionChange = (sectionId: string) => {
    setActiveSection(sectionId);
    const path = sectionToPath[sectionId] || '/dean/dashboard';
    navigate(path, { replace: true });
  };

  return (
    <DashboardLayout role="dean">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', minWidth: 0 }}>
        {renderAlerts()}
        {activeSection === 'overview' && renderOverview()}
        {activeSection === 'user_management' && renderUserManagement()}
        {activeSection === 'student_management' && renderStudentManagement()}
        {activeSection === 'create_account' && renderCreateAccount()}
        {activeSection === 'quiz_oversight' && renderQuizOversight()}
        {activeSection === 'security' && renderSecurity()}
        {activeSection === 'analytics' && renderAnalytics()}
        {activeSection === 'activity_logs' && renderActivityLogs()}
        {activeSection === 'settings' && renderSettings()}
        {renderPlacementModal()}
      </div>
    </DashboardLayout>
  );
}
