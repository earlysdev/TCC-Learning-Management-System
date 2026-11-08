import type { UserRole } from './types';
import { 
  BookOpen, 
  History, 
  Award, 
  Sparkles, 
  Settings, 
  Users, 
  BarChart, 
  FileText, 
  ShieldCheck, 
  Activity, 
  LayoutDashboard,
  UserPlus,
  Layers,
  GraduationCap
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: any;
}

export interface RoleConfig {
  label: string;
  badgeColor: 'primary' | 'success' | 'warning' | 'error';
  navItems: NavItem[];
}

export const CURRENT_SCHOOL_YEAR = '2026–2027';
export const CURRENT_SCHOOL_YEAR_SLUG = '2026-2027';

export interface DepartmentInfo {
  code: string;
  name: string;
  shortName: string;
}

export const COLLEGE_DEPARTMENTS: DepartmentInfo[] = [
  { code: 'CIT', name: 'College of Information Technology', shortName: 'Information Technology' },
  { code: 'CED', name: 'College of Education', shortName: 'Education' },
  { code: 'CAS', name: 'College of Arts and Sciences', shortName: 'Arts & Sciences' },
  { code: 'CCJPS', name: 'College of Criminal Justice and Public Safety', shortName: 'Criminology' },
  { code: 'CBA', name: 'College of Business Administration', shortName: 'Business Administration' },
  { code: 'CHM', name: 'College of Hospitality Management', shortName: 'Hospitality Management' },
  { code: 'COM', name: 'College of Midwifery', shortName: 'Midwifery' },
  { code: 'CLIS', name: 'College of Library Information Science', shortName: 'Library Information Science' },
];

export function getDepartmentName(code?: string | null): string {
  if (!code) return 'College of Information Technology';
  const found = COLLEGE_DEPARTMENTS.find(d => d.code.toUpperCase() === code.toUpperCase());
  return found ? found.name : `${code} Department`;
}

export const YEAR_LEVEL_OPTIONS: string[] = [
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year',
];

export const YEAR_LEVEL_BLOCKS: Record<string, string[]> = {
  '1st Year': ['Block - 1A', 'Block - 1B', 'Block - 1C', 'Block - 1D', 'Block - 1E'],
  '2nd Year': ['Block - 2A', 'Block - 2B', 'Block - 2C', 'Block - 2D', 'Block - 2E'],
  '3rd Year': ['Block - 3A', 'Block - 3B', 'Block - 3C', 'Block - 3D', 'Block - 3E'],
  '4th Year': ['Block - 4A', 'Block - 4B', 'Block - 4C', 'Block - 4D', 'Block - 4E'],
};

export const ALL_BLOCKS: string[] = Object.values(YEAR_LEVEL_BLOCKS).flat();

export function getYearLevelFromBlock(block?: string | null, explicitGrade?: string | null): string {
  if (explicitGrade && explicitGrade.trim().length > 0) {
    return explicitGrade.trim();
  }
  if (!block) return '1st Year';
  if (/1st\s*Year/i.test(block)) return '1st Year';
  if (/2nd\s*Year/i.test(block)) return '2nd Year';
  if (/3rd\s*Year/i.test(block)) return '3rd Year';
  if (/4th\s*Year/i.test(block)) return '4th Year';
  const match = block.match(/([1-4])[A-Z]/i) || block.match(/\b([1-4])\b/);
  if (!match) return '1st Year';
  switch (match[1]) {
    case '1': return '1st Year';
    case '2': return '2nd Year';
    case '3': return '3rd Year';
    case '4': return '4th Year';
    default: return '1st Year';
  }
}

export interface CurriculumSubjectItem {
  code: string;
  name: string;
  yearLevel: '1st Year' | '2nd Year' | '3rd Year' | '4th Year';
  semester: '1st Semester' | '2nd Semester' | 'Summer';
  lec: number;
  lab: number;
  units: number;
  prerequisite: string;
}

