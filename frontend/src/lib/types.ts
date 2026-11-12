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
  department?: string;
  school_year?: string;
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
  department?: string;
  reference_pdf_name?: string | null;
  reference_pdf_text?: string | null;
  reference_pdf_data?: string | null;
  has_pdf_data?: boolean;
  question_count: number;
  time_limit_minutes?: number;
  shuffle_questions?: boolean;
  quiz_type?: 'formative' | 'summative';
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
  started?: boolean;
  is_locked?: boolean;
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

export type QuestionType =
  | 'multiple_choice'
  | 'identification'
  | 'true_false'
  | 'multiple_answer'
  | 'essay';

export type StudentAnswerValue = number | string | number[] | null;

export interface Question {
  type?: QuestionType;
  prompt: string;
  options: string[];
  correct_index?: number;
  correct_indices?: number[];
  correct_answer?: string;
  skill?: string;
  points?: number;
}

export type QuizQuestion = Question;

export interface ReviewQuestion {
  type?: QuestionType;
  prompt: string;
  options: string[];
  points: number;
  skill?: string;
  correct_index: number;
  correct_indices?: number[];
  correct_answer?: string;
  student_answer: StudentAnswerValue;
  is_correct: boolean;
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
  resolved_by?: number | null;
  resolver?: { id: number; name: string } | null;
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
  department?: string;
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

export interface TeacherAiRecommendation {
  title: string;
  priority: 'high' | 'medium' | 'positive';
  category: 'remediation' | 'misconception' | 'integrity' | 'differentiation';
  rationale: string;
  action_step: string;
  target_group: string;
}

export interface TeacherMissedQuestion {
  quiz_id: number;
  quiz_title: string;
  subject: string;
  question_index: number;
  prompt: string;
  skill: string;
  attempts: number;
  missed_count: number;
  miss_rate: number;
  most_common_wrong_answer?: string | null;
}

export interface TeacherCompetencyStat {
  competency: string;
  subject: string;
  questions_answered: number;
  correct_count: number;
  missed_count: number;
  accuracy: number;
  miss_rate: number;
  status: 'critical' | 'needs_review' | 'mastered';
}

export interface TeacherSectionPerformance {
  section: string;
  year_level: string;
  attempts_count: number;
  students_count: number;
  average_percentage: number;
  flagged_attempts: number;
  status: 'strong' | 'developing' | 'needs_attention';
}

export interface TeacherAtRiskStudent {
  student_id: number;
  name: string;
  lrn?: string | null;
  grade?: string | null;
  section: string;
  average_percentage: number;
  attempts_count: number;
  latest_quiz_title: string;
  violations: number;
  priority: 'high' | 'medium';
}

export interface TeacherRemedialDraft {
  subject: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'challenging';
  count: number;
  target_section?: string | null;
  reason: string;
}

export interface TeacherInsightsResponse {
  selected_quiz_id: number | null;
  quizzes: Array<{
    id: number;
    title: string;
    subject: string;
    topic: string;
    is_published: boolean;
    attempts_count: number;
  }>;
  summary: {
    quiz_count: number;
    published_count: number;
    total_attempts: number;
    unique_students: number;
    average_percentage: number;
    pass_rate: number;
    at_risk_count: number;
    flagged_attempts: number;
    handled_year_level?: string | null;
  };
  mastery_bands: {
    proficient: { count: number; pct: number };
    developing: { count: number; pct: number };
    at_risk: { count: number; pct: number };
  };
  missed_questions: TeacherMissedQuestion[];
  weak_competencies: TeacherCompetencyStat[];
  section_breakdown: TeacherSectionPerformance[];
  at_risk_students: TeacherAtRiskStudent[];
  remedial_draft: TeacherRemedialDraft | null;
  ai: {
    headline: string;
    executive_summary: string;
    recommendations: TeacherAiRecommendation[];
    teaching_strategies: string[];
    source: string;
  };
}

