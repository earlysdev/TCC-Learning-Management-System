import { useState, useEffect } from 'react';
import { 
  ShieldAlert, ShieldCheck, AlertTriangle, Users, 
  ChevronDown, ChevronUp, EyeOff, Search, Radio, Clock, Lock
} from 'lucide-react';
import type { Quiz } from '../../lib/types';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { lmsFetch } from '../../lmsApi';

interface StudentInfo {
  id: number;
  name: string;
  email: string;
  lrn?: string;
  grade?: string;
  section?: string;
}

interface ViolationDetail {
  type: string;
  label?: string;
  timestamp?: string;
  details?: string;
}

interface SubmissionRecord {
  id: number;
  student: StudentInfo;
  score: number;
  max_score: number;
  percentage: number | string;
  cheating_attempts_count: number;
  violations: ViolationDetail[];
  ip_address?: string;
  started_at?: string;
  completed_at?: string;
}

interface LiveSessionRecord {
  id: number;
  student_id: number;
  student_name: string;
  student_email: string;
  student_section: string;
  student_grade?: string;
  status: string;
  current_question: number;
  answered_count: number;
  total_questions: number;
  progress_percentage: number;
  current_score: number;
  max_score: number;
  cheating_attempts_count: number;
  time_remaining_seconds?: number | null;
  started_at?: string;
  last_active_at?: string;
}

interface QuizSubmissionsModalProps {
  quiz: Quiz | null;
  isOpen: boolean;
  onClose: () => void;
}

