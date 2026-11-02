import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronsDown,
  ChevronsUp,
  Clock3,
  Eye,
  ExternalLink,
  FileQuestion,
  FileText,
  Info,
  LockKeyhole,
  MonitorOff,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { lmsFetch } from '../../lmsApi';
import type { Quiz, Recommendation, ReviewQuestion } from '../../lib/types';
import Button from '../../components/ui/Button';
import QuizDetailsPdfModal from '../../components/ui/QuizDetailsPdfModal';

type QuizResult = {
  score: number;
  max_score: number;
  percentage: number | string;
  cheating_attempts_count?: number;
  recommendation?: Recommendation | null;
  allow_review?: boolean;
  answers?: number[];
  review_questions?: ReviewQuestion[];
};

type IntegrityEventType =
  | 'assessment_tab_hidden'
  | 'assessment_window_blurred'
  | 'developer_tools_shortcut'
  | 'print_shortcut'
  | 'screenshot_shortcut'
  | 'clipboard_action'
  | 'context_menu_prevented';

type Interruption = {
  title: string;
  detail: string;
};

const interruptionCopy: Record<IntegrityEventType, Interruption> = {
  assessment_tab_hidden: {
    title: 'Alt-Tab / Tab Switch Detected',
    detail: 'The assessment window was minimized or you switched to another tab. Alt-tabbing during an active exam is strictly prohibited.',
  },
  assessment_window_blurred: {
    title: 'Focus Lost (Alt-Tab / Window Blur)',
    detail: 'This assessment window lost focus. The screen has been blacked out to prevent unauthorized viewing or capturing.',
  },
  developer_tools_shortcut: {
    title: 'Developer Tools Attempt (F12)',
    detail: 'A browser developer tools or source inspection shortcut was detected. Developer tools are strictly forbidden during examinations.',
  },
  print_shortcut: {
    title: 'Print Attempt Blocked',
    detail: 'A print shortcut was detected. Printing or saving questions as PDF is prohibited.',
  },
  screenshot_shortcut: {
    title: 'Screenshot / Screen Capture Intercepted',
    detail: 'A screenshot or screen capture command (PrintScreen / Snipping Tool) was detected. Screen blacked out and clipboard cleared.',
  },
  clipboard_action: {
    title: 'Copy / Clipboard Action Prohibited',
    detail: 'Copying or cutting text is not permitted during this assessment.',
  },
  context_menu_prevented: {
    title: 'Right-Click Context Menu Prohibited',
    detail: 'Right-clicking and context menus are disabled in the secure exam environment.',
  },
};

function quizWindowCanResume() {
  return !document.hidden && document.hasFocus();
}

function getShortcutEvent(event: KeyboardEvent): IntegrityEventType | null {
  const key = event.key.toLowerCase();
  const primaryModifier = event.ctrlKey || event.metaKey;

  // F12 or DevTools shortcuts (Ctrl+Shift+I, J, C, Ctrl+U)
  if (
    event.key === 'F12'
    || event.code === 'F12'
    || event.keyCode === 123
    || (primaryModifier && event.shiftKey && ['i', 'j', 'c'].includes(key))
    || (event.ctrlKey && key === 'u')
  ) {
    return 'developer_tools_shortcut';
  }

  // PrintScreen key (standard code, key name, or keyCode 44)
  if (event.key === 'PrintScreen' || event.code === 'PrintScreen' || event.keyCode === 44) {
    return 'screenshot_shortcut';
  }

  // Print shortcut
  if (primaryModifier && key === 'p') {
    return 'print_shortcut';
  }

  // Windows Snipping Tool (Win+Shift+S) or Mac screenshot (Cmd+Shift+3,4,5)
  if (
    (event.shiftKey && (event.metaKey || event.ctrlKey) && ['s', '3', '4', '5'].includes(key))
    || (event.altKey && (event.key === 'PrintScreen' || event.keyCode === 44))
  ) {
    return 'screenshot_shortcut';
  }

  // Copy / cut prevention
  if (primaryModifier && ['c', 'x', 'a'].includes(key)) {
    return 'clipboard_action';
  }

  return null;
}

