import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { lmsFetch, getLmsUser, extractCollection } from '../../lmsApi';
import type { Quiz, User, Subject } from '../../lib/types';
import { 
  BookOpen, CheckCircle2, Users, Target, Sparkles, 
  ArrowRight, AlertCircle, Eye, EyeOff, Pencil,
  ShieldAlert
} from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import QuizEditorModal, { type QuizEditorValues } from './QuizEditorModal';
import PublishQuizModal, { type PublishAudience, type SectionOption } from './PublishQuizModal';
import QuizSubmissionsModal from './QuizSubmissionsModal';

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

function rosterSections(students: User[]): SectionOption[] {
  if (!Array.isArray(students)) return [];
  const groups = new Map<string, SectionOption>();
  students.forEach((student) => {
    const label = [student.grade, student.section].filter(Boolean).join(' · ');
    if (!label) return;
    const current = groups.get(label);
    groups.set(label, current ? { ...current, studentCount: (current.studentCount || 0) + 1 } : { id: label, label, studentCount: 1 });
  });
  return Array.from(groups.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function toSectionOptions(records: SectionApiRecord[]): SectionOption[] {
  return records.map((record) => {
    const label = record.label || record.name || [record.grade, record.section].filter(Boolean).join(' · ') || 'Unnamed section';
    return {
      id: record.id ?? label,
      label,
      studentCount: record.student_count ?? record.students_count,
    };
  });
}

function quizAudienceLabel(quiz: Quiz): string | null {
  if (quiz.audience?.label) return quiz.audience.label;
  const type = quiz.audience?.type || quiz.audience_type;
  if (type === 'all') return 'All students';
  if (type === 'section') return 'Selected sections';
  if (type === 'individual') return 'Selected students';
  return null;
}

export default function TeacherDashboard() {
  const user = getLmsUser();
  const { subpage } = useParams<{ subpage?: string }>();
  const navigate = useNavigate();
  const initialSection = subpage === 'dashboard' ? 'overview' : (subpage || 'overview');
  const [activeSection, setActiveSection] = useState(initialSection);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [metrics, setMetrics] = useState<TeacherMetrics>({ quizzes: 0, published: 0, submissions: 0, average: 0 });
  const [students, setStudents] = useState<User[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [publishingQuiz, setPublishingQuiz] = useState<Quiz | null>(null);
  const [submissionsQuiz, setSubmissionsQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // AI Quiz Builder form
  const [subject, setSubject] = useState('Science');
  const [topic, setTopic] = useState('Ecosystems');
  const [difficulty, setDifficulty] = useState('medium');
  const [count, setCount] = useState(5);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedTargetSection, setSelectedTargetSection] = useState('');

  // Student filter
  const [studentSearch, setStudentSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await lmsFetch<{ metrics: TeacherMetrics; quizzes: Quiz[] }>('/teacher/dashboard');
      setMetrics(data.metrics || { quizzes: 0, published: 0, submissions: 0, average: 0 });
      setQuizzes(data.quizzes || []);
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
      setStudents(Array.isArray(roster) ? roster : []);
      setSections((current) => current.length > 0 ? current : rosterSections(roster));
    } catch {
      setStudents([]);
    }
  };

  const loadSubjects = async () => {
    try {
      const data = await lmsFetch<unknown>('/subjects');
      const list = collectionFromResponse<Subject>(data);
      setSubjects(Array.isArray(list) ? list : []);
      if (Array.isArray(list) && list.length > 0 && !subject) setSubject(list[0].name);
    } catch {
      // Subjects are optional
    }
  };

  const loadSections = async () => {
    try {
      const data = await lmsFetch<unknown>('/sections');
      const availableSections = toSectionOptions(collectionFromResponse<SectionApiRecord>(data));
      if (availableSections.length > 0) setSections(availableSections);
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

  const handleGenerateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const finalSubject = (subject && subject.trim()) || (subjects[0]?.name) || 'Science';
      const data = await lmsFetch<{ quiz: Quiz; generation_source: string }>('/teacher/quizzes/generate', {
        method: 'POST',
        body: JSON.stringify({
          subject: finalSubject,
          topic: topic.trim(),
          count,
          difficulty,
          target_type: selectedTargetSection ? 'section' : 'all',
          target_sections: selectedTargetSection ? [selectedTargetSection] : null,
        }),
      });
      setNotice(
        data.generation_source === 'gemini'
          ? `AI draft created: "${data.quiz.title}". Review and edit it before choosing its audience.`
          : `Practice quiz draft created: "${data.quiz.title}". Review and edit it before choosing its audience.`
      );
      setQuizzes((current) => [data.quiz, ...current.filter((quiz) => quiz.id !== data.quiz.id)]);
      setEditingQuiz(data.quiz);
      void loadDashboard();
      setActiveSection('quizzes');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate quiz');
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePublish = async (quiz: Quiz) => {
    if (!quiz.is_published) {
      setPublishingQuiz(quiz);
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
      setNotice(`"${quiz.title}" is unpublished and no longer available to students.`);
      void loadDashboard();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update quiz status');
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
          allow_review: draft.allow_review,
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
      setNotice(`"${draft.title}" was saved. Choose Publish when you are ready to assign it.`);
      void loadDashboard();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save quiz changes');
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
          allow_review: Boolean(publishingQuiz.allow_review),
          target_type: audience.type,
          audience_type: audience.type,
          target_sections: audience.section_ids,
          section_ids: audience.section_ids,
          target_student_ids: audience.student_ids,
          student_ids: audience.student_ids,
        }),
      });
      const fallback: Quiz = {
        ...publishingQuiz,
        is_published: true,
        audience_type: audience.type,
        audience: { type: audience.type },
      };
      const updated = extractQuiz(response || fallback);
      setQuizzes((current) => current.map((quiz) => quiz.id === publishingQuiz.id ? updated : quiz));
      setPublishingQuiz(null);
      setNotice(`"${publishingQuiz.title}" is published to ${audience.type === 'all' ? 'all students' : audience.type === 'section' ? 'the selected sections' : 'the selected students'}.`);
      void loadDashboard();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not publish this quiz');
    } finally {
      setBusy(false);
    }
  };

  const safeStudents = Array.isArray(students) ? students : [];
  const filteredStudents = safeStudents.filter(s => {
    const matchesSearch = !studentSearch || 
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) || 
      (s.lrn && s.lrn.includes(studentSearch));
    const matchesGrade = !gradeFilter || s.grade === gradeFilter;
    return matchesSearch && matchesGrade;
  });

  const renderOverview = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
            TEACHER DASHBOARD
          </span>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
            Welcome, {user?.name || 'Teacher'}!
          </h1>
          <p style={{ color: 'var(--neutral-300)', marginTop: '0.25rem' }}>
            Create AI assessments, oversee class submissions, and analyze learner mastery.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="accent" onClick={() => setActiveSection('quizzes')}>
            <Sparkles size={16} /> Create AI Quiz
          </Button>
          <Button variant="outline" onClick={() => setActiveSection('students')}>
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
          <Button variant="outline" size="sm" onClick={() => setActiveSection('quizzes')}>
            Manage All <ArrowRight size={14} />
          </Button>
        </div>

        {quizzes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--neutral-300)' }}>
            No quizzes generated yet. Use the AI builder to create your first quiz!
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
                    <span style={{ fontSize: '0.8rem', color: 'var(--neutral-400)' }}>{quiz.topic}</span>
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
          Quizzes & AI Generator
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Generate standard-aligned questions with AI, inspect questions & answer keys, and publish.
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

      {/* AI Quiz Builder Form */}
      <GlassCard style={{ borderLeft: '4px solid var(--accent-purple-light)', position: 'relative', zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ background: 'var(--accent-purple)', padding: '0.5rem', borderRadius: 'var(--radius-md)', color: 'white' }}>
            <Sparkles size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>AI Quiz Generator</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--neutral-300)' }}>Generate high-quality multiple choice quizzes automatically using Gemini AI.</p>
          </div>
        </div>

        <form onSubmit={handleGenerateQuiz} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Row 1: Primary Scope (Subject and Topic) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <Select
              label="Curriculum Subject"
              value={subject}
              onChange={setSubject}
              options={subjects.length > 0
                ? subjects.map((s) => ({ value: s.name, label: `${s.name}${s.code ? ` (${s.code})` : ''}` }))
                : [
                  { value: 'Science', label: 'Science (SCI)' },
                  { value: 'Mathematics', label: 'Mathematics (MATH)' },
                  { value: 'English', label: 'English (ENG)' },
                  { value: 'Filipino', label: 'Filipino (FIL)' },
                  { value: 'Araling Panlipunan', label: 'Araling Panlipunan (AP)' },
                  { value: 'MAPEH', label: 'MAPEH (MAPEH)' },
                  { value: 'TLE / TVL', label: 'TLE / TVL (TLE)' },
                  { value: 'Edukasyon sa Pagpapakatao', label: 'Edukasyon sa Pagpapakatao (ESP)' },
                ]
              }
            />

            <Input
              label="Topic / Unit"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Cellular Respiration, Newton's Laws"
              required
            />
          </div>

          {/* Row 2: Assessment Parameters & Targeting */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
            <Select 
              label="Difficulty Level"
              value={difficulty} 
              onChange={setDifficulty}
              options={[
                { value: 'easy', label: 'Easy (Foundational)' },
                { value: 'medium', label: 'Medium (Standard)' },
                { value: 'challenging', label: 'Challenging (Advanced)' },
              ]}
            />

            <Select 
              label="Questions Count"
              value={String(count)} 
              onChange={(val) => setCount(Number(val))}
              options={[
                { value: '3', label: '3 Questions (Quick Check)' },
                { value: '5', label: '5 Questions (Standard)' },
                { value: '10', label: '10 Questions (Unit Quiz)' },
              ]}
            />

            <Select
              label="Target Section (Optional)"
              value={selectedTargetSection}
              onChange={setSelectedTargetSection}
              options={[
                { value: '', label: 'No section — assign later' },
                ...sections.map((s) => ({
                  value: String(s.id),
                  label: `${s.label}${s.studentCount ? ` (${s.studentCount} ${s.studentCount === 1 ? 'student' : 'students'})` : ''}`
                })),
              ]}
            />
          </div>

          {/* Row 3: Action Bar & Generation Indicator */}
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
              <Sparkles size={16} style={{ color: 'var(--accent-purple-light)', flexShrink: 0 }} />
              <span>AI automatically drafts 4-option multiple-choice items with complete answer keys & skill rationales.</span>
            </div>

            <Button
              variant="accent"
              type="submit"
              disabled={busy || !subject}
              style={{ padding: '0.75rem 1.75rem', whiteSpace: 'nowrap' }}
            >
              <Sparkles size={16} /> {busy ? 'Generating Quiz Draft...' : 'Generate Quiz Draft'}
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
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <Badge variant="primary">{quiz.subject}</Badge>
                  <span style={{ fontSize: '0.85rem', color: 'var(--neutral-300)' }}>Topic: {quiz.topic}</span>
                  <Badge variant={quiz.is_published ? 'success' : 'warning'}>
                    {quiz.is_published ? 'Published' : 'Draft'}
                  </Badge>
                </div>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'white' }}>{quiz.title}</h3>
                <p style={{ color: 'var(--neutral-300)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                  {quiz.question_count} Questions • {quiz.attempts_count || 0} Submissions • {quiz.average || 0}% Class Average
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
                    title="Change target audience (all, section, individual)"
                  >
                    <Target size={14} /> Target: {quizAudienceLabel(quiz) || 'All'}
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSubmissionsQuiz(quiz)}
                >
                  <ShieldAlert size={14} /> Submissions & Proctoring ({quiz.attempts_count || 0})
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

  const renderStudents = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          STUDENT ROSTER
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Enrolled Learners
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Directory of student learners enrolled under your grade levels and sections.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <Input 
            placeholder="Search by student name or LRN..."
            value={studentSearch}
            onChange={e => setStudentSearch(e.target.value)}
          />
        </div>
        <div style={{ width: '180px' }}>
          <Select 
            value={gradeFilter} 
            onChange={setGradeFilter}
            options={[
              { value: '', label: 'All Grades' },
              { value: 'Grade 7', label: 'Grade 7' },
              { value: 'Grade 8', label: 'Grade 8' },
              { value: 'Grade 9', label: 'Grade 9' },
              { value: 'Grade 10', label: 'Grade 10' },
              { value: 'Grade 11', label: 'Grade 11' },
              { value: 'Grade 12', label: 'Grade 12' },
            ]}
          />
        </div>
      </div>

      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'white', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid var(--glass-border)' }}>
              <th style={{ padding: '0.85rem 1.25rem' }}>Student Name</th>
              <th style={{ padding: '0.85rem 1.25rem' }}>LRN</th>
              <th style={{ padding: '0.85rem 1.25rem' }}>Grade & Section</th>
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
                  <td style={{ padding: '0.85rem 1.25rem', fontFamily: 'monospace' }}>{student.lrn || '—'}</td>
                  <td style={{ padding: '0.85rem 1.25rem' }}>{student.grade || 'Grade 10'} {student.section ? `• ${student.section}` : ''}</td>
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

  const renderInsights = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--accent-purple-light)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          INTELLIGENT FEEDBACK
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          AI Teaching Insights
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Automated analysis of missed competencies and recommended remediation topics.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        <GlassCard style={{ borderLeft: '4px solid var(--accent-purple-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Sparkles size={20} style={{ color: 'var(--accent-purple-light)' }} />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white' }}>Skill Mastery Observation</h3>
          </div>
          <p style={{ color: 'var(--neutral-200)', lineHeight: 1.6, fontSize: '0.9rem' }}>
            Students performed best on foundational recall questions in Ecosystems structure, with an 85% accuracy rate. However, food chain trophic level calculations scored lower at 62%.
          </p>
        </GlassCard>

        <GlassCard style={{ borderLeft: '4px solid var(--primary-400)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Target size={20} style={{ color: 'var(--primary-400)' }} />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white' }}>Suggested Remediation</h3>
          </div>
          <p style={{ color: 'var(--neutral-200)', lineHeight: 1.6, fontSize: '0.9rem' }}>
            Consider conducting a 10-minute review session focusing on energy pyramid transitions and predator-prey dynamics before launching the next unit test.
          </p>
        </GlassCard>
      </div>
    </div>
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
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'white' }}>{user?.name || 'Teacher Demo'}</h2>
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
              {user?.email || 'teacher.demo@lnhs.test'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Department</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              Science & Technology Department
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Assigned Levels</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              Grade 10 Science
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>School Year</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              2025–2026
            </div>
          </div>
        </div>
      </GlassCard>
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
        {/* Navigation Tabs Bar */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', overflowX: 'auto' }}>
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'quizzes', label: 'Quizzes' },
            { id: 'students', label: 'Students' },
            { id: 'analytics', label: 'Analytics' },
            { id: 'insights', label: 'AI Insights' },
            { id: 'settings', label: 'Settings' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => handleSectionChange(tab.id)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: activeSection === tab.id ? 'var(--primary-600)' : 'transparent',
                color: activeSection === tab.id ? 'white' : 'var(--neutral-300)',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

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
        onClose={() => setEditingQuiz(null)}
        onSave={handleSaveQuiz}
      />

      <PublishQuizModal
        quiz={publishingQuiz}
        isOpen={Boolean(publishingQuiz)}
        students={students}
        sections={sections}
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
