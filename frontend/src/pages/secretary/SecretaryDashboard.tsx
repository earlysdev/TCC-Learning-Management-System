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
  getDepartmentName,
  CURRENT_SCHOOL_YEAR,
  type CurriculumSubjectItem,
} from '../../lib/constants';
import { 
  Users, UserPlus, BookOpen, Activity, ArrowRight,
  CheckCircle2, AlertCircle, FileText, BarChart3, 
  GraduationCap, Download, Layers, Plus, Trash2, Search, Sparkles,
  KeyRound, Copy, Check, Eye, EyeOff, Printer, Clock, ShieldCheck, RefreshCw, X
} from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import ProfileUpdateCard from '../../components/ui/ProfileUpdateCard';
import {
  AccountCredentialsEmailReceipt,
  createFallbackAccountReceipt,
  type AccountEmailDispatchReceipt,
} from '../../components/ui/AccountCredentialsEmailReceipt';
import { useToastContext } from '../../contexts/ToastContext';
import { generateStrongPassword, evaluatePasswordStrength } from '../../lib/passwordUtils';

const MAX_STUDENTS_PER_SECTION = 50;

interface SecretaryMetrics {
  total_students: number;
  total_teachers: number;
  recent_registrations: number;
  system_status?: string;
}

type ReportTypeId = 'student_masterlist' | 'graduating_roster' | 'section_capacity' | 'curriculum_prospectus';

interface RecentExportRecord {
  id: string;
  reportId: ReportTypeId;
  docCode: string;
  title: string;
  format: 'Classic Printable Sheet (PDF)' | 'Official CSV Ledger';
  scopeSummary: string;
  recordCount: number;
  exportedBy: string;
  exportedAt: string;
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
  const departmentCode = (user?.department || 'CIT').toUpperCase();
  const departmentName = getDepartmentName(departmentCode);
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
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [lrn, setLrn] = useState('');
  const [yearLevel, setYearLevel] = useState('1st Year');
  const [dispatchedAccountReceipt, setDispatchedAccountReceipt] = useState<AccountEmailDispatchReceipt | null>(null);

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