/**
 * Tagoloan Community College (TCC)
 * Bachelor of Science in Information Technology (BSIT)
 * CMO 25, s. 2015 Curriculum (1st Year to 4th Year, excluding 4th Year Practicum)
 */
export const BSIT_SUBJECTS: CurriculumSubjectItem[] = [
  // ==========================================
  // FIRST YEAR — FIRST SEMESTER (14 Lec, 3 Lab, 17 TU)
  // ==========================================
  { code: 'IT 101', name: 'Introduction To Computing', yearLevel: '1st Year', semester: '1st Semester', lec: 2, lab: 1, units: 3, prerequisite: 'none' },
  { code: 'IT 102', name: 'Computer Programming 1', yearLevel: '1st Year', semester: '1st Semester', lec: 2, lab: 1, units: 3, prerequisite: 'none' },
  { code: 'IT 103', name: 'Integrated Application Software', yearLevel: '1st Year', semester: '1st Semester', lec: 2, lab: 1, units: 3, prerequisite: 'none' },
  { code: 'GEC 1', name: 'Understanding the Self', yearLevel: '1st Year', semester: '1st Semester', lec: 3, lab: 0, units: 3, prerequisite: 'none' },
  { code: 'ROTC/CWTS 101', name: 'Basic Army Science/CWTS', yearLevel: '1st Year', semester: '1st Semester', lec: 3, lab: 0, units: 3, prerequisite: 'none' },
  { code: 'PATH FIT 1', name: 'Movement Competency Training', yearLevel: '1st Year', semester: '1st Semester', lec: 2, lab: 0, units: 2, prerequisite: 'none' },

  // ==========================================
  // FIRST YEAR — SECOND SEMESTER (15 Lec, 2 Lab, 17 TU)
  // ==========================================
  { code: 'IT 104', name: 'Information Technology Fundamentals', yearLevel: '1st Year', semester: '2nd Semester', lec: 3, lab: 0, units: 3, prerequisite: 'IT 101' },
  { code: 'IT 105', name: 'Computer Programming 2', yearLevel: '1st Year', semester: '2nd Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT 102' },
  { code: 'IT 106', name: 'Digital Logic Design', yearLevel: '1st Year', semester: '2nd Semester', lec: 2, lab: 1, units: 3, prerequisite: 'none' },
  { code: 'GEC 2', name: 'Readings in Philippine History', yearLevel: '1st Year', semester: '2nd Semester', lec: 3, lab: 0, units: 3, prerequisite: 'none' },
  { code: 'ROTC/CWTS 102', name: 'Reserved Officer Training Corps/CWTS', yearLevel: '1st Year', semester: '2nd Semester', lec: 3, lab: 0, units: 3, prerequisite: 'R101' },
  { code: 'PATH FIT 2', name: 'Fitness Training', yearLevel: '1st Year', semester: '2nd Semester', lec: 2, lab: 0, units: 2, prerequisite: 'PATH FIT 1' },

  // ==========================================
  // SECOND YEAR — FIRST SEMESTER (16 Lec, 4 Lab, 20 TU)
  // ==========================================
  { code: 'IT 107', name: 'Application Development & Emerging Technologies', yearLevel: '2nd Year', semester: '1st Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT 105' },
  { code: 'IT 108', name: 'Data Structures & Algorithms', yearLevel: '2nd Year', semester: '1st Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT 105' },
  { code: 'IT 109', name: 'Fundamentals of Database Systems', yearLevel: '2nd Year', semester: '1st Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT 105' },
  { code: 'IT 110', name: 'Object Oriented Programming (OOP)', yearLevel: '2nd Year', semester: '1st Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT 105' },
  { code: 'IT 111', name: 'Social Issues & Professional Issues', yearLevel: '2nd Year', semester: '1st Semester', lec: 3, lab: 0, units: 3, prerequisite: 'IT101/IT104' },
  { code: 'GEC 3', name: 'The Contemporary World', yearLevel: '2nd Year', semester: '1st Semester', lec: 3, lab: 0, units: 3, prerequisite: 'none' },
  { code: 'PATH FIT 3', name: 'Dance Sports/In-Dual/Group/Outdoor', yearLevel: '2nd Year', semester: '1st Semester', lec: 2, lab: 0, units: 2, prerequisite: 'PATH FIT 2' },

  // ==========================================
  // SECOND YEAR — SECOND SEMESTER (21 Lec, 5 Lab, 26 TU)
  // ==========================================
  { code: 'IT 112', name: 'Information Management 1', yearLevel: '2nd Year', semester: '2nd Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT 108' },
  { code: 'IT 113', name: 'Event-Driven Programming', yearLevel: '2nd Year', semester: '2nd Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT108/109/110' },
  { code: 'IT 114', name: 'Integrative Programming & Technologies 1', yearLevel: '2nd Year', semester: '2nd Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT108/109/110' },
  { code: 'IT 115', name: 'Human Computer Interaction 1', yearLevel: '2nd Year', semester: '2nd Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT108/109/110' },
  { code: 'IT 116', name: 'Advanced Database System', yearLevel: '2nd Year', semester: '2nd Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT108/109/110' },
  { code: 'GEC 4', name: 'Mathematics in the Modern World', yearLevel: '2nd Year', semester: '2nd Semester', lec: 3, lab: 0, units: 3, prerequisite: 'none' },
  { code: 'GEE 6', name: 'Art Appreciation', yearLevel: '2nd Year', semester: '2nd Semester', lec: 3, lab: 0, units: 3, prerequisite: 'none' },
  { code: 'GEE 8', name: 'Ethics', yearLevel: '2nd Year', semester: '2nd Semester', lec: 3, lab: 0, units: 3, prerequisite: 'none' },
  { code: 'PATH FIT 4', name: 'Team Sports', yearLevel: '2nd Year', semester: '2nd Semester', lec: 2, lab: 0, units: 2, prerequisite: 'PATH FIT 3' },

  // ==========================================
  // SECOND YEAR — SUMMER (7 Lec, 2 Lab, 9 TU)
  // ==========================================
  { code: 'IT 117', name: 'Quantitative Methods (Modeling & Simulation)', yearLevel: '2nd Year', semester: 'Summer', lec: 2, lab: 1, units: 3, prerequisite: 'IT108/109/110/112' },
  { code: 'IT 118', name: 'Human Computer Interaction 2', yearLevel: '2nd Year', semester: 'Summer', lec: 2, lab: 1, units: 3, prerequisite: 'IT115' },
  { code: 'IT Elec 1', name: 'System Analysis and Design (SAD)', yearLevel: '2nd Year', semester: 'Summer', lec: 3, lab: 0, units: 3, prerequisite: 'IT109/110/116' },

  // ==========================================
  // THIRD YEAR — FIRST SEMESTER (23 Lec, 4 Lab, 27 TU)
  // ==========================================
  { code: 'IT 119', name: 'System Integration & Architecture 1', yearLevel: '3rd Year', semester: '1st Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT113/114/115/116' },
  { code: 'IT 120', name: 'Research 1 (Methods of Research in Computing)', yearLevel: '3rd Year', semester: '1st Semester', lec: 3, lab: 0, units: 3, prerequisite: 'IT 112' },
  { code: 'IT 121', name: 'Information Management 2', yearLevel: '3rd Year', semester: '1st Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT112' },
  { code: 'IT 122', name: 'Integrative Programming & Technologies 2', yearLevel: '3rd Year', semester: '1st Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT114' },
  { code: 'IT Elec 2', name: 'Computer Graphics', yearLevel: '3rd Year', semester: '1st Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT 106/118' },
  { code: 'GEC 5', name: 'Purposive Communication', yearLevel: '3rd Year', semester: '1st Semester', lec: 3, lab: 0, units: 3, prerequisite: 'none' },
  { code: 'GEC 7', name: 'Science, Technology and Society', yearLevel: '3rd Year', semester: '1st Semester', lec: 3, lab: 0, units: 3, prerequisite: 'none' },
  { code: 'GEC 9', name: 'Life, Works & Writing of Dr. Jose Rizal', yearLevel: '3rd Year', semester: '1st Semester', lec: 3, lab: 0, units: 3, prerequisite: 'none' },
  { code: 'GEE 9', name: 'Technopreneurship (The Entrepreneurial Mind)', yearLevel: '3rd Year', semester: '1st Semester', lec: 3, lab: 0, units: 3, prerequisite: 'none' },

  // ==========================================
  // THIRD YEAR — SECOND SEMESTER (23 Lec, 4 Lab, 27 TU)
  // ==========================================
  { code: 'IT 123', name: 'Information Assurance & Security 1', yearLevel: '3rd Year', semester: '2nd Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT119' },
  { code: 'IT 124', name: 'Networking 1', yearLevel: '3rd Year', semester: '2nd Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT114' },
  { code: 'IT 125', name: 'Capstone Project 1', yearLevel: '3rd Year', semester: '2nd Semester', lec: 3, lab: 0, units: 3, prerequisite: '1st/2nd/3rdYr1stSem' },
  { code: 'IT 126', name: 'System Integration & Architecture 2', yearLevel: '3rd Year', semester: '2nd Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT119' },
  { code: 'IT 127', name: 'Platform Technologies', yearLevel: '3rd Year', semester: '2nd Semester', lec: 3, lab: 0, units: 3, prerequisite: 'IT119' },
  { code: 'IT Elec 3', name: 'Computer - Aided Design (CAD)', yearLevel: '3rd Year', semester: '2nd Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT Elective 2' },
  { code: 'GEE 4', name: 'Living In the IT Era', yearLevel: '3rd Year', semester: '2nd Semester', lec: 3, lab: 0, units: 3, prerequisite: 'none' },
  { code: 'GEE 7', name: 'Gender & Society', yearLevel: '3rd Year', semester: '2nd Semester', lec: 3, lab: 0, units: 3, prerequisite: 'none' },
  { code: 'GEE 10', name: 'Entrepreneurial Management', yearLevel: '3rd Year', semester: '2nd Semester', lec: 3, lab: 0, units: 3, prerequisite: 'GEE 9' },
  { code: 'GEE 11', name: 'Phil. Indigenous Communities & Peace Studies Education', yearLevel: '3rd Year', semester: '2nd Semester', lec: 3, lab: 0, units: 3, prerequisite: 'none' },

  // ==========================================
  // THIRD YEAR — SUMMER (8 Lec, 1 Lab, 9 TU)
  // ==========================================
  { code: 'IT Elec 4', name: 'Fundamentals of Data Warehousing & Data Mining', yearLevel: '3rd Year', semester: 'Summer', lec: 3, lab: 0, units: 3, prerequisite: 'IT119' },
  { code: 'IT Elec 5', name: 'Multimedia System', yearLevel: '3rd Year', semester: 'Summer', lec: 2, lab: 1, units: 3, prerequisite: 'IT Elective 2 & 3' },
  { code: 'IT Elec 6', name: 'Management Information System (MIS)', yearLevel: '3rd Year', semester: 'Summer', lec: 3, lab: 0, units: 3, prerequisite: 'IT Elective 1' },

  // ==========================================
  // FOURTH YEAR — FIRST SEMESTER (11 Lec, 4 Lab, 15 TU)
  // Note: 4th Year 2nd Semester Practicum (Prac 101 - 486 hours) is intentionally excluded.
  // ==========================================
  { code: 'IT 128', name: 'System Administration and Maintenance', yearLevel: '4th Year', semester: '1st Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT123/124/126' },
  { code: 'IT 129', name: 'Information Assurance & Security 2', yearLevel: '4th Year', semester: '1st Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT123' },
  { code: 'IT 130', name: 'Networking 2', yearLevel: '4th Year', semester: '1st Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT124' },
  { code: 'IT 131', name: 'Web System and Technologies', yearLevel: '4th Year', semester: '1st Semester', lec: 2, lab: 1, units: 3, prerequisite: 'IT 127' },
  { code: 'IT 132', name: 'Capstone Project 2', yearLevel: '4th Year', semester: '1st Semester', lec: 3, lab: 0, units: 3, prerequisite: 'IT125' },
];

