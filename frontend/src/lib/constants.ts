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
  Layers
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

export const YEAR_LEVEL_BLOCKS: Record<string, string[]> = {
  '1st Year': ['Block - 1A', 'Block - 1B', 'Block - 1C', 'Block - 1D', 'Block - 1E'],
  '2nd Year': ['Block - 2A', 'Block - 2B', 'Block - 2C', 'Block - 2D', 'Block - 2E'],
  '3rd Year': ['Block - 3A', 'Block - 3B', 'Block - 3C', 'Block - 3D', 'Block - 3E'],
  '4th Year': ['Block - 4A', 'Block - 4B', 'Block - 4C', 'Block - 4D', 'Block - 4E'],
};

export const ALL_BLOCKS: string[] = Object.values(YEAR_LEVEL_BLOCKS).flat();

export function getYearLevelFromBlock(block?: string | null): string {
  if (!block) return '1st Year';
  const match = block.match(/([1-4])[A-E]/i);
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
  yearLevel: string;
  semester: string;
}

export const BSIT_SUBJECTS: CurriculumSubjectItem[] = [
  // 2024-2025 1st (BSIT — Year 1st)
  { code: 'PATH FIT 1', name: 'Movement Competency Training', yearLevel: '1st Year', semester: '1st Semester' },
  { code: 'GEC 1', name: 'Understanding the Self', yearLevel: '1st Year', semester: '1st Semester' },
  { code: 'IT 101', name: 'Introduction To Computing', yearLevel: '1st Year', semester: '1st Semester' },
  { code: 'IT 102', name: 'Computer Programming 1', yearLevel: '1st Year', semester: '1st Semester' },
  { code: 'IT 103', name: 'Integrated Application Software', yearLevel: '1st Year', semester: '1st Semester' },
  { code: 'Math 1', name: 'College Algebra', yearLevel: '1st Year', semester: '1st Semester' },
  { code: 'Math 2', name: 'Plane Trigonometry', yearLevel: '1st Year', semester: '1st Semester' },
  { code: 'NSTP 1', name: 'CWTS/ROTC 1', yearLevel: '1st Year', semester: '1st Semester' },

  // 2024-2025 2nd (BSIT — Year 1st)
  { code: 'ROTC/CWTS 102', name: 'Reserved Officer Training Corps/CWTS', yearLevel: '1st Year', semester: '2nd Semester' },
  { code: 'IT 105', name: 'Computer Programming 2', yearLevel: '1st Year', semester: '2nd Semester' },
  { code: 'IT 106', name: 'Digital Logic Design', yearLevel: '1st Year', semester: '2nd Semester' },
  { code: 'PATH FIT 2', name: 'Fitness Training', yearLevel: '1st Year', semester: '2nd Semester' },
  { code: 'IT 104', name: 'Information Technology Fundamentals', yearLevel: '1st Year', semester: '2nd Semester' },
  { code: 'Math 3', name: 'Pre-Calculus', yearLevel: '1st Year', semester: '2nd Semester' },
  { code: 'GEC 2', name: 'READING IN PHILIPPINE HISTORY', yearLevel: '1st Year', semester: '2nd Semester' },

  // 2025-2026 1st (BSIT — Year 2nd)
  { code: 'PATH FIT 3', name: 'DANCE SPORTS & INDIVIDUAL/GROUP EXERCISE/OUTDOOR', yearLevel: '2nd Year', semester: '1st Semester' },
  { code: 'GEC 3', name: 'The Contemporary World', yearLevel: '2nd Year', semester: '1st Semester' },
  { code: 'IT 107', name: 'Application Development & Emerging Technologies', yearLevel: '2nd Year', semester: '1st Semester' },
  { code: 'IT 108', name: 'Data Structures & Algorithms', yearLevel: '2nd Year', semester: '1st Semester' },
  { code: 'IT 109', name: 'Fundamentals of Database Systems', yearLevel: '2nd Year', semester: '1st Semester' },
  { code: 'IT 110', name: 'Object Oriented Programming (OOP)', yearLevel: '2nd Year', semester: '1st Semester' },
  { code: 'IT 111', name: 'Social Issues & Professional Issues', yearLevel: '2nd Year', semester: '1st Semester' },

  // 2025-2026 2nd (BSIT — Year 2nd)
  { code: 'IT 112', name: 'Information Management 1', yearLevel: '2nd Year', semester: '2nd Semester' },
  { code: 'IT 113', name: 'Event-Driven Programming', yearLevel: '2nd Year', semester: '2nd Semester' },
  { code: 'IT 114', name: 'Integrative Programming & Technologies 1', yearLevel: '2nd Year', semester: '2nd Semester' },
  { code: 'IT 115', name: 'Human Computer Interaction 1', yearLevel: '2nd Year', semester: '2nd Semester' },
  { code: 'IT 116', name: 'Advanced Database System', yearLevel: '2nd Year', semester: '2nd Semester' },
  { code: 'PATH FIT 4', name: 'Team Sports', yearLevel: '2nd Year', semester: '2nd Semester' },
  { code: 'GEC 4', name: 'Mathematics in the Modern World', yearLevel: '2nd Year', semester: '2nd Semester' },
  { code: 'GEE 6', name: 'Art Appreciation', yearLevel: '2nd Year', semester: '2nd Semester' },
  { code: 'GEE 8', name: 'Ethics', yearLevel: '2nd Year', semester: '2nd Semester' },

  // 2025-2026 Summer (BSIT — Year 2nd)
  { code: 'IT 117', name: 'QualitativeMethods(Modeling&Simulation)', yearLevel: '2nd Year', semester: 'Summer' },
  { code: 'IT 118', name: 'Human Computer Interaction 2', yearLevel: '2nd Year', semester: 'Summer' },
  { code: 'IT Elec 1', name: 'System Analysis and Design (SAD)', yearLevel: '2nd Year', semester: 'Summer' },

  // 2026-2027 1st (BSIT — Year 3rd)
  { code: 'IT 119', name: 'System Integration & Architecture 1', yearLevel: '3rd Year', semester: '1st Semester' },
  { code: 'IT 120', name: 'Research1 (Methods of Research in Computing)', yearLevel: '3rd Year', semester: '1st Semester' },
  { code: 'IT 121', name: 'Information Management 2', yearLevel: '3rd Year', semester: '1st Semester' },
  { code: 'IT 122', name: 'Integrative Programming & Technologies 2', yearLevel: '3rd Year', semester: '1st Semester' },
  { code: 'IT Elec 2', name: 'Computer Graphics', yearLevel: '3rd Year', semester: '1st Semester' },
  { code: 'GEC 5', name: 'Purposive Communication', yearLevel: '3rd Year', semester: '1st Semester' },
  { code: 'GEC 7', name: 'Science, Technology, and Society', yearLevel: '3rd Year', semester: '1st Semester' },
  { code: 'GEC 9', name: 'Life, Works & Writing of Dr. Jose Rizal', yearLevel: '3rd Year', semester: '1st Semester' },
  { code: 'GEE 9', name: 'Technoprenuership (The Entrepreneurial Mind)', yearLevel: '3rd Year', semester: '1st Semester' },
];

export const BSIT_SUBJECT_OPTIONS = BSIT_SUBJECTS.map((s) => ({
  value: `${s.code} - ${s.name}`,
  label: `${s.code} — ${s.name}`,
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
      { label: 'Blocks', path: '/secretary/sections', icon: Layers },
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
      { label: 'Student Records', path: '/dean/records', icon: FileText },
      { label: 'Quiz Oversight', path: '/dean/quizzes', icon: ShieldCheck },
      { label: 'Security & Proctoring', path: '/dean/security', icon: ShieldCheck },
      { label: 'Analytics', path: '/dean/analytics', icon: BarChart },
      { label: 'Activity Logs', path: '/dean/logs', icon: Activity },
      { label: 'System Health', path: '/dean/health', icon: Activity },
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