function formatRemainingTime(secs: number | null | undefined): string {
  if (secs === null || secs === undefined || secs < 0) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function QuizSubmissionsModal({ quiz, isOpen, onClose }: QuizSubmissionsModalProps) {
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSessionRecord[]>([]);
  const [quizType, setQuizType] = useState<'formative' | 'summative'>('formative');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen || !quiz) return;
    
    let mounted = true;
    setLoading(true);
    setError(null);
    setSearch('');
    setExpandedId(null);
    setQuizType(quiz.quiz_type === 'summative' ? 'summative' : 'formative');

    const fetchMonitorData = (isInitial: boolean) => {
      lmsFetch<{
        quiz_type?: 'formative' | 'summative';
        live_monitoring_enabled?: boolean;
        live_sessions?: LiveSessionRecord[];
        submissions: SubmissionRecord[];
      }>(`/teacher/quizzes/${quiz.id}/live`)
        .then(data => {
          if (!mounted) return;
          if (data.quiz_type) {
            setQuizType(data.quiz_type === 'summative' ? 'summative' : 'formative');
          }
          setLiveSessions(Array.isArray(data.live_sessions) ? data.live_sessions : []);
          setSubmissions(data.submissions || []);
        })
        .catch(err => {
          if (!mounted || !isInitial) return;
          setError(err instanceof Error ? err.message : 'Could not load quiz submissions.');
        })
        .finally(() => {
          if (mounted && isInitial) setLoading(false);
        });
    };

    fetchMonitorData(true);
    const interval = window.setInterval(() => fetchMonitorData(false), 4000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [isOpen, quiz?.id]);

  if (!quiz) return null;

  const isFormative = quizType !== 'summative';

  const filteredSubmissions = submissions.filter(sub => {
    const student = sub.student;
    if (!student) return true;
    const term = search.toLowerCase();
    return (
      student.name.toLowerCase().includes(term) ||
      (student.lrn && student.lrn.includes(term)) ||
      (student.section && student.section.toLowerCase().includes(term)) ||
      student.email.toLowerCase().includes(term)
    );
  });

  const filteredLiveSessions = liveSessions.filter(s => {
    const term = search.toLowerCase();
    if (!term) return true;
    return (
      s.student_name.toLowerCase().includes(term) ||
      s.student_section.toLowerCase().includes(term) ||
      s.student_email.toLowerCase().includes(term)
    );
  });

  const totalCount = submissions.length;
  const flaggedCount = submissions.filter(s => s.cheating_attempts_count > 0).length;
  const cleanCount = totalCount - flaggedCount;
  const avgScore = totalCount > 0 
    ? (submissions.reduce((acc, s) => acc + Number(s.percentage), 0) / totalCount).toFixed(0)
    : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isFormative ? `Live Monitor & Submissions: ${quiz.title}` : `Summative Submissions & Proctoring: ${quiz.title}`}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close Review
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '72vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
        
        {/* Metrics Overview Header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '0.75rem' }}>
          {isFormative && (
            <div style={{ background: 'rgba(59, 130, 246, 0.14)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.35)' }}>
              <span style={{ fontSize: '0.74rem', color: '#93c5fd', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Radio size={13} /> Taking Quiz Now
              </span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#bfdbfe', marginTop: '0.2rem' }}>{liveSessions.length}</div>
            </div>
          )}
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Total Submissions</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', marginTop: '0.2rem' }}>{totalCount}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Average Score</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a5d6a7', marginTop: '0.2rem' }}>{avgScore}%</div>
          </div>
          <div style={{ background: 'rgba(76, 175, 80, 0.12)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(76, 175, 80, 0.3)' }}>
            <span style={{ fontSize: '0.75rem', color: '#a5d6a7', textTransform: 'uppercase', fontWeight: 600 }}>Clean Attempts</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a5d6a7', marginTop: '0.2rem' }}>{cleanCount}</div>
          </div>
          <div style={{ background: flaggedCount > 0 ? 'rgba(244, 67, 54, 0.15)' : 'rgba(255,255,255,0.05)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: flaggedCount > 0 ? '1px solid rgba(244, 67, 54, 0.4)' : '1px solid var(--glass-border)' }}>
            <span style={{ fontSize: '0.75rem', color: flaggedCount > 0 ? '#ff8a80' : 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Cheating Detected</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: flaggedCount > 0 ? '#ff5252' : 'white', marginTop: '0.2rem' }}>{flaggedCount}</div>
          </div>
        </div>

        {/* Formative Live Student Monitoring Section OR Summative Mode Banner */}
        {isFormative ? (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.06)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem 1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399', display: 'inline-block' }} />
                <strong style={{ color: 'white', fontSize: '0.96rem' }}>
                  Formative Live View — Students Currently Taking the Quiz ({filteredLiveSessions.length})
                </strong>
              </div>
              <span style={{ fontSize: '0.76rem', color: '#a7f3d0', background: 'rgba(16, 185, 129, 0.16)', border: '1px solid rgba(16, 185, 129, 0.35)', padding: '0.18rem 0.6rem', borderRadius: '999px', fontWeight: 600 }}>
                Auto-refreshing every 4s
              </span>
            </div>

            {filteredLiveSessions.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--neutral-300)', padding: '0.5rem 0' }}>
                No students are actively taking this Formative quiz right now. As soon as a student opens the quiz, their live progress, current question, score, and timer will appear here in real time.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {filteredLiveSessions.map((live) => (
                  <div
                    key={live.id}
                    style={{
                      background: 'rgba(0, 0, 0, 0.28)',
                      border: live.cheating_attempts_count > 0 ? '1px solid rgba(244, 67, 54, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.55rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <strong style={{ color: 'white', fontSize: '0.95rem' }}>{live.student_name}</strong>
                        <Badge variant="primary" style={{ fontSize: '0.7rem' }}>{live.student_section}</Badge>
                        <span style={{ fontSize: '0.78rem', color: '#93c5fd', fontWeight: 600 }}>
                          On Question {live.current_question} of {live.total_questions}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--neutral-200)' }}>
                          Answered: <strong style={{ color: 'white' }}>{live.answered_count}/{live.total_questions}</strong>
                        </span>
                        <span style={{ fontSize: '0.82rem', color: '#a5d6a7', fontWeight: 700 }}>
                          Live Score: {live.current_score}/{live.max_score}
                        </span>
                        {live.time_remaining_seconds !== null && live.time_remaining_seconds !== undefined && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700 }}>
                            <Clock size={13} /> {formatRemainingTime(live.time_remaining_seconds)}
                          </span>
                        )}
                        {live.cheating_attempts_count > 0 ? (
                          <span style={{ fontSize: '0.76rem', color: '#ff8a80', background: 'rgba(244, 67, 54, 0.2)', border: '1px solid rgba(244, 67, 54, 0.45)', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 700 }}>
                            ⚠️ {live.cheating_attempts_count} Alert{live.cheating_attempts_count === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.76rem', color: '#a5d6a7', background: 'rgba(76, 175, 80, 0.16)', border: '1px solid rgba(76, 175, 80, 0.35)', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 600 }}>
                            ✓ Focused
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(4, live.progress_percentage))}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #3b82f6, #10b981)',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.09)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: 'var(--radius-md)',
              padding: '0.9rem 1.1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: '#fde68a',
              fontSize: '0.86rem',
            }}
          >
            <Lock size={18} style={{ color: '#fbbf24', flexShrink: 0 }} />
            <div>
              <strong style={{ color: 'white', display: 'block', marginBottom: '0.15rem' }}>
                Summative Quiz Mode — Final Submission Only
              </strong>
              Live student monitoring is disabled for Summative exams. Student scores and proctoring logs appear below as soon as each student finishes and submits the quiz.
            </div>
          </div>
        )}

        {/* Search bar */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search student by name, ID, or block..."
            className="form-input"
            style={{ paddingLeft: '2.5rem', width: '100%' }}
          />
          <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--neutral-300)' }}>
            Loading student submissions and anti-cheat telemetry...
          </div>
        )}

        {/* Error state */}
        {error && (
          <div style={{ background: 'rgba(239, 83, 80, 0.2)', border: '1px solid var(--error)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#ffcdd2', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={18} /> {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filteredSubmissions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--neutral-300)', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
            <Users size={40} style={{ color: 'var(--neutral-400)', margin: '0 auto 0.75rem' }} />
            <h4 style={{ color: 'white', fontSize: '1.1rem', margin: 0 }}>No submissions recorded yet</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--neutral-400)', marginTop: '0.25rem' }}>
              Students assigned to this quiz will appear here once they complete and submit their assessment.
            </p>
          </div>
        )}

        {/* Submissions list */}
        {!loading && !error && filteredSubmissions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filteredSubmissions.map((sub) => {
              const isExpanded = expandedId === sub.id;
              const hasViolations = sub.cheating_attempts_count > 0;
              const percentageNum = Number(sub.percentage);

              return (
                <div
                  key={sub.id}
                  style={{
                    background: hasViolations ? 'rgba(244, 67, 54, 0.06)' : 'rgba(255, 255, 255, 0.035)',
                    border: hasViolations ? '1px solid rgba(244, 67, 54, 0.3)' : '1px solid var(--glass-border)',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    transition: 'all 0.2s',
                  }}
                >
                  <div
                    style={{
                      padding: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                      cursor: hasViolations ? 'pointer' : 'default',
                    }}
                    onClick={() => {
                      if (hasViolations) setExpandedId(isExpanded ? null : sub.id);
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ color: 'white', fontSize: '1rem' }}>
                          {sub.student?.name || 'Student'}
                        </strong>
                        {sub.student?.section && (
                          <Badge variant="primary" style={{ fontSize: '0.7rem' }}>
                            {sub.student.section}
                          </Badge>
                        )}
                        {sub.student?.lrn && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--neutral-400)' }}>
                            ID: {sub.student.lrn}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--neutral-300)', marginTop: '0.2rem' }}>
                        Completed: {sub.completed_at ? new Date(sub.completed_at).toLocaleString() : 'Recently'}
                        {sub.ip_address && ` • IP: ${sub.ip_address}`}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white' }}>
                          {sub.score}/{sub.max_score}{' '}
                          <span style={{ fontSize: '0.85rem', color: percentageNum >= 75 ? '#a5d6a7' : '#ffab91' }}>
                            ({percentageNum.toFixed(0)}%)
                          </span>
                        </div>
                        <Badge variant={percentageNum >= 75 ? 'success' : 'warning'} style={{ fontSize: '0.7rem' }}>
                          {percentageNum >= 75 ? 'Passed' : 'Needs Review'}
                        </Badge>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {hasViolations ? (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.35rem 0.65rem',
                              borderRadius: 'var(--radius-full)',
                              background: 'rgba(244, 67, 54, 0.2)',
                              border: '1px solid rgba(244, 67, 54, 0.5)',
                              color: '#ff8a80',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                            }}
                          >
                            <ShieldAlert size={15} />
                            <span>⚠️ {sub.cheating_attempts_count} Cheating Alert{sub.cheating_attempts_count === 1 ? '' : 's'}</span>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </div>
                        ) : (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.35rem 0.65rem',
                              borderRadius: 'var(--radius-full)',
                              background: 'rgba(76, 175, 80, 0.15)',
                              border: '1px solid rgba(76, 175, 80, 0.4)',
                              color: '#a5d6a7',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                            }}
                          >
                            <ShieldCheck size={15} />
                            <span>✓ Clean Test</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded violation breakdown */}
                  {hasViolations && isExpanded && (
                    <div
                      style={{
                        padding: '0.85rem 1rem 1rem',
                        borderTop: '1px solid rgba(244, 67, 54, 0.25)',
                        background: 'rgba(0,0,0,0.25)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#ff8a80', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                        <EyeOff size={15} /> Proctoring Violation Log (Screen Turned Pitch Black):
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        {Array.isArray(sub.violations) && sub.violations.length > 0 ? (
                          sub.violations.map((v, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: 'rgba(255,255,255,0.04)',
                                padding: '0.45rem 0.75rem',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                color: 'white',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ color: '#ff5252', fontWeight: 700 }}>#{idx + 1}</span>
                                <span>{v.label || v.type || 'Window blur / tab switch'}</span>
                                {v.details && <span style={{ color: 'var(--neutral-400)', fontSize: '0.75rem' }}>({v.details})</span>}
                              </div>
                              <span style={{ color: 'var(--neutral-400)', fontSize: '0.75rem' }}>
                                {v.timestamp ? new Date(v.timestamp).toLocaleTimeString() : 'Recorded'}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div style={{ color: 'var(--neutral-400)', fontSize: '0.8rem' }}>
                            {sub.cheating_attempts_count} alt-tab / tab switch or screenshot shortcut events triggered the blackout shield during this exam session.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
