import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  ExternalLink,
  FileQuestion,
  FileText,
  Info,
  Lock,
  LockKeyhole,
  MonitorOff,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { lmsFetch, getLmsUser } from '../../lmsApi';
import type { Question, Quiz, Recommendation, ReviewQuestion, StudentAnswerValue } from '../../lib/types';
import Button from '../../components/ui/Button';
import QuizDetailsPdfModal from '../../components/ui/QuizDetailsPdfModal';
import { useToastContext } from '../../contexts/ToastContext';

type QuizResult = {
  score: number;
  max_score: number;
  percentage: number | string;
  cheating_attempts_count?: number;
  recommendation?: Recommendation | null;
  allow_review?: boolean;
  answers?: StudentAnswerValue[];
  review_questions?: ReviewQuestion[];
};

function isAnswerProvided(ans: StudentAnswerValue | undefined, question?: Question): boolean {
  if (ans === undefined || ans === null) return false;
  const qType = question?.type || 'multiple_choice';
  if (qType === 'identification' || qType === 'essay') {
    return typeof ans === 'string' && ans.trim().length > 0;
  }
  if (qType === 'multiple_answer') {
    return Array.isArray(ans) && ans.length > 0;
  }
  return typeof ans === 'number' && ans >= 0;
}

function normalizeDefaultUnanswered(question?: Question): StudentAnswerValue {
  const qType = question?.type || 'multiple_choice';
  if (qType === 'identification' || qType === 'essay') return '';
  if (qType === 'multiple_answer') return [];
  return -1;
}

type IntegrityEventType =
  | 'assessment_tab_hidden'
  | 'assessment_window_blurred'
  | 'fullscreen_exited'
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
  fullscreen_exited: {
    title: 'Full-Screen Exam Lock Exited',
    detail: 'You exited full-screen examination mode. Assessments must remain in full-screen lock at all times to prevent alt-tabbing or cheating.',
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

function detectDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Desktop Browser';
  const ua = navigator.userAgent || '';
  const os = /Windows/i.test(ua)
    ? 'Windows PC'
    : /Android/i.test(ua)
      ? 'Android Device'
      : /iPhone|iPad|iPod/i.test(ua)
        ? 'iOS Device'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'Mac'
          : /Linux/i.test(ua)
            ? 'Linux PC'
            : 'Device';
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /Chrome\//i.test(ua)
      ? 'Chrome'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : 'Browser';
  return `${os} • ${browser}`;
}

async function enterExamFullscreen(): Promise<boolean> {
  try {
    const docEl = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    if (!document.fullscreenElement) {
      if (typeof docEl.requestFullscreen === 'function') {
        await docEl.requestFullscreen();
      } else if (typeof docEl.webkitRequestFullscreen === 'function') {
        await docEl.webkitRequestFullscreen();
      }
    }
    const navWithKeyboard = navigator as Navigator & {
      keyboard?: { lock?: (keys?: string[]) => Promise<void> };
    };
    await navWithKeyboard.keyboard?.lock?.(['Escape', 'F11']).catch(() => {});
    return Boolean(document.fullscreenElement);
  } catch {
    return Boolean(document.fullscreenElement);
  }
}

function exitExamFullscreen(): void {
  try {
    const navWithKeyboard = navigator as Navigator & {
      keyboard?: { unlock?: () => void };
    };
    navWithKeyboard.keyboard?.unlock?.();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  } catch {
    // Non-blocking
  }
}

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

  // Copy / cut prevention (allow Ctrl+A inside text inputs/textareas for identification & essay questions)
  const targetTag = (event.target as HTMLElement | null)?.tagName;
  const isTextInput = targetTag === 'INPUT' || targetTag === 'TEXTAREA';
  if (primaryModifier && (['c', 'x'].includes(key) || (key === 'a' && !isTextInput))) {
    return 'clipboard_action';
  }

  return null;
}

