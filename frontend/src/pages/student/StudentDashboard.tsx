import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { lmsFetch, getLmsUser } from '../../lmsApi';
import type { Quiz, Recommendation, Announcement } from '../../lib/types';
import { getYearLevelFromBlock } from '../../lib/constants';
import { 
  BookOpen, CheckCircle2, Award, Sparkles, Send, 
  ArrowRight, ArrowLeft, Clock, AlertCircle, FileQuestion, Calendar, Trophy,
  ExternalLink, Loader2
} from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import ProfileUpdateCard from '../../components/ui/ProfileUpdateCard';

export default function StudentDashboard() {
  const user = getLmsUser();
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
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [takingQuizId, setTakingQuizId] = useState<number | null>(null);
  const [quizResult, setQuizResult] = useState<{
    score: number;
    max_score: number;
    percentage: number | string;
    recommendation: Recommendation;
  } | null>(null);

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
      const data = await lmsFetch<Announcement[] | { data: Announcement[] }>('/announcements');
      if (Array.isArray(data)) {
        setAnnouncements(data);
      } else if (data && Array.isArray(data.data)) {
        setAnnouncements(data.data);
      }
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
    setSubmitting(true);
    try {
      const data = await lmsFetch<{ quiz: Quiz; attempt: typeof quizResult }>(`/student/quizzes/${quiz.id}`);
      setSelectedQuiz(data.quiz);
      setQuizResult(data.attempt);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not open this quiz');
    } finally {
      setSubmitting(false);
    }
  };

  const openQuizWindow = (quiz: Quiz) => {
    if (takingQuizId === quiz.id) return; // Already opening this quiz
    setTakingQuizId(quiz.id);

    const quizUrl = `/student/quizzes/${quiz.id}/take`;
    const quizWindow = window.open(
      quizUrl,
      `tcc_quiz_${quiz.id}`,
      'popup=yes,width=1180,height=820,noopener=no',
    );

    if (quizWindow) {
      quizWindow.focus();
      // Re-enable button after 3 seconds so user can retry if window closed
      setTimeout(() => setTakingQuizId(null), 3000);
      return;
    }

    // The separate assessment route still works if the browser blocks a popup.
    setTakingQuizId(null);
    navigate(quizUrl);
  };

  const handleSubmitQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuiz) return;
    
    const questionCount = selectedQuiz.questions?.length || 0;
    if (answers.length !== questionCount || answers.some(a => a === undefined)) {
      setError('Please answer all questions before submitting.');
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
      await fetchQuizzes();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit quiz');
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
          <Button variant="outline" size="sm" onClick={() => setActiveSection('quizzes')}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--primary-300)', fontWeight: 600, textTransform: 'uppercase' }}>
                    {quiz.subject}
                  </span>
                  <Badge variant={quiz.attempted ? 'success' : 'primary'}>
                    {quiz.attempted ? 'Completed' : 'Ready'}
                  </Badge>
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white', marginBottom: '0.4rem' }}>{quiz.title}</h3>
                <p style={{ color: 'var(--neutral-300)', fontSize: '0.85rem', marginBottom: '1rem', flex: 1 }}>
                  {quiz.topic} • {quiz.question_count} questions
                </p>
                {quiz.attempted && (
                  <div style={{ background: 'rgba(67, 160, 71, 0.15)', border: '1px solid rgba(67, 160, 71, 0.3)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem', fontSize: '0.85rem', color: '#a5d6a7' }}>
                    Score: <strong>{quiz.score}/{quiz.max_score}</strong> ({Number(quiz.percentage).toFixed(0)}%)
                  </div>
                )}
                <Button 
                  variant={quiz.attempted ? 'outline' : 'primary'} 
                  disabled={!quiz.attempted && takingQuizId === quiz.id}
                  onClick={() => {
                    if (quiz.attempted) {
                      openQuiz(quiz);
                      setActiveSection('quizzes');
                    } else {
                      openQuizWindow(quiz);
                    }
                  }}
                >
                  {!quiz.attempted && takingQuizId === quiz.id ? (
                    <><Loader2 size={14} className="spin-icon" /> Opening Quiz...</>
                  ) : (
                    <>{quiz.attempted ? 'View Result & Recs' : 'Take Quiz'} <ArrowRight size={14} /></>
                  )}
                </Button>
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

          {quizResult.recommendation && (
            <GlassCard style={{ borderLeft: '4px solid var(--accent-purple-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ background: 'var(--accent-purple)', padding: '0.5rem', borderRadius: 'var(--radius-md)', color: 'white' }}>
                  <Sparkles size={20} />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-purple-light)', fontWeight: 700, textTransform: 'uppercase' }}>
                    {quizResult.recommendation.source === 'gemini' ? 'AI STUDY RECOMMENDATION (GEMINI)' : 'PERSONALIZED STUDY RECOMMENDATION'}
                  </span>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>Suggested Next Steps</h3>
                </div>
              </div>

              <p style={{ color: 'var(--neutral-200)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                {quizResult.recommendation.summary}
              </p>

              {quizResult.recommendation.focus_topics?.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--neutral-400)', fontWeight: 600, marginBottom: '0.5rem' }}>
                    TOPICS TO REVIEW:
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
                    ACTION STEPS:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--neutral-200)', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.9rem' }}>
                    {quizResult.recommendation.action_steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {quizResult.recommendation.references && quizResult.recommendation.references.length > 0 && (
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
              )}
            </GlassCard>
          )}

          <Button variant="primary" onClick={() => { setSelectedQuiz(null); setQuizResult(null); }}>
            Back to Quizzes List
          </Button>
        </div>
      );
    }

    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <Button variant="outline" size="sm" onClick={() => setSelectedQuiz(null)}>
          <ArrowLeft size={16} /> Cancel & Back to Quizzes
        </Button>

        <GlassCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <Badge variant="primary">{selectedQuiz.subject}</Badge>
            <span style={{ fontSize: '0.85rem', color: 'var(--neutral-300)' }}>
              {selectedQuiz.questions?.length || 0} Questions
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'white', marginBottom: '0.5rem' }}>
            {selectedQuiz.title}
          </h1>
          <p style={{ color: 'var(--neutral-300)', fontSize: '0.95rem' }}>
            {selectedQuiz.instructions || 'Choose the best answer for each question. You may only submit this quiz once.'}
          </p>
        </GlassCard>

        {error && (
          <div style={{ background: 'rgba(239, 83, 80, 0.2)', border: '1px solid var(--error)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#ffcdd2', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmitQuiz} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {selectedQuiz.questions?.map((q, qIndex) => (
            <GlassCard key={qIndex}>
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                <span style={{ background: 'var(--primary-600)', color: 'white', fontWeight: 700, width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.85rem' }}>
                  {qIndex + 1}
                </span>
                <p style={{ color: 'white', fontWeight: 600, fontSize: '1.05rem', marginTop: '0.15rem' }}>
                  {q.prompt}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingLeft: '2.5rem' }}>
                {q.options.map((opt, optIndex) => {
                  const isSelected = answers[qIndex] === optIndex;
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
            </GlassCard>
          ))}

          <Button variant="accent" size="lg" type="submit" disabled={submitting} style={{ width: '100%', marginTop: '0.5rem' }}>
            <Send size={18} /> {submitting ? 'Submitting Answers...' : 'Submit Quiz Now'}
          </Button>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <Badge variant="primary">{quiz.subject}</Badge>
                  <Badge variant={quiz.attempted ? 'success' : 'warning'}>
                    {quiz.attempted ? 'Completed' : 'Pending'}
                  </Badge>
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'white', marginBottom: '0.4rem' }}>{quiz.title}</h3>
                <p style={{ color: 'var(--neutral-300)', fontSize: '0.9rem', marginBottom: '1rem', flex: 1 }}>
                  Topic: <strong>{quiz.topic}</strong> • {quiz.question_count} Questions
                </p>

                {quiz.attempted && (
                  <div style={{ background: 'rgba(67, 160, 71, 0.15)', border: '1px solid rgba(67, 160, 71, 0.3)', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#a5d6a7', textTransform: 'uppercase', fontWeight: 600 }}>Recorded Score</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white' }}>
                      {quiz.score}/{quiz.max_score} <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#a5d6a7' }}>({Number(quiz.percentage).toFixed(0)}%)</span>
                    </div>
                  </div>
                )}

                <Button 
                  variant={quiz.attempted ? 'outline' : 'accent'}
                  disabled={!quiz.attempted && takingQuizId === quiz.id}
                  onClick={() => quiz.attempted ? openQuiz(quiz) : openQuizWindow(quiz)}
                >
                  {!quiz.attempted && takingQuizId === quiz.id ? (
                    <><Loader2 size={16} className="spin-icon" /> Opening Quiz...</>
                  ) : (
                    <>{quiz.attempted ? 'Review Result & AI Recommendations' : 'Start Quiz'} <ArrowRight size={16} /></>
                  )}
                </Button>
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
          value={completedQuizzes.length > 0 ? `${Math.max(...completedQuizzes.map(q => Number(q.percentage || 0))).toFixed(0)}%` : '—'} 
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
          {completedQuizzes.filter(q => q.recommendation).map(q => (
            <GlassCard key={q.id} style={{ borderLeft: '4px solid var(--accent-purple-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div>
                  <Badge variant="primary">{q.subject}</Badge>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'white', marginTop: '0.25rem' }}>{q.title}</h3>
                </div>
                <Badge variant={Number(q.percentage) >= 75 ? 'success' : 'warning'}>
                  Score: {q.score}/{q.max_score} ({Number(q.percentage).toFixed(0)}%)
                </Badge>
              </div>

              <p style={{ color: 'var(--neutral-200)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1rem' }}>
                {q.recommendation?.summary}
              </p>

              {q.recommendation?.focus_topics && q.recommendation.focus_topics.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--neutral-400)', fontWeight: 600, marginBottom: '0.4rem' }}>
                    KEY TOPICS TO REVIEW:
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
                    ACTION PLAN:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--neutral-300)', fontSize: '0.85rem' }}>
                    {q.recommendation.action_steps.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {q.recommendation?.references && q.recommendation.references.length > 0 && (
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
              )}
            </GlassCard>
          ))}
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
            <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600 }}>Block</div>
            <div style={{ color: 'white', fontWeight: 600, marginTop: '0.2rem' }}>
              {user?.section || 'Block - 1A'} ({getYearLevelFromBlock(user?.section)})
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
        {/* Navigation Tabs Bar */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', overflowX: 'auto' }}>
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'quizzes', label: 'My Quizzes' },
            { id: 'history', label: 'Quiz History' },
            { id: 'scores', label: 'Scores' },
            { id: 'recommendations', label: 'AI Recommendations' },
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
        {activeSection === 'history' && renderHistory()}
        {activeSection === 'scores' && renderScores()}
        {activeSection === 'recommendations' && renderRecommendations()}
        {activeSection === 'settings' && renderSettings()}
      </div>
    </DashboardLayout>
  );
}