  // Official College Reports state
  const [reportYearFilter, setReportYearFilter] = useState<string>('ALL');
  const [reportStatusFilter, setReportStatusFilter] = useState<string>('ALL');
  const [activePreviewReport, setActivePreviewReport] = useState<ReportTypeId | null>(null);
  const [recentExports, setRecentExports] = useState<RecentExportRecord[]>(() => {
    try {
      const saved = localStorage.getItem('tcc_secretary_recent_exportations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback
    }
    return [];
  });

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

  // Compute automatic section assignment for a given Year Level (50 students max per section)
  const getAutoSectionAssignment = (targetYear: string) => {
    const blocks = yearLevelBlocksMap[targetYear] || YEAR_LEVEL_BLOCKS['1st Year'] || ['Block - 1A'];
    const blockUsage = blocks.map((blk) => {
      const count = students.filter((s) => (s.section || '').trim().toLowerCase() === blk.toLowerCase()).length;
      return {
        block: blk,
        count,
        isFull: count >= MAX_STUDENTS_PER_SECTION,
        vacant: Math.max(0, MAX_STUDENTS_PER_SECTION - count),
      };
    });

    const firstAvailableIndex = blockUsage.findIndex((b) => !b.isFull);
    if (firstAvailableIndex !== -1) {
      const assigned = blockUsage[firstAvailableIndex];
      const nextBlock =
        blockUsage[firstAvailableIndex + 1]?.block ||
        computeNextBlockSuggestion(targetYear, blocks);
      return {
        assignedBlock: assigned.block,
        currentCount: assigned.count,
        vacantSlots: assigned.vacant,
        nextFallbackBlock: nextBlock,
        allFull: false,
        blockUsage,
      };
    }

    // All existing blocks in this year level have reached 50 students -> auto-overflow to next block letter
    const overflowBlock = computeNextBlockSuggestion(targetYear, blocks);
    return {
      assignedBlock: overflowBlock,
      currentCount: 0,
      vacantSlots: MAX_STUDENTS_PER_SECTION,
      nextFallbackBlock: computeNextBlockSuggestion(targetYear, [...blocks, overflowBlock]),
      allFull: true,
      blockUsage,
    };
  };

  const currentAutoAssignment = useMemo(
    () => getAutoSectionAssignment(yearLevel),
    [yearLevel, yearLevelBlocksMap, students]
  );

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

      const studentsData = await lmsFetch<PaginatedResponse<User> | { data?: { data?: User[] } | User[] } | User[]>('/users?role=student&per_page=500').catch(() => []);
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

  const handleGenerateStrongPassword = () => {
    const generated = generateStrongPassword(12);
    setPassword(generated);
    setShowPassword(true);
    setCopiedPassword(false);
    showToast('Generated strong institutional password.', 'info');
  };

  const handleCopyPassword = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopiedPassword(true);
      showToast('Strong password copied to clipboard!', 'success');
      setTimeout(() => setCopiedPassword(false), 2500);
    } catch {
      showToast('Could not copy automatically — please copy from the visible field.', 'warning');
    }
  };

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
          department: departmentCode,
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
      const autoAssign = getAutoSectionAssignment(yearLevel);
      const assignedSection = newUserRole === 'student' ? autoAssign.assignedBlock : null;

      const response = await lmsFetch<{
        data?: User;
        message?: string;
        email_dispatch?: AccountEmailDispatchReceipt;
      }>('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: fullName,
          first_name: firstName,
          last_name: lastName,
          email,
          password,
          role: newUserRole,
          lrn: newUserRole === 'student' ? lrn : null,
          grade: newUserRole === 'student' ? yearLevel : null,
          section: assignedSection,
        }),
      });

      const finalSection = response?.data?.section || assignedSection;
      const receiptDepartment = (response?.data?.department || departmentCode).toUpperCase();
      const roleTitle = newUserRole === 'student' ? 'Student Learner' : 'Faculty Teacher';
      const fallbackReceipt = response?.email_dispatch || createFallbackAccountReceipt({
        recipient: email.trim(),
        accountName: fullName,
        role: newUserRole,
        roleLabel: roleTitle,
        department: receiptDepartment,
        departmentLabel: `${receiptDepartment} — ${getDepartmentName(receiptDepartment)}`,
        schoolYear: response?.data?.school_year || CURRENT_SCHOOL_YEAR,
        lrn: newUserRole === 'student' ? lrn.trim() : null,
        grade: newUserRole === 'student' ? yearLevel : null,
        section: newUserRole === 'student' ? finalSection : null,
        plainPassword: password,
        issuedBy: user?.name || 'Office of the College Secretary',
        issuedByRole: 'College Secretary',
      });

      setDispatchedAccountReceipt(fallbackReceipt);

      const emailDelivered = Boolean(fallbackReceipt.sent);
      const baseMsg =
        newUserRole === 'student'
          ? `Student ${fullName} enrolled into ${yearLevel} • ${finalSection}`
          : `Teacher account for ${fullName} created`;
      const msg = emailDelivered
        ? `${baseMsg} and official account credentials dispatched to ${email.trim()}!`
        : `${baseMsg}. ${fallbackReceipt.mail_warning || response?.message || 'Email was not delivered externally — share the slip below.'}`;

      setNotice(msg);
      showToast(msg, emailDelivered ? 'success' : 'warning');
      // Reset form
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setLrn('');
      await loadSecretaryData();
      await loadSections();
      await loadActivityLogs();
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

  // Merge official 58 BSIT subjects (excluding Practicum and legacy Math 1/2/3/NSTP 1 duplicates) with any extra custom subjects added via API
  const allCurriculumSubjects: CurriculumSubjectItem[] = useMemo(() => {
    const baseList = [...BSIT_SUBJECTS];
    const excludedLegacyCodes = new Set(['prac 101', 'nstp 1', 'math 1', 'math 2', 'math 3']);
    const knownCodes = new Set(baseList.map((item) => item.code.toLowerCase()));
    customSubjects.forEach((subj) => {
      const code = (subj.code || '').trim();
      const name = (subj.name || '').trim();
      if (!code || !name) return;
      if (/^prac/i.test(code) || /practicum/i.test(name)) return;
      if (excludedLegacyCodes.has(code.toLowerCase())) return;
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

  // Record an export in Recent Exportations history
  const recordReportExport = (
    reportId: ReportTypeId,
    docCode: string,
    title: string,
    format: RecentExportRecord['format'],
    scopeSummary: string,
    recordCount: number
  ) => {
    const newEntry: RecentExportRecord = {
      id: `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      reportId,
      docCode,
      title,
      format,
      scopeSummary,
      recordCount,
      exportedBy: user?.name ? `${user.name} (Secretary)` : 'School Secretary',
      exportedAt: new Date().toISOString(),
    };
    setRecentExports((prev) => {
      const updated = [newEntry, ...prev].slice(0, 20);
      try {
        localStorage.setItem('tcc_secretary_recent_exportations', JSON.stringify(updated));
      } catch {
        // Ignore storage error
      }
      return updated;
    });
  };

  // Filtered students for Official College Reports
  const reportFilteredStudents = useMemo(() => {
    return students.filter((s) => {
      const sYear = getYearLevelFromBlock(s.section, s.grade);
      const matchesYear = reportYearFilter === 'ALL' || sYear === reportYearFilter;
      const matchesStatus = reportStatusFilter === 'ALL' || (s.status || 'active') === reportStatusFilter;
      return matchesYear && matchesStatus;
    });
  }, [students, reportYearFilter, reportStatusFilter]);

  const graduatingStudentsList = useMemo(() => {
    return students.filter((s) => {
      const sYear = getYearLevelFromBlock(s.section, s.grade);
      return sYear === '4th Year' || s.status === 'graduated';
    });
  }, [students]);

  const handleDownloadCsvReport = (reportId: ReportTypeId) => {
    let csvContent = '';
    let filename = '';
    let docCode = '';
    let title = '';
    let scopeSummary = '';
    let count = 0;

    if (reportId === 'student_masterlist') {
      docCode = 'TCC-REG-FORM-01';
      title = 'Complete Student Masterlist';
      const rows = reportFilteredStudents;
      count = rows.length;
      scopeSummary = `${reportYearFilter === 'ALL' ? 'All Year Levels' : reportYearFilter} • ${reportStatusFilter === 'ALL' ? 'All Statuses' : reportStatusFilter}`;
      const header = ['No.', 'Student ID', 'Full Name', 'Year Level', 'Class Section / Block', 'Email Address', 'Enrollment Status'];
      const body = rows.map((s, idx) => [
        String(idx + 1),
        s.lrn || 'N/A',
        `"${(s.name || '').replace(/"/g, '""')}"`,
        getYearLevelFromBlock(s.section, s.grade),
        s.section || 'Block - 1A',
        s.email || '',
        (s.status || 'active').toUpperCase(),
      ]);
      csvContent = [header.join(','), ...body.map((r) => r.join(','))].join('\n');
      filename = `TCC_Student_Masterlist_${new Date().toISOString().slice(0, 10)}.csv`;
    } else if (reportId === 'graduating_roster') {
      docCode = 'TCC-REG-FORM-02';
      title = 'Graduating Students Roster (4th Year)';
      const rows = graduatingStudentsList;
      count = rows.length;
      scopeSummary = '4th Year BSIT (Blocks 4A–4E) • S.Y. 2026–2027';
      const header = ['No.', 'Student ID', 'Candidate Name', 'Year Level', 'Assigned Block', 'Email Address', 'Graduation Status'];
      const body = rows.map((s, idx) => [
        String(idx + 1),
        s.lrn || 'N/A',
        `"${(s.name || '').replace(/"/g, '""')}"`,
        getYearLevelFromBlock(s.section, s.grade),
        s.section || 'Block - 4A',
        s.email || '',
        (s.status || 'active').toUpperCase(),
      ]);
      csvContent = [header.join(','), ...body.map((r) => r.join(','))].join('\n');
      filename = `TCC_Graduating_Roster_SY2026_2027_${new Date().toISOString().slice(0, 10)}.csv`;
    } else if (reportId === 'section_capacity') {
      docCode = 'TCC-REG-FORM-03';
      title = 'Section & Block Capacity Utilization Report';
      const allRows: string[][] = [];
      let idx = 1;
      Object.entries(yearLevelBlocksMap).forEach(([yr, blks]) => {
        if (reportYearFilter !== 'ALL' && yr !== reportYearFilter) return;
        blks.forEach((blk) => {
          const enrolled = students.filter((s) => (s.section || '').trim().toLowerCase() === blk.toLowerCase()).length;
          const vacant = Math.max(0, MAX_STUDENTS_PER_SECTION - enrolled);
          const status = enrolled >= MAX_STUDENTS_PER_SECTION ? 'FULL (50/50)' : 'VACANT AVAILABLE';
          allRows.push([
            String(idx++),
            yr,
            blk,
            String(enrolled),
            String(MAX_STUDENTS_PER_SECTION),
            String(vacant),
            status,
          ]);
        });
      });
      count = allRows.length;
      scopeSummary = `${reportYearFilter === 'ALL' ? '1st–4th Year Sections' : reportYearFilter} • Max 50 Students/Section`;
      const header = ['No.', 'Year Level', 'Class Section / Block', 'Enrolled Students', 'Max Capacity', 'Vacant Slots', 'Section Status'];
      csvContent = [header.join(','), ...allRows.map((r) => r.join(','))].join('\n');
      filename = `TCC_Section_Capacity_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    } else {
      docCode = 'TCC-REG-FORM-04';
      title = 'Official BSIT Curriculum Prospectus Ledger';
      const rows = allCurriculumSubjects.filter(
        (c) => reportYearFilter === 'ALL' || c.yearLevel === reportYearFilter
      );
      count = rows.length;
      scopeSummary = `${reportYearFilter === 'ALL' ? '1st–4th Year BSIT' : reportYearFilter} (Excl. Practicum)`;
      const header = ['Course Code', 'Descriptive Title', 'Year Level', 'Semester', 'Lec', 'Lab', 'Total Units (TU)', 'Prerequisite'];
      const body = rows.map((c) => [
        `"${c.code}"`,
        `"${c.name.replace(/"/g, '""')}"`,
        c.yearLevel,
        c.semester,
        String(c.lec),
        String(c.lab),
        String(c.units),
        `"${c.prerequisite}"`,
      ]);
      csvContent = [header.join(','), ...body.map((r) => r.join(','))].join('\n');
      filename = `TCC_BSIT_Curriculum_Prospectus_${new Date().toISOString().slice(0, 10)}.csv`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    recordReportExport(reportId, docCode, title, 'Official CSV Ledger', scopeSummary, count);
    showToast(`Exported "${title}" (${count} records) and recorded in Recent Exportations.`, 'success');
  };

  const handleOpenClassicSheet = (reportId: ReportTypeId, autoRecord = true) => {
    setActivePreviewReport(reportId);
    if (!autoRecord) return;

    if (reportId === 'student_masterlist') {
      recordReportExport(
        reportId,
        'TCC-REG-FORM-01',
        'Complete Student Masterlist',
        'Classic Printable Sheet (PDF)',
        `${reportYearFilter === 'ALL' ? 'All Year Levels' : reportYearFilter} • ${reportStatusFilter === 'ALL' ? 'All Statuses' : reportStatusFilter}`,
        reportFilteredStudents.length
      );
    } else if (reportId === 'graduating_roster') {
      recordReportExport(
        reportId,
        'TCC-REG-FORM-02',
        'Graduating Students Roster (4th Year)',
        'Classic Printable Sheet (PDF)',
        '4th Year BSIT (Blocks 4A–4E) • S.Y. 2026–2027',
        graduatingStudentsList.length
      );
    } else if (reportId === 'section_capacity') {
      const secCount = Object.entries(yearLevelBlocksMap)
        .filter(([yr]) => reportYearFilter === 'ALL' || yr === reportYearFilter)
        .reduce((acc, [, blks]) => acc + blks.length, 0);
      recordReportExport(
        reportId,
        'TCC-REG-FORM-03',
        'Section & Block Capacity Utilization Report',
        'Classic Printable Sheet (PDF)',
        `${reportYearFilter === 'ALL' ? 'All Year Levels' : reportYearFilter} • 50-Student Limit`,
        secCount
      );
    } else {
      const subjCount = allCurriculumSubjects.filter(
        (c) => reportYearFilter === 'ALL' || c.yearLevel === reportYearFilter
      ).length;
      recordReportExport(
        reportId,
        'TCC-REG-FORM-04',
        'Official BSIT Curriculum Prospectus Ledger',
        'Classic Printable Sheet (PDF)',
        `${reportYearFilter === 'ALL' ? '1st–4th Year BSIT' : reportYearFilter} (Excl. Practicum)`,
        subjCount
      );
    }
  };

  const handlePrintOfficialSheet = () => {
    window.print();
  };

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
        <StatCard label="Class Sections" value={allAvailableBlocks.length} icon={<Layers size={24} />} detail={`${allAvailableYearLevels.length} Year Levels (50/Sec Cap)`} />
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

  const renderCreateAccount = () => {
    const pwStrength = evaluatePasswordStrength(password);
    const fillPct = Math.min(100, Math.round((currentAutoAssignment.currentCount / MAX_STUDENTS_PER_SECTION) * 100));
    const yearStudentsTotal = students.filter(
      (s) => getYearLevelFromBlock(s.section, s.grade) === yearLevel
    ).length;
    const yearTotalCapacity = currentAutoAssignment.blockUsage.length * MAX_STUDENTS_PER_SECTION;

    return (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Full-Width Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
              REGISTRATION &amp; AUTO-SECTIONING
            </span>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
              Create New Account
            </h1>
            <p style={{ color: 'var(--neutral-300)' }}>
              Register a verified student learner or faculty teacher. Students are automatically assigned to the first vacant section in their Year Level (50 students max per section).
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button variant="outline" onClick={() => handleSectionChange('blocks')}>
              <Layers size={16} /> Manage Sections &amp; Years
            </Button>
            <Button variant="outline" onClick={() => handleSectionChange('student_records')}>
              <BookOpen size={16} /> Student Directory ({students.length})
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

        {dispatchedAccountReceipt && (
          <AccountCredentialsEmailReceipt
            receipt={dispatchedAccountReceipt}
            onDismiss={() => setDispatchedAccountReceipt(null)}
            onViewDirectory={() => handleSectionChange('student_records')}
            directoryButtonLabel={dispatchedAccountReceipt.role === 'teacher' ? 'View Account Directory' : 'View in Student Directory'}
          />
        )}

        {/* Full-Width 2-Column Balanced Workspace Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
            gap: '1.35rem',
            alignItems: 'stretch',
          }}
        >
          {/* Left Column: Account Registration Form */}
          <GlassCard style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem', height: '100%', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary-300)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      OFFICIAL ACCOUNT REGISTRATION
                    </span>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'white', margin: '0.15rem 0 0' }}>
                      Account Credentials &amp; Academic Profile
                    </h2>
                  </div>
                  <Badge variant="primary">S.Y. 2026–2027</Badge>
                </div>

                {/* Segmented Account Role Cards */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', color: 'var(--neutral-200)', fontWeight: 700, marginBottom: '0.45rem' }}>
                    Account Role
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setNewUserRole('student')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.7rem 0.95rem',
                        borderRadius: '10px',
                        background:
                          newUserRole === 'student'
                            ? 'rgba(139, 92, 246, 0.22)'
                            : 'rgba(255, 255, 255, 0.04)',
                        border:
                          newUserRole === 'student'
                            ? '1px solid rgba(167, 139, 250, 0.6)'
                            : '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <GraduationCap size={18} style={{ color: newUserRole === 'student' ? '#c4b5fd' : 'var(--neutral-400)' }} />
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>Student Learner</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--neutral-300)' }}>Auto-assigned to 50-cap block</div>
                        </div>
                      </div>
                      <input
                        type="radio"
                        name="role"
                        value="student"
                        checked={newUserRole === 'student'}
                        onChange={() => setNewUserRole('student')}
                        style={{ accentColor: 'var(--primary-400)' }}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewUserRole('teacher')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.7rem 0.95rem',
                        borderRadius: '10px',
                        background:
                          newUserRole === 'teacher'
                            ? 'rgba(245, 158, 11, 0.18)'
                            : 'rgba(255, 255, 255, 0.04)',
                        border:
                          newUserRole === 'teacher'
                            ? '1px solid rgba(251, 191, 36, 0.55)'
                            : '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Users size={18} style={{ color: newUserRole === 'teacher' ? '#fde68a' : 'var(--neutral-400)' }} />
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>Faculty Teacher</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--neutral-300)' }}>BSIT course &amp; quiz instructor</div>
                        </div>
                      </div>
                      <input
                        type="radio"
                        name="role"
                        value="teacher"
                        checked={newUserRole === 'teacher'}
                        onChange={() => setNewUserRole('teacher')}
                        style={{ accentColor: 'var(--primary-400)' }}
                      />
                    </button>
                  </div>
                </div>

                {/* Row 1: First Name & Last Name */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.84rem', color: 'var(--neutral-200)', fontWeight: 700, height: '22px', marginBottom: '0.4rem' }}>
                      First Name
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Juan"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      required
                      style={{ height: '44px', margin: 0, width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.84rem', color: 'var(--neutral-200)', fontWeight: 700, height: '22px', marginBottom: '0.4rem' }}>
                      Last Name
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Dela Cruz"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      required
                      style={{ height: '44px', margin: 0, width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Row 2: Email Address & Student ID side-by-side (or full width Email for Teacher) */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: newUserRole === 'student' ? 'repeat(auto-fit, minmax(200px, 1fr))' : '1fr',
                    gap: '1rem',
                    alignItems: 'start',
                  }}
                >
                  <div>
                    <label style={{ display: 'block', fontSize: '0.84rem', color: 'var(--neutral-200)', fontWeight: 700, height: '22px', marginBottom: '0.4rem' }}>
                      Official Email Address
                    </label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="e.g. juan.delacruz@tcc.edu.ph"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      style={{ height: '44px', margin: 0, width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  {newUserRole === 'student' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '22px', marginBottom: '0.4rem' }}>
                        <label style={{ fontSize: '0.84rem', color: 'var(--neutral-200)', fontWeight: 700, margin: 0 }}>
                          Student ID (Login Username)
                        </label>
                        <span style={{ fontSize: '0.7rem', color: 'var(--neutral-400)' }}>Max 12 digits</span>
                      </div>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. 20273710"
                        value={lrn}
                        onChange={e => setLrn(e.target.value.replace(/\D/g, '').slice(0, 12))}
                        maxLength={12}
                        required
                        style={{ height: '44px', margin: 0, width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                      />
                    </div>
                  )}
                </div>

                {/* Row 3: Strong Password Generator & Field */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', minHeight: '24px' }}>
                    <label style={{ fontSize: '0.84rem', color: 'var(--neutral-200)', fontWeight: 700, margin: 0 }}>
                      Initial Password
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <button
                        type="button"
                        onClick={handleGenerateStrongPassword}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.28rem 0.68rem',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(139, 92, 246, 0.25))',
                          border: '1px solid rgba(251, 191, 36, 0.45)',
                          color: '#fde68a',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <KeyRound size={13} /> Generate Strong Password
                      </button>
                      {password && (
                        <button
                          type="button"
                          onClick={handleCopyPassword}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.28rem 0.6rem',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.07)',
                            border: '1px solid rgba(255, 255, 255, 0.16)',
                            color: copiedPassword ? '#86efac' : '#e2e8f0',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {copiedPassword ? <Check size={13} /> : <Copy size={13} />}
                          {copiedPassword ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter initial password or click Generate Strong Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      className="form-input"
                      style={{
                        height: '44px',
                        margin: 0,
                        width: '100%',
                        boxSizing: 'border-box',
                        paddingRight: '2.75rem',
                        fontFamily: showPassword ? 'monospace' : 'inherit',
                        letterSpacing: showPassword ? '0.4px' : 'normal',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      style={{
                        position: 'absolute',
                        right: '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--neutral-300)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: 0,
                      }}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--neutral-400)' }}>
                      Minimum 8 characters. Click <strong style={{ color: '#fde68a' }}>Generate Strong Password</strong> for a 12-character credential.
                    </span>
                    {password && (
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: pwStrength.color }}>
                        {pwStrength.label}
                      </span>
                    )}
                  </div>
                  <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${password ? pwStrength.score : 0}%`,
                        height: '100%',
                        background: pwStrength.color,
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>
                </div>

                {/* Row 4 (Student): Year Level & Auto-Assigned Section — Locked 100% on the exact same horizontal line */}
                {newUserRole === 'student' && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                      gap: '1rem',
                      alignItems: 'start',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '24px', marginBottom: '0.4rem' }}>
                        <label style={{ fontSize: '0.84rem', color: 'var(--neutral-200)', fontWeight: 700, margin: 0 }}>
                          Year Level
                        </label>
                        <span style={{ fontSize: '0.72rem', color: 'var(--neutral-400)' }}>Select 1st–4th Yr</span>
                      </div>
                      <select
                        value={yearLevel}
                        onChange={e => setYearLevel(e.target.value)}
                        className="form-select"
                        style={{ height: '46px', margin: 0, width: '100%', boxSizing: 'border-box' }}
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', height: '24px', marginBottom: '0.4rem' }}>
                        <label style={{ fontSize: '0.84rem', color: 'var(--neutral-200)', fontWeight: 700, margin: 0, whiteSpace: 'nowrap' }}>
                          Assigned Section (Auto)
                        </label>
                        <span
                          style={{
                            fontSize: '0.66rem',
                            fontWeight: 800,
                            padding: '0.12rem 0.5rem',
                            borderRadius: '999px',
                            background: 'rgba(16, 185, 129, 0.18)',
                            border: '1px solid rgba(16, 185, 129, 0.45)',
                            color: '#6ee7b7',
                            letterSpacing: '0.3px',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Auto • 50 Max
                        </span>
                      </div>

                      <div
                        style={{
                          height: '46px',
                          padding: '0 0.85rem',
                          borderRadius: '8px',
                          background: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.5rem',
                          boxSizing: 'border-box',
                        }}
                      >
                        <span style={{ fontWeight: 800, fontSize: '0.96rem', color: 'white', whiteSpace: 'nowrap' }}>
                          {currentAutoAssignment.assignedBlock}
                        </span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#a7f3d0', whiteSpace: 'nowrap' }}>
                          {currentAutoAssignment.currentCount} / {MAX_STUDENTS_PER_SECTION} Enrolled ({currentAutoAssignment.vacantSlots} Vacant)
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Button variant="accent" size="lg" type="submit" disabled={busy} style={{ width: '100%', height: '48px', marginTop: '0.25rem' }}>
                <UserPlus size={18} />{' '}
                {busy
                  ? 'Creating User Account...'
                  : newUserRole === 'student'
                    ? `Register Student into ${yearLevel} • ${currentAutoAssignment.assignedBlock}`
                    : 'Register Faculty Teacher Account'}
              </Button>
            </form>
          </GlassCard>

          {/* Right Column: Live Section Capacity Monitor & Recent Enrollments */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <GlassCard style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      LIVE SECTION CAPACITY QUEUE (50 STUDENTS / SECTION)
                    </span>
                    <h2 style={{ fontSize: '1.18rem', fontWeight: 800, color: 'white', margin: '0.15rem 0 0' }}>
                      {yearLevel} Auto-Sectioning Monitor
                    </h2>
                  </div>
                  <Badge variant="success">
                    {yearStudentsTotal} / {yearTotalCapacity} Enrolled
                  </Badge>
                </div>

                {/* Year Level Quick-Switch Tabs */}
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  {allAvailableYearLevels.map((yrLbl) => {
                    const active = yearLevel === yrLbl;
                    return (
                      <button
                        key={yrLbl}
                        type="button"
                        onClick={() => setYearLevel(yrLbl)}
                        style={{
                          flex: 1,
                          minWidth: '95px',
                          padding: '0.4rem 0.65rem',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          background: active ? 'var(--accent-purple)' : 'rgba(255, 255, 255, 0.05)',
                          border: active ? '1px solid #c4b5fd' : '1px solid rgba(255, 255, 255, 0.1)',
                          color: active ? 'white' : 'var(--neutral-300)',
                        }}
                      >
                        {yrLbl}
                      </button>
                    );
                  })}
                </div>

                {/* Active Auto-Assigned Section Highlight Banner */}
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: '10px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'white' }}>
                        Next Assigned: {currentAutoAssignment.assignedBlock}
                      </span>
                      <Badge variant="success">Active Target</Badge>
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fbbf24' }}>
                      {currentAutoAssignment.currentCount} / {MAX_STUDENTS_PER_SECTION} Students
                    </span>
                  </div>

                  <div style={{ width: '100%', height: '7px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${fillPct}%`,
                        height: '100%',
                        background: fillPct >= 90 ? '#f59e0b' : '#10b981',
                        transition: 'width 0.25s ease',
                      }}
                    />
                  </div>

                  <div style={{ fontSize: '0.76rem', color: 'var(--neutral-200)', lineHeight: 1.4 }}>
                    <strong style={{ color: '#a7f3d0' }}>{currentAutoAssignment.vacantSlots} vacant slots</strong> remaining in{' '}
                    <strong style={{ color: 'white' }}>{currentAutoAssignment.assignedBlock}</strong>. Once it reaches{' '}
                    <strong>{MAX_STUDENTS_PER_SECTION}/{MAX_STUDENTS_PER_SECTION}</strong>, enrollment automatically advances to{' '}
                    <strong style={{ color: '#c4b5fd' }}>{currentAutoAssignment.nextFallbackBlock}</strong>.
                  </div>
                </div>

                {/* All Sections Capacity Breakdown for Selected Year Level */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {currentAutoAssignment.blockUsage.map((item) => {
                    const isTarget = item.block === currentAutoAssignment.assignedBlock;
                    const itemPct = Math.min(100, Math.round((item.count / MAX_STUDENTS_PER_SECTION) * 100));
                    return (
                      <div
                        key={item.block}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '110px 1fr 110px 88px',
                          alignItems: 'center',
                          gap: '0.65rem',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '8px',
                          background: isTarget ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.035)',
                          border: isTarget
                            ? '1px solid rgba(16, 185, 129, 0.4)'
                            : '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        <span style={{ fontWeight: 700, fontSize: '0.84rem', color: 'white', whiteSpace: 'nowrap' }}>
                          {item.block}
                        </span>
                        <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${itemPct}%`,
                              height: '100%',
                              background: item.isFull ? '#ef4444' : isTarget ? '#10b981' : '#6366f1',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.76rem', color: 'var(--neutral-300)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {item.count} / {MAX_STUDENTS_PER_SECTION} Students
                        </span>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            textAlign: 'center',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '999px',
                            whiteSpace: 'nowrap',
                            background: item.isFull
                              ? 'rgba(239, 68, 68, 0.2)'
                              : isTarget
                                ? 'rgba(16, 185, 129, 0.22)'
                                : 'rgba(255, 255, 255, 0.06)',
                            color: item.isFull ? '#fca5a5' : isTarget ? '#6ee7b7' : 'var(--neutral-400)',
                          }}
                        >
                          {item.isFull ? 'FULL 50/50' : isTarget ? 'NEXT AUTO' : `${item.vacant} VACANT`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '0.65rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  fontSize: '0.78rem',
                }}
              >
                <span style={{ color: 'var(--neutral-400)' }}>
                  Need another section under {yearLevel}?
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
                  + Create Section / Manage Year Levels
                </button>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    );
  };

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

    const gridColsTemplate = '112px minmax(0, 1fr) 38px 38px 38px 132px';

    const renderSemesterCurriculumCard = (
      yrLevel: string,
      sem: '1st Semester' | '2nd Semester' | 'Summer',
      semItems: CurriculumSubjectItem[]
    ) => {
      const totalLec = semItems.reduce((acc, i) => acc + i.lec, 0);
      const totalLab = semItems.reduce((acc, i) => acc + i.lab, 0);
      const totalTu = semItems.reduce((acc, i) => acc + i.units, 0);

      return (
        <div
          key={sem}
          style={{
            borderRadius: '10px',
            background: 'rgba(15, 23, 42, 0.55)',
            border: '1px solid rgba(255, 255, 255, 0.09)',
            overflow: 'hidden',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Semester Title Bar */}
          <div
            style={{
              padding: '0.65rem 0.9rem',
              background:
                sem === 'Summer'
                  ? 'rgba(245, 158, 11, 0.16)'
                  : 'rgba(63, 81, 181, 0.22)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.5rem',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontWeight: 800,
                fontSize: '0.84rem',
                color: 'white',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {yrLevel} • {sem}
            </span>
            <span style={{ fontSize: '0.76rem', color: '#cbd5e1', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {semItems.length} Courses • {totalTu} TU
            </span>
          </div>

          {/* Column Header Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: gridColsTemplate,
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.04)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'var(--neutral-300)',
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              flexShrink: 0,
            }}
          >
            <div style={{ padding: '0.5rem 0.65rem', whiteSpace: 'nowrap' }}>Course Code</div>
            <div style={{ padding: '0.5rem 0.65rem' }}>Descriptive Title</div>
            <div style={{ padding: '0.5rem 0.2rem', textAlign: 'center' }}>Lec</div>
            <div style={{ padding: '0.5rem 0.2rem', textAlign: 'center' }}>Lab</div>
            <div style={{ padding: '0.5rem 0.2rem', textAlign: 'center' }}>TU</div>
            <div style={{ padding: '0.5rem 0.65rem' }}>Preq</div>
          </div>

          {/* Flex-Stretched Course Rows Body (Eliminates any bottom gap between unequal semester counts) */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'stretch',
            }}
          >
            {semItems.map((subj) => (
              <div
                key={subj.code}
                style={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: gridColsTemplate,
                  alignItems: 'center',
                  minHeight: '40px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.045)',
                  fontSize: '0.81rem',
                  color: 'white',
                }}
              >
                <div style={{ padding: '0.45rem 0.65rem' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      fontSize: '0.74rem',
                      padding: '0.15rem 0.42rem',
                      borderRadius: '6px',
                      background: 'rgba(139, 92, 246, 0.18)',
                      border: '1px solid rgba(139, 92, 246, 0.35)',
                      color: '#ddd6fe',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {subj.code}
                  </span>
                </div>
                <div
                  style={{
                    padding: '0.45rem 0.65rem',
                    fontWeight: 600,
                    color: '#f8fafc',
                    lineHeight: 1.3,
                  }}
                >
                  {subj.name}
                </div>
                <div style={{ padding: '0.45rem 0.2rem', textAlign: 'center', color: '#cbd5e1' }}>
                  {subj.lec}
                </div>
                <div style={{ padding: '0.45rem 0.2rem', textAlign: 'center', color: '#cbd5e1' }}>
                  {subj.lab}
                </div>
                <div style={{ padding: '0.45rem 0.2rem', textAlign: 'center', fontWeight: 800, color: '#fbbf24' }}>
                  {subj.units}
                </div>
                <div
                  style={{
                    padding: '0.45rem 0.65rem',
                    color: subj.prerequisite === 'none' ? 'var(--neutral-400)' : '#93c5fd',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {subj.prerequisite}
                </div>
              </div>
            ))}
          </div>

          {/* Flush Bottom Total Credits Footer */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: gridColsTemplate,
              alignItems: 'center',
              minHeight: '40px',
              background: 'rgba(255, 255, 255, 0.055)',
              fontWeight: 800,
              fontSize: '0.81rem',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                gridColumn: '1 / span 2',
                padding: '0.5rem 0.65rem',
                textAlign: 'right',
                color: '#cbd5e1',
                fontSize: '0.74rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Total Credits
            </div>
            <div style={{ padding: '0.5rem 0.2rem', textAlign: 'center', color: 'white' }}>{totalLec}</div>
            <div style={{ padding: '0.5rem 0.2rem', textAlign: 'center', color: 'white' }}>{totalLab}</div>
            <div style={{ padding: '0.5rem 0.2rem', textAlign: 'center', color: '#a5d6a7' }}>{totalTu}</div>
            <div style={{ padding: '0.5rem 0.65rem' }} />
          </div>
        </div>
      );
    };

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
              Manually create and manage Year Levels (1st to 4th Year), Class Sections/Blocks (50 students per section capacity), and official TCC BSIT Curriculum Subjects.
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem', alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '22px', marginBottom: '0.45rem' }}>
                  <label style={{ fontSize: '0.84rem', color: 'var(--neutral-200)', fontWeight: 700, margin: 0 }}>
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
                      padding: 0,
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
                    style={{ height: '44px', margin: 0, width: '100%', boxSizing: 'border-box' }}
                  >
                    {allAvailableYearLevels.map((yrLbl) => (
                      <option key={yrLbl} value={yrLbl}>
                        {yrLbl}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 1st Year, 4th Year, or Bridging Year"
                    value={newCustomYearLevelInput}
                    onChange={(e) => setNewCustomYearLevelInput(e.target.value)}
                    required
                    style={{ height: '44px', margin: 0, width: '100%', boxSizing: 'border-box' }}
                  />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '22px', marginBottom: '0.45rem' }}>
                  <label style={{ fontSize: '0.84rem', color: 'var(--neutral-200)', fontWeight: 700, margin: 0 }}>
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
                      padding: 0,
                    }}
                  >
                    Suggested: {suggestedBlock}
                  </button>
                </div>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Block - 1F or 1F"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  required
                  style={{ height: '44px', margin: 0, width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '22px', marginBottom: '0.45rem' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--neutral-400)', fontWeight: 600 }}>
                    Action
                  </span>
                </div>
                <Button
                  type="submit"
                  variant="accent"
                  disabled={creatingSection}
                  style={{ width: '100%', height: '44px', margin: 0, boxSizing: 'border-box' }}
                >
                  <Plus size={17} /> {creatingSection ? 'Creating Section...' : 'Create Section / Block'}
                </Button>
              </div>
            </div>

            {/* Quick-fill chips for 1st to 4th Year next blocks */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.15rem' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(285px, 1fr))', gap: '1.25rem' }}>
          {Object.entries(yearLevelBlocksMap).map(([yearLbl, blocks]) => {
            const yearStudentsCount = students.filter(
              (s) => getYearLevelFromBlock(s.section, s.grade) === yearLbl
            ).length;
            const yearCourses = allCurriculumSubjects.filter((c) => c.yearLevel === yearLbl);
            const yearUnits = yearCourses.reduce((sum, c) => sum + c.units, 0);

            return (
              <GlassCard key={yearLbl} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '0.9rem' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.85rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'white', margin: 0 }}>{yearLbl}</h3>
                      <span style={{ fontSize: '0.78rem', color: 'var(--neutral-300)' }}>
                        {yearCourses.length > 0
                          ? `${yearCourses.length} BSIT Subjects • ${yearUnits} Total Units`
                          : 'Academic Year Level'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <Badge variant="primary">{blocks.length} Sections</Badge>
                      <Badge variant="success">{yearStudentsCount} Students</Badge>
                    </div>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {blocks.length === 0 ? (
                      <div style={{ flex: 1, padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--neutral-400)', fontSize: '0.85rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)' }}>
                        No sections created for {yearLbl} yet.
                      </div>
                    ) : (
                      blocks.map((blk) => {
                        const count = students.filter((s) => (s.section || '').trim().toLowerCase() === blk.toLowerCase()).length;
                        const isFull = count >= MAX_STUDENTS_PER_SECTION;
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
                              flex: 1,
                              minHeight: '42px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.55rem 0.85rem',
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid var(--glass-border)',
                              borderRadius: 'var(--radius-sm)',
                            }}
                          >
                            <span
                              style={{
                                fontWeight: 700,
                                color: 'white',
                                fontSize: '0.9rem',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {blk}
                            </span>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                              <span
                                style={{
                                  fontSize: '0.76rem',
                                  color: isFull ? '#fca5a5' : 'var(--neutral-300)',
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {count} / {MAX_STUDENTS_PER_SECTION} Students
                              </span>
                              <button
                                type="button"
                                disabled={isFull}
                                title={
                                  isFull
                                    ? `${blk} has reached the 50-student limit`
                                    : `Enroll a student into ${yearLbl} (${blk})`
                                }
                                onClick={() => {
                                  setNewUserRole('student');
                                  setYearLevel(yearLbl);
                                  handleSectionChange('create_account');
                                }}
                                style={{
                                  padding: '0.2rem 0.52rem',
                                  borderRadius: '6px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                  background: isFull ? 'rgba(239, 68, 68, 0.15)' : 'rgba(63, 81, 181, 0.25)',
                                  border: isFull
                                    ? '1px solid rgba(239, 68, 68, 0.35)'
                                    : '1px solid rgba(99, 102, 241, 0.4)',
                                  color: isFull ? '#fca5a5' : '#c7d2fe',
                                  cursor: isFull ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {isFull ? 'Full' : '+ Enroll'}
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
                                    padding: '0.22rem',
                                    borderRadius: '6px',
                                    background: 'rgba(239, 68, 68, 0.14)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#fca5a5',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Trash2 size={12} />
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

          {/* Grouped Year Level & Semester Tables — Cleanly fitted without scrollbars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {displayedYears.map((yrLevel) => {
              const yearItems = filteredCurriculum.filter((item) => item.yearLevel === yrLevel);
              if (yearItems.length === 0) return null;

              const regularSemesters: Array<'1st Semester' | '2nd Semester'> = ['1st Semester', '2nd Semester'];
              const activeRegularSemesters = regularSemesters.filter((sem) =>
                yearItems.some((i) => i.semester === sem)
              );
              const summerItems = yearItems.filter((i) => i.semester === 'Summer');

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

                  {/* 1st & 2nd Semester side-by-side (or full width if single semester like 4th Year) */}
                  {activeRegularSemesters.length > 0 && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          activeRegularSemesters.length === 1
                            ? '1fr'
                            : 'repeat(auto-fit, minmax(430px, 1fr))',
                        gap: '1.15rem',
                      }}
                    >
                      {activeRegularSemesters.map((sem) =>
                        renderSemesterCurriculumCard(
                          yrLevel,
                          sem,
                          yearItems.filter((i) => i.semester === sem)
                        )
                      )}
                    </div>
                  )}

                  {/* Summer Term rendered cleanly below 1st & 2nd Semester without cramping columns */}
                  {summerItems.length > 0 && (
                    <div style={{ marginTop: activeRegularSemesters.length > 0 ? '1.15rem' : 0 }}>
                      {renderSemesterCurriculumCard(yrLevel, 'Summer', summerItems)}
                    </div>
                  )}

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
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search by student name, ID, block, or email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ height: '42px', margin: 0, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <select 
          value={blockFilter} 
          onChange={e => setBlockFilter(e.target.value)}
          className="form-select"
          style={{ width: '220px', height: '42px', margin: 0, boxSizing: 'border-box' }}
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

  const renderReports = () => {
    const reportCards: Array<{
      id: ReportTypeId;
      docCode: string;
      seriesLabel: string;
      title: string;
      description: string;
      recordCount: number;
      recordUnit: string;
      accentColor: string;
    }> = [
      {
        id: 'student_masterlist',
        docCode: 'TCC-REG-FORM-01',
        seriesLabel: 'OFFICIAL REGISTRY LEDGER',
        title: 'Complete Student Masterlist',
        description:
          'Official institutional student roster containing Student ID, Full Name, Year Level, Assigned Block (50-student limit), Email, and Enrollment Status.',
        recordCount: reportFilteredStudents.length,
        recordUnit: 'Enrolled Students',
        accentColor: '#fbbf24',
      },
      {
        id: 'graduating_roster',
        docCode: 'TCC-REG-FORM-02',
        seriesLabel: 'ACADEMIC CANDIDACY ROSTER',
        title: 'Graduating Students Roster',
        description:
          'Official summary of 4th Year graduating BSIT students (Blocks 4A–4E) and graduation candidates for Academic Year 2026–2027.',
        recordCount: graduatingStudentsList.length,
        recordUnit: '4th Year Candidates',
        accentColor: '#c4b5fd',
      },
      {
        id: 'section_capacity',
        docCode: 'TCC-REG-FORM-03',
        seriesLabel: 'BLOCK UTILIZATION AUDIT',
        title: 'Section & Block Capacity Report',
        description:
          'Audits all active class sections across 1st–4th Year against the mandatory 50-student per section maximum capacity and vacant slot queue.',
        recordCount: allAvailableBlocks.length,
        recordUnit: 'Active Sections',
        accentColor: '#34d399',
      },
      {
        id: 'curriculum_prospectus',
        docCode: 'TCC-REG-FORM-04',
        seriesLabel: 'CMO 25 S. 2015 PROSPECTUS',
        title: 'BSIT Curriculum Prospectus Report',
        description:
          'Complete 1st to 4th Year BSIT curriculum course schedule with Lecture, Laboratory, Total Units (TU), and Prerequisites (excluding Practicum).',
        recordCount: allCurriculumSubjects.length,
        recordUnit: 'Official Courses',
        accentColor: '#60a5fa',
      },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.65rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
              DATA EXPORT &amp; INSTITUTIONAL REPORTING
            </span>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
              Official College Reports
            </h1>
            <p style={{ color: 'var(--neutral-300)' }}>
              Generate classic TCC Secretary &amp; Registrar compliance documents, printable rosters, and audited CSV ledgers.
            </p>
          </div>

          {/* Classic Filter & Scope Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              flexWrap: 'wrap',
              padding: '0.6rem 0.85rem',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--glass-border)',
            }}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-300)', textTransform: 'uppercase' }}>
              Report Scope:
            </span>
            <select
              value={reportYearFilter}
              onChange={(e) => setReportYearFilter(e.target.value)}
              className="form-select"
              style={{ width: '165px', padding: '0.35rem 0.65rem', fontSize: '0.82rem' }}
            >
              <option value="ALL">All Year Levels</option>
              {allAvailableYearLevels.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
            <select
              value={reportStatusFilter}
              onChange={(e) => setReportStatusFilter(e.target.value)}
              className="form-select"
              style={{ width: '150px', padding: '0.35rem 0.65rem', fontSize: '0.82rem' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
              <option value="graduated">Graduated Only</option>
            </select>
          </div>
        </div>

        {/* Classic Institutional Report Ledgers Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {reportCards.map((card) => {
            const lastExportForCard = recentExports.find((item) => item.reportId === card.id);
            return (
              <GlassCard
                key={card.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1.1rem',
                  borderTop: `3px solid ${card.accentColor}`,
                }}
              >
                <div>
                  {/* Classic Document Header Strip */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.5rem',
                      paddingBottom: '0.65rem',
                      marginBottom: '0.75rem',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <FileText size={16} style={{ color: card.accentColor }} />
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          color: card.accentColor,
                          letterSpacing: '0.5px',
                        }}
                      >
                        {card.docCode}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        color: 'var(--neutral-300)',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {card.seriesLabel}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.18rem', fontWeight: 800, color: 'white', margin: '0 0 0.4rem' }}>
                    {card.title}
                  </h3>
                  <p style={{ color: 'var(--neutral-300)', fontSize: '0.84rem', lineHeight: 1.45, margin: 0 }}>
                    {card.description}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  {/* Metadata Strip */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      background: 'rgba(15, 23, 42, 0.5)',
                      border: '1px solid rgba(255, 255, 255, 0.07)',
                      fontSize: '0.78rem',
                    }}
                  >
                    <span style={{ color: 'var(--neutral-300)' }}>
                      Ready Records: <strong style={{ color: 'white' }}>{card.recordCount} {card.recordUnit}</strong>
                    </span>
                    <span style={{ color: lastExportForCard ? '#a7f3d0' : 'var(--neutral-400)', fontSize: '0.73rem' }}>
                      {lastExportForCard
                        ? `Last exported ${new Date(lastExportForCard.exportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : 'Not exported this session'}
                    </span>
                  </div>

                  {/* Classic Dual Action Bar */}
                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <Button
                      type="button"
                      variant="accent"
                      size="sm"
                      onClick={() => handleOpenClassicSheet(card.id, true)}
                      style={{ flex: 1 }}
                    >
                      <Printer size={14} /> Open Classic Report Sheet
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadCsvReport(card.id)}
                      style={{ flex: 1 }}
                    >
                      <Download size={14} /> Export CSV Ledger
                    </Button>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>

        {/* Recent Exportations History Table */}
        <GlassCard>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginBottom: '1rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={18} style={{ color: '#fbbf24' }} />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', margin: 0 }}>
                  Recent Exportations
                </h2>
              </div>
              <p style={{ color: 'var(--neutral-300)', fontSize: '0.84rem', margin: '0.2rem 0 0' }}>
                Official audit log recording the last time each college report or student roster was exported.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Badge variant="primary">{recentExports.length} Recorded Exports</Badge>
              {recentExports.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setRecentExports([]);
                    try {
                      localStorage.removeItem('tcc_secretary_recent_exportations');
                    } catch {
                      // Ignore
                    }
                    showToast('Cleared Recent Exportations history.', 'info');
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    color: 'var(--neutral-300)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '0.3rem 0.65rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  Clear Log
                </button>
              )}
            </div>
          </div>

          {recentExports.length === 0 ? (
            <div
              style={{
                padding: '2.25rem 1.5rem',
                textAlign: 'center',
                background: 'rgba(255, 255, 255, 0.025)',
                border: '1px dashed rgba(255, 255, 255, 0.14)',
                borderRadius: '10px',
                color: 'var(--neutral-300)',
              }}
            >
              <ShieldCheck size={28} style={{ color: 'var(--primary-300)', marginBottom: '0.5rem' }} />
              <div style={{ fontWeight: 700, color: 'white', fontSize: '0.95rem', marginBottom: '0.25rem' }}>
                No Report Exportations Recorded Yet
              </div>
              <div style={{ fontSize: '0.83rem', color: 'var(--neutral-400)' }}>
                Click <strong>Open Classic Report Sheet</strong> or <strong>Export CSV Ledger</strong> on any report above to generate an official college record and log the export timestamp here.
              </div>
            </div>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                color: 'white',
                fontSize: '0.84rem',
              }}
            >
              <thead>
                <tr
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'var(--neutral-300)',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                  }}
                >
                  <th style={{ padding: '0.65rem 0.85rem' }}>Form Code &amp; Report Title</th>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Format / Style</th>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Scope &amp; Records</th>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Exported By</th>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Last Exported Timestamp</th>
                  <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentExports.map((exp) => (
                  <tr key={exp.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.045)' }}>
                    <td style={{ padding: '0.7rem 0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '0.73rem',
                            fontWeight: 800,
                            padding: '0.15rem 0.45rem',
                            borderRadius: '6px',
                            background: 'rgba(251, 191, 36, 0.16)',
                            border: '1px solid rgba(251, 191, 36, 0.35)',
                            color: '#fde68a',
                          }}
                        >
                          {exp.docCode}
                        </span>
                        <span style={{ fontWeight: 700, color: 'white' }}>{exp.title}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.7rem 0.85rem' }}>
                      <Badge variant={exp.format.includes('PDF') ? 'primary' : 'success'}>
                        {exp.format}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.7rem 0.85rem', color: 'var(--neutral-300)' }}>
                      {exp.scopeSummary} • <strong style={{ color: 'white' }}>{exp.recordCount} records</strong>
                    </td>
                    <td style={{ padding: '0.7rem 0.85rem', color: '#cbd5e1', fontWeight: 600 }}>
                      {exp.exportedBy}
                    </td>
                    <td style={{ padding: '0.7rem 0.85rem', color: '#fde68a', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {new Date(exp.exportedAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenClassicSheet(exp.reportId, false)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.28rem 0.6rem',
                            borderRadius: '6px',
                            background: 'rgba(139, 92, 246, 0.22)',
                            border: '1px solid rgba(139, 92, 246, 0.45)',
                            color: '#ddd6fe',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <Printer size={12} /> View Sheet
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadCsvReport(exp.reportId)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.28rem 0.6rem',
                            borderRadius: '6px',
                            background: 'rgba(255, 255, 255, 0.07)',
                            border: '1px solid rgba(255, 255, 255, 0.16)',
                            color: 'white',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <RefreshCw size={12} /> Re-Export
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </GlassCard>

        {/* Classic Official TCC Document Preview & Print Modal */}
        {activePreviewReport && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(5, 8, 18, 0.82)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '1020px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '16px',
                background: '#160b18',
                border: '1px solid rgba(251, 191, 36, 0.35)',
                boxShadow: '0 25px 70px rgba(0,0,0,0.75)',
                overflow: 'hidden',
              }}
            >
              {/* Modal Top Action Bar */}
              <div
                style={{
                  padding: '0.85rem 1.25rem',
                  background: 'rgba(255, 255, 255, 0.04)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <FileText size={18} style={{ color: '#fbbf24' }} />
                  <span style={{ fontWeight: 800, color: 'white', fontSize: '0.95rem' }}>
                    Official TCC Institutional Document Sheet Preview
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadCsvReport(activePreviewReport)}
                  >
                    <Download size={14} /> Download CSV
                  </Button>
                  <Button
                    type="button"
                    variant="accent"
                    size="sm"
                    onClick={handlePrintOfficialSheet}
                  >
                    <Printer size={14} /> Print / Save Official PDF
                  </Button>
                  <button
                    type="button"
                    onClick={() => setActivePreviewReport(null)}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.16)',
                      color: 'white',
                      borderRadius: '8px',
                      padding: '0.35rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Classic Institutional Paper Sheet Content */}
              <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
                <div
                  style={{
                    background: '#fffdf9',
                    color: '#1e293b',
                    borderRadius: '10px',
                    padding: '2rem 2.25rem',
                    border: '2px solid #7f1d1d',
                    boxShadow: 'inset 0 0 0 1px #d97706',
                    fontFamily: 'Georgia, "Times New Roman", serif',
                  }}
                >
                  {/* Official TCC Letterhead */}
                  <div
                    style={{
                      textAlign: 'center',
                      borderBottom: '2px double #7f1d1d',
                      paddingBottom: '1rem',
                      marginBottom: '1.25rem',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1.2px', color: '#475569' }}>
                      Republic of the Philippines • Province of Misamis Oriental • Municipality of Tagoloan
                    </div>
                    <h2 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#7f1d1d', margin: '0.2rem 0', letterSpacing: '0.5px' }}>
                      TAGOLOAN COMMUNITY COLLEGE
                    </h2>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1e293b' }}>
                      COLLEGE OF INFORMATION TECHNOLOGY • OFFICE OF THE COLLEGE SECRETARY
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '0.15rem' }}>
                      Baluarte, Tagoloan, Misamis Oriental • Academic Year 2026–2027
                    </div>
                  </div>

                  {/* Document Title & Metadata Strip */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-end',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      marginBottom: '1rem',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        {activePreviewReport === 'student_masterlist' && 'FORM TCC-REG-01 • OFFICIAL ENROLLMENT ROSTER'}
                        {activePreviewReport === 'graduating_roster' && 'FORM TCC-REG-02 • 4TH YEAR GRADUATION CANDIDACY ROSTER'}
                        {activePreviewReport === 'section_capacity' && 'FORM TCC-REG-03 • SECTION & BLOCK CAPACITY AUDIT (50 MAX)'}
                        {activePreviewReport === 'curriculum_prospectus' && 'FORM TCC-REG-04 • CMO 25 S. 2015 BSIT CURRICULUM PROSPECTUS'}
                      </div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: '0.15rem 0 0' }}>
                        {activePreviewReport === 'student_masterlist' && 'Complete BSIT Student Masterlist'}
                        {activePreviewReport === 'graduating_roster' && '4th Year Graduating Students Roster (S.Y. 2026–2027)'}
                        {activePreviewReport === 'section_capacity' && 'Class Section & Block Capacity Utilization Report'}
                        {activePreviewReport === 'curriculum_prospectus' && 'Official BSIT 1st–4th Year Curriculum Prospectus'}
                      </h3>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#334155' }}>
                      <div><strong>Date Generated:</strong> {new Date().toLocaleString()}</div>
                      <div><strong>Generated By:</strong> {user?.name || 'School Secretary'}</div>
                    </div>
                  </div>

                  {/* Classic Report Table */}
                  <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                    {(activePreviewReport === 'student_masterlist' || activePreviewReport === 'graduating_roster') && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                          <tr style={{ background: '#7f1d1d', color: 'white' }}>
                            <th style={{ padding: '0.5rem 0.65rem', border: '1px solid #991b1b', textAlign: 'center', width: '44px' }}>No.</th>
                            <th style={{ padding: '0.5rem 0.65rem', border: '1px solid #991b1b', textAlign: 'left' }}>Student ID</th>
                            <th style={{ padding: '0.5rem 0.65rem', border: '1px solid #991b1b', textAlign: 'left' }}>Student Full Name</th>
                            <th style={{ padding: '0.5rem 0.65rem', border: '1px solid #991b1b', textAlign: 'left' }}>Year Level</th>
                            <th style={{ padding: '0.5rem 0.65rem', border: '1px solid #991b1b', textAlign: 'left' }}>Assigned Block</th>
                            <th style={{ padding: '0.5rem 0.65rem', border: '1px solid #991b1b', textAlign: 'left' }}>Official Email</th>
                            <th style={{ padding: '0.5rem 0.65rem', border: '1px solid #991b1b', textAlign: 'center' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(activePreviewReport === 'graduating_roster' ? graduatingStudentsList : reportFilteredStudents).length === 0 ? (
                            <tr>
                              <td colSpan={7} style={{ padding: '1.25rem', textAlign: 'center', border: '1px solid #cbd5e1', color: '#64748b' }}>
                                No student records match the current filter criteria.
                              </td>
                            </tr>
                          ) : (
                            (activePreviewReport === 'graduating_roster' ? graduatingStudentsList : reportFilteredStudents).map((s, idx) => (
                              <tr key={s.id} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                <td style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                                <td style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', fontFamily: 'monospace', fontWeight: 700 }}>{s.lrn || 'N/A'}</td>
                                <td style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', fontWeight: 700, color: '#0f172a' }}>{s.name}</td>
                                <td style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1' }}>{getYearLevelFromBlock(s.section, s.grade)}</td>
                                <td style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', fontWeight: 600 }}>{s.section || 'Block - 1A'}</td>
                                <td style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', color: '#334155' }}>{s.email}</td>
                                <td style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700, textTransform: 'uppercase' }}>
                                  {s.status || 'Active'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}

                    {activePreviewReport === 'section_capacity' && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                          <tr style={{ background: '#7f1d1d', color: 'white' }}>
                            <th style={{ padding: '0.5rem 0.65rem', border: '1px solid #991b1b', textAlign: 'left' }}>Year Level</th>
                            <th style={{ padding: '0.5rem 0.65rem', border: '1px solid #991b1b', textAlign: 'left' }}>Class Section / Block</th>
                            <th style={{ padding: '0.5rem 0.65rem', border: '1px solid #991b1b', textAlign: 'center' }}>Enrolled Students</th>
                            <th style={{ padding: '0.5rem 0.65rem', border: '1px solid #991b1b', textAlign: 'center' }}>Max Capacity</th>
                            <th style={{ padding: '0.5rem 0.65rem', border: '1px solid #991b1b', textAlign: 'center' }}>Vacant Slots</th>
                            <th style={{ padding: '0.5rem 0.65rem', border: '1px solid #991b1b', textAlign: 'center' }}>Queue Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(yearLevelBlocksMap)
                            .filter(([yr]) => reportYearFilter === 'ALL' || yr === reportYearFilter)
                            .flatMap(([yr, blks]) =>
                              blks.map((blk) => {
                                const enrolled = students.filter(
                                  (s) => (s.section || '').trim().toLowerCase() === blk.toLowerCase()
                                ).length;
                                const vacant = Math.max(0, MAX_STUDENTS_PER_SECTION - enrolled);
                                return (
                                  <tr key={`${yr}-${blk}`}>
                                    <td style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', fontWeight: 700 }}>{yr}</td>
                                    <td style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', fontWeight: 700 }}>{blk}</td>
                                    <td style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}>{enrolled}</td>
                                    <td style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', textAlign: 'center' }}>{MAX_STUDENTS_PER_SECTION}</td>
                                    <td style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700, color: '#047857' }}>{vacant}</td>
                                    <td style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}>
                                      {enrolled >= MAX_STUDENTS_PER_SECTION ? 'FULL (50/50)' : 'OPEN / VACANT'}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                        </tbody>
                      </table>
                    )}

                    {activePreviewReport === 'curriculum_prospectus' && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                          <tr style={{ background: '#7f1d1d', color: 'white' }}>
                            <th style={{ padding: '0.45rem 0.6rem', border: '1px solid #991b1b', textAlign: 'left' }}>Course Code</th>
                            <th style={{ padding: '0.45rem 0.6rem', border: '1px solid #991b1b', textAlign: 'left' }}>Descriptive Title</th>
                            <th style={{ padding: '0.45rem 0.6rem', border: '1px solid #991b1b', textAlign: 'left' }}>Year &amp; Semester</th>
                            <th style={{ padding: '0.45rem 0.6rem', border: '1px solid #991b1b', textAlign: 'center' }}>Lec</th>
                            <th style={{ padding: '0.45rem 0.6rem', border: '1px solid #991b1b', textAlign: 'center' }}>Lab</th>
                            <th style={{ padding: '0.45rem 0.6rem', border: '1px solid #991b1b', textAlign: 'center' }}>TU</th>
                            <th style={{ padding: '0.45rem 0.6rem', border: '1px solid #991b1b', textAlign: 'left' }}>Prerequisite</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allCurriculumSubjects
                            .filter((c) => reportYearFilter === 'ALL' || c.yearLevel === reportYearFilter)
                            .map((c) => (
                              <tr key={c.code}>
                                <td style={{ padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', fontFamily: 'monospace', fontWeight: 700 }}>{c.code}</td>
                                <td style={{ padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', fontWeight: 600 }}>{c.name}</td>
                                <td style={{ padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1' }}>{c.yearLevel} • {c.semester}</td>
                                <td style={{ padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', textAlign: 'center' }}>{c.lec}</td>
                                <td style={{ padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', textAlign: 'center' }}>{c.lab}</td>
                                <td style={{ padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}>{c.units}</td>
                                <td style={{ padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', fontFamily: 'monospace' }}>{c.prerequisite}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Classic Signatory Block */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '1.5rem',
                      marginTop: '2.25rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid #cbd5e1',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      fontSize: '0.78rem',
                      textAlign: 'center',
                    }}
                  >
                    <div>
                      <div style={{ color: '#64748b', marginBottom: '1.6rem' }}>Prepared &amp; Exported By:</div>
                      <div style={{ fontWeight: 800, color: '#0f172a', borderTop: '1px solid #334155', paddingTop: '0.3rem' }}>
                        {(user?.name || 'MIRACLE').toUpperCase()}
                      </div>
                      <div style={{ color: '#475569', fontSize: '0.72rem' }}>College Secretary, {departmentCode} Department</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', marginBottom: '1.6rem' }}>Reviewed &amp; Verified By:</div>
                      <div style={{ fontWeight: 800, color: '#0f172a', borderTop: '1px solid #334155', paddingTop: '0.3rem' }}>
                        {departmentCode} DEAN
                      </div>
                      <div style={{ color: '#475569', fontSize: '0.72rem' }}>{departmentName}</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', marginBottom: '1.6rem' }}>Attested By:</div>
                      <div style={{ fontWeight: 800, color: '#0f172a', borderTop: '1px solid #334155', paddingTop: '0.3rem' }}>
                        OFFICE OF THE COLLEGE REGISTRAR
                      </div>
                      <div style={{ color: '#475569', fontSize: '0.72rem' }}>Tagoloan Community College</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

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
              Office of the Secretary ({departmentCode})
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