export default function StudentQuizTakePage() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questionOrder, setQuestionOrder] = useState<number[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [answers, setAnswers] = useState<StudentAnswerValue[]>([]);
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
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => (
    typeof document !== 'undefined' && Boolean(document.fullscreenElement)
  ));
  const hasEnteredFullscreenRef = useRef<boolean>(
    typeof document !== 'undefined' && Boolean(document.fullscreenElement)
  );
  const cursorPosRef = useRef<{ x: number; y: number }>({ x: 50, y: 35 });
  const cursorTrailRef = useRef<Array<{ x: number; y: number }>>([]);
  const hoveredElementRef = useRef<string | null>(null);
  const scrollPctRef = useRef<number>(0);
  const deviceLabelRef = useRef<string>(detectDeviceLabel());
  const timeLeftRef = useRef<number | null>(null);
  const showPdfModalRef = useRef(false);
  const startTimeRef = useRef<string>(new Date().toISOString());
  const lastIntegrityEvent = useRef<{ eventType: IntegrityEventType; occurredAt: number } | null>(null);

  useEffect(() => {
    showPdfModalRef.current = showPdfModal;
  }, [showPdfModal]);

  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

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
    showToast(`Security Warning: ${label}`, 'warning');

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
        if (data.quiz?.id) {
          try {
            const currentUser = getLmsUser();
            const key = `lms_locked_quizzes_${currentUser?.id ?? 'student'}`;
            const raw = localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : [];
            const list = Array.isArray(parsed) ? parsed.map((id) => Number(id)).filter((id) => id > 0) : [];
            if (!list.includes(data.quiz.id)) {
              list.push(data.quiz.id);
              localStorage.setItem(key, JSON.stringify(list));
            }
          } catch {
            // Ignore storage errors
          }
        }
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

  // Automatically enter fullscreen when assessment starts, and exit fullscreen when finished
  useEffect(() => {
    if (isAssessmentActive) {
      void enterExamFullscreen().then((entered) => {
        if (entered) {
          hasEnteredFullscreenRef.current = true;
          setIsFullscreen(true);
        } else {
          setIsFullscreen(Boolean(document.fullscreenElement));
        }
      });
    } else if (result) {
      exitExamFullscreen();
    }
  }, [isAssessmentActive, result]);

  // Track student cursor coordinates, cursor trail, hovered element, scroll position, and fullscreen lock changes
  useEffect(() => {
    if (!isAssessmentActive) return;

    let lastTrailTime = 0;

    const handleMouseMove = (event: MouseEvent) => {
      const vw = Math.max(window.innerWidth, 1);
      const vh = Math.max(window.innerHeight, 1);
      const x = Number(Math.max(0, Math.min(100, (event.clientX / vw) * 100)).toFixed(1));
      const y = Number(Math.max(0, Math.min(100, (event.clientY / vh) * 100)).toFixed(1));
      cursorPosRef.current = { x, y };

      const now = Date.now();
      if (now - lastTrailTime > 110) {
        lastTrailTime = now;
        cursorTrailRef.current = [...cursorTrailRef.current.slice(-7), { x, y }];
      }

      const target = event.target as HTMLElement | null;
      const labeledEl = target?.closest?.('[data-proctor-label]');
      hoveredElementRef.current = labeledEl ? labeledEl.getAttribute('data-proctor-label') : null;
    };

    const handleScroll = () => {
      const docHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const pct = Number(Math.max(0, Math.min(100, (window.scrollY / docHeight) * 100)).toFixed(1));
      scrollPctRef.current = pct;
    };

    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (active) {
        hasEnteredFullscreenRef.current = true;
      } else if (hasEnteredFullscreenRef.current) {
        reportIntegrityEvent('fullscreen_exited', { source: 'fullscreenchange' });
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isAssessmentActive, reportIntegrityEvent]);

  useEffect(() => {
    if (!isAssessmentActive || timeLeft === null || submitting) return;
    if (timeLeft <= 0) {
      if (!quiz || !quizId) return;
      setSubmitting(true);
      setAutoSubmittedByTimer(true);
      const qCount = quiz.questions?.length ?? 0;
      const paddedAnswers = Array.from({ length: qCount }, (_, idx) =>
        isAnswerProvided(answers[idx], quiz.questions?.[idx])
          ? answers[idx]
          : normalizeDefaultUnanswered(quiz.questions?.[idx])
      );
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

  // Send real-time progress, device, cursor, and answer heartbeats (1.5s) so teachers can monitor live
  useEffect(() => {
    if (!isAssessmentActive || !quizId || !quiz) return;

    const sendHeartbeat = () => {
      const qCount = quiz.questions?.length ?? 0;
      const normalizedAnswers = Array.from({ length: qCount }, (_, idx) =>
        isAnswerProvided(answers[idx], quiz.questions?.[idx])
          ? answers[idx]
          : normalizeDefaultUnanswered(quiz.questions?.[idx])
      );
      void lmsFetch(`/student/quizzes/${quizId}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          answers: normalizedAnswers,
          question_order: questionOrder,
          current_question: currentQuestionNum,
          time_remaining_seconds: timeLeftRef.current,
          cheating_attempts_count: integrityIncidentCount,
          cursor_x: cursorPosRef.current.x,
          cursor_y: cursorPosRef.current.y,
          cursor_trail: cursorTrailRef.current,
          hovered_element: hoveredElementRef.current,
          scroll_y_pct: scrollPctRef.current,
          device_label: deviceLabelRef.current,
          viewport_width: typeof window !== 'undefined' ? window.innerWidth : 1920,
          viewport_height: typeof window !== 'undefined' ? window.innerHeight : 1080,
          is_fullscreen: typeof document !== 'undefined' && Boolean(document.fullscreenElement),
          is_blocked: isBlocked,
          interruption_title: isBlocked ? (interruption?.title ?? 'Screen Blacked Out') : null,
        }),
      }).catch(() => undefined);
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 1500);
    return () => window.clearInterval(interval);
  }, [
    isAssessmentActive,
    quizId,
    quiz,
    answers,
    questionOrder,
    currentQuestionNum,
    integrityIncidentCount,
    isBlocked,
    isFullscreen,
    interruption,
  ]);

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

  const handleAnswer = (questionIndex: number, value: StudentAnswerValue, displayQuestionNum = questionIndex + 1) => {
    setCurrentQuestionNum(displayQuestionNum);
    setError(null);
    setAnswers((current) => {
      const next = [...current];
      next[questionIndex] = value;
      return next;
    });
    if (typeof value === 'number') {
      showToast(`Question #${displayQuestionNum} answer selected.`, 'info');
    }
  };

  const handleToggleMultiAnswer = (questionIndex: number, optionIndex: number, displayQuestionNum = questionIndex + 1) => {
    setCurrentQuestionNum(displayQuestionNum);
    setError(null);
    setAnswers((current) => {
      const next = [...current];
      const existing = Array.isArray(next[questionIndex]) ? [...(next[questionIndex] as number[])] : [];
      const pos = existing.indexOf(optionIndex);
      if (pos >= 0) {
        existing.splice(pos, 1);
      } else {
        existing.push(optionIndex);
      }
      existing.sort((a, b) => a - b);
      next[questionIndex] = existing;
      return next;
    });
    showToast(`Question #${displayQuestionNum} options updated.`, 'info');
  };

  const submitQuiz = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quiz || !quizId || isBlocked) return;

    const questions = quiz.questions ?? [];
    const questionCount = questions.length;
    const hasUnanswered = questions.some((q, idx) => !isAnswerProvided(answers[idx], q));
    if (hasUnanswered) {
      const msg = 'Answer every question before submitting the quiz.';
      setError(msg);
      showToast(msg, 'warning');
      return;
    }

    const normalizedAnswers = Array.from({ length: questionCount }, (_, idx) =>
      isAnswerProvided(answers[idx], questions[idx])
        ? answers[idx]
        : normalizeDefaultUnanswered(questions[idx])
    );

    setSubmitting(true);
    setError(null);
    try {
      const data = await lmsFetch<{ attempt: QuizResult }>(`/student/quizzes/${quizId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          answers: normalizedAnswers,
          cheating_attempts_count: integrityIncidentCount,
          violations: violationsList,
          started_at: startTimeRef.current,
        }),
      });
      setResult(data.attempt);
      showToast(`Assessment submitted! Score: ${data.attempt.score}/${data.attempt.max_score}`, 'success');
    } catch (reason: unknown) {
      const msg = reason instanceof Error ? reason.message : 'Your answers could not be submitted.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const closeAssessment = () => {
    if (isAssessmentActive && quiz && quizId && !result && !submitting) {
      const qCount = quiz.questions?.length ?? 0;
      const paddedAnswers = Array.from({ length: qCount }, (_, idx) =>
        isAnswerProvided(answers[idx], quiz.questions?.[idx])
          ? answers[idx]
          : normalizeDefaultUnanswered(quiz.questions?.[idx])
      );
      void lmsFetch(`/student/quizzes/${quizId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          answers: paddedAnswers,
          cheating_attempts_count: integrityIncidentCount,
          violations: violationsList,
          started_at: startTimeRef.current,
        }),
      }).catch(() => undefined);
    }
    exitExamFullscreen();
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
    void enterExamFullscreen().then((entered) => {
      if (entered) {
        hasEnteredFullscreenRef.current = true;
      }
      setIsFullscreen(Boolean(document.fullscreenElement));
      setIsBlocked(false);
      setCanResume(false);
    });
  };

  const answeredCount = (quiz?.questions ?? []).filter((q, idx) => isAnswerProvided(answers[idx], q)).length;

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
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.72rem', color: '#c4b5fd', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.2rem' }}>
                            {typeLabelMap[qType] || 'Question'}
                          </div>
                          <div style={{ fontWeight: 700, color: 'white', fontSize: '0.96rem' }}>
                            {idx + 1}. {item.prompt}
                          </div>
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
            </section>
          )}

          {Number(result.score) >= Number(result.max_score) && Number(result.max_score) > 0 ? (
            <section
              className="quiz-recommendation-card"
              style={{
                borderColor: 'rgba(76, 175, 80, 0.45)',
                background: 'linear-gradient(180deg, rgba(76, 175, 80, 0.14), rgba(16, 185, 129, 0.06))',
              }}
            >
              <div className="quiz-recommendation-heading">
                <CheckCircle2 size={24} style={{ color: '#a5d6a7' }} />
                <div>
                  <span style={{ color: '#a5d6a7' }}>Perfect Score Achieved • 100% Mastery</span>
                  <h2>No Further Improvement Needed</h2>
                </div>
              </div>
              <p style={{ color: '#e8f5e9', margin: 0 }}>
                Outstanding work! You answered every question correctly on this assessment. Because you achieved a perfect score, no additional study improvements or external reference links are required.
              </p>
            </section>
          ) : result.recommendation ? (
            <section className="quiz-recommendation-card">
              <div className="quiz-recommendation-heading">
                <Sparkles size={22} />
                <div>
                  <span>
                    {quiz.reference_pdf_name
                      ? `Learning Ideas Based on Attached PDF (${quiz.reference_pdf_name})`
                      : 'Personalized Study Plan'}
                  </span>
                  <h2>
                    {quiz.reference_pdf_name
                      ? "What to Review from Your Instructor's PDF Handout"
                      : 'What to work on next'}
                  </h2>
                </div>
              </div>
              <p>{result.recommendation.summary}</p>
              {result.recommendation.focus_topics?.length > 0 && (
                <div>
                  <h3>{quiz.reference_pdf_name ? 'Missed Concepts from Attached PDF' : 'Focus topics'}</h3>
                  <div className="quiz-topic-tags">
                    {result.recommendation.focus_topics.map((topic) => <span key={topic}>{topic}</span>)}
                  </div>
                </div>
              )}
              {result.recommendation.action_steps?.length > 0 && (
                <div>
                  <h3>
                    {quiz.reference_pdf_name
                      ? `Learning Ideas from ${quiz.reference_pdf_name}`
                      : 'Suggested steps'}
                  </h3>
                  <ol>{result.recommendation.action_steps.map((step) => <li key={step}>{step}</li>)}</ol>
                </div>
              )}
              {quiz.reference_pdf_name ? (
                <div style={{ marginTop: '1.1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.1rem' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
                    <FileText size={16} /> Instructor&apos;s Attached Reference PDF
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowPdfModal(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      textAlign: 'left',
                      gap: '0.75rem',
                      padding: '0.85rem 1.05rem',
                      borderRadius: '10px',
                      background: 'rgba(139, 92, 246, 0.16)',
                      border: '1px solid rgba(139, 92, 246, 0.45)',
                      color: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                      <div style={{ background: 'rgba(139, 92, 246, 0.55)', padding: '0.45rem', borderRadius: '8px', flexShrink: 0 }}>
                        <FileText size={16} style={{ color: 'white' }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#ddd6fe' }}>
                          {quiz.reference_pdf_name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.15rem' }}>
                          Click to open and review the instructor&apos;s attached PDF handout for the questions you missed.
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c4b5fd', textDecoration: 'underline', flexShrink: 0 }}>
                      Open PDF Handout
                    </span>
                  </button>
                </div>
              ) : (
                result.recommendation.references && result.recommendation.references.length > 0 && (
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
                )
              )}
            </section>
          ) : null}
        </section>

        {showPdfModal && (
          <QuizDetailsPdfModal
            quiz={quiz}
            onClose={() => setShowPdfModal(false)}
            inAssessmentWindow
          />
        )}
      </main>
    );
  }

  const orderedIndices =
    questionOrder.length > 0
      ? questionOrder
      : (quiz.questions?.map((_, idx) => idx) ?? []);
  const totalQuestions = orderedIndices.length;
  const activeStepIndex =
    totalQuestions > 0
      ? Math.max(0, Math.min(totalQuestions - 1, currentQuestionNum - 1))
      : 0;

  let firstUnansweredDisplayIdx = totalQuestions;
  for (let i = 0; i < totalQuestions; i += 1) {
    const origIdx = orderedIndices[i];
    const q = quiz.questions?.[origIdx];
    if (!isAnswerProvided(answers[origIdx], q)) {
      firstUnansweredDisplayIdx = i;
      break;
    }
  }

  const maxUnlockedDisplayIdx =
    totalQuestions > 0
      ? Math.min(totalQuestions - 1, firstUnansweredDisplayIdx)
      : 0;
  const activeOriginalIndex = orderedIndices[activeStepIndex] ?? 0;
  const activeQuestion = quiz.questions?.[activeOriginalIndex];
  const isCurrentQuestionAnswered = activeQuestion
    ? isAnswerProvided(answers[activeOriginalIndex], activeQuestion)
    : false;
  const isLastQuestion = activeStepIndex >= totalQuestions - 1;
  const allQuestionsAnswered =
    totalQuestions > 0 && firstUnansweredDisplayIdx >= totalQuestions;

  const goToQuestionStep = (targetDisplayIdx: number) => {
    if (targetDisplayIdx < 0 || targetDisplayIdx >= totalQuestions) return;
    if (targetDisplayIdx > maxUnlockedDisplayIdx) {
      const requiredNum = firstUnansweredDisplayIdx + 1;
      const msg = `Please answer Question ${requiredNum} first before moving to Question ${targetDisplayIdx + 1}.`;
      setError(msg);
      showToast(msg, 'warning');
      return;
    }
    setError(null);
    setCurrentQuestionNum(targetDisplayIdx + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToPreviousQuestion = () => {
    if (activeStepIndex > 0) {
      goToQuestionStep(activeStepIndex - 1);
    }
  };

  const goToNextQuestion = () => {
    if (!isCurrentQuestionAnswered) {
      const msg = `Please answer Question ${activeStepIndex + 1} first before moving to Question ${activeStepIndex + 2}.`;
      setError(msg);
      showToast(msg, 'warning');
      return;
    }
    if (activeStepIndex < totalQuestions - 1) {
      setError(null);
      setCurrentQuestionNum(activeStepIndex + 2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <main 
      className="quiz-take-page" 
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <header className="quiz-take-header">
        <div className="quiz-take-brand"><ShieldCheck size={22} /> TCC Assessment</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          {timeLeft !== null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.75rem', borderRadius: '999px', background: timeLeft < 60 ? 'rgba(239, 83, 80, 0.25)' : 'rgba(255, 255, 255, 0.08)', border: `1px solid ${timeLeft < 60 ? '#ef5350' : 'rgba(255,255,255,0.14)'}`, color: timeLeft < 60 ? '#ff8a80' : '#fbbf24', fontWeight: 800, fontFamily: 'monospace', fontSize: '0.95rem' }}>
              <Clock3 size={16} />
              <span>{Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
            </div>
          )}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.32rem 0.75rem',
              borderRadius: '999px',
              background: isFullscreen ? 'rgba(76, 175, 80, 0.2)' : 'rgba(245, 158, 11, 0.2)',
              border: `1px solid ${isFullscreen ? 'rgba(76, 175, 80, 0.45)' : 'rgba(245, 158, 11, 0.45)'}`,
              color: isFullscreen ? '#a5d6a7' : '#fde68a',
              fontSize: '0.78rem',
              fontWeight: 700,
            }}
          >
            <LockKeyhole size={14} />
            <span>{isFullscreen ? 'Full-Screen Exam Lock Active' : 'Full-Screen Lock Required'}</span>
          </div>
          <div className="quiz-take-status"><span aria-hidden="true" /> Proctoring active (Anti-Cheat)</div>
        </div>
        <Button variant="outline" size="sm" onClick={closeAssessment}>Exit Assessment</Button>
      </header>

      {/* When isBlocked is true or Fullscreen Lock is not active, hide the quiz questions */}
      <div 
        className="quiz-take-shell"
        style={{ display: isBlocked || !isFullscreen ? 'none' : 'grid' }}
      >
        <aside className="quiz-take-sidebar">
          <div className="quiz-take-subject">{quiz.subject}</div>
          <h1>{quiz.title}</h1>
          {quiz.topic && quiz.topic.trim().toLowerCase() !== quiz.title.trim().toLowerCase() && (
            <p>{quiz.topic}</p>
          )}
          <div className="quiz-progress-block">
            <div><span>Progress</span><strong>{answeredCount} / {totalQuestions}</strong></div>
            <div className="quiz-progress-track"><span style={{ width: `${(answeredCount / Math.max(totalQuestions, 1)) * 100}%` }} /></div>
          </div>

          {totalQuestions > 0 && (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '0.7rem 0.75rem',
                marginBottom: '0.9rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  color: '#cbd5e1',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>Question Lock Sequence</span>
                <span style={{ color: '#c4b5fd' }}>Q{activeStepIndex + 1} / Q{totalQuestions}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(42px, 1fr))', gap: '0.4rem' }}>
                {orderedIndices.map((origIdx, dispIdx) => {
                  const qItem = quiz.questions?.[origIdx];
                  const isAnswered = isAnswerProvided(answers[origIdx], qItem);
                  const isCurrent = dispIdx === activeStepIndex;
                  const isLocked = dispIdx > maxUnlockedDisplayIdx;
                  return (
                    <button
                      key={origIdx}
                      type="button"
                      data-proctor-label={`Question Navigator Q${dispIdx + 1}`}
                      onClick={() => goToQuestionStep(dispIdx)}
                      title={
                        isLocked
                          ? `Locked — Answer Question ${firstUnansweredDisplayIdx + 1} first`
                          : `Question ${dispIdx + 1}${isAnswered ? ' (Answered)' : ''}`
                      }
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.2rem',
                        height: '32px',
                        borderRadius: '7px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        cursor: isLocked ? 'not-allowed' : 'pointer',
                        opacity: isLocked ? 0.55 : 1,
                        background: isCurrent
                          ? 'rgba(139, 92, 246, 0.38)'
                          : isAnswered
                            ? 'rgba(76, 175, 80, 0.22)'
                            : 'rgba(255, 255, 255, 0.05)',
                        border: isCurrent
                          ? '1.5px solid #a78bfa'
                          : isAnswered
                            ? '1px solid rgba(76, 175, 80, 0.5)'
                            : '1px solid rgba(255, 255, 255, 0.14)',
                        color: isCurrent
                          ? '#ffffff'
                          : isAnswered
                            ? '#a5d6a7'
                            : '#94a3b8',
                        transition: 'all 0.15s',
                      }}
                    >
                      {isLocked ? <Lock size={11} /> : isAnswered ? '✓' : null}
                      <span>{dispIdx + 1}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            data-proctor-label="Attached PDF Handout / Instructions Button"
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
              <strong>Full-Screen Anti-Cheat Active</strong>
              <p>Keep this window in full-screen and focused. Exiting full-screen, alt-tabbing, taking screenshots, or opening developer tools will black out the screen and be recorded.</p>
            </div>
          </div>
          <p className="quiz-integrity-limit">Teacher live-monitors your device, cursor, and answers in real time.</p>
        </aside>

        <section className="quiz-question-area">
          <div className="quiz-question-heading">
            <div>
              <p className="quiz-result-eyebrow">Secure Full-Screen Assessment Window • Sequential Question Lock</p>
              <h2>
                Question {activeStepIndex + 1} of {totalQuestions}
              </h2>
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
              <div className="quiz-question-count">
                <FileQuestion size={18} /> {answeredCount} / {totalQuestions} answered
              </div>
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
            {/* Step-by-Step Sequential Question Progress Bar */}
            {totalQuestions > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {orderedIndices.map((origIdx, dispIdx) => {
                    const qItem = quiz.questions?.[origIdx];
                    const isAnswered = isAnswerProvided(answers[origIdx], qItem);
                    const isCurrent = dispIdx === activeStepIndex;
                    const isLocked = dispIdx > maxUnlockedDisplayIdx;
                    return (
                      <button
                        key={origIdx}
                        type="button"
                        onClick={() => goToQuestionStep(dispIdx)}
                        data-proctor-label={`Step Pill Q${dispIdx + 1}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.35rem 0.7rem',
                          borderRadius: '999px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: isLocked ? 'not-allowed' : 'pointer',
                          opacity: isLocked ? 0.55 : 1,
                          background: isCurrent
                            ? 'rgba(139, 92, 246, 0.32)'
                            : isAnswered
                              ? 'rgba(76, 175, 80, 0.2)'
                              : 'rgba(255, 255, 255, 0.05)',
                          border: isCurrent
                            ? '1.5px solid #a78bfa'
                            : isAnswered
                              ? '1px solid rgba(76, 175, 80, 0.45)'
                              : '1px solid rgba(255, 255, 255, 0.12)',
                          color: isCurrent
                            ? '#ffffff'
                            : isAnswered
                              ? '#a5d6a7'
                              : '#cbd5e1',
                          transition: 'all 0.15s',
                        }}
                      >
                        {isLocked ? <Lock size={12} /> : isAnswered ? <CheckCircle2 size={13} /> : null}
                        <span>Q{dispIdx + 1}</span>
                      </button>
                    );
                  })}
                </div>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>
                  {isCurrentQuestionAnswered
                    ? `✓ Question ${activeStepIndex + 1} answered`
                    : `🔒 Answer Question ${activeStepIndex + 1} first to unlock Next`}
                </span>
              </div>
            )}

            {activeQuestion && (() => {
              const displayIndex = activeStepIndex;
              const originalIndex = activeOriginalIndex;
              const question = activeQuestion;
              const qType = question.type ?? 'multiple_choice';
              const qPoints = Number(question.points) > 0 ? Number(question.points) : 1;
              const typeBadgeMap: Record<string, string> = {
                multiple_choice: 'Multiple Choice',
                true_false: 'True or False',
                identification: 'Identification • Type Exact Answer',
                multiple_answer: 'Multiple Answer • Select All That Apply',
                essay: 'Essay • Written Response',
              };
              const currentAns = answers[originalIndex];

              return (
                <fieldset
                  key={originalIndex}
                  className="quiz-question-card"
                  data-proctor-label={`Question ${displayIndex + 1}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          padding: '0.18rem 0.55rem',
                          borderRadius: '999px',
                          background: 'rgba(139, 92, 246, 0.16)',
                          border: '1px solid rgba(139, 92, 246, 0.38)',
                          color: '#ddd6fe',
                        }}
                      >
                        {typeBadgeMap[qType] || 'Multiple Choice'}
                      </span>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.18rem 0.55rem',
                          borderRadius: '999px',
                          background: isCurrentQuestionAnswered
                            ? 'rgba(76, 175, 80, 0.18)'
                            : 'rgba(245, 158, 11, 0.16)',
                          border: isCurrentQuestionAnswered
                            ? '1px solid rgba(76, 175, 80, 0.45)'
                            : '1px solid rgba(245, 158, 11, 0.45)',
                          color: isCurrentQuestionAnswered ? '#a5d6a7' : '#fde68a',
                        }}
                      >
                        {isCurrentQuestionAnswered ? '✓ Answered' : 'Required Before Next'}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fbbf24' }}>
                      {qPoints} {qPoints === 1 ? 'pt' : 'pts'}
                    </span>
                  </div>
                  <legend><span>{displayIndex + 1}</span>{question.prompt}</legend>

                  {qType === 'identification' ? (
                    <div style={{ marginTop: '0.6rem' }}>
                      <input
                        type="text"
                        value={typeof currentAns === 'string' ? currentAns : ''}
                        onFocus={() => setCurrentQuestionNum(displayIndex + 1)}
                        onChange={(e) => handleAnswer(originalIndex, e.target.value, displayIndex + 1)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !isLastQuestion) {
                            e.preventDefault();
                            goToNextQuestion();
                          }
                        }}
                        placeholder="Type your answer here..."
                        data-proctor-label={`Question ${displayIndex + 1} · Identification Input`}
                        autoComplete="off"
                        spellCheck={false}
                        style={{
                          width: '100%',
                          padding: '0.8rem 1rem',
                          borderRadius: '10px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: typeof currentAns === 'string' && currentAns.trim().length > 0
                            ? '1.5px solid rgba(139, 92, 246, 0.65)'
                            : '1px solid rgba(255, 255, 255, 0.16)',
                          color: 'white',
                          fontSize: '0.95rem',
                          userSelect: 'text',
                          WebkitUserSelect: 'text',
                        }}
                      />
                    </div>
                  ) : qType === 'essay' ? (
                    <div style={{ marginTop: '0.6rem' }}>
                      <textarea
                        rows={5}
                        value={typeof currentAns === 'string' ? currentAns : ''}
                        onFocus={() => setCurrentQuestionNum(displayIndex + 1)}
                        onChange={(e) => handleAnswer(originalIndex, e.target.value, displayIndex + 1)}
                        placeholder="Write your complete answer or explanation here..."
                        data-proctor-label={`Question ${displayIndex + 1} · Essay Textarea`}
                        style={{
                          width: '100%',
                          padding: '0.85rem 1rem',
                          borderRadius: '10px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: typeof currentAns === 'string' && currentAns.trim().length > 0
                            ? '1.5px solid rgba(139, 92, 246, 0.65)'
                            : '1px solid rgba(255, 255, 255, 0.16)',
                          color: 'white',
                          fontSize: '0.93rem',
                          lineHeight: 1.5,
                          resize: 'vertical',
                          userSelect: 'text',
                          WebkitUserSelect: 'text',
                        }}
                      />
                    </div>
                  ) : qType === 'multiple_answer' ? (
                    <div className="quiz-options">
                      {(question.options ?? []).map((option, optionIndex) => {
                        const selectedArr = Array.isArray(currentAns) ? (currentAns as number[]) : [];
                        const selected = selectedArr.includes(optionIndex);
                        const letter = String.fromCharCode(65 + optionIndex);
                        return (
                          <label
                            className={`quiz-option ${selected ? 'is-selected' : ''}`}
                            key={optionIndex}
                            data-proctor-label={`Question ${displayIndex + 1} · Option ${letter}`}
                          >
                            <input
                              type="checkbox"
                              name={`question-${originalIndex}-${optionIndex}`}
                              checked={selected}
                              onChange={() => handleToggleMultiAnswer(originalIndex, optionIndex, displayIndex + 1)}
                            />
                            <span className="quiz-option-letter">{selected ? '✓' : letter}</span>
                            <span>{option}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="quiz-options">
                      {(question.options ?? []).map((option, optionIndex) => {
                        const selected = currentAns === optionIndex;
                        const letter = String.fromCharCode(65 + optionIndex);
                        return (
                          <label
                            className={`quiz-option ${selected ? 'is-selected' : ''}`}
                            key={optionIndex}
                            data-proctor-label={`Question ${displayIndex + 1} · Option ${letter}`}
                          >
                            <input
                              type="radio"
                              name={`question-${originalIndex}`}
                              checked={selected}
                              onChange={() => handleAnswer(originalIndex, optionIndex, displayIndex + 1)}
                            />
                            <span className="quiz-option-letter">{letter}</span>
                            <span>{option}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </fieldset>
              );
            })()}

            {/* Sequential Question Navigation & Submit Bar */}
            <div
              className="quiz-submit-row"
              data-proctor-label="Sequential Question Navigation Section"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={activeStepIndex === 0}
                  onClick={goToPreviousQuestion}
                  data-proctor-label="Previous Question Button"
                >
                  <ChevronLeft size={16} /> Previous Question
                </Button>
                <span
                  style={{
                    fontSize: '0.84rem',
                    color: isCurrentQuestionAnswered ? '#a5d6a7' : '#fde68a',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontWeight: 600,
                  }}
                >
                  {isCurrentQuestionAnswered ? (
                    <>
                      <CheckCircle2 size={16} />
                      {isLastQuestion
                        ? `Question ${activeStepIndex + 1} answered. Ready to submit assessment!`
                        : `Question ${activeStepIndex + 1} answered. Click "Next" to proceed to Question ${activeStepIndex + 2}.`}
                    </>
                  ) : (
                    <>
                      <Lock size={15} />
                      {isLastQuestion
                        ? `Answer Question ${activeStepIndex + 1} first before submitting.`
                        : `Answer Question ${activeStepIndex + 1} first before moving to Question ${activeStepIndex + 2}.`}
                    </>
                  )}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                {!isLastQuestion ? (
                  <Button
                    type="button"
                    variant="accent"
                    size="lg"
                    disabled={!isCurrentQuestionAnswered}
                    onClick={goToNextQuestion}
                    data-proctor-label="Next Question Button"
                    title={
                      isCurrentQuestionAnswered
                        ? `Move to Question ${activeStepIndex + 2}`
                        : `You must answer Question ${activeStepIndex + 1} first before moving to Question ${activeStepIndex + 2}`
                    }
                    style={{
                      opacity: isCurrentQuestionAnswered ? 1 : 0.6,
                      cursor: isCurrentQuestionAnswered ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {isCurrentQuestionAnswered ? (
                      <>
                        Next Question (Q{activeStepIndex + 2}) <ChevronRight size={18} />
                      </>
                    ) : (
                      <>
                        <Lock size={16} /> Answer Q{activeStepIndex + 1} to Unlock Next
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="accent"
                    size="lg"
                    type="submit"
                    disabled={submitting || isBlocked || !allQuestionsAnswered}
                    data-proctor-label="Submit Assessment Button"
                    style={{
                      opacity: allQuestionsAnswered ? 1 : 0.6,
                      cursor: allQuestionsAnswered ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <Send size={18} /> {submitting ? 'Submitting…' : 'Submit Assessment'}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </section>
      </div>

      {/* FULL-SCREEN EXAM LOCK GATE (If browser was refreshed or opened directly outside fullscreen) */}
      {!isFullscreen && !isBlocked && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fullscreen-lock-title"
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            background: 'radial-gradient(circle at center, #1a0911 0%, #060609 100%)',
            zIndex: 9999990,
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
              background: 'rgba(139, 92, 246, 0.18)',
              border: '2px solid rgba(139, 92, 246, 0.55)',
              borderRadius: '50%',
              padding: '1.25rem',
              marginBottom: '1.15rem',
              color: '#c4b5fd',
            }}
          >
            <LockKeyhole size={54} aria-hidden="true" />
          </div>

          <span style={{ fontSize: '0.8rem', color: '#c4b5fd', fontWeight: 800, letterSpacing: '1.8px', textTransform: 'uppercase' }}>
            MANDATORY FULL-SCREEN PROCTORING LOCK
          </span>

          <h1 id="fullscreen-lock-title" style={{ fontSize: '1.9rem', fontWeight: 800, color: 'white', margin: '0.55rem 0' }}>
            Full-Screen Mode Required to Take Quiz
          </h1>

          <p style={{ maxWidth: '520px', color: '#cbd5e1', fontSize: '1rem', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
            To prevent alt-tabbing, window switching, and unauthorized assistance, this assessment is locked to full-screen mode. Exiting full-screen during the quiz will immediately trigger an anti-cheat blackout violation.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button
              variant="accent"
              size="lg"
              onClick={() => {
                void enterExamFullscreen().then((entered) => {
                  hasEnteredFullscreenRef.current = true;
                  setIsFullscreen(entered || true);
                });
              }}
              style={{ minWidth: '250px', padding: '0.85rem 1.8rem' }}
            >
              <LockKeyhole size={18} /> Enter Full-Screen & Start Quiz
            </Button>
            <Button variant="outline" size="lg" onClick={closeAssessment}>
              Cancel & Exit
            </Button>
          </div>
        </div>
      )}

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
            <Eye size={18} /> {canResume ? 'Re-Enter Full-Screen & Resume' : 'Click Window to Focus First'}
          </Button>

          <p style={{ marginTop: '1.25rem', color: '#78909c', fontSize: '0.8rem' }}>
            Keep this window active and in full-screen lock at all times to avoid further penalties.
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
