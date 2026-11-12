import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { lmsFetch, getLmsUser, extractCollection } from '../../lmsApi';
import type { Quiz, User, Subject, TeacherRemedialDraft } from '../../lib/types';
import { BSIT_SUBJECT_OPTIONS, ALL_BLOCKS, getYearLevelFromBlock, buildSubjectOptionsForYear } from '../../lib/constants';
import { readPdfFile, type ParsedPdfPayload } from '../../lib/pdfUtils';
import { 
  BookOpen, CheckCircle2, Users, Target, Sparkles, 
  ArrowRight, AlertCircle, Eye, EyeOff, Pencil,
  ShieldAlert, FileText, Upload, X
} from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
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
  const [topic, setTopic] = useState('');
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
        setSubject(yearOptions[0].value);
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
        setSubject(first.code ? `${first.code} - ${first.name}` : first.name);
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
      if (!topic.trim() && !quizTitle.trim()) {
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
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const fallbackSubject = resolveDefaultSubjectForYear(handledYearLevel);
      const finalSubject = (subject && subject.trim()) || (subjects[0]?.name) || fallbackSubject;
      const fallbackPdfTopic = uploadedPdf ? uploadedPdf.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() : '';
      const cleanTopic = topic.trim() || quizTitle.trim() || fallbackPdfTopic || 'Course Unit';
      const cleanTitle = quizTitle.trim() || cleanTopic;
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
      const msg = `Quiz draft "${data.quiz.title}" created ${sourceNote}. Review and customize in the editor.`;
      setNotice(msg);
      showToast(`Quiz draft "${data.quiz.title}" created!`, 'success');
      setQuizTitle('');
      setTopic('');
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
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--glass-border)',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <Badge variant="primary">{quiz.subject}</Badge>
                    {hasDistinctTopic(quiz) && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--neutral-400)' }}>{quiz.topic}</span>
                    )}
                    {quiz.generated_by_ai && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent-purple-light)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <Sparkles size={12} /> AI Generated
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, color: 'white', fontSize: '1.05rem' }}>{quiz.title}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--neutral-300)' }}>
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
                      variant={quiz.is_published ? 'outline' : 'primary'} 
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
                      <ShieldAlert size={14} /> Proctoring ({quiz.attempts_count || 0})
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

  const renderQuizzes = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          CURRICULUM & ASSESSMENTS
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Quizzes & Assessment Builder
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Author custom assessments for BSIT courses, configure questions & answer keys, set point weights, and publish to blocks.
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

      {/* Manual Quiz Builder Form */}
      <GlassCard style={{ borderLeft: '4px solid var(--primary-400)', position: 'relative', zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ background: 'var(--primary-600)', padding: '0.5rem', borderRadius: 'var(--radius-md)', color: 'white' }}>
            <Pencil size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>Create New Quiz</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--neutral-300)' }}>Select a BSIT course, enter a topic, and open the Question Builder to author your questions and answer keys manually.</p>
          </div>
        </div>

        <form onSubmit={handleCreateManualQuiz} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Row 1: Quiz Title, BSIT Subject, and Topic */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
            <Input
              label="Quiz Title (Optional · uses Topic if blank)"
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              placeholder="e.g. Midterm Quiz 1 (No extra title added)"
            />

            <Select
              label={
                handledYearLevel
                  ? `Course Code & Subject Description (${handledYearLevel})`
                  : 'Course Code & Subject Description (1st – 4th Year • Excl. Practicum)'
              }
              value={subject}
              onChange={setSubject}
              options={buildSubjectOptionsForYear(handledYearLevel, subjects)}
            />

            <Input
              label="Topic / Unit"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Data Structures, OOP Principles, Relational Databases"
              required={!quizTitle.trim() && !uploadedPdf}
            />
          </div>

          {/* Row 2: Custom Question Count, Time Limit, Quiz Type & Block Targeting */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <Input
                label="Number of Questions (1–50)"
                type="number"
                min={1}
                max={50}
                value={String(count)}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  if (Number.isNaN(parsed)) {
                    setCount(1);
                  } else {
                    setCount(Math.max(1, Math.min(50, parsed)));
                  }
                }}
                required
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', marginRight: '0.15rem' }}>Quick set:</span>
                {[1, 3, 5, 10, 15, 20, 30].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCount(preset)}
                    style={{
                      padding: '0.18rem 0.55rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '999px',
                      cursor: 'pointer',
                      border: count === preset ? '1px solid var(--primary-400)' : '1px solid rgba(255,255,255,0.12)',
                      background: count === preset ? 'rgba(63, 81, 181, 0.3)' : 'rgba(255,255,255,0.04)',
                      color: count === preset ? 'white' : 'var(--neutral-300)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <Input
                label="Time Limit (Minutes · Auto-Submit)"
                type="number"
                min={1}
                max={300}
                value={String(timeLimitMinutes)}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  if (Number.isNaN(parsed)) {
                    setTimeLimitMinutes(15);
                  } else {
                    setTimeLimitMinutes(Math.max(1, Math.min(300, parsed)));
                  }
                }}
                required
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', marginRight: '0.15rem' }}>Presets:</span>
                {[5, 10, 15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setTimeLimitMinutes(mins)}
                    style={{
                      padding: '0.18rem 0.55rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '999px',
                      cursor: 'pointer',
                      border: timeLimitMinutes === mins ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.12)',
                      background: timeLimitMinutes === mins ? 'rgba(251, 191, 36, 0.22)' : 'rgba(255,255,255,0.04)',
                      color: timeLimitMinutes === mins ? '#fbbf24' : 'var(--neutral-300)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            <Select
              label="Quiz Type (Formative / Summative)"
              value={quizType}
              onChange={(val) => setQuizType(val === 'summative' ? 'summative' : 'formative')}
              options={[
                { value: 'formative', label: 'Formative · Live Student Monitoring' },
                { value: 'summative', label: 'Summative · Final Submission Only' },
              ]}
            />

            <Select
              label="Target Block (Optional)"
              value={selectedTargetSection}
              onChange={setSelectedTargetSection}
              options={[
                { value: '', label: handledYearLevel ? `No block · ${handledYearLevel} (assign later)` : 'No block · assign later' },
                ...scopedSections.map((s) => ({
                  value: String(s.id),
                  label: `${s.label}${s.studentCount ? ` (${s.studentCount} ${s.studentCount === 1 ? 'student' : 'students'})` : ''}`
                })),
              ]}
            />
          </div>

          {/* Row 2.2: Allow Answer Review Checkbox */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.85rem',
              padding: '0.75rem 1.1rem',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              background: allowReview ? 'rgba(67, 160, 71, 0.1)' : 'rgba(255, 255, 255, 0.03)',
              border: allowReview ? '1px solid rgba(67, 160, 71, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
              <input
                type="checkbox"
                checked={allowReview}
                onChange={(e) => setAllowReview(e.target.checked)}
                style={{ width: '17px', height: '17px', accentColor: 'var(--success)', cursor: 'pointer', flexShrink: 0 }}
              />
              <div>
                <div style={{ fontWeight: 700, color: 'white', fontSize: '0.9rem' }}>
                  Allow Answer Review for Completed Quizzes
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--neutral-300)' }}>
                  When checked, students will be able to review the quiz questions along with their selected answers and the correct answer key after submitting.
                </div>
              </div>
            </div>
            <Badge variant={allowReview ? 'success' : 'warning'}>
              {allowReview ? 'Answer Review Enabled' : 'Review Disabled'}
            </Badge>
          </label>

          {/* Row 2.5: PDF Upload for Quiz Instructions, AI Question Generation & Post-Quiz Study Feedback */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              padding: '1rem 1.15rem',
              borderRadius: 'var(--radius-md)',
              background: uploadedPdf ? 'rgba(67, 160, 71, 0.1)' : 'rgba(245, 158, 11, 0.06)',
              border: uploadedPdf ? '1px solid rgba(67, 160, 71, 0.35)' : '1px solid rgba(245, 158, 11, 0.22)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flex: '1 1 300px', minWidth: 0 }}>
              <div style={{ background: uploadedPdf ? 'rgba(67, 160, 71, 0.25)' : 'rgba(245, 158, 11, 0.2)', color: uploadedPdf ? '#a5d6a7' : '#fbbf24', padding: '0.55rem', borderRadius: 'var(--radius-md)', flexShrink: 0 }}>
                <FileText size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'white', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span>PDF Upload for Instructions & AI Question Generation (Optional)</span>
                  {uploadedPdf && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', background: 'rgba(67, 160, 71, 0.25)', color: '#c8e6c9', border: '1px solid rgba(67, 160, 71, 0.45)', padding: '0.15rem 0.55rem', borderRadius: '999px' }}>
                      <FileText size={12} /> {uploadedPdf.name}
                      <button
                        type="button"
                        onClick={() => setUploadedPdf(null)}
                        title="Remove uploaded PDF"
                        style={{ background: 'transparent', border: 'none', color: '#ffcdd2', cursor: 'pointer', padding: 0, display: 'inline-flex' }}
                      >
                        <X size={13} />
                      </button>
                    </span>
                  )}
                </div>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--neutral-300)', lineHeight: 1.45 }}>
                  {uploadedPdf
                    ? `AI will read "${uploadedPdf.name}" to generate ${count} questions and provide study feedback after quiz submission.`
                    : 'Upload a PDF handout so AI generates questions and study feedback from the PDF, or leave empty to base AI questions on the Topic / Unit.'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input
                ref={createPdfInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handlePdfUploadChange}
                style={{ display: 'none' }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => createPdfInputRef.current?.click()}
                style={{ gap: '0.4rem' }}
              >
                <Upload size={14} /> {uploadedPdf ? 'Change PDF' : 'Upload PDF (.pdf)'}
              </Button>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.83rem', color: 'white', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.12)' }}>
                <input
                  type="checkbox"
                  checked={generateWithAi}
                  onChange={(e) => setGenerateWithAi(e.target.checked)}
                  style={{ accentColor: 'var(--accent-gold, #f59e0b)', width: '15px', height: '15px' }}
                />
                <Sparkles size={14} style={{ color: '#fbbf24' }} />
                <span>{uploadedPdf ? 'AI Generate from PDF' : 'AI Generate from Topic'}</span>
              </label>

              {generateWithAi && (
                <select
                  aria-label="AI Difficulty"
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value as 'easy' | 'medium' | 'challenging')}
                  className="form-select"
                  style={{ width: 'auto', height: '35px', padding: '0 2rem 0 0.75rem', fontSize: '0.8rem' }}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="challenging">Challenging</option>
                </select>
              )}
            </div>
          </div>

          {/* Row 3: Action Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--neutral-400)', fontSize: '0.85rem' }}>
              <BookOpen size={16} style={{ color: 'var(--primary-300)', flexShrink: 0 }} />
              <span>
                {generateWithAi
                  ? uploadedPdf
                    ? `AI will generate ${count} questions from "${uploadedPdf.name}" and open the editor for review.`
                    : `AI will generate ${count} questions from your Topic / Unit and open the editor for review.`
                  : 'Opens the interactive Question Editor where you can type questions, set points per item, and mark correct answers.'}
              </span>
            </div>

            <Button
              variant="accent"
              type="submit"
              disabled={busy || !subject}
              style={{ padding: '0.75rem 1.75rem', whiteSpace: 'nowrap' }}
            >
              {generateWithAi ? <Sparkles size={16} /> : <Pencil size={16} />}
              {busy
                ? generateWithAi
                  ? 'Generating AI Quiz...'
                  : 'Creating Quiz...'
                : generateWithAi
                  ? uploadedPdf
                    ? `Generate ${count} Questions from PDF`
                    : `Generate ${count} Questions with AI`
                  : 'Create Quiz & Add Questions'}
            </Button>
          </div>
        </form>
      </GlassCard>

      {/* Quizzes List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', zIndex: 1 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'white' }}>Your Created Quizzes ({quizzes.length})</h2>

        {quizzes.map(quiz => (
          <GlassCard key={quiz.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                  <Badge variant="primary">{quiz.subject}</Badge>
                  {hasDistinctTopic(quiz) && (
                    <span style={{ fontSize: '0.85rem', color: 'var(--neutral-300)' }}>Topic: {quiz.topic}</span>
                  )}
                  {quiz.reference_pdf_name && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.14)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                      <FileText size={12} /> {quiz.reference_pdf_name}
                    </span>
                  )}
                  {quiz.generated_by_ai && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#c4b5fd', background: 'rgba(124, 58, 237, 0.18)', border: '1px solid rgba(167, 139, 250, 0.3)', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                      <Sparkles size={12} /> AI Generated
                    </span>
                  )}
                  <Badge variant={quiz.is_published ? 'success' : 'warning'}>
                    {quiz.is_published ? 'Published' : 'Draft'}
                  </Badge>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      color: quiz.quiz_type === 'summative' ? '#fbbf24' : '#a5d6a7',
                      background: quiz.quiz_type === 'summative' ? 'rgba(245, 158, 11, 0.14)' : 'rgba(67, 160, 71, 0.16)',
                      border: quiz.quiz_type === 'summative' ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(67, 160, 71, 0.35)',
                      padding: '0.15rem 0.55rem',
                      borderRadius: '999px',
                    }}
                  >
                    {quiz.quiz_type === 'summative' ? 'Summative Exam' : 'Formative • Live View'}
                  </span>
                  {quiz.allow_review && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.74rem',
                        color: '#93c5fd',
                        background: 'rgba(59, 130, 246, 0.14)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        padding: '0.15rem 0.55rem',
                        borderRadius: '999px',
                      }}
                    >
                      <CheckCircle2 size={12} /> Answer Review Allowed
                    </span>
                  )}
                </div>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'white' }}>{quiz.title}</h3>
                <p style={{ color: 'var(--neutral-300)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                  {quiz.question_count} Questions • {quiz.time_limit_minutes || 15} Mins{quiz.question_count >= 3 && quiz.shuffle_questions ? ' • Shuffled' : ''} • {quiz.attempts_count || 0} Submissions • {quiz.average || 0}% Class Average
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setEditingQuiz(quiz)}
                >
                  <Pencil size={14} /> Edit Questions
                </Button>
                <Button 
                  variant={quiz.is_published ? 'outline' : 'primary'}
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
                  {quiz.is_published ? 'Unpublish' : 'Publish / Assign'}
                </Button>
                {quiz.is_published && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPublishingQuiz(quiz)}
                    title="Change target audience (all, block, individual)"
                  >
                    <Target size={14} /> Target: {quizAudienceLabel(quiz) || 'All'}
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSubmissionsQuiz(quiz)}
                >
                  <ShieldAlert size={14} />{' '}
                  {quiz.quiz_type === 'summative'
                    ? `Submissions & Proctoring (${quiz.attempts_count || 0})`
                    : `Live Monitor & Submissions (${quiz.attempts_count || 0})`}
                </Button>
              </div>
            </div>

            {/* Questions preview */}
            {quiz.questions && quiz.questions.length > 0 && (
              <details style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <summary style={{ color: 'var(--primary-300)', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                  Preview Questions & Answer Key ({quiz.questions.length})
                </summary>
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {quiz.questions.map((q, idx) => (
                    <div key={idx} style={{ fontSize: '0.875rem', color: 'var(--neutral-200)' }}>
                      <strong>{idx + 1}. {q.prompt}</strong>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                        {q.options.map((opt, optIdx) => (
                          <span 
                            key={optIdx} 
                            style={{ 
                              padding: '0.2rem 0.5rem', 
                              borderRadius: '4px',
                              background: optIdx === q.correct_index ? 'rgba(67, 160, 71, 0.3)' : 'rgba(255,255,255,0.05)',
                              border: optIdx === q.correct_index ? '1px solid var(--success)' : '1px solid transparent',
                              color: optIdx === q.correct_index ? '#a5d6a7' : 'var(--neutral-300)',
                              fontWeight: optIdx === q.correct_index ? 600 : 400
                            }}
                          >
                            {String.fromCharCode(65 + optIdx)}. {opt} {optIdx === q.correct_index && '✓'}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </GlassCard>
        ))}
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
    </DashboardLayout>
  );
}
