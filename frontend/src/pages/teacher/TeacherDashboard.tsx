import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { lmsFetch, getLmsUser, extractCollection } from '../../lmsApi';
import type { Quiz, User, Subject, TeacherRemedialDraft } from '../../lib/types';
import {
  BSIT_SUBJECT_OPTIONS,
  ALL_BLOCKS,
  getYearLevelFromBlock,
  buildSubjectOptionsForYear,
  formatCourseLabel,
  extractSubjectName,
} from '../../lib/constants';
import { readPdfFile, type ParsedPdfPayload } from '../../lib/pdfUtils';
import { 
  BookOpen, CheckCircle2, Users, Target, Sparkles, 
  ArrowRight, AlertCircle, Eye, EyeOff, Pencil,
  ShieldAlert, FileText, Upload, X, Copy, Trash2
} from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import ProfileUpdateCard from '../../components/ui/ProfileUpdateCard';
import QuizEditorModal, { type QuizEditorValues } from './QuizEditorModal';
import PublishQuizModal, { type PublishAudience, type SectionOption } from './PublishQuizModal';
import QuizSubmissionsModal from './QuizSubmissionsModal';
import TeacherAiInsightsPanel from './TeacherAiInsightsPanel';
import { useToastContext } from '../../contexts/ToastContext';

interface TeacherMetrics {
  quizzes: number;
  published: number;
  submissions: number;
  average: number;
}

type SectionApiRecord = {
  id?: string | number;
  name?: string;
  label?: string;
  grade?: string;
  section?: string;
  student_count?: number;
  students_count?: number;
};

function collectionFromResponse<T>(response: unknown): T[] {
  return extractCollection<T>(response);
}

function extractQuiz(res: { quiz?: Quiz } | Quiz): Quiz {
  if (res && 'quiz' in res && res.quiz) return res.quiz;
  return res as Quiz;
}

function rosterSections(students: User[], handledYearLevel?: string | null): SectionOption[] {
  const safeList = Array.isArray(students) ? students : [];
  const counts = new Map<string, number>();
  safeList.forEach((student) => {
    const blk = student.section?.trim();
    if (!blk) return;
    counts.set(blk, (counts.get(blk) || 0) + 1);
  });

  const baseBlocks = handledYearLevel
    ? ALL_BLOCKS.filter((blk) => getYearLevelFromBlock(blk) === handledYearLevel)
    : ALL_BLOCKS;

  const allBlockLabels = Array.from(new Set([...baseBlocks, ...Array.from(counts.keys())]));
  return allBlockLabels.map((label) => ({
    id: label,
    label,
    studentCount: counts.get(label) || 0,
  }));
}

function toSectionOptions(records: SectionApiRecord[]): SectionOption[] {
  return records.map((record) => {
    const label = record.name || record.label || 'Unnamed block';
    return {
      id: label,
      label,
      studentCount: record.student_count ?? record.students_count,
    };
  });
}

function quizAudienceLabel(quiz: Quiz): string | null {
  if (quiz.audience?.label) return quiz.audience.label;
  const type = quiz.audience?.type || quiz.audience_type;
  if (type === 'all') return 'All students';
  if (type === 'section') return 'Selected blocks';
  if (type === 'individual') return 'Selected students';
  return null;
}

function hasDistinctTopic(quiz: Pick<Quiz, 'title' | 'topic'>): boolean {
  const cleanTitle = (quiz.title || '').trim().toLowerCase();
  const cleanTopic = (quiz.topic || '').trim().toLowerCase();
  if (!cleanTopic) return false;
  if (cleanTitle === cleanTopic) return false;
  if (cleanTitle === `${cleanTopic} assessment`) return false;
  return true;
}

function resolveDefaultSubjectForYear(yearLevel?: string | null): string {
  if (yearLevel) {
    const match = BSIT_SUBJECT_OPTIONS.find((s) => s.yearLevel === yearLevel);
    if (match) return match.value;
  }
  return BSIT_SUBJECT_OPTIONS[0]?.value || 'IT 101 - Introduction To Computing';
}

