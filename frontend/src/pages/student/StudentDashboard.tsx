import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { lmsFetch, getLmsUser, extractCollection } from '../../lmsApi';
import type { Quiz, Recommendation, Announcement, ReviewQuestion, StudentAnswerValue, Question } from '../../lib/types';
import { getYearLevelFromBlock } from '../../lib/constants';
import { 
  BookOpen, CheckCircle2, Award, Sparkles, Send, 
  ArrowRight, ArrowLeft, Clock, AlertCircle, FileQuestion, Calendar, Trophy,
  ExternalLink, Loader2, FileText, Info, Eye, Lock
} from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import ProfileUpdateCard from '../../components/ui/ProfileUpdateCard';
import QuizDetailsPdfModal from '../../components/ui/QuizDetailsPdfModal';
import QuizPrivacyRulesModal from '../../components/ui/QuizPrivacyRulesModal';
import { useToastContext } from '../../contexts/ToastContext';

export default function StudentDashboard() {
  const user = getLmsUser();
  const { showToast } = useToastContext();
  const { subpage } = useParams<{ subpage?: string }>();
  const navigate = useNavigate();
  const initialSection = subpage === 'dashboard' ? 'overview' : (subpage || 'overview');
  const [activeSection, setActiveSection] = useState(initialSection);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Taking a quiz state
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [detailsModalQuiz, setDetailsModalQuiz] = useState<Quiz | null>(null);
  const [privacyModalQuiz, setPrivacyModalQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<StudentAnswerValue[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [takingQuizId, setTakingQuizId] = useState<number | null>(null);
  const [lockedQuizIds, setLockedQuizIds] = useState<number[]>(() => {
    try {
      const key = `lms_locked_quizzes_${user?.id ?? 'student'}`;
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map((id) => Number(id)).filter((id) => id > 0) : [];
    } catch {
      return [];
    }
  });
  const [quizResult, setQuizResult] = useState<{
    score: number;
    max_score: number;
    percentage: number | string;
    recommendation: Recommendation;
    allow_review?: boolean;
    answers?: StudentAnswerValue[];
    review_questions?: ReviewQuestion[];
  } | null>(null);

  const isAnswerProvided = (answer: StudentAnswerValue | undefined, question?: Question | ReviewQuestion): boolean => {
    if (answer === undefined || answer === null) return false;
    const qType = question?.type ?? 'multiple_choice';
    if (qType === 'identification' || qType === 'essay') {
      return typeof answer === 'string' && answer.trim().length > 0;
    }
    if (qType === 'multiple_answer') {
      return Array.isArray(answer) && answer.length > 0;
    }
    return typeof answer === 'number' && answer >= 0;
  };

  const fetchQuizzes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await lmsFetch<{ quizzes: Quiz[] }>('/student/quizzes');
      setQuizzes(data.quizzes || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch quizzes');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      const data = await lmsFetch<unknown>('/announcements');
      setAnnouncements(extractCollection<Announcement>(data));
    } catch {
      // Announcements may be empty or optional
    }
  };

  useEffect(() => {
    fetchQuizzes();
    fetchAnnouncements();
  }, []);

  useEffect(() => {
    if (subpage) {
      const mapped = subpage === 'dashboard' ? 'overview' : subpage;
      setActiveSection(mapped);
      if (mapped !== 'quizzes') setSelectedQuiz(null);
    }
  }, [subpage]);

  const openQuiz = async (quiz: Quiz) => {
    setError(null);
    setQuizResult(null);
    setAnswers([]);
    setCurrentStepIndex(0);
    setSubmitting(true);
    try {
      const data = await lmsFetch<{ quiz: Quiz; attempt: typeof quizResult }>(`/student/quizzes/${quiz.id}`);
      setSelectedQuiz(data.quiz);
      setQuizResult(data.attempt);
      showToast(`Opened "${quiz.title}" review.`, 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not open this quiz';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const markQuizLockedLocally = (quizId: number) => {
    setLockedQuizIds((prev) => {
      if (prev.includes(quizId)) return prev;
      const next = [...prev, quizId];
      try {
        localStorage.setItem(`lms_locked_quizzes_${user?.id ?? 'student'}`, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const isQuizAttemptLocked = (quiz: Quiz): boolean => {
    return Boolean(
      quiz.attempted ||
      quiz.started ||
      quiz.is_locked ||
      takingQuizId === quiz.id ||
      lockedQuizIds.includes(quiz.id)
    );
  };

  const requestTakeQuiz = (quiz: Quiz) => {
    if (isQuizAttemptLocked(quiz)) {
      showToast('This assessment is already completed or locked.', 'warning');
      return;
    }
    setPrivacyModalQuiz(quiz);
    showToast('Review assessment rules before starting.', 'info');
  };

  const openQuizWindow = (quiz: Quiz) => {
    if (isQuizAttemptLocked(quiz)) return;
    setTakingQuizId(quiz.id);
    markQuizLockedLocally(quiz.id);
    setPrivacyModalQuiz(null);
    setQuizzes((prev) =>
      prev.map((q) => (q.id === quiz.id ? { ...q, started: true, is_locked: true } : q))
    );
    showToast(`Launching secure assessment: "${quiz.title}"`, 'success');

    // Immediately enter Full-Screen Exam Lock within the user click gesture to prevent alt-tabbing or window switching
    const docEl = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    if (!document.fullscreenElement) {
      if (typeof docEl.requestFullscreen === 'function') {
        docEl.requestFullscreen().catch(() => {});
      } else if (typeof docEl.webkitRequestFullscreen === 'function') {
        docEl.webkitRequestFullscreen().catch(() => {});
      }
    }
    const navWithKeyboard = navigator as Navigator & {
      keyboard?: { lock?: (keys?: string[]) => Promise<void> };
    };
    navWithKeyboard.keyboard?.lock?.(['Escape', 'F11']).catch(() => {});

    const quizUrl = `/student/quizzes/${quiz.id}/take`;
    navigate(quizUrl);
  };

  const handleSubmitQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuiz) return;
    
    const questions = selectedQuiz.questions || [];
    if (questions.some((q, idx) => !isAnswerProvided(answers[idx], q))) {
      const msg = 'Please answer all questions before submitting.';
      setError(msg);
      showToast(msg, 'warning');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const data = await lmsFetch<{ attempt: NonNullable<typeof quizResult> }>(
        `/student/quizzes/${selectedQuiz.id}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({ answers }),
        }
      );
      setQuizResult(data.attempt);
      showToast('Quiz submitted successfully!', 'success');
      await fetchQuizzes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit quiz';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const completedQuizzes = quizzes.filter(q => q.attempted);
  const avgScore = completedQuizzes.length > 0
    ? (completedQuizzes.reduce((sum, q) => sum + Number(q.percentage || 0), 0) / completedQuizzes.length).toFixed(0)
    : '0';

  const renderOverview = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
            STUDENT DASHBOARD
          </span>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
            Welcome back, {user?.name || 'Student'}!
          </h1>
          <p style={{ color: 'var(--neutral-300)', marginTop: '0.25rem' }}>
            Track your progress, take your assigned quizzes, and view AI-driven recommendations.
          </p>
        </div>
        <Button variant="accent" onClick={() => setActiveSection('quizzes')}>
          <BookOpen size={16} /> Take a Quiz
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        <StatCard 
          label="Available Quizzes" 
          value={quizzes.length} 
          icon={<BookOpen size={24} />} 
          detail="Published for you" 
        />
        <StatCard 
          label="Completed" 
          value={completedQuizzes.length} 
          icon={<CheckCircle2 size={24} />} 
          detail="Submitted attempts" 
        />
        <StatCard 
          label="Average Score" 
          value={`${avgScore}%`} 
          icon={<Award size={24} />} 
          detail="Across completed quizzes" 
        />
        <StatCard 
          label="Study Suggestions" 
          value={completedQuizzes.length} 
          icon={<Sparkles size={24} />} 
          detail="Personalized insights" 
        />
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <GlassCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Calendar size={18} style={{ color: 'var(--accent-purple-light)' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white' }}>School Announcements</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {announcements.slice(0, 3).map((a) => (
              <div key={a.id} style={{ background: 'rgba(255,255,255,0.04)', padding: '0.85rem 1.1rem', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--primary-400)' }}>
                <div style={{ fontWeight: 600, color: 'white', fontSize: '0.95rem' }}>{a.title}</div>
                <div style={{ color: 'var(--neutral-300)', fontSize: '0.85rem', marginTop: '0.2rem' }}>{a.content}</div>
                <div style={{ color: 'var(--neutral-400)', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                  Posted by {a.author?.name || 'Faculty'}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Recent Quizzes List */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'white' }}>Recent Quizzes</h2>
          <Button variant="outline" size="sm" onClick={() => handleSectionChange('quizzes')}>
            View All <ArrowRight size={14} />
          </Button>
        </div>
        {loading ? (
          <div style={{ color: 'var(--neutral-300)' }}>Loading quizzes...</div>
        ) : quizzes.length === 0 ? (
          <GlassCard><div style={{ color: 'var(--neutral-300)', textAlign: 'center', padding: '2rem' }}>No quizzes available at this time.</div></GlassCard>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {quizzes.slice(0, 4).map(quiz => (
              <GlassCard key={quiz.id} hoverable style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--primary-300)', fontWeight: 600, textTransform: 'uppercase' }}>
                    {quiz.subject}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {quiz.reference_pdf_name && (
                      <span
                        onClick={() => setDetailsModalQuiz(quiz)}
                        title={`Click to view attached PDF: ${quiz.reference_pdf_name}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.7rem',
                          padding: '0.18rem 0.5rem',
                          borderRadius: '999px',
                          background: 'rgba(139, 92, 246, 0.2)',
                          border: '1px solid rgba(139, 92, 246, 0.45)',
                          color: '#ddd6fe',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <FileText size={11} /> PDF
                      </span>
                    )}
                    <Badge variant={quiz.attempted ? 'success' : isQuizAttemptLocked(quiz) ? 'warning' : 'primary'}>
                      {quiz.attempted ? 'Completed • Locked' : isQuizAttemptLocked(quiz) ? 'Started • Locked' : 'Ready'}
                    </Badge>
                  </div>
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white', marginBottom: '0.35rem' }}>{quiz.title}</h3>
                <p style={{ color: 'var(--neutral-300)', fontSize: '0.84rem', marginBottom: '0.65rem' }}>
                  {quiz.topic && quiz.topic.trim().toLowerCase() !== quiz.title.trim().toLowerCase()
                    ? `${quiz.topic} • ${quiz.question_count} questions • ${quiz.time_limit_minutes || 15} mins`
                    : `${quiz.question_count} questions • ${quiz.time_limit_minutes || 15} mins`}
                </p>

                {quiz.instructions && (
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '0.55rem 0.7rem',
                      marginBottom: '0.75rem',
                      fontSize: '0.8rem',
                      color: 'var(--neutral-300)',
                      lineHeight: 1.45,
                      flex: 1,
                    }}
                  >
                    <div style={{ fontSize: '0.68rem', color: '#93c5fd', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Info size={11} /> Instructions
                    </div>
                    <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {quiz.instructions}
                    </div>
                  </div>
                )}

                {quiz.reference_pdf_name && (
                  <button
                    type="button"
                    onClick={() => setDetailsModalQuiz(quiz)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      width: '100%',
                      textAlign: 'left',
                      background: 'rgba(139, 92, 246, 0.12)',
                      border: '1px solid rgba(139, 92, 246, 0.35)',
                      borderRadius: '8px',
                      padding: '0.48rem 0.7rem',
                      marginBottom: '0.75rem',
                      color: '#ddd6fe',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <FileText size={14} style={{ flexShrink: 0, color: '#c4b5fd' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {quiz.reference_pdf_name}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#c4b5fd', textDecoration: 'underline', flexShrink: 0 }}>
                      View PDF
                    </span>
                  </button>
                )}

                {quiz.attempted && (
                  <div style={{ background: 'rgba(67, 160, 71, 0.15)', border: '1px solid rgba(67, 160, 71, 0.3)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem', fontSize: '0.85rem', color: '#a5d6a7' }}>
                    Score: <strong>{quiz.score}/{quiz.max_score}</strong> ({Number(quiz.percentage).toFixed(0)}%)
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', flexWrap: 'wrap' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDetailsModalQuiz(quiz)}
                    style={{ flex: 1 }}
                  >
                    <Eye size={14} /> {quiz.reference_pdf_name ? 'Details & PDF' : 'View Details'}
                  </Button>
                  {quiz.attempted && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        openQuiz(quiz);
                        setActiveSection('quizzes');
                      }}
                      style={{ flex: 1 }}
                    >
                      <Award size={14} /> View Result
                    </Button>
                  )}
                  {isQuizAttemptLocked(quiz) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      title="Single-attempt policy: You have already started or completed this quiz and cannot click Take Quiz a second time."
                      style={{
                        flex: 1,
                        opacity: 0.72,
                        cursor: 'not-allowed',
                        background: 'rgba(239, 68, 68, 0.12)',
                        borderColor: 'rgba(239, 68, 68, 0.35)',
                        color: '#fca5a5',
                      }}
                    >
                      <Lock size={14} /> Take Quiz (Locked)
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={takingQuizId === quiz.id}
                      style={{ flex: 1 }}
                      onClick={() => requestTakeQuiz(quiz)}
                    >
                      {takingQuizId === quiz.id ? (
                        <><Loader2 size={14} className="spin-icon" /> Locking...</>
                      ) : (
                        <>Take Quiz <ArrowRight size={14} /></>
                      )}
                    </Button>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderTakingQuiz = () => {
    if (!selectedQuiz) return null;

    if (quizResult) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
          <Button variant="outline" size="sm" onClick={() => { setSelectedQuiz(null); setQuizResult(null); }}>
            <ArrowLeft size={16} /> Back to Quizzes
          </Button>

          <GlassCard style={{ textAlign: 'center', padding: '2.5rem' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--neutral-300)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
              YOUR QUIZ RESULT
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', margin: '0.5rem 0' }}>
              {selectedQuiz.title}
            </h1>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: '0.5rem', margin: '1.5rem 0' }}>
              <span style={{ fontSize: '3.5rem', fontWeight: 800, color: 'white', fontFamily: 'var(--font-display)' }}>
                {quizResult.score}
              </span>
              <span style={{ fontSize: '1.5rem', color: 'var(--neutral-400)' }}>
                /{quizResult.max_score}
              </span>
              <Badge variant={Number(quizResult.percentage) >= 75 ? 'success' : 'warning'} style={{ marginLeft: '1rem', fontSize: '1rem', padding: '0.4rem 0.8rem' }}>
                {Number(quizResult.percentage).toFixed(0)}%
              </Badge>
            </div>
          </GlassCard>

          {(selectedQuiz.allow_review || quizResult.allow_review) && Array.isArray(quizResult.review_questions) && quizResult.review_questions.length > 0 && (
            <GlassCard style={{ borderLeft: '4px solid var(--success)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ background: 'rgba(76, 175, 80, 0.25)', padding: '0.5rem', borderRadius: 'var(--radius-md)', color: '#a5d6a7' }}>
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#a5d6a7', fontWeight: 700, textTransform: 'uppercase' }}>
                    ANSWER KEY & ITEM REVIEW
                  </span>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white', margin: 0 }}>
                    Review Your Questions & Answers ({quizResult.review_questions.length})
                  </h3>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {quizResult.review_questions.map((item, idx) => {
                  const qType = item.type ?? 'multiple_choice';
                  const unanswered = !isAnswerProvided(item.student_answer, item);
                  const typeLabelMap: Record<string, string> = {
                    multiple_choice: 'Multiple Choice',
                    true_false: 'True or False',
                    identification: 'Identification',
                    multiple_answer: 'Multiple Answer',
                    essay: 'Essay',
                  };
                  const correctIndicesSet = new Set<number>(
                    Array.isArray(item.correct_indices) && item.correct_indices.length > 0
                      ? item.correct_indices
                      : [item.correct_index]
                  );
                  const studentIndicesSet = new Set<number>(
                    Array.isArray(item.student_answer)
                      ? (item.student_answer as number[]).map((n) => Number(n))
                      : typeof item.student_answer === 'number' && item.student_answer >= 0
                        ? [item.student_answer]
                        : []
                  );

                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '1rem 1.1rem',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: item.is_correct
                          ? '1px solid rgba(76, 175, 80, 0.4)'
                          : '1px solid rgba(239, 83, 80, 0.35)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.72rem', color: '#c4b5fd', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.18rem' }}>
                            {typeLabelMap[qType] || 'Question'}
                          </div>
                          <div style={{ fontWeight: 700, color: 'white', fontSize: '0.95rem' }}>
                            {idx + 1}. {item.prompt}
                          </div>
                        </div>
                        <Badge variant={item.is_correct ? 'success' : 'warning'}>
                          {item.is_correct ? `✓ Correct (+${item.points} pt)` : unanswered ? 'Unanswered (0 pt)' : '✗ Incorrect (0 pt)'}
                        </Badge>
                      </div>

                      {qType === 'identification' || qType === 'essay' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div
                            style={{
                              padding: '0.65rem 0.85rem',
                              borderRadius: '8px',
                              background: item.is_correct ? 'rgba(76, 175, 80, 0.16)' : 'rgba(239, 83, 80, 0.16)',
                              border: item.is_correct ? '1px solid rgba(76, 175, 80, 0.45)' : '1px solid rgba(239, 83, 80, 0.45)',
                              color: item.is_correct ? '#c8e6c9' : '#ffcdd2',
                              fontSize: '0.88rem',
                            }}
                          >
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.85, marginBottom: '0.2rem' }}>
                              Your Answer
                            </div>
                            <div style={{ whiteSpace: 'pre-wrap', fontWeight: 600 }}>
                              {typeof item.student_answer === 'string' && item.student_answer.trim().length > 0
                                ? item.student_answer
                                : '(No answer submitted)'}
                            </div>
                          </div>
                          {(item.correct_answer || item.options?.[0]) && (
                            <div
                              style={{
                                padding: '0.65rem 0.85rem',
                                borderRadius: '8px',
                                background: 'rgba(76, 175, 80, 0.14)',
                                border: '1px solid rgba(76, 175, 80, 0.4)',
                                color: '#a5d6a7',
                                fontSize: '0.88rem',
                              }}
                            >
                              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.85, marginBottom: '0.2rem' }}>
                                {qType === 'essay' ? '✓ Reference / Model Key' : '✓ Correct Answer Key'}
                              </div>
                              <div style={{ whiteSpace: 'pre-wrap', fontWeight: 600 }}>
                                {item.correct_answer || item.options?.[0]}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {item.options.map((opt, optIdx) => {
                            const isCorrectChoice = qType === 'multiple_answer'
                              ? correctIndicesSet.has(optIdx)
                              : optIdx === item.correct_index;
                            const isStudentChoice = qType === 'multiple_answer'
                              ? studentIndicesSet.has(optIdx)
                              : optIdx === item.student_answer;
                            return (
                              <div
                                key={optIdx}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '0.75rem',
                                  padding: '0.55rem 0.8rem',
                                  borderRadius: '8px',
                                  fontSize: '0.88rem',
                                  background: isCorrectChoice
                                    ? 'rgba(76, 175, 80, 0.18)'
                                    : isStudentChoice
                                      ? 'rgba(239, 83, 80, 0.18)'
                                      : 'rgba(255, 255, 255, 0.03)',
                                  border: isCorrectChoice
                                    ? '1px solid rgba(76, 175, 80, 0.5)'
                                    : isStudentChoice
                                      ? '1px solid rgba(239, 83, 80, 0.5)'
                                      : '1px solid rgba(255, 255, 255, 0.07)',
                                  color: isCorrectChoice ? '#c8e6c9' : isStudentChoice ? '#ffcdd2' : 'var(--neutral-200)',
                                  fontWeight: isCorrectChoice || isStudentChoice ? 600 : 400,
                                }}
                              >
                                <span>
                                  <strong>{String.fromCharCode(65 + optIdx)}.</strong> {opt}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0, fontSize: '0.75rem' }}>
                                  {isStudentChoice && (
                                    <span style={{ padding: '0.1rem 0.45rem', borderRadius: '999px', background: 'rgba(255,255,255,0.12)', color: 'white' }}>
                                      Your Answer
                                    </span>
                                  )}
                                  {isCorrectChoice && (
                                    <span style={{ padding: '0.1rem 0.45rem', borderRadius: '999px', background: 'rgba(76, 175, 80, 0.3)', color: '#a5d6a7' }}>
                                      ✓ Correct Answer
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}

          {Number(quizResult.score) >= Number(quizResult.max_score) && Number(quizResult.max_score) > 0 ? (
            <GlassCard style={{ borderLeft: '4px solid var(--success)', background: 'rgba(76, 175, 80, 0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.65rem' }}>
                <div style={{ background: 'rgba(76, 175, 80, 0.25)', padding: '0.5rem', borderRadius: 'var(--radius-md)', color: '#a5d6a7' }}>
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#a5d6a7', fontWeight: 700, textTransform: 'uppercase' }}>
                    PERFECT SCORE ACHIEVED • 100% MASTERY
                  </span>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white', margin: 0 }}>
                    No Further Improvement Needed
                  </h3>
                </div>
              </div>
              <p style={{ color: '#e8f5e9', lineHeight: 1.6, margin: 0 }}>
                Outstanding work! You answered every question correctly on this assessment. Because you achieved a perfect score, no additional study improvements or external reference links are required.
              </p>
            </GlassCard>
          ) : quizResult.recommendation ? (
            <GlassCard style={{ borderLeft: '4px solid var(--accent-purple-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ background: 'var(--accent-purple)', padding: '0.5rem', borderRadius: 'var(--radius-md)', color: 'white' }}>
                  <Sparkles size={20} />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-purple-light)', fontWeight: 700, textTransform: 'uppercase' }}>
                    {selectedQuiz.reference_pdf_name
                      ? `LEARNING IDEAS BASED ON ATTACHED PDF (${selectedQuiz.reference_pdf_name})`
                      : quizResult.recommendation.source === 'gemini'
                        ? 'AI STUDY RECOMMENDATION (GEMINI)'
                        : 'PERSONALIZED STUDY RECOMMENDATION'}
                  </span>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>
                    {selectedQuiz.reference_pdf_name
                      ? "What to Review from Your Instructor's PDF Handout"
                      : 'Suggested Next Steps'}
                  </h3>
                </div>
              </div>

              <p style={{ color: 'var(--neutral-200)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                {quizResult.recommendation.summary}
              </p>

              {quizResult.recommendation.focus_topics?.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--neutral-400)', fontWeight: 600, marginBottom: '0.5rem' }}>
                    {selectedQuiz.reference_pdf_name ? 'MISSED CONCEPTS FROM ATTACHED PDF:' : 'TOPICS TO REVIEW:'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {quizResult.recommendation.focus_topics.map((t, i) => (
                      <span key={i} style={{ background: 'rgba(255,255,255,0.08)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-full)', color: 'white', fontSize: '0.85rem' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {quizResult.recommendation.action_steps?.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--neutral-400)', fontWeight: 600, marginBottom: '0.5rem' }}>
                    {selectedQuiz.reference_pdf_name
                      ? `LEARNING IDEAS FROM ${selectedQuiz.reference_pdf_name.toUpperCase()}:`
                      : 'ACTION STEPS:'}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--neutral-200)', display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.9rem' }}>
                    {quizResult.recommendation.action_steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedQuiz.reference_pdf_name ? (
                <div style={{ marginTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.25rem' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--accent-purple-light)', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileText size={14} /> INSTRUCTOR&apos;S ATTACHED REFERENCE PDF:
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailsModalQuiz(selectedQuiz)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      textAlign: 'left',
                      gap: '0.75rem',
                      padding: '0.85rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(139, 92, 246, 0.14)',
                      border: '1px solid rgba(139, 92, 246, 0.4)',
                      color: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                      <div style={{ background: 'var(--accent-purple)', padding: '0.45rem', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}>
                        <FileText size={15} style={{ color: 'white' }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent-purple-light)' }}>
                          {selectedQuiz.reference_pdf_name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--neutral-300)', marginTop: '0.15rem' }}>
                          Click to open and study the instructor&apos;s attached PDF handout for the questions you missed.
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c4b5fd', textDecoration: 'underline', flexShrink: 0 }}>
                      Open PDF Handout
                    </span>
                  </button>
                </div>
              ) : (
                quizResult.recommendation.references && quizResult.recommendation.references.length > 0 && (
                  <div style={{ marginTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.25rem' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--accent-purple-light)', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ExternalLink size={14} /> STUDY REFERENCES & LEARNING MATERIALS:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {quizResult.recommendation.references.map((ref, i) => (
                        <a
                          key={i}
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.75rem',
                            padding: '0.75rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            textDecoration: 'none',
                            transition: 'all 0.2s',
                            color: 'white',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.15)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                        >
                          <div style={{ background: 'var(--accent-purple)', padding: '0.4rem', borderRadius: 'var(--radius-sm)', flexShrink: 0, marginTop: '0.1rem' }}>
                            <ExternalLink size={14} style={{ color: 'white' }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--accent-purple-light)' }}>{ref.title}</div>
                            {ref.description && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--neutral-300)', marginTop: '0.2rem', lineHeight: 1.4 }}>{ref.description}</div>
                            )}
                            {ref.source_name && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', marginTop: '0.25rem' }}>Source: {ref.source_name}</div>
                            )}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )
              )}
            </GlassCard>
          ) : null}

          <Button variant="primary" onClick={() => { setSelectedQuiz(null); setQuizResult(null); }}>
            Back to Quizzes List
          </Button>
        </div>
      );
    }

    const totalInlineQuestions = selectedQuiz.questions?.length || 0;
    const clampedStepIdx = totalInlineQuestions > 0
      ? Math.max(0, Math.min(totalInlineQuestions - 1, currentStepIndex))
      : 0;
    const currentInlineQuestion = selectedQuiz.questions?.[clampedStepIdx];
    const isCurrentInlineAnswered = currentInlineQuestion
      ? isAnswerProvided(answers[clampedStepIdx], currentInlineQuestion)
      : false;
    const isLastInlineQuestion = clampedStepIdx >= totalInlineQuestions - 1;
    const allInlineAnswered = (selectedQuiz.questions || []).every((q, idx) =>
      isAnswerProvided(answers[idx], q)
    );

    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <Button variant="outline" size="sm" onClick={() => setSelectedQuiz(null)}>
          <ArrowLeft size={16} /> Cancel & Back to Quizzes
        </Button>

        <GlassCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <Badge variant="primary">{selectedQuiz.subject}</Badge>
            <span style={{ fontSize: '0.85rem', color: 'var(--neutral-300)' }}>
              Question {clampedStepIdx + 1} of {totalInlineQuestions}
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'white', marginBottom: '0.5rem' }}>
            {selectedQuiz.title}
          </h1>
          <p style={{ color: 'var(--neutral-300)', fontSize: '0.95rem' }}>
            {selectedQuiz.instructions || 'Choose the best answer for each question. You must answer the current question before moving to the next question.'}
          </p>
        </GlassCard>

        {error && (
          <div style={{ background: 'rgba(239, 83, 80, 0.2)', border: '1px solid var(--error)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#ffcdd2', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmitQuiz} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {currentInlineQuestion && (() => {
            const q = currentInlineQuestion;
            const qIndex = clampedStepIdx;
            const qType = q.type ?? 'multiple_choice';
            const currentAns = answers[qIndex];
            return (
              <GlassCard key={qIndex}>
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{ background: 'var(--primary-600)', color: 'white', fontWeight: 700, width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.85rem' }}>
                    {qIndex + 1}
                  </span>
                  <p style={{ color: 'white', fontWeight: 600, fontSize: '1.05rem', marginTop: '0.15rem' }}>
                    {q.prompt}
                  </p>
                </div>

                {qType === 'identification' ? (
                  <div style={{ paddingLeft: '2.5rem' }}>
                    <input
                      type="text"
                      value={typeof currentAns === 'string' ? currentAns : ''}
                      onChange={(e) => {
                        setError(null);
                        const next = [...answers];
                        next[qIndex] = e.target.value;
                        setAnswers(next);
                      }}
                      placeholder="Type your answer..."
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.16)',
                        color: 'white',
                        fontSize: '0.95rem',
                      }}
                    />
                  </div>
                ) : qType === 'essay' ? (
                  <div style={{ paddingLeft: '2.5rem' }}>
                    <textarea
                      rows={4}
                      value={typeof currentAns === 'string' ? currentAns : ''}
                      onChange={(e) => {
                        setError(null);
                        const next = [...answers];
                        next[qIndex] = e.target.value;
                        setAnswers(next);
                      }}
                      placeholder="Write your essay response..."
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.16)',
                        color: 'white',
                        fontSize: '0.95rem',
                      }}
                    />
                  </div>
                ) : qType === 'multiple_answer' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingLeft: '2.5rem' }}>
                    {(q.options ?? []).map((opt, optIndex) => {
                      const selectedArr = Array.isArray(currentAns) ? (currentAns as number[]) : [];
                      const isSelected = selectedArr.includes(optIndex);
                      return (
                        <label
                          key={optIndex}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.75rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            background: isSelected ? 'rgba(63, 81, 181, 0.3)' : 'rgba(255,255,255,0.05)',
                            border: isSelected ? '1px solid var(--primary-400)' : '1px solid transparent',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            color: 'white',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setError(null);
                              const next = [...answers];
                              const arr = Array.isArray(next[qIndex]) ? [...(next[qIndex] as number[])] : [];
                              const pos = arr.indexOf(optIndex);
                              if (pos >= 0) arr.splice(pos, 1);
                              else arr.push(optIndex);
                              arr.sort((a, b) => a - b);
                              next[qIndex] = arr;
                              setAnswers(next);
                            }}
                            style={{ accentColor: 'var(--primary-400)', width: '16px', height: '16px' }}
                          />
                          <span style={{ fontWeight: 600, color: 'var(--primary-300)', width: '20px' }}>
                            {String.fromCharCode(65 + optIndex)}.
                          </span>
                          <span style={{ fontSize: '0.95rem' }}>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingLeft: '2.5rem' }}>
                    {(q.options ?? []).map((opt, optIndex) => {
                      const isSelected = currentAns === optIndex;
                      return (
                        <label 
                          key={optIndex}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.75rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            background: isSelected ? 'rgba(63, 81, 181, 0.3)' : 'rgba(255,255,255,0.05)',
                            border: isSelected ? '1px solid var(--primary-400)' : '1px solid transparent',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            color: 'white',
                          }}
                        >
                          <input 
                            type="radio" 
                            name={`question-${qIndex}`} 
                            value={optIndex} 
                            checked={isSelected}
                            onChange={() => {
                              setError(null);
                              const next = [...answers];
                              next[qIndex] = optIndex;
                              setAnswers(next);
                            }}
                            style={{ accentColor: 'var(--primary-400)', width: '16px', height: '16px' }}
                          />
                          <span style={{ fontWeight: 600, color: 'var(--primary-300)', width: '20px' }}>
                            {String.fromCharCode(65 + optIndex)}.
                          </span>
                          <span style={{ fontSize: '0.95rem' }}>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </GlassCard>
            );
          })()}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <Button
              type="button"
              variant="outline"
              disabled={clampedStepIdx === 0}
              onClick={() => {
                setError(null);
                setCurrentStepIndex((prev) => Math.max(0, prev - 1));
              }}
            >
              <ArrowLeft size={16} /> Previous Question
            </Button>

            {!isLastInlineQuestion ? (
              <Button
                type="button"
                variant="accent"
                disabled={!isCurrentInlineAnswered}
                onClick={() => {
                  if (!isCurrentInlineAnswered) {
                    const msg = `Please answer Question ${clampedStepIdx + 1} first before moving to the next question.`;
                    setError(msg);
                    showToast(msg, 'warning');
                    return;
                  }
                  setError(null);
                  setCurrentStepIndex((prev) => Math.min(totalInlineQuestions - 1, prev + 1));
                }}
              >
                {isCurrentInlineAnswered ? (
                  <>Next Question <ArrowRight size={16} /></>
                ) : (
                  <><Lock size={15} /> Answer Question {clampedStepIdx + 1} First</>
                )}
              </Button>
            ) : (
              <Button
                variant="accent"
                size="lg"
                type="submit"
                disabled={submitting || !allInlineAnswered}
              >
                <Send size={18} /> {submitting ? 'Submitting Answers...' : 'Submit Quiz Now'}
              </Button>
            )}
          </div>
        </form>
      </div>
    );
  };

  const renderQuizzes = () => {
    if (selectedQuiz) {
      return renderTakingQuiz();
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
            ASSIGNED ASSESSMENTS
          </span>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
            My Quizzes
          </h1>
          <p style={{ color: 'var(--neutral-300)' }}>
            Quizzes prepared and published by your subject teachers.
          </p>
        </div>

        {loading ? (
          <div style={{ color: 'white' }}>Loading available quizzes...</div>
        ) : quizzes.length === 0 ? (
          <GlassCard style={{ textAlign: 'center', padding: '3rem' }}>
            <FileQuestion size={48} style={{ color: 'var(--neutral-400)', margin: '0 auto 1rem' }} />
            <h3 style={{ color: 'white', fontSize: '1.25rem', fontWeight: 700 }}>No Quizzes Available</h3>
            <p style={{ color: 'var(--neutral-300)', marginTop: '0.5rem' }}>
              Your teachers have not published any quizzes for you yet. Check back soon!
            </p>
          </GlassCard>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {quizzes.map(quiz => (
              <GlassCard key={quiz.id} hoverable style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Badge variant="primary">{quiz.subject}</Badge>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {quiz.reference_pdf_name && (
                      <span
                        onClick={() => setDetailsModalQuiz(quiz)}
                        title={`Click to view attached PDF: ${quiz.reference_pdf_name}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.72rem',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '999px',
                          background: 'rgba(139, 92, 246, 0.2)',
                          border: '1px solid rgba(139, 92, 246, 0.45)',
                          color: '#ddd6fe',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <FileText size={11} /> PDF Handout
                      </span>
                    )}
                    <Badge variant={quiz.attempted ? 'success' : isQuizAttemptLocked(quiz) ? 'warning' : 'warning'}>
                      {quiz.attempted ? 'Completed • Locked' : isQuizAttemptLocked(quiz) ? 'Attempt Locked' : 'Pending'}
                    </Badge>
                  </div>
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'white', marginBottom: '0.35rem' }}>{quiz.title}</h3>
                <p style={{ color: 'var(--neutral-300)', fontSize: '0.88rem', marginBottom: '0.75rem' }}>
                  {quiz.topic && quiz.topic.trim().toLowerCase() !== quiz.title.trim().toLowerCase() ? (
                    <>Topic: <strong>{quiz.topic}</strong> • {quiz.question_count} Questions • {quiz.time_limit_minutes || 15} mins</>
                  ) : (
                    <>{quiz.question_count} Questions • {quiz.time_limit_minutes || 15} mins</>
                  )}
                </p>

                {quiz.instructions && (
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '0.6rem 0.75rem',
                      marginBottom: '0.8rem',
                      fontSize: '0.82rem',
                      color: 'var(--neutral-300)',
                      lineHeight: 1.45,
                      flex: 1,
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', color: '#93c5fd', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Info size={12} /> Instructions
                    </div>
                    <div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {quiz.instructions}
                    </div>
                  </div>
                )}

                {quiz.reference_pdf_name && (
                  <button
                    type="button"
                    onClick={() => setDetailsModalQuiz(quiz)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      width: '100%',
                      textAlign: 'left',
                      background: 'rgba(139, 92, 246, 0.12)',
                      border: '1px solid rgba(139, 92, 246, 0.35)',
                      borderRadius: '8px',
                      padding: '0.55rem 0.75rem',
                      marginBottom: '0.85rem',
                      color: '#ddd6fe',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <FileText size={15} style={{ flexShrink: 0, color: '#c4b5fd' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {quiz.reference_pdf_name}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#c4b5fd', textDecoration: 'underline', flexShrink: 0 }}>
                      Open PDF
                    </span>
                  </button>
                )}

                {quiz.attempted && (
                  <div style={{ background: 'rgba(67, 160, 71, 0.15)', border: '1px solid rgba(67, 160, 71, 0.3)', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '0.85rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#a5d6a7', textTransform: 'uppercase', fontWeight: 600 }}>Recorded Score</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white' }}>
                      {quiz.score}/{quiz.max_score} <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#a5d6a7' }}>({Number(quiz.percentage).toFixed(0)}%)</span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.6rem', marginTop: 'auto', flexWrap: 'wrap' }}>
                  <Button
                    variant="outline"
                    onClick={() => setDetailsModalQuiz(quiz)}
                    style={{ flex: 1 }}
                  >
                    <Eye size={15} /> {quiz.reference_pdf_name ? 'View Details & PDF' : 'View Details'}
                  </Button>
                  {quiz.attempted && (
                    <Button
                      variant="outline"
                      onClick={() => openQuiz(quiz)}
                      style={{ flex: 1 }}
                    >
                      <Award size={15} /> {quiz.allow_review ? 'Result & Review' : 'View Result'}
                    </Button>
                  )}
                  {isQuizAttemptLocked(quiz) ? (
                    <Button
                      variant="outline"
                      disabled
                      title="Single-attempt policy: You have already started or completed this quiz and cannot click Take Quiz a second time."
                      style={{
                        flex: 1,
                        opacity: 0.72,
                        cursor: 'not-allowed',
                        background: 'rgba(239, 68, 68, 0.12)',
                        borderColor: 'rgba(239, 68, 68, 0.35)',
                        color: '#fca5a5',
                      }}
                    >
                      <Lock size={15} /> Take Quiz (Locked)
                    </Button>
                  ) : (
                    <Button
                      variant="accent"
                      disabled={takingQuizId === quiz.id}
                      style={{ flex: 1 }}
                      onClick={() => requestTakeQuiz(quiz)}
                    >
                      {takingQuizId === quiz.id ? (
                        <><Loader2 size={16} className="spin-icon" /> Locking...</>
                      ) : (
                        <>Take Quiz <ArrowRight size={16} /></>
                      )}
                    </Button>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderHistory = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          COMPLETED ASSESSMENTS
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Quiz History
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Review all your submitted quizzes and their past scores.
        </p>
      </div>

      {completedQuizzes.length === 0 ? (
        <GlassCard style={{ textAlign: 'center', padding: '3rem' }}>
          <Clock size={48} style={{ color: 'var(--neutral-400)', margin: '0 auto 1rem' }} />
          <h3 style={{ color: 'white', fontSize: '1.25rem', fontWeight: 700 }}>No Submissions Yet</h3>
          <p style={{ color: 'var(--neutral-300)', marginTop: '0.5rem' }}>
            Complete a quiz from the "My Quizzes" tab to view your score history here.
          </p>
        </GlassCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {completedQuizzes.map(quiz => (
            <GlassCard key={quiz.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <Badge variant="primary">{quiz.subject}</Badge>
                  <span style={{ fontSize: '0.8rem', color: 'var(--neutral-400)' }}>{quiz.topic}</span>
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white' }}>{quiz.title}</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white' }}>
                    {quiz.score}/{quiz.max_score}
                  </div>
                  <Badge variant={Number(quiz.percentage) >= 75 ? 'success' : 'warning'}>
                    {Number(quiz.percentage).toFixed(0)}%
                  </Badge>
                </div>
                <Button variant="outline" size="sm" onClick={() => { openQuiz(quiz); setActiveSection('quizzes'); }}>
                  Review
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );

  const renderScores = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          ACADEMIC PERFORMANCE
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Scores & Analytics
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Comprehensive summary of your scores across all subjects.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        <StatCard label="Total Quizzes Taken" value={completedQuizzes.length} icon={<CheckCircle2 size={24} />} detail="Successfully submitted" />
        <StatCard label="Overall Average" value={`${avgScore}%`} icon={<Award size={24} />} detail="Calculated score percentage" />
        <StatCard 
          label="Highest Score" 
          value={completedQuizzes.length > 0 ? `${Math.max(...completedQuizzes.map(q => Number(q.percentage || 0))).toFixed(0)}%` : '0%'} 
          icon={<Trophy size={24} />} 
          detail="Personal best" 
        />
      </div>

      <GlassCard>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white', marginBottom: '1rem' }}>Subject Breakdown</h3>
        {completedQuizzes.length === 0 ? (
          <div style={{ color: 'var(--neutral-400)', fontSize: '0.9rem', padding: '1rem 0' }}>
            No completed quizzes recorded yet. Complete an assessment to view your subject breakdown.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Array.from(new Set(completedQuizzes.map(q => q.subject))).map(subj => {
              const subjQuizzes = completedQuizzes.filter(q => q.subject === subj);
              const subjAvg = subjQuizzes.length > 0
                ? (subjQuizzes.reduce((s, q) => s + Number(q.percentage || 0), 0) / subjQuizzes.length).toFixed(0)
                : null;
              return (
                <div key={subj}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem', color: 'white' }}>
                    <span>{subj}</span>
                    <span style={{ fontWeight: 600 }}>{subjAvg ? `${subjAvg}%` : 'No data yet'}</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                    <div style={{ width: subjAvg ? `${subjAvg}%` : '0%', height: '100%', background: 'linear-gradient(90deg, var(--primary-500), var(--accent-purple-light))' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );

  const renderRecommendations = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--accent-purple-light)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          INTELLIGENT LEARNING
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          AI Study Recommendations
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Targeted study recommendations generated based on your past quiz answers and missed competencies.
        </p>
      </div>

      {completedQuizzes.filter(q => q.recommendation).length === 0 ? (
        <GlassCard style={{ textAlign: 'center', padding: '3rem' }}>
          <Sparkles size={48} style={{ color: 'var(--accent-purple-light)', margin: '0 auto 1rem' }} />
          <h3 style={{ color: 'white', fontSize: '1.25rem', fontWeight: 700 }}>No Recommendations Generated Yet</h3>
          <p style={{ color: 'var(--neutral-300)', marginTop: '0.5rem' }}>
            Complete a quiz to receive personalized AI recommendations and study guidance!
          </p>
        </GlassCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {completedQuizzes.filter(q => q.recommendation).map(q => {
            const isPerfect = Number(q.score) >= Number(q.max_score) && Number(q.max_score) > 0;
            return (
              <GlassCard
                key={q.id}
                style={{
                  borderLeft: isPerfect ? '4px solid var(--success)' : '4px solid var(--accent-purple-light)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div>
                    <Badge variant="primary">{q.subject}</Badge>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'white', marginTop: '0.25rem' }}>{q.title}</h3>
                  </div>
                  <Badge variant={Number(q.percentage) >= 75 ? 'success' : 'warning'}>
                    Score: {q.score}/{q.max_score} ({Number(q.percentage).toFixed(0)}%)
                  </Badge>
                </div>

                {isPerfect ? (
                  <p style={{ color: '#a5d6a7', fontSize: '0.95rem', lineHeight: 1.6, margin: 0, fontWeight: 600 }}>
                    ✓ Perfect Score Achieved (100% Mastery) · You answered every question correctly. No further study improvements or external reference links are required.
                  </p>
                ) : (
                  <>
                    <p style={{ color: 'var(--neutral-200)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1rem' }}>
                      {q.recommendation?.summary}
                    </p>

                    {q.recommendation?.focus_topics && q.recommendation.focus_topics.length > 0 && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--neutral-400)', fontWeight: 600, marginBottom: '0.4rem' }}>
                          {q.reference_pdf_name ? 'MISSED CONCEPTS FROM ATTACHED PDF:' : 'KEY TOPICS TO REVIEW:'}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {q.recommendation.focus_topics.map((t, idx) => (
                            <span key={idx} style={{ background: 'rgba(255,255,255,0.08)', padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-full)', color: 'white', fontSize: '0.8rem' }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {q.recommendation?.action_steps && q.recommendation.action_steps.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--neutral-400)', fontWeight: 600, marginBottom: '0.4rem' }}>
                          {q.reference_pdf_name
                            ? `LEARNING IDEAS FROM ${q.reference_pdf_name.toUpperCase()}:`
                            : 'ACTION PLAN:'}
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--neutral-300)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {q.recommendation.action_steps.map((s, idx) => (
                            <li key={idx}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {q.reference_pdf_name ? (
                      <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem' }}>
                        <button
                          type="button"
                          onClick={() => setDetailsModalQuiz(q)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            textAlign: 'left',
                            gap: '0.6rem',
                            padding: '0.65rem 0.9rem',
                            borderRadius: 'var(--radius-md)',
                            background: 'rgba(139, 92, 246, 0.14)',
                            border: '1px solid rgba(139, 92, 246, 0.4)',
                            color: 'white',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                            <FileText size={15} style={{ color: 'var(--accent-purple-light)', flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-purple-light)' }}>
                                Instructor&apos;s Attached PDF: {q.reference_pdf_name}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--neutral-300)' }}>
                                Click to open and review the attached reference handout
                              </div>
                            </div>
                          </div>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#c4b5fd', textDecoration: 'underline', flexShrink: 0 }}>
                            Open PDF
                          </span>
                        </button>
                      </div>
                    ) : (
                      q.recommendation?.references && q.recommendation.references.length > 0 && (
                        <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem' }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--accent-purple-light)', fontWeight: 700, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <ExternalLink size={13} /> STUDY REFERENCES:
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {q.recommendation.references.map((ref, idx) => (
                              <a
                                key={idx}
                                href={ref.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.6rem',
                                  padding: '0.6rem 0.85rem',
                                  borderRadius: 'var(--radius-md)',
                                  background: 'rgba(255,255,255,0.04)',
                                  border: '1px solid rgba(255,255,255,0.06)',
                                  textDecoration: 'none',
                                  transition: 'all 0.2s',
                                  color: 'white',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.25)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                              >
                                <ExternalLink size={14} style={{ color: 'var(--accent-purple-light)', flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-purple-light)' }}>{ref.title}</div>
                                  {ref.source_name && (
                                    <div style={{ fontSize: '0.72rem', color: 'var(--neutral-400)' }}>{ref.source_name}</div>
                                  )}
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderSettings = () => (
    <div style={{ maxWidth: '650px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <span style={{ fontSize: '0.8rem', color: 'var(--primary-300)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
          ACCOUNT DETAILS
        </span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.25rem' }}>
          Student Profile
        </h1>
        <p style={{ color: 'var(--neutral-300)' }}>
          Official registration and enrollment records at Tagoloan Community College.
        </p>
      </div>

      <GlassCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-500), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800, color: 'white' }}>
            {user?.initials || 'S'}
          </div>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'white' }}>{user?.name || 'Student Name'}</h2>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <Badge variant="success">Active Student</Badge>
              <Badge variant="primary">{user?.section || 'Block - 1A'}</Badge>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Student ID</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem', fontFamily: 'monospace', fontSize: '1.05rem' }}>
              {user?.lrn || '20273710'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Email Address</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              {user?.email || 'student@tcc.edu.ph'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Academic Department</div>
            <div style={{ color: '#fbbf24', fontWeight: 700, marginTop: '0.2rem' }}>
              {user?.department ? `${user.department} Department` : 'College of Information Technology (CIT)'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Block</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              {user?.section || 'Block - 1A'} ({getYearLevelFromBlock(user?.section)})
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
    if (sectionId !== 'quizzes') setSelectedQuiz(null);
    const path = sectionId === 'overview' ? '/student/dashboard' : `/student/${sectionId}`;
    navigate(path, { replace: true });
  };

  return (
    <DashboardLayout role="student">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', minWidth: 0 }}>
        {activeSection === 'overview' && renderOverview()}
        {activeSection === 'quizzes' && renderQuizzes()}
        {activeSection === 'history' && renderHistory()}
        {activeSection === 'scores' && renderScores()}
        {activeSection === 'recommendations' && renderRecommendations()}
        {activeSection === 'settings' && renderSettings()}
      </div>

      {detailsModalQuiz && (
        <QuizDetailsPdfModal
          quiz={detailsModalQuiz}
          onClose={() => setDetailsModalQuiz(null)}
          onStartQuiz={(q) => {
            if (q.attempted) {
              openQuiz(q);
              setActiveSection('quizzes');
            } else {
              requestTakeQuiz(q);
            }
          }}
        />
      )}

      <QuizPrivacyRulesModal
        quiz={privacyModalQuiz}
        isOpen={Boolean(privacyModalQuiz)}
        isStarting={Boolean(privacyModalQuiz && takingQuizId === privacyModalQuiz.id)}
        onClose={() => setPrivacyModalQuiz(null)}
        onConfirmStart={(q) => openQuizWindow(q)}
      />
    </DashboardLayout>
  );
}
