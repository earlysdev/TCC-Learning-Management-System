export type UserRole = 'student' | 'teacher' | 'secretary' | 'dean' | 'developer';

export interface User {
  id: number;
  name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  role: UserRole;
  grade?: string;
  section?: string;
  status?: string;
  initials?: string;
  lrn?: string;
}

export interface Quiz {
  id: number;
  title: string;
  subject: string;
  topic: string;
  instructions: string | null;
  question_count: number;
  time_limit_minutes?: number;
  shuffle_questions?: boolean;
  is_published?: boolean;
  allow_review?: boolean;
  target_type?: QuizAudienceType;
  target_sections?: Array<string | number>;
  target_student_ids?: number[];
  audience_type?: QuizAudienceType;
  audience?: QuizAudience;
  generated_by_ai?: boolean;
  attempts_count?: number;
  average?: number;
  attempted?: boolean;
  score?: number | null;
  max_score?: number | null;
  percentage?: number | null;
  recommendation?: Recommendation | null;
  questions?: Question[];
}

export type QuizAudienceType = 'all' | 'section' | 'individual';

export interface QuizAudience {
  type?: QuizAudienceType;
  section_ids?: Array<string | number>;
  student_ids?: number[];
  label?: string;
}

export interface Question {
  prompt: string;
  options: string[];
  correct_index?: number;
  skill?: string;
  points?: number;
}

export interface StudyReference {
  title: string;
  url: string;
  description?: string;
  source_name?: string;
}

export interface Recommendation {
  summary: string;
  focus_topics: string[];
  action_steps: string[];
  references?: StudyReference[];
  source?: string;
}

export interface Announcement {
  id: number;
  title: string;
  content: string;
  target_role?: string;
  is_pinned: boolean;
  author: { id: number; name: string };
  created_at: string;
}

export interface LmsNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

export interface DashboardMetrics {
  [key: string]: string | number;
}

export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
}

export interface ActivityLog {
  id: number;
  user_id?: number | null;
  action: string;
  description?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  user?: User | null;
}

export interface SecurityLog {
  id: number;
  user_id?: number | null;
  event_type: string;
  ip_address?: string | null;
  user_agent?: string | null;
  details?: Record<string, unknown> | null;
  is_resolved: boolean;
  resolved_at?: string | null;
  created_at: string;
  user?: User | null;
}

export interface SystemSetting {
  id: number;
  key: string;
  value?: string | null;
  type: string;
  description?: string | null;
  updated_at?: string;
}

export interface Section {
  id: number;
  grade: string;
  name: string;
  display_name: string;
  student_count?: number;
  students_count?: number;
  created_at?: string;
}

export interface Subject {
  id: number;
  name: string;
  code?: string;
  grade?: string;
  department?: string;
  description?: string;
  quizzes_count?: number;
  created_at?: string;
}