export default function TeacherDashboard() {
  const user = getLmsUser();
  const { showToast } = useToastContext();
  const { subpage } = useParams<{ subpage?: string }>();
  const navigate = useNavigate();
  const initialSection = subpage === 'dashboard' ? 'overview' : (subpage || 'overview');
  const [activeSection, setActiveSection] = useState(initialSection);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [handledYearLevel, setHandledYearLevel] = useState<string | null>(user?.grade || null);
  const [metrics, setMetrics] = useState<TeacherMetrics>({ quizzes: 0, published: 0, submissions: 0, average: 0 });
  const [students, setStudents] = useState<User[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [publishingQuiz, setPublishingQuiz] = useState<Quiz | null>(null);
  const [submissionsQuiz, setSubmissionsQuiz] = useState<Quiz | null>(null);
  const [draftingRemedial, setDraftingRemedial] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Manual & PDF/AI Quiz Builder form
  const [quizTitle, setQuizTitle] = useState('');
  const [subject, setSubject] = useState(() => resolveDefaultSubjectForYear(user?.grade));
  const [topic, setTopic] = useState(() => extractSubjectName(resolveDefaultSubjectForYear(user?.grade)));
  const topicManuallyEditedRef = useRef(false);
  const [count, setCount] = useState(5);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(15);
  const [quizType, setQuizType] = useState<'formative' | 'summative'>('formative');
  const [allowReview, setAllowReview] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedTargetSection, setSelectedTargetSection] = useState('');
  const [uploadedPdf, setUploadedPdf] = useState<ParsedPdfPayload | null>(null);
  const [generateWithAi, setGenerateWithAi] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'challenging'>('medium');
  const createPdfInputRef = useRef<HTMLInputElement>(null);
  const [duplicatingQuizId, setDuplicatingQuizId] = useState<number | null>(null);
  const [quizToDelete, setQuizToDelete] = useState<Quiz | null>(null);
  const [deletingQuiz, setDeletingQuiz] = useState(false);

  const handleCourseChange = (nextCourse: string) => {
    setSubject(nextCourse);
    const derivedTopic = extractSubjectName(nextCourse);
    if (derivedTopic) {
      setTopic(derivedTopic);
      topicManuallyEditedRef.current = false;
    }
  };

  // Student filter
  const [studentSearch, setStudentSearch] = useState('');
  const [blockFilter, setBlockFilter] = useState('');

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await lmsFetch<{ handled_year_level?: string | null; metrics: TeacherMetrics; quizzes: Quiz[] }>('/teacher/dashboard');
      setMetrics(data.metrics || { quizzes: 0, published: 0, submissions: 0, average: 0 });
      setQuizzes(data.quizzes || []);
      if (data.handled_year_level !== undefined) {
        setHandledYearLevel(data.handled_year_level);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load teacher dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async () => {
    try {
      const teacherRoster = await lmsFetch<unknown>('/teacher/students').catch(() => null);
      const data = teacherRoster || await lmsFetch<unknown>('/users?role=student');
      const roster = collectionFromResponse<User>(data);
      const yearHint =
        teacherRoster && typeof teacherRoster === 'object' && 'handled_year_level' in teacherRoster
          ? (teacherRoster as { handled_year_level?: string | null }).handled_year_level ?? null
          : handledYearLevel;
      setStudents(Array.isArray(roster) ? roster : []);
      setSections((current) => current.length > 0 ? current : rosterSections(roster, yearHint));
    } catch {
      setStudents([]);
    }
  };

  useEffect(() => {
    if (handledYearLevel) {
      const yearOptions = BSIT_SUBJECT_OPTIONS.filter((s) => s.yearLevel === handledYearLevel);
      if (yearOptions.length > 0 && (!subject || !yearOptions.some((s) => s.value === subject))) {
        const nextCourse = yearOptions[0].value;
        setSubject(nextCourse);
        if (!topicManuallyEditedRef.current) {
          setTopic(extractSubjectName(nextCourse));
        }
      }
    }
  }, [handledYearLevel]);

  const loadSubjects = async () => {
    try {
      const data = await lmsFetch<unknown>('/subjects');
      const list = collectionFromResponse<Subject>(data);
      setSubjects(Array.isArray(list) ? list : []);
      if (Array.isArray(list) && list.length > 0 && !subject) {
        const first = list[0];
        const nextCourse = first.code ? `${first.code} • ${first.name}` : first.name;
        setSubject(nextCourse);
        if (!topicManuallyEditedRef.current) {
          setTopic(extractSubjectName(nextCourse));
        }
      }
    } catch {
      // Subjects are optional
    }
  };

  const loadSections = async () => {
    try {
      const data = await lmsFetch<unknown>('/sections');
      const availableSections = toSectionOptions(collectionFromResponse<SectionApiRecord>(data));
      const filteredSections = handledYearLevel
        ? availableSections.filter((sec) => getYearLevelFromBlock(sec.label) === handledYearLevel)
        : availableSections;
      if (filteredSections.length > 0) setSections(filteredSections);
    } catch {
      // Sections can be derived from the learner roster for the local demo.
    }
  };

  useEffect(() => {
    loadDashboard();
    loadStudents();
    loadSections();
    loadSubjects();
  }, []);

  useEffect(() => {
    if (subpage) {
      const mapped = subpage === 'dashboard' ? 'overview' : subpage;
      setActiveSection(mapped);
    }
  }, [subpage]);

  const handlePdfUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      const msg = 'Please select a valid PDF (.pdf) document.';
      setError(msg);
      showToast(msg, 'warning');
      return;
    }
    try {
      setError(null);
      const parsed = await readPdfFile(file);
      setUploadedPdf(parsed);
      setGenerateWithAi(true);
      showToast(`PDF "${parsed.name}" uploaded and ready.`, 'success');
      if (!topic.trim()) {
        const cleanFileName = parsed.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
        if (cleanFileName) setTopic(cleanFileName);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to read PDF file.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      if (createPdfInputRef.current) createPdfInputRef.current.value = '';
    }
  };

  const handleCreateManualQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const fallbackSubject = resolveDefaultSubjectForYear(handledYearLevel);
      const finalSubject = (subject && subject.trim()) || (subjects[0]?.name) || fallbackSubject;
      const derivedSubjectName = extractSubjectName(finalSubject);
      const fallbackPdfTopic = uploadedPdf ? uploadedPdf.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() : '';
      const cleanTopic = topic.trim() || derivedSubjectName || fallbackPdfTopic || 'Course Unit';
      const cleanTitle = quizTitle.trim();
      const questionCount = Math.max(1, Math.min(50, Number(count) || 1));
      const data = await lmsFetch<{ quiz: Quiz }>('/teacher/quizzes', {
        method: 'POST',
        body: JSON.stringify({
          title: cleanTitle,
          subject: finalSubject,
          topic: cleanTopic,
          count: questionCount,
          time_limit_minutes: Math.max(1, Math.min(300, Number(timeLimitMinutes) || 15)),
          quiz_type: quizType,
          allow_review: allowReview,
          generate_with_ai: generateWithAi,
          difficulty: aiDifficulty,
          pdf_name: uploadedPdf?.name || null,
          pdf_text: uploadedPdf?.text || null,
          pdf_base64: uploadedPdf?.base64 || null,
          target_type: selectedTargetSection ? 'section' : 'all',
          target_sections: selectedTargetSection ? [selectedTargetSection] : null,
        }),
      });
      const sourceNote = uploadedPdf
        ? generateWithAi
          ? `with ${questionCount} AI-generated questions from PDF "${uploadedPdf.name}"`
          : `with PDF handout "${uploadedPdf.name}" and ${questionCount} question ${questionCount === 1 ? 'slot' : 'slots'}`
        : generateWithAi
          ? `with ${questionCount} AI-generated questions based on topic "${cleanTopic}"`
          : `with ${questionCount} question ${questionCount === 1 ? 'slot' : 'slots'}`;
      const msg = `Quiz "${data.quiz.title}" created ${sourceNote}.`;
      setNotice(msg);
      showToast(`"${data.quiz.title}" created.`, 'success');
      setQuizTitle('');
      topicManuallyEditedRef.current = false;
      setTopic(extractSubjectName(finalSubject));
      setUploadedPdf(null);
      setGenerateWithAi(false);
      setQuizzes((current) => [data.quiz, ...current.filter((quiz) => quiz.id !== data.quiz.id)]);
      setEditingQuiz(data.quiz);
      void loadDashboard();
      setActiveSection('quizzes');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create quiz';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicateQuiz = async (quiz: Quiz) => {
    if (busy || duplicatingQuizId !== null) return;
    setDuplicatingQuizId(quiz.id);
    setError(null);
    setNotice(null);
    try {
      const data = await lmsFetch<{ quiz: Quiz; message?: string }>(`/teacher/quizzes/${quiz.id}/duplicate`, {
        method: 'POST',
      });
      const duplicated = extractQuiz(data);
      setQuizzes((current) => [duplicated, ...current.filter((item) => item.id !== duplicated.id)]);
      const msg = `Duplicated "${quiz.title}" as "${duplicated.title}".`;
      setNotice(msg);
      showToast(msg, 'success');
      void loadDashboard();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not duplicate quiz';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setDuplicatingQuizId(null);
    }
  };

  const handleConfirmDeleteQuiz = async () => {
    if (!quizToDelete || deletingQuiz) return;
    setDeletingQuiz(true);
    setError(null);
    try {
      await lmsFetch(`/teacher/quizzes/${quizToDelete.id}`, {
        method: 'DELETE',
      });
      const deletedTitle = quizToDelete.title;
      const deletedId = quizToDelete.id;
      try {
        localStorage.removeItem(`tcc_quiz_draft_${deletedId}`);
      } catch {
        // Ignore storage errors
      }
      setQuizzes((current) => current.filter((item) => item.id !== deletedId));
      setQuizToDelete(null);
      const msg = `"${deletedTitle}" has been deleted.`;
      setNotice(msg);
      showToast(msg, 'info');
      void loadDashboard();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not delete quiz';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setDeletingQuiz(false);
    }
  };

  const handleTogglePublish = async (quiz: Quiz) => {
    if (!quiz.is_published) {
      setPublishingQuiz(quiz);
      showToast(`Configure publish settings for "${quiz.title}".`, 'info');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await lmsFetch<{ quiz?: Quiz } | Quiz>(`/teacher/quizzes/${quiz.id}/publish`, {
        method: 'PATCH',
        body: JSON.stringify({ is_published: false }),
      });
      const updated = extractQuiz(response);
      setQuizzes((current) => current.map((item) => item.id === quiz.id ? updated : item));
      const msg = `"${quiz.title}" is unpublished and no longer available to students.`;
      setNotice(msg);
      showToast(msg, 'info');
      void loadDashboard();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update quiz status';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveQuiz = async (draft: QuizEditorValues) => {
    setBusy(true);
    setError(null);
    try {
      const response = await lmsFetch<{ quiz?: Quiz } | Quiz>(`/teacher/quizzes/${draft.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: draft.title,
          subject: draft.subject,
          topic: draft.topic,
          instructions: draft.instructions,
          reference_pdf_name: draft.reference_pdf_name ?? null,
          reference_pdf_text: draft.reference_pdf_text ?? null,
          pdf_base64: draft.pdf_base64 ?? null,
          quiz_type: draft.quiz_type || 'formative',
          allow_review: draft.allow_review,
          time_limit_minutes: draft.time_limit_minutes,
          shuffle_questions: draft.questions.length >= 3 ? Boolean(draft.shuffle_questions) : false,
          questions: draft.questions,
        }),
      });
      const fallback: Quiz = {
        ...(editingQuiz || {} as Quiz),
        ...draft,
        question_count: draft.questions.length,
      };
      const updated = extractQuiz(response || fallback);
      setQuizzes((current) => current.map((quiz) => quiz.id === draft.id ? updated : quiz));
      setEditingQuiz(null);
      const msg = `"${draft.title}" was saved. Choose Publish when you are ready to assign it.`;
      setNotice(msg);
      showToast(`"${draft.title}" saved successfully!`, 'success');
      void loadDashboard();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save quiz changes';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handlePublishQuiz = async (audience: PublishAudience) => {
    if (!publishingQuiz) return;
    setBusy(true);
    setError(null);
    try {
      const response = await lmsFetch<{ quiz?: Quiz } | Quiz>(`/teacher/quizzes/${publishingQuiz.id}/publish`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_published: true,
          quiz_type: audience.quiz_type ?? publishingQuiz.quiz_type ?? 'formative',
          allow_review: audience.allow_review ?? Boolean(publishingQuiz.allow_review),
          target_type: audience.type,
          audience_type: audience.type,
          target_sections: audience.section_ids,
          section_ids: audience.section_ids,
          target_student_ids: audience.student_ids,
          student_ids: audience.student_ids,
          time_limit_minutes: audience.time_limit_minutes,
          shuffle_questions: audience.shuffle_questions,
        }),
      });
      const fallback: Quiz = {
        ...publishingQuiz,
        is_published: true,
        quiz_type: audience.quiz_type ?? publishingQuiz.quiz_type ?? 'formative',
        allow_review: audience.allow_review ?? Boolean(publishingQuiz.allow_review),
        time_limit_minutes: audience.time_limit_minutes,
        shuffle_questions: audience.shuffle_questions,
        audience_type: audience.type,
        audience: { type: audience.type },
      };
      const updated = extractQuiz(response || fallback);
      setQuizzes((current) => current.map((quiz) => quiz.id === publishingQuiz.id ? updated : quiz));
      setPublishingQuiz(null);
      const msg = `"${publishingQuiz.title}" is published to ${audience.type === 'all' ? 'all students' : audience.type === 'section' ? 'the selected blocks' : 'the selected students'} (${audience.time_limit_minutes} mins${audience.shuffle_questions ? ', Shuffled' : ''}).`;
      setNotice(msg);
      showToast(msg, 'success');
      void loadDashboard();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not publish this quiz';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const safeStudents = Array.isArray(students) ? students : [];
  const filteredStudents = safeStudents.filter(s => {
    const matchesSearch = !studentSearch || 
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) || 
      (s.lrn && s.lrn.includes(studentSearch)) ||
      (s.section && s.section.toLowerCase().includes(studentSearch.toLowerCase()));
    const matchesBlock = !blockFilter || s.section === blockFilter || getYearLevelFromBlock(s.section) === blockFilter;
    return matchesSearch && matchesBlock;
  });

  const renderOverview = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
            TEACHER DASHBOARD
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'white', margin: 0 }}>
              Welcome, {user?.name || 'Teacher'}!
            </h1>
            {handledYearLevel && (
              <Badge variant="warning">Assigned: {handledYearLevel}</Badge>
            )}
          </div>
          <p style={{ color: 'var(--neutral-300)', marginTop: '0.25rem' }}>
            {handledYearLevel
              ? `Author assessments and track mastery for your assigned ${handledYearLevel} classes.`
              : 'Author custom assessments, oversee class submissions, and analyze learner mastery.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="accent" onClick={() => handleSectionChange('quizzes')}>
            <Pencil size={16} /> Create Quiz
          </Button>
          <Button variant="outline" onClick={() => handleSectionChange('students')}>
            <Users size={16} /> Students Roster
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
        <StatCard label="Quizzes Created" value={loading ? '…' : metrics.quizzes} icon={<BookOpen size={24} />} detail="Total assessments" />
        <StatCard label="Published" value={loading ? '…' : metrics.published} icon={<CheckCircle2 size={24} />} detail="Visible to students" />
        <StatCard label="Submissions" value={loading ? '…' : metrics.submissions} icon={<Users size={24} />} detail="Total student attempts" />
        <StatCard label="Class Average" value={loading ? '…' : `${metrics.average}%`} icon={<Target size={24} />} detail="Across completed quizzes" />
      </div>

      {/* Quick Quiz Overview */}
      <GlassCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>Recent Class Quizzes</h2>
          <Button variant="outline" size="sm" onClick={() => handleSectionChange('quizzes')}>
            Manage All <ArrowRight size={14} />
          </Button>
        </div>

        {quizzes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--neutral-300)' }}>
            No quizzes created yet. Click <strong>Create Quiz</strong> to author your first assessment!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {quizzes.slice(0, 5).map(quiz => (
              <div 
                key={quiz.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                    <Badge variant="primary">{formatCourseLabel(quiz.subject)}</Badge>
                    {hasDistinctTopic(quiz) && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--neutral-300)' }}>• {quiz.topic}</span>
                    )}
                    {quiz.generated_by_ai && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold-light)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        • <Sparkles size={12} /> AI
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, color: 'white', fontSize: '1.02rem' }}>{quiz.title}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.82rem', color: 'var(--neutral-300)' }}>
                      <strong>{quiz.attempts_count || 0}</strong> attempts • <strong>{quiz.average || 0}%</strong> avg
                    </div>
                    <Badge variant={quiz.is_published ? 'success' : 'warning'}>
                      {quiz.is_published ? 'Published' : 'Draft'}
                    </Badge>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setEditingQuiz(quiz)}
                    >
                      <Pencil size={14} /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || duplicatingQuizId === quiz.id}
                      isLoading={duplicatingQuizId === quiz.id}
                      onClick={() => handleDuplicateQuiz(quiz)}
                      title="Duplicate quiz with next sequential number"
                    >
                      <Copy size={14} /> Duplicate
                    </Button>
                    <Button 
                      variant={quiz.is_published ? 'outline' : 'accent'} 
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        if (quiz.is_published) {
                          handleTogglePublish(quiz);
                        } else {
                          setPublishingQuiz(quiz);
                        }
                      }}
                    >
                      {quiz.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
                      {quiz.is_published ? 'Unpublish' : 'Publish'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSubmissionsQuiz(quiz)}
                    >
                      <ShieldAlert size={14} /> Submissions ({quiz.attempts_count || 0})
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'rgba(255, 255, 255, 0.55)',
    marginBottom: '0.85rem',
  };

  const renderQuizzes = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <div>
        <span style={{ fontSize: '0.78rem', color: 'var(--primary-300)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
          CURRICULUM &amp; ASSESSMENTS
        </span>
        <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'white', margin: '0.2rem 0 0.25rem' }}>
          Quiz Management
        </h1>
        <p style={{ color: 'var(--neutral-300)', fontSize: '0.9rem', margin: 0 }}>
          Create, configure, duplicate, and manage course assessments.
        </p>
      </div>

      {notice && (
        <div style={{ background: 'rgba(46, 125, 50, 0.16)', border: '1px solid rgba(129, 199, 132, 0.35)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#c8e6c9', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
          <CheckCircle2 size={17} /> {notice}
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(211, 47, 47, 0.16)', border: '1px solid rgba(239, 154, 154, 0.35)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#ffcdd2', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
          <AlertCircle size={17} /> {error}
        </div>
      )}

      {/* Create New Quiz Card */}
      <GlassCard style={{ position: 'relative', zIndex: 30, border: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', paddingBottom: '1rem', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>Create New Quiz</h2>
          </div>
          {handledYearLevel && (
            <span style={{ fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '0.2rem 0.6rem', borderRadius: '999px', fontWeight: 600 }}>
              {handledYearLevel} Courses
            </span>
          )}
        </div>

        <form onSubmit={handleCreateManualQuiz} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Section A: Basic Information */}
          <div>
            <div style={sectionHeaderStyle}>Basic Information</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <Input
                label="Quiz Title"
                value={quizTitle}
                onChange={(e) => setQuizTitle(e.target.value)}
                placeholder="e.g. Quiz 1, Midterm Examination"
              />

              <Select
                label="Course Code & Subject"
                value={subject}
                onChange={handleCourseChange}
                options={buildSubjectOptionsForYear(handledYearLevel, subjects)}
              />

              <Input
                label="Topic / Unit"
                value={topic}
                onChange={(e) => {
                  topicManuallyEditedRef.current = true;
                  setTopic(e.target.value);
                }}
                placeholder="e.g. Introduction to Computing"
                required
              />
            </div>
          </div>

          {/* Section B: Quiz Configuration */}
          <div style={{ paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.07)' }}>
            <div style={sectionHeaderStyle}>Quiz Configuration</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <Input
                  label="Number of Questions"
                  type="number"
                  min={1}
                  max={50}
                  value={String(count)}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setCount(Number.isNaN(parsed) ? 1 : Math.max(1, Math.min(50, parsed)));
                  }}
                  required
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                  {[5, 10, 15, 20, 30].map((preset) => {
                    const active = count === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCount(preset)}
                        style={{
                          height: '24px',
                          padding: '0 0.55rem',
                          fontSize: '0.73rem',
                          fontWeight: 600,
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: active ? '1px solid rgba(245, 158, 11, 0.6)' : '1px solid rgba(255,255,255,0.1)',
                          background: active ? 'rgba(245, 158, 11, 0.16)' : 'rgba(255,255,255,0.03)',
                          color: active ? '#fbbf24' : 'rgba(255,255,255,0.65)',
                        }}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <Input
                  label="Time Limit (Minutes)"
                  type="number"
                  min={1}
                  max={300}
                  value={String(timeLimitMinutes)}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setTimeLimitMinutes(Number.isNaN(parsed) ? 15 : Math.max(1, Math.min(300, parsed)));
                  }}
                  required
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                  {[10, 15, 30, 45, 60].map((mins) => {
                    const active = timeLimitMinutes === mins;
                    return (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setTimeLimitMinutes(mins)}
                        style={{
                          height: '24px',
                          padding: '0 0.55rem',
                          fontSize: '0.73rem',
                          fontWeight: 600,
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: active ? '1px solid rgba(245, 158, 11, 0.6)' : '1px solid rgba(255,255,255,0.1)',
                          background: active ? 'rgba(245, 158, 11, 0.16)' : 'rgba(255,255,255,0.03)',
                          color: active ? '#fbbf24' : 'rgba(255,255,255,0.65)',
                        }}
                      >
                        {mins}m
                      </button>
                    );
                  })}
                </div>
              </div>

              <Select
                label="Quiz Type"
                value={quizType}
                onChange={(val) => setQuizType(val === 'summative' ? 'summative' : 'formative')}
                options={[
                  { value: 'formative', label: 'Formative • Live Monitoring' },
                  { value: 'summative', label: 'Summative • Final Submission' },
                ]}
              />

              <Select
                label="Target Block"
                value={selectedTargetSection}
                onChange={setSelectedTargetSection}
                options={[
                  { value: '', label: handledYearLevel ? `All ${handledYearLevel} Blocks • Assign Later` : 'All Blocks • Assign Later' },
                  ...scopedSections.map((s) => ({
                    value: String(s.id),
                    label: `${s.label}${s.studentCount ? ` • ${s.studentCount} ${s.studentCount === 1 ? 'student' : 'students'}` : ''}`,
                  })),
                ]}
              />
            </div>
          </div>

          {/* Section C: Quiz Options */}
          <div style={{ paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.07)' }}>
            <div style={sectionHeaderStyle}>Quiz Options</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem' }}>
              {/* Option 1: Allow Answer Review */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  background: 'rgba(255, 255, 255, 0.025)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={allowReview}
                    onChange={(e) => setAllowReview(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-gold, #f59e0b)', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.88rem' }}>Allow Answer Review</div>
                    <div style={{ fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.55)', marginTop: '0.1rem' }}>
                      Show answer key after submission
                    </div>
                  </div>
                </div>
              </label>

              {/* Option 2: PDF Upload (Secondary) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(255, 255, 255, 0.025)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                  <FileText size={16} style={{ color: 'rgba(255, 255, 255, 0.6)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.88rem' }}>PDF Reference</div>
                    <div style={{ fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.55)', marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {uploadedPdf ? uploadedPdf.name : 'Optional handout for students & AI'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                  <input
                    ref={createPdfInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handlePdfUploadChange}
                    style={{ display: 'none' }}
                  />
                  {uploadedPdf && (
                    <button
                      type="button"
                      onClick={() => setUploadedPdf(null)}
                      title="Remove PDF"
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        background: 'rgba(255, 255, 255, 0.04)',
                        color: 'rgba(255, 255, 255, 0.7)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => createPdfInputRef.current?.click()}
                  >
                    <Upload size={13} /> {uploadedPdf ? 'Change' : 'Upload PDF'}
                  </Button>
                </div>
              </div>

              {/* Option 3: AI Question Generation (Secondary) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(255, 255, 255, 0.025)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', cursor: 'pointer', minWidth: 0, flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={generateWithAi}
                    onChange={(e) => setGenerateWithAi(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-gold, #f59e0b)', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>AI Question Generation</span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.55)', marginTop: '0.1rem' }}>
                      {uploadedPdf ? 'Draft questions from uploaded PDF' : 'Draft questions from Topic / Unit'}
                    </div>
                  </div>
                </label>

                {generateWithAi && (
                  <select
                    aria-label="AI Difficulty"
                    value={aiDifficulty}
                    onChange={(e) => setAiDifficulty(e.target.value as 'easy' | 'medium' | 'challenging')}
                    className="form-select"
                    style={{ width: 'auto', height: '32px', padding: '0 1.85rem 0 0.65rem', fontSize: '0.78rem', flexShrink: 0 }}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="challenging">Challenging</option>
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Section D: Primary Action */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              paddingTop: '1rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <Button
              variant="accent"
              type="submit"
              disabled={busy || !subject}
              isLoading={busy}
              style={{ height: '42px', padding: '0 1.4rem', boxShadow: 'none' }}
            >
              {!busy && (generateWithAi ? <Sparkles size={16} /> : <Pencil size={16} />)}
              {busy
                ? generateWithAi
                  ? 'Generating Questions...'
                  : 'Creating Quiz...'
                : generateWithAi
                  ? 'Create & Generate Questions'
                  : 'Create Quiz & Add Questions'}
            </Button>
          </div>
        </form>
      </GlassCard>

      {/* Created Quizzes List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
            Created Quizzes ({quizzes.length})
          </h2>
        </div>

        {quizzes.length === 0 ? (
          <GlassCard style={{ textAlign: 'center', padding: '2.25rem', color: 'rgba(255,255,255,0.55)', fontSize: '0.9rem' }}>
            No quizzes created yet. Use the form above to create your first assessment.
          </GlassCard>
        ) : (
          quizzes.map((quiz) => (
            <GlassCard key={quiz.id} style={{ border: '1px solid rgba(255, 255, 255, 0.08)', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ minWidth: 0, flex: '1 1 280px' }}>
                  <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                    <Badge variant="primary">{formatCourseLabel(quiz.subject)}</Badge>
                    <Badge variant={quiz.is_published ? 'success' : 'warning'}>
                      {quiz.is_published ? 'Published' : 'Draft'}
                    </Badge>
                    <span style={{ fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '0.15rem 0.55rem', borderRadius: '999px' }}>
                      {quiz.quiz_type === 'summative' ? 'Summative' : 'Formative'}
                    </span>
                    {quiz.reference_pdf_name && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.75)', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                        <FileText size={11} /> {quiz.reference_pdf_name}
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.25rem' }}>
                    {quiz.title}
                  </h3>
                  <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.83rem', margin: 0 }}>
                    {quiz.topic ? `${quiz.topic} • ` : ''}
                    {quiz.question_count} {quiz.question_count === 1 ? 'Question' : 'Questions'} • {quiz.time_limit_minutes || 15} mins
                    {quiz.allow_review ? ' • Review Enabled' : ''}
                    {quiz.question_count >= 3 && quiz.shuffle_questions ? ' • Shuffled' : ''}
                    {' • '}{quiz.attempts_count || 0} {quiz.attempts_count === 1 ? 'Submission' : 'Submissions'} ({quiz.average || 0}% avg)
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingQuiz(quiz)}
                  >
                    <Pencil size={14} /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || duplicatingQuizId === quiz.id}
                    isLoading={duplicatingQuizId === quiz.id}
                    onClick={() => handleDuplicateQuiz(quiz)}
                    title="Duplicate quiz with sequential title"
                  >
                    <Copy size={14} /> Duplicate
                  </Button>
                  <Button
                    variant={quiz.is_published ? 'outline' : 'accent'}
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      if (quiz.is_published) {
                        handleTogglePublish(quiz);
                      } else {
                        setPublishingQuiz(quiz);
                      }
                    }}
                    style={!quiz.is_published ? { boxShadow: 'none' } : undefined}
                  >
                    {quiz.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
                    {quiz.is_published ? 'Unpublish' : 'Publish'}
                  </Button>
                  {quiz.is_published && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPublishingQuiz(quiz)}
                      title="Configure target block or student audience"
                    >
                      <Target size={14} /> {quizAudienceLabel(quiz) || 'All'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSubmissionsQuiz(quiz)}
                  >
                    <ShieldAlert size={14} /> Submissions ({quiz.attempts_count || 0})
                  </Button>
                  <button
                    type="button"
                    onClick={() => setQuizToDelete(quiz)}
                    disabled={busy}
                    title={`Delete "${quiz.title}"`}
                    aria-label={`Delete ${quiz.title}`}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      border: '1px solid rgba(239, 83, 80, 0.28)',
                      background: 'rgba(239, 83, 80, 0.08)',
                      color: '#fca5a5',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: busy ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {quiz.questions && quiz.questions.length > 0 && (
                <details style={{ marginTop: '0.85rem', background: 'rgba(0,0,0,0.2)', padding: '0.65rem 0.9rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <summary style={{ color: 'rgba(255, 255, 255, 0.75)', fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem' }}>
                    Preview Questions &amp; Answer Key ({quiz.questions.length})
                  </summary>
                  <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {quiz.questions.map((q, idx) => {
                      const qType = q.type || 'multiple_choice';
                      return (
                        <div key={idx} style={{ fontSize: '0.84rem', color: 'var(--neutral-200)' }}>
                          <strong>{idx + 1}. {q.prompt || '(Untitled question)'}</strong>
                          {qType === 'identification' ? (
                            <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', color: '#a5d6a7' }}>
                              Answer Key: <strong>{q.correct_answer || q.options?.[0] || '(None)'}</strong>
                            </div>
                          ) : qType === 'essay' ? (
                            <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.65)' }}>
                              Essay Response {q.correct_answer ? `• Reference: ${q.correct_answer}` : ''}
                            </div>
                          ) : (
                            Array.isArray(q.options) && q.options.length > 0 && (
                              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                                {q.options.map((opt, optIdx) => {
                                  const isCorrect =
                                    qType === 'multiple_answer' && Array.isArray(q.correct_indices) && q.correct_indices.length > 0
                                      ? q.correct_indices.includes(optIdx)
                                      : optIdx === q.correct_index;
                                  return (
                                    <span
                                      key={optIdx}
                                      style={{
                                        padding: '0.15rem 0.5rem',
                                        borderRadius: '4px',
                                        fontSize: '0.78rem',
                                        background: isCorrect ? 'rgba(46, 125, 50, 0.25)' : 'rgba(255,255,255,0.04)',
                                        border: isCorrect ? '1px solid rgba(129, 199, 132, 0.45)' : '1px solid rgba(255,255,255,0.06)',
                                        color: isCorrect ? '#a5d6a7' : 'var(--neutral-300)',
                                        fontWeight: isCorrect ? 600 : 400,
                                      }}
                                    >
                                      {String.fromCharCode(65 + optIdx)}. {opt} {isCorrect && '✓'}
                                    </span>
                                  );
                                })}
                              </div>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </GlassCard>
          ))
        )}
      </div>
    </div>
  );

  const scopedSections = handledYearLevel
    ? sections.filter((s) => getYearLevelFromBlock(s.label) === handledYearLevel)
    : sections;
  const scopedBlocks = handledYearLevel
    ? ALL_BLOCKS.filter((blk) => getYearLevelFromBlock(blk) === handledYearLevel)
    : ALL_BLOCKS;

  const renderStudents = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          STUDENT ROSTER
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', margin: 0 }}>
            Students
          </h1>
          {handledYearLevel && <Badge variant="warning">Handled: {handledYearLevel}</Badge>}
        </div>
        <p style={{ color: 'var(--neutral-300)' }}>
          {handledYearLevel
            ? `Directory of ${handledYearLevel} student learners assigned to your teaching load.`
            : 'Directory of student learners enrolled across college blocks (1st Year – 4th Year).'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <Input 
            placeholder="Search by student name, ID, or block..."
            value={studentSearch}
            onChange={e => setStudentSearch(e.target.value)}
          />
        </div>
        <div style={{ width: '210px' }}>
          <Select 
            value={blockFilter} 
            onChange={setBlockFilter}
            options={handledYearLevel
              ? [
                  { value: '', label: `All ${handledYearLevel} Blocks` },
                  ...scopedBlocks.map((blk) => ({ value: blk, label: blk })),
                ]
              : [
                  { value: '', label: 'All Blocks' },
                  { value: '1st Year', label: 'All 1st Year (1A–1E)' },
                  { value: '2nd Year', label: 'All 2nd Year (2A–2E)' },
                  { value: '3rd Year', label: 'All 3rd Year (3A–3E)' },
                  { value: '4th Year', label: 'All 4th Year (4A–4E)' },
                  ...ALL_BLOCKS.map((blk) => ({ value: blk, label: blk })),
                ]}
          />
        </div>
      </div>

      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'white', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid var(--glass-border)' }}>
              <th style={{ padding: '0.85rem 1.25rem' }}>Student Name</th>
              <th style={{ padding: '0.85rem 1.25rem' }}>ID</th>
              <th style={{ padding: '0.85rem 1.25rem' }}>Block</th>
              <th style={{ padding: '0.85rem 1.25rem' }}>Email</th>
              <th style={{ padding: '0.85rem 1.25rem' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--neutral-400)' }}>
                  No students found matching your criteria.
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
                      ({getYearLevelFromBlock(student.section)})
                    </span>
                  </td>
                  <td style={{ padding: '0.85rem 1.25rem', color: 'var(--neutral-300)' }}>{student.email}</td>
                  <td style={{ padding: '0.85rem 1.25rem' }}>
                    <Badge variant={student.status === 'inactive' ? 'warning' : 'success'}>
                      {student.status || 'Active'}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );

  const renderAnalytics = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          DATA INSIGHTS
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Class Analytics
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Detailed performance metrics across quizzes and assessment attempts.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        <StatCard label="Total Quizzes" value={quizzes.length} icon={<BookOpen size={24} />} detail="Created quizzes" />
        <StatCard label="Active Submissions" value={metrics.submissions} icon={<Users size={24} />} detail="Total attempts" />
        <StatCard label="Overall Average" value={`${metrics.average}%`} icon={<Target size={24} />} detail="Class composite" />
      </div>

      <GlassCard>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'white', marginBottom: '1rem' }}>Quiz Performance Breakdown</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {quizzes.map(q => (
            <div key={q.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem', color: 'white' }}>
                <span><strong>{q.title}</strong> ({q.subject})</span>
                <span style={{ fontWeight: 600 }}>{q.average || 0}% ({q.attempts_count || 0} submissions)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                <div style={{ width: `${q.average || 0}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary-500), var(--success))' }} />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );

  const handleDraftRemedialQuiz = async (draft: TeacherRemedialDraft) => {
    setDraftingRemedial(true);
    setError(null);
    try {
      const data = await lmsFetch<{ quiz: Quiz }>('/teacher/quizzes', {
        method: 'POST',
        body: JSON.stringify({
          title: draft.topic,
          subject: draft.subject,
          topic: draft.topic,
          count: draft.count || 5,
          time_limit_minutes: 15,
          quiz_type: 'formative',
          allow_review: true,
          generate_with_ai: true,
          difficulty: draft.difficulty || 'medium',
          target_type: draft.target_section ? 'section' : 'all',
          target_sections: draft.target_section ? [draft.target_section] : null,
        }),
      });
      setQuizzes((current) => [data.quiz, ...current.filter((q) => q.id !== data.quiz.id)]);
      setEditingQuiz(data.quiz);
      setNotice(`AI Remedial Quiz draft "${data.quiz.title}" created from teaching insights. Review and publish when ready.`);
      showToast(`Drafted remedial quiz "${data.quiz.title}"!`, 'success');
      void loadDashboard();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to draft AI remedial quiz.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setDraftingRemedial(false);
    }
  };

  const renderInsights = () => (
    <TeacherAiInsightsPanel
      handledYearLevel={handledYearLevel}
      draftingRemedial={draftingRemedial}
      onDraftRemedialQuiz={handleDraftRemedialQuiz}
    />
  );

  const renderSettings = () => (
    <div style={{ maxWidth: '650px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          ACCOUNT DETAILS
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Teacher Profile
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Faculty credentials and assigned teaching department at Tagoloan Community College.
        </p>
      </div>

      <GlassCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-500), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800, color: 'white' }}>
            {user?.initials || 'T'}
          </div>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'white' }}>{user?.name || 'TCC Faculty'}</h2>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <Badge variant="primary">Faculty Teacher</Badge>
              <Badge variant="success">Active</Badge>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Email Address</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              {user?.email || 'teacher@tcc.edu.ph'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Department</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              College of Information Technology (BSIT)
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Assigned Year Level &amp; Blocks</div>
            <div style={{ color: handledYearLevel ? '#fde68a' : 'white', fontWeight: 700, marginTop: '0.2rem' }}>
              {handledYearLevel ? `${handledYearLevel} (${scopedBlocks.join(', ') || 'Assigned Blocks'})` : '1st Year – 4th Year (All Blocks)'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Academic Department</div>
            <div style={{ color: '#fbbf24', fontWeight: 700, marginTop: '0.2rem' }}>
              {user?.department ? `${user.department} Department` : 'College of Information Technology (CIT)'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>School Year</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              2026–2027
            </div>
          </div>
        </div>
      </GlassCard>

      <ProfileUpdateCard />
    </div>
  );

  const handleSectionChange = (sectionId: string) => {
    setActiveSection(sectionId);
    const path = sectionId === 'overview' ? '/teacher/dashboard' : `/teacher/${sectionId}`;
    navigate(path, { replace: true });
  };

  return (
    <DashboardLayout role="teacher">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', minWidth: 0 }}>
        {activeSection === 'overview' && renderOverview()}
        {activeSection === 'quizzes' && renderQuizzes()}
        {activeSection === 'students' && renderStudents()}
        {activeSection === 'analytics' && renderAnalytics()}
        {activeSection === 'insights' && renderInsights()}
        {activeSection === 'settings' && renderSettings()}
      </div>

      <QuizEditorModal
        quiz={editingQuiz}
        isOpen={Boolean(editingQuiz)}
        busy={busy}
        subjects={subjects}
        handledYearLevel={handledYearLevel}
        onClose={() => setEditingQuiz(null)}
        onSave={handleSaveQuiz}
      />

      <PublishQuizModal
        quiz={publishingQuiz}
        isOpen={Boolean(publishingQuiz)}
        students={students}
        sections={scopedSections}
        handledYearLevel={handledYearLevel}
        busy={busy}
        onClose={() => setPublishingQuiz(null)}
        onPublish={handlePublishQuiz}
      />

      <QuizSubmissionsModal
        quiz={submissionsQuiz}
        isOpen={Boolean(submissionsQuiz)}
        onClose={() => setSubmissionsQuiz(null)}
      />

      <Modal
        isOpen={Boolean(quizToDelete)}
        onClose={() => !deletingQuiz && setQuizToDelete(null)}
        title="Delete Quiz"
        maxWidth="480px"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setQuizToDelete(null)}
              disabled={deletingQuiz}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="error"
              onClick={handleConfirmDeleteQuiz}
              isLoading={deletingQuiz}
              disabled={deletingQuiz}
            >
              Delete Quiz
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.92rem', lineHeight: 1.55 }}>
          Are you sure you want to permanently delete{' '}
          <strong style={{ color: '#f8fafc' }}>{quizToDelete?.title}</strong> (
          {formatCourseLabel(quizToDelete?.subject)})? This action will remove the quiz and any associated student attempts.
        </p>
      </Modal>
    </DashboardLayout>
  );
}