export default function StudentQuizTakePage() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questionOrder, setQuestionOrder] = useState<number[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Anti-cheat state: pitch-black blackout screen
  const [isBlocked, setIsBlocked] = useState(false);
  const [canResume, setCanResume] = useState(false);
  const [interruption, setInterruption] = useState<Interruption | null>(null);
  const [integrityIncidentCount, setIntegrityIncidentCount] = useState(0);
  const [violationsList, setViolationsList] = useState<Array<{ type: string; label: string; timestamp: string }>>([]);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [autoSubmittedByTimer, setAutoSubmittedByTimer] = useState(false);
  const [currentQuestionNum, setCurrentQuestionNum] = useState(1);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const showPdfModalRef = useRef(false);
  const startTimeRef = useRef<string>(new Date().toISOString());
  const lastIntegrityEvent = useRef<{ eventType: IntegrityEventType; occurredAt: number } | null>(null);

  useEffect(() => {
    showPdfModalRef.current = showPdfModal;
  }, [showPdfModal]);

  const reportIntegrityEvent = useCallback((eventType: IntegrityEventType, details: Record<string, unknown>) => {
    if (!quizId) return;

    const now = Date.now();
    const previous = lastIntegrityEvent.current;
    if (previous && previous.eventType === eventType && now - previous.occurredAt < 1200) return;

    lastIntegrityEvent.current = { eventType, occurredAt: now };
    const label = interruptionCopy[eventType]?.title || eventType;

    // Immediately trigger solid blackout screen
    setIsBlocked(true);
    setInterruption(interruptionCopy[eventType]);
    setIntegrityIncidentCount((count) => count + 1);
    setCanResume(quizWindowCanResume());

    // Record violation locally
    setViolationsList((curr) => [
      ...curr,
      {
        type: eventType,
        label,
        timestamp: new Date(now).toISOString(),
      },
    ]);

    // If PrintScreen was attempted, clear clipboard memory
    if (eventType === 'screenshot_shortcut' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText('').catch(() => {});
    }

    // Report in real-time to the server proctoring telemetry
    void lmsFetch(`/student/quizzes/${quizId}/violation`, {
      method: 'POST',
      body: JSON.stringify({
        violation_type: eventType,
        details: `${label} - ${JSON.stringify(details)}`,
      }),
    }).catch(() => undefined);
  }, [quizId]);

  useEffect(() => {
    if (!quizId) {
      setError('This quiz link is invalid.');
      setLoading(false);
      return;
    }

    let mounted = true;
    void lmsFetch<{ quiz: Quiz; attempt: QuizResult | null }>(`/student/quizzes/${quizId}`)
      .then((data) => {
        if (!mounted) return;
        setQuiz(data.quiz);
        const qLen = data.quiz?.questions?.length ?? 0;
        const order = Array.from({ length: qLen }, (_, idx) => idx);
        if (data.quiz?.shuffle_questions && qLen >= 3) {
          for (let i = order.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = order[i];
            order[i] = order[j];
            order[j] = tmp;
          }
        }
        setQuestionOrder(order);
        setResult(data.attempt);
        if (!data.attempt && data.quiz) {
          const limitMins = Number(data.quiz.time_limit_minutes) > 0 ? Number(data.quiz.time_limit_minutes) : 15;
          setTimeLeft(limitMins * 60);
        }
        if (data.attempt?.cheating_attempts_count) {
          setIntegrityIncidentCount(data.attempt.cheating_attempts_count);
        }
      })
      .catch((reason: unknown) => {
        if (mounted) {
          setError(reason instanceof Error ? reason.message : 'The quiz could not be opened.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [quizId]);

  const isAssessmentActive = Boolean(quiz && !result && !loading);

  useEffect(() => {
    if (!isAssessmentActive || timeLeft === null || submitting) return;
    if (timeLeft <= 0) {
      if (!quiz || !quizId) return;
      setSubmitting(true);
      setAutoSubmittedByTimer(true);
      const qCount = quiz.questions?.length ?? 0;
      const paddedAnswers = Array.from({ length: qCount }, (_, idx) => (answers[idx] !== undefined ? answers[idx] : -1));
      void lmsFetch<{ attempt: QuizResult }>(`/student/quizzes/${quizId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          answers: paddedAnswers,
          cheating_attempts_count: integrityIncidentCount,
          violations: violationsList,
          started_at: startTimeRef.current,
        }),
      })
        .then((data) => setResult(data.attempt))
        .catch(() => undefined)
        .finally(() => setSubmitting(false));
      return;
    }

    const timer = window.setInterval(() => {
      setTimeLeft((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isAssessmentActive, timeLeft, submitting, quiz, quizId, answers, integrityIncidentCount, violationsList]);

  // Send real-time progress heartbeats so teachers can monitor Formative quizzes live
  useEffect(() => {
    if (!isAssessmentActive || !quizId || !quiz) return;

    const sendHeartbeat = () => {
      const qCount = quiz.questions?.length ?? 0;
      const normalizedAnswers = Array.from({ length: qCount }, (_, idx) => (answers[idx] !== undefined ? answers[idx] : -1));
      void lmsFetch(`/student/quizzes/${quizId}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          answers: normalizedAnswers,
          current_question: currentQuestionNum,
          time_remaining_seconds: timeLeft,
          cheating_attempts_count: integrityIncidentCount,
        }),
      }).catch(() => undefined);
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 5000);
    return () => window.clearInterval(interval);
  }, [isAssessmentActive, quizId, quiz, answers, currentQuestionNum, integrityIncidentCount]);

  useEffect(() => {
    if (!isAssessmentActive) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab switched or window minimized - immediately blackout
        reportIntegrityEvent('assessment_tab_hidden', { source: 'visibilitychange' });
      } else if (isBlocked) {
        setCanResume(quizWindowCanResume());
      }
    };

    const handleWindowBlur = () => {
      // Do not trigger anti-cheat blur when focus moves into the in-window PDF viewer iframe
      if (showPdfModalRef.current || document.activeElement?.tagName === 'IFRAME') {
        return;
      }
      // Window lost focus (alt-tabbed, clicked other monitor, or opened snipping tool)
      reportIntegrityEvent('assessment_window_blurred', { source: 'window_blur' });
    };

    const handleWindowFocus = () => {
      if (isBlocked) setCanResume(quizWindowCanResume());
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const eventType = getShortcutEvent(event);
      if (!eventType) return;

      event.preventDefault();
      event.stopPropagation();

      // Clear clipboard if screenshot shortcut
      if (eventType === 'screenshot_shortcut' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText('').catch(() => {});
      }

      reportIntegrityEvent(eventType, {
        source: 'keyboard_shortcut',
        key: event.key,
        code: event.code,
      });
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'PrintScreen' || event.code === 'PrintScreen' || event.keyCode === 44) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText('').catch(() => {});
        }
        reportIntegrityEvent('screenshot_shortcut', { source: 'printscreen_keyup' });
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      reportIntegrityEvent('context_menu_prevented', { source: 'context_menu' });
    };

    const handleCopy = (event: ClipboardEvent) => {
      event.preventDefault();
      reportIntegrityEvent('clipboard_action', { source: 'clipboard_copy' });
    };

    const handleBeforePrint = () => {
      reportIntegrityEvent('print_shortcut', { source: 'beforeprint' });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCopy);
    window.addEventListener('beforeprint', handleBeforePrint);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('cut', handleCopy);
      window.removeEventListener('beforeprint', handleBeforePrint);
    };
  }, [isAssessmentActive, isBlocked, reportIntegrityEvent]);

  const handleAnswer = (questionIndex: number, optionIndex: number, displayQuestionNum = questionIndex + 1) => {
    setCurrentQuestionNum(displayQuestionNum);
    setAnswers((current) => {
      const next = [...current];
      next[questionIndex] = optionIndex;
      return next;
    });
  };

  const submitQuiz = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quiz || !quizId || isBlocked) return;

    const questionCount = quiz.questions?.length ?? 0;
    if (answers.length !== questionCount || answers.some((answer) => answer === undefined)) {
      setError('Answer every question before submitting the quiz.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const data = await lmsFetch<{ attempt: QuizResult }>(`/student/quizzes/${quizId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          answers,
          cheating_attempts_count: integrityIncidentCount,
          violations: violationsList,
          started_at: startTimeRef.current,
        }),
      });
      setResult(data.attempt);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Your answers could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  const closeAssessment = () => {
    if (window.opener) {
      window.close();
      return;
    }
    navigate('/student/quizzes');
  };

  const resumeAssessment = () => {
    if (!quizWindowCanResume()) {
      setCanResume(false);
      return;
    }
    setIsBlocked(false);
    setCanResume(false);
  };

  const answeredCount = answers.filter((answer) => answer !== undefined).length;

  if (loading) {
    return (
      <main className="quiz-take-page quiz-take-loading" aria-live="polite">
        <span className="quiz-take-loader" aria-hidden="true" />
        <p>Opening secure assessment window…</p>
      </main>
    );
  }

  if (error && !quiz) {
    return (
      <main className="quiz-take-page quiz-take-message-page">
        <section className="quiz-take-message-card" role="alert">
          <AlertTriangle size={30} aria-hidden="true" />
          <h1>Unable to open assessment</h1>
          <p>{error}</p>
          <Button variant="primary" onClick={closeAssessment}>
            <ChevronLeft size={17} /> Return to My Quizzes
          </Button>
        </section>
      </main>
    );
  }

  if (!quiz) return null;

  if (result) {
    const percentage = Number(result.percentage);
    const incidentTotal = result.cheating_attempts_count ?? integrityIncidentCount;
    return (
      <main className="quiz-take-page">
        <header className="quiz-take-header">
          <div className="quiz-take-brand"><ShieldCheck size={22} /> TCC Assessment</div>
          <Button variant="outline" size="sm" onClick={closeAssessment}>Close Window</Button>
        </header>

        <section className="quiz-result-wrap">
          <div className="quiz-result-card">
            <CheckCircle2 size={42} aria-hidden="true" />
            <p className="quiz-result-eyebrow">
              {autoSubmittedByTimer ? 'Time Limit Reached • Auto-Submitted' : 'Assessment submitted'}
            </p>
            <h1>{quiz.title}</h1>
            {autoSubmittedByTimer && (
              <div
                style={{
                  margin: '0.6rem auto 0.9rem',
                  padding: '0.55rem 0.95rem',
                  borderRadius: '8px',
                  background: 'rgba(245, 158, 11, 0.16)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  color: '#fde68a',
                  fontSize: '0.84rem',
                  maxWidth: '460px',
                }}
              >
                ⏰ The countdown timer reached zero. Your answered questions were automatically submitted and recorded.
              </div>
            )}
            <div className="quiz-result-score">
              <strong>{result.score}</strong>
              <span>/ {result.max_score}</span>
            </div>
            <span className={`quiz-result-percentage ${percentage >= 75 ? 'is-passing' : ''}`}>
              {percentage.toFixed(0)}%
            </span>

            {incidentTotal > 0 ? (
              <div 
                style={{
                  margin: '1.25rem auto 0',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  background: 'rgba(244, 67, 54, 0.15)',
                  border: '1px solid rgba(244, 67, 54, 0.35)',
                  color: '#ff8a80',
                  fontSize: '0.85rem',
                  maxWidth: '450px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  textAlign: 'left',
                }}
              >
                <ShieldAlert size={22} style={{ flexShrink: 0 }} />
                <div>
                  <strong>Proctoring Notice:</strong> {incidentTotal} focus/anti-cheat violation{incidentTotal === 1 ? '' : 's'} recorded and submitted to your teacher.
                </div>
              </div>
            ) : (
              <div 
                style={{
                  margin: '1.25rem auto 0',
                  padding: '0.6rem 1rem',
                  borderRadius: '8px',
                  background: 'rgba(76, 175, 80, 0.15)',
                  border: '1px solid rgba(76, 175, 80, 0.35)',
                  color: '#a5d6a7',
                  fontSize: '0.85rem',
                  maxWidth: '400px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                <ShieldCheck size={18} />
                <span>Clean Academic Record: 0 proctoring violations recorded.</span>
              </div>
            )}
          </div>

          {(quiz.allow_review || result.allow_review) && Array.isArray(result.review_questions) && result.review_questions.length > 0 && (
            <section
              className="quiz-recommendation-card"
              style={{ marginTop: '1.25rem' }}
            >
              <div className="quiz-recommendation-heading">
                <CheckCircle2 size={22} />
                <div>
                  <span>Answer Key & Item Review</span>
                  <h2>Review Your Quiz Questions & Answers ({result.review_questions.length})</h2>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.75rem' }}>
                {result.review_questions.map((item, idx) => {
                  const unanswered = item.student_answer < 0;
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '1rem 1.15rem',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: item.is_correct
                          ? '1px solid rgba(76, 175, 80, 0.4)'
                          : '1px solid rgba(239, 83, 80, 0.35)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.65rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 700, color: 'white', fontSize: '0.96rem', flex: 1 }}>
                          {idx + 1}. {item.prompt}
                        </div>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.6rem',
                            borderRadius: '999px',
                            background: item.is_correct
                              ? 'rgba(76, 175, 80, 0.2)'
                              : unanswered
                                ? 'rgba(245, 158, 11, 0.2)'
                                : 'rgba(239, 83, 80, 0.2)',
                            color: item.is_correct
                              ? '#a5d6a7'
                              : unanswered
                                ? '#fde68a'
                                : '#ff8a80',
                            border: item.is_correct
                              ? '1px solid rgba(76, 175, 80, 0.45)'
                              : unanswered
                                ? '1px solid rgba(245, 158, 11, 0.45)'
                                : '1px solid rgba(239, 83, 80, 0.45)',
                          }}
                        >
                          {item.is_correct ? `✓ Correct (+${item.points} pt)` : unanswered ? 'Unanswered (0 pt)' : '✗ Incorrect (0 pt)'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {item.options.map((opt, optIdx) => {
                          const isCorrectChoice = optIdx === item.correct_index;
                          const isStudentChoice = optIdx === item.student_answer;
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
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {result.recommendation && (
            <section className="quiz-recommendation-card">
              <div className="quiz-recommendation-heading"><Sparkles size={22} /><div><span>Personalized study plan</span><h2>What to work on next</h2></div></div>
              <p>{result.recommendation.summary}</p>
              {result.recommendation.focus_topics?.length > 0 && (
                <div>
                  <h3>Focus topics</h3>
                  <div className="quiz-topic-tags">
                    {result.recommendation.focus_topics.map((topic) => <span key={topic}>{topic}</span>)}
                  </div>
                </div>
              )}
              {result.recommendation.action_steps?.length > 0 && (
                <div>
                  <h3>Suggested steps</h3>
                  <ol>{result.recommendation.action_steps.map((step) => <li key={step}>{step}</li>)}</ol>
                </div>
              )}
              {result.recommendation.references && result.recommendation.references.length > 0 && (
                <div style={{ marginTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.25rem' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <ExternalLink size={16} /> Study References & Learning Materials
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                    {result.recommendation.references.map((ref, i) => (
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
                          borderRadius: '8px',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          textDecoration: 'none',
                          transition: 'all 0.2s',
                          color: 'white',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.15)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                      >
                        <div style={{ background: 'rgba(139,92,246,0.6)', padding: '0.35rem', borderRadius: '6px', flexShrink: 0, marginTop: '0.1rem' }}>
                          <ExternalLink size={14} style={{ color: 'white' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#c4b5fd' }}>{ref.title}</div>
                          {ref.description && (
                            <div style={{ fontSize: '0.8rem', color: '#a0aec0', marginTop: '0.15rem', lineHeight: 1.4 }}>{ref.description}</div>
                          )}
                          {ref.source_name && (
                            <div style={{ fontSize: '0.72rem', color: '#718096', marginTop: '0.2rem' }}>Source: {ref.source_name}</div>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </section>
      </main>
    );
  }

  return (
    <main 
      className="quiz-take-page" 
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <header className="quiz-take-header">
        <div className="quiz-take-brand"><ShieldCheck size={22} /> TCC Assessment</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {timeLeft !== null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.75rem', borderRadius: '999px', background: timeLeft < 60 ? 'rgba(239, 83, 80, 0.25)' : 'rgba(255, 255, 255, 0.08)', border: `1px solid ${timeLeft < 60 ? '#ef5350' : 'rgba(255,255,255,0.14)'}`, color: timeLeft < 60 ? '#ff8a80' : '#fbbf24', fontWeight: 800, fontFamily: 'monospace', fontSize: '0.95rem' }}>
              <Clock3 size={16} />
              <span>{Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
            </div>
          )}
          <div className="quiz-take-status"><span aria-hidden="true" /> Proctoring active (Anti-Cheat)</div>
        </div>
        <Button variant="outline" size="sm" onClick={closeAssessment}>Exit Assessment</Button>
      </header>

      {/* When isBlocked is true, completely hide the quiz questions so nothing can be seen or captured */}
      <div 
        className="quiz-take-shell"
        style={{ display: isBlocked ? 'none' : 'grid' }}
      >
        <aside className="quiz-take-sidebar">
          <div className="quiz-take-subject">{quiz.subject}</div>
          <h1>{quiz.title}</h1>
          {quiz.topic && quiz.topic.trim().toLowerCase() !== quiz.title.trim().toLowerCase() && (
            <p>{quiz.topic}</p>
          )}
          <div className="quiz-progress-block">
            <div><span>Progress</span><strong>{answeredCount} / {quiz.questions?.length ?? 0}</strong></div>
            <div className="quiz-progress-track"><span style={{ width: `${(answeredCount / Math.max(quiz.questions?.length ?? 1, 1)) * 100}%` }} /></div>
          </div>

          <button
            type="button"
            onClick={() => setShowPdfModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              width: '100%',
              textAlign: 'left',
              background: quiz.reference_pdf_name ? 'rgba(139, 92, 246, 0.16)' : 'rgba(255, 255, 255, 0.05)',
              border: quiz.reference_pdf_name ? '1px solid rgba(139, 92, 246, 0.42)' : '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: '10px',
              padding: '0.7rem 0.85rem',
              marginBottom: '0.9rem',
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <FileText size={18} style={{ color: quiz.reference_pdf_name ? '#c4b5fd' : '#93c5fd', flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '0.7rem', color: quiz.reference_pdf_name ? '#c4b5fd' : '#93c5fd', textTransform: 'uppercase', fontWeight: 700 }}>
                {quiz.reference_pdf_name ? 'Attached PDF Handout' : 'Quiz Details & Instructions'}
              </div>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {quiz.reference_pdf_name || 'View Instructions & Details'}
              </div>
            </div>
          </button>

          <div className="quiz-integrity-info">
            <LockKeyhole size={19} aria-hidden="true" />
            <div>
              <strong>Anti-Cheat Active</strong>
              <p>Keep this window focused. Alt-tabbing, taking screenshots, or opening developer tools will black out the screen and be recorded.</p>
            </div>
          </div>
          <p className="quiz-integrity-limit">Anti-cheat shield turns screen black on blur or screenshot attempts.</p>
        </aside>

        <section className="quiz-question-area">
          <div className="quiz-question-heading">
            <div>
              <p className="quiz-result-eyebrow">Secure Assessment Window</p>
              <h2>Answer each question</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {quiz.reference_pdf_name && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPdfModal(true)}
                  style={{
                    borderColor: 'rgba(139, 92, 246, 0.5)',
                    background: 'rgba(139, 92, 246, 0.16)',
                    color: '#ddd6fe',
                  }}
                >
                  <FileText size={15} /> View PDF Handout
                </Button>
              )}
              <div className="quiz-question-count"><FileQuestion size={18} /> {quiz.questions?.length ?? 0} questions</div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
                title="Direct Scroll to Bottom"
              >
                <ChevronsDown size={15} /> Scroll to Bottom
              </Button>
            </div>
          </div>

          {quiz.instructions && (
            <div
              className="quiz-instructions"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: '240px' }}>
                <div style={{ fontSize: '0.72rem', color: '#93c5fd', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Info size={13} /> Instructions for Students
                </div>
                <div>{quiz.instructions}</div>
              </div>
              {quiz.reference_pdf_name && (
                <button
                  type="button"
                  onClick={() => setShowPdfModal(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    padding: '0.5rem 0.9rem',
                    borderRadius: '8px',
                    background: 'rgba(139, 92, 246, 0.24)',
                    border: '1px solid rgba(139, 92, 246, 0.5)',
                    color: '#ede9fe',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <FileText size={15} /> Open Attached PDF ({quiz.reference_pdf_name})
                </button>
              )}
            </div>
          )}
          {error && <div className="quiz-inline-error" role="alert"><AlertTriangle size={18} /> {error}</div>}

          <form onSubmit={submitQuiz} className="quiz-question-form">
            {(questionOrder.length > 0 ? questionOrder : (quiz.questions?.map((_, idx) => idx) ?? [])).map((originalIndex, displayIndex) => {
              const question = quiz.questions?.[originalIndex];
              if (!question) return null;
              return (
                <fieldset key={originalIndex} className="quiz-question-card">
                  <legend><span>{displayIndex + 1}</span>{question.prompt}</legend>
                  <div className="quiz-options">
                    {question.options.map((option, optionIndex) => {
                      const selected = answers[originalIndex] === optionIndex;
                      return (
                        <label className={`quiz-option ${selected ? 'is-selected' : ''}`} key={optionIndex}>
                          <input
                            type="radio"
                            name={`question-${originalIndex}`}
                            checked={selected}
                            onChange={() => handleAnswer(originalIndex, optionIndex, displayIndex + 1)}
                          />
                          <span className="quiz-option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                          <span>{option}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
            <div className="quiz-submit-row">
              <span><Clock3 size={17} /> Review your answers before submitting.</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  title="Direct Scroll to Top"
                >
                  <ChevronsUp size={15} /> Scroll to Top
                </Button>
                <Button variant="accent" size="lg" type="submit" disabled={submitting || isBlocked}>
                  <Send size={18} /> {submitting ? 'Submitting…' : 'Submit Assessment'}
                </Button>
              </div>
            </div>
          </form>
        </section>
      </div>

      {/* FULL BLACKOUT SCREEN: PITCH BLACK OVERLAY COVERING 100% OF THE VIEWPORT */}
      {isBlocked && (
        <div 
          className="quiz-integrity-overlay" 
          role="alertdialog" 
          aria-modal="true" 
          aria-labelledby="quiz-integrity-title"
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: '#000000',
            zIndex: 99999999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center',
            color: 'white',
          }}
        >
          <div 
            style={{ 
              background: 'rgba(239, 83, 80, 0.18)', 
              border: '2px solid #ef5350', 
              borderRadius: '50%', 
              padding: '1.25rem', 
              marginBottom: '1.25rem', 
              color: '#ff5252' 
            }}
          >
            <MonitorOff size={60} aria-hidden="true" />
          </div>

          <span style={{ fontSize: '0.82rem', color: '#ff8a80', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase' }}>
            BLACKOUT SHIELD ACTIVE • ANTI-CHEAT ENGAGED
          </span>

          <h1 id="quiz-integrity-title" style={{ fontSize: '2rem', fontWeight: 800, color: 'white', margin: '0.65rem 0' }}>
            {interruption?.title || 'Screen Blacked Out'}
          </h1>

          <p style={{ maxWidth: '520px', color: '#cfd8dc', fontSize: '1.05rem', lineHeight: 1.6, margin: '0 0 1.25rem' }}>
            {interruption?.detail || 'Screen display was blacked out to prevent cheating. Alt-tabbing, switching windows, capturing screenshots, or developer tools are strictly prohibited.'}
          </p>

          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '0.75rem 1.5rem', marginBottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.75rem', color: '#b0bec5', textTransform: 'uppercase', fontWeight: 600 }}>Proctoring Telemetry</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ff5252' }}>
                ⚠️ Violation #{integrityIncidentCount} Logged
              </div>
            </div>
            <div style={{ height: '32px', width: '1px', background: 'rgba(255,255,255,0.15)' }} />
            <div style={{ fontSize: '0.82rem', color: '#b0bec5', textAlign: 'left' }}>
              Transmitted to Subject Teacher & Dean
            </div>
          </div>

          <Button 
            variant="primary" 
            size="lg" 
            onClick={resumeAssessment} 
            disabled={!canResume}
            style={{ minWidth: '220px', padding: '0.85rem 1.75rem' }}
          >
            <Eye size={18} /> {canResume ? 'Resume Assessment' : 'Click Window to Focus First'}
          </Button>

          <p style={{ marginTop: '1.25rem', color: '#78909c', fontSize: '0.8rem' }}>
            Keep this window active and focused at all times to avoid further penalties.
          </p>
        </div>
      )}
      {showPdfModal && !isBlocked && (
        <QuizDetailsPdfModal
          quiz={quiz}
          onClose={() => setShowPdfModal(false)}
          inAssessmentWindow
        />
      )}
    </main>
  );
}
