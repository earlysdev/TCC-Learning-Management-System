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
      { label: 'Sections & Grades', path: '/secretary/sections', icon: Layers },
      { label: 'Student Records', path: '/secretary/records', icon: FileText },
      { label: 'Performance', path: '/secretary/performance', icon: BarChart },
      { label: 'Reports', path: '/secretary/reports', icon: FileText },
      { label: 'Activity Logs', path: '/secretary/logs', icon: Activity },
      { label: 'Settings', path: '/secretary/settings', icon: Settings },
    ]
  },

  principal: {
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