export const BSIT_SUBJECT_OPTIONS = BSIT_SUBJECTS.map((s) => ({
  value: `${s.code} - ${s.name}`,
  label: `[${s.yearLevel} • ${s.semester}] ${s.code} — ${s.name}`,
  yearLevel: s.yearLevel,
  semester: s.semester,
}));

export const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  student: {
    label: 'Student',
    badgeColor: 'success',
    navItems: [
      { label: 'Overview', path: '/student/dashboard', icon: LayoutDashboard },
      { label: 'My Quizzes', path: '/student/quizzes', icon: BookOpen },
      { label: 'Quiz History', path: '/student/history', icon: History },
      { label: 'Scores', path: '/student/scores', icon: Award },
      { label: 'AI Recommendations', path: '/student/recommendations', icon: Sparkles },
      { label: 'Settings', path: '/student/settings', icon: Settings },
    ]
  },
  teacher: {
    label: 'Teacher',
    badgeColor: 'primary',
    navItems: [
      { label: 'Overview', path: '/teacher/dashboard', icon: LayoutDashboard },
      { label: 'Quizzes', path: '/teacher/quizzes', icon: BookOpen },
      { label: 'Students', path: '/teacher/students', icon: Users },
      { label: 'Analytics', path: '/teacher/analytics', icon: BarChart },
      { label: 'AI Insights', path: '/teacher/insights', icon: Sparkles },
      { label: 'Settings', path: '/teacher/settings', icon: Settings },
    ]
  },
  secretary: {
    label: 'Secretary',
    badgeColor: 'warning',
    navItems: [
      { label: 'Overview', path: '/secretary/dashboard', icon: LayoutDashboard },
      { label: 'Create Account', path: '/secretary/accounts', icon: UserPlus },
      { label: 'Sections & Year Levels', path: '/secretary/sections', icon: Layers },
      { label: 'Student Records', path: '/secretary/records', icon: FileText },
      { label: 'Performance', path: '/secretary/performance', icon: BarChart },
      { label: 'Reports', path: '/secretary/reports', icon: FileText },
      { label: 'Activity Logs', path: '/secretary/logs', icon: Activity },
      { label: 'Settings', path: '/secretary/settings', icon: Settings },
    ]
  },
  dean: {
    label: 'Dean',
    badgeColor: 'error',
    navItems: [
      { label: 'Overview', path: '/dean/dashboard', icon: LayoutDashboard },
      { label: 'User Management', path: '/dean/users', icon: Users },
      { label: 'Student Management', path: '/dean/students', icon: GraduationCap },
      { label: 'Quiz Oversight', path: '/dean/quizzes', icon: ShieldCheck },
      { label: 'Security & Proctoring', path: '/dean/security', icon: ShieldCheck },
      { label: 'Analytics', path: '/dean/analytics', icon: BarChart },
      { label: 'Activity Logs', path: '/dean/logs', icon: Activity },
      { label: 'Settings', path: '/dean/settings', icon: Settings },
    ]
  },
  developer: {
    label: 'Developer',
    badgeColor: 'error',
    navItems: [
      { label: 'Overview', path: '/developer/dashboard', icon: LayoutDashboard },
      { label: 'Settings', path: '/developer/settings', icon: Settings },
    ]
  }
};
