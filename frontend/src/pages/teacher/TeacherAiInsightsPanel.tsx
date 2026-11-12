import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  RefreshCw,
  Target,
  AlertTriangle,
  ShieldAlert,
  Users,
  BookOpen,
  Wand2,
  CheckCircle2,
  Layers,
  TrendingDown,
} from 'lucide-react';
import { lmsFetch } from '../../lmsApi';
import type { TeacherInsightsResponse, TeacherRemedialDraft } from '../../lib/types';
import GlassCard from '../../components/ui/GlassCard';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';

interface TeacherAiInsightsPanelProps {
  handledYearLevel?: string | null;
  draftingRemedial?: boolean;
  onDraftRemedialQuiz: (draft: TeacherRemedialDraft) => void;
}

const PRIORITY_BADGE: Record<'high' | 'medium' | 'positive', { variant: 'error' | 'warning' | 'success'; label: string }> = {
  high: { variant: 'error', label: 'High Priority' },
  medium: { variant: 'warning', label: 'Recommended' },
  positive: { variant: 'success', label: 'Stretch Goal' },
};

const CATEGORY_LABEL: Record<string, string> = {
  remediation: 'Topic Remediation',
  misconception: 'Misconception Fix',
  integrity: 'Assessment Integrity',
  differentiation: 'Learner Support',
};

export default function TeacherAiInsightsPanel({
  handledYearLevel,
  draftingRemedial = false,
  onDraftRemedialQuiz,
}: TeacherAiInsightsPanelProps) {
  const [selectedQuizId, setSelectedQuizId] = useState<string>('');
  const [insights, setInsights] = useState<TeacherInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsightsPayload = useCallback(async (quizIdValue: string, forceRefresh = false) => {
    const params = new URLSearchParams();
    if (quizIdValue) params.set('quiz_id', quizIdValue);
    if (forceRefresh) params.set('refresh', '1');
    const qs = params.toString();
    return lmsFetch<TeacherInsightsResponse>(`/teacher/insights${qs ? `?${qs}` : ''}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchInsightsPayload(selectedQuizId, false)
      .then((data) => {
        if (!cancelled) {
          setInsights(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to generate AI teaching insights.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedQuizId, fetchInsightsPayload]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const data = await fetchInsightsPayload(selectedQuizId, true);
      setInsights(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to refresh AI teaching insights.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleFilterChange = (nextQuizId: string) => {
    setLoading(true);
    setSelectedQuizId(nextQuizId);
  };

  const effectiveYear = insights?.summary.handled_year_level ?? handledYearLevel ?? null;
  const isGemini = insights?.ai.source === 'gemini';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--accent-purple-light)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700 }}>
            INTELLIGENT FEEDBACK &amp; PEDAGOGY COACH
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', margin: 0 }}>
              AI Teaching Insights
            </h1>
            {effectiveYear && (
              <Badge variant="warning">Handles: {effectiveYear}</Badge>
            )}
            {insights && (
              <Badge variant={isGemini ? 'primary' : 'success'}>
                {isGemini ? 'Gemini AI Synthesis' : 'Smart Mastery Telemetry'}
              </Badge>
            )}
          </div>
          <p style={{ color: 'var(--neutral-300)', margin: '0.35rem 0 0' }}>
            Item-level misconception detection, mastery bands, section comparisons, and prioritized AI remediation actions.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <select
            aria-label="Filter insights by quiz"
            className="form-select"
            value={selectedQuizId}
            onChange={(e) => handleFilterChange(e.target.value)}
            style={{ minWidth: '230px', height: '40px', margin: 0 }}
          >
            <option value="">All Assessments ({insights?.quizzes.length ?? 0})</option>
            {(insights?.quizzes || []).map((q) => (
              <option key={q.id} value={String(q.id)}>
                {q.title} ({q.attempts_count} {q.attempts_count === 1 ? 'attempt' : 'attempts'})
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            onClick={() => void handleRefresh()}
            disabled={loading || refreshing}
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : undefined} />
            {refreshing ? 'Analyzing…' : 'Refresh AI Insights'}
          </Button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 83, 80, 0.2)', border: '1px solid var(--error)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#ffcdd2' }}>
          {error}
        </div>
      )}

      {loading && !insights ? (
        <GlassCard style={{ textAlign: 'center', padding: '3rem' }}>
          <Sparkles size={38} style={{ color: 'var(--accent-purple-light)', margin: '0 auto 0.75rem' }} />
          <div style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem' }}>Synthesizing Class Telemetry &amp; AI Recommendations…</div>
          <p style={{ color: 'var(--neutral-400)', marginTop: '0.4rem' }}>Evaluating question miss rates, competency mastery, and block gaps.</p>
        </GlassCard>
      ) : !insights || insights.summary.total_attempts === 0 ? (
        <GlassCard style={{ textAlign: 'center', padding: '3rem' }}>
          <Sparkles size={42} style={{ color: 'var(--accent-purple-light)', margin: '0 auto 0.75rem' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'white', margin: 0 }}>
            {insights?.ai.headline || 'No Assessment Telemetry Yet'}
          </h3>
          <p style={{ color: 'var(--neutral-300)', marginTop: '0.5rem', maxWidth: '560px', marginInline: 'auto', lineHeight: 1.6 }}>
            {insights?.ai.executive_summary || 'Once students complete published quizzes, AI teaching insights, common wrong answers, and one-click remedial quiz drafts will appear here.'}
          </p>
        </GlassCard>
      ) : (
        <>
          {/* Row 1: Executive AI Diagnosis + Mastery Distribution */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
            <GlassCard style={{ borderLeft: '4px solid var(--accent-purple-light)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: 'var(--accent-purple-light)', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                    <Sparkles size={15} /> AI Instructional Diagnosis
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--neutral-400)' }}>
                    {insights.summary.total_attempts} attempts • {insights.summary.unique_students} students
                  </span>
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', margin: '0 0 0.55rem', lineHeight: 1.3 }}>
                  {insights.ai.headline}
                </h2>
                <p style={{ color: 'var(--neutral-200)', lineHeight: 1.6, fontSize: '0.9rem', margin: 0 }}>
                  {insights.ai.executive_summary}
                </p>
              </div>

              {insights.remedial_draft && (
                <div style={{ padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.35)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                    <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#e9d5ff', textTransform: 'uppercase' }}>
                      Targeted Remedial Practice Ready
                    </div>
                    <div style={{ fontSize: '0.84rem', color: 'var(--neutral-200)', marginTop: '0.15rem' }}>
                      {insights.remedial_draft.topic} ({insights.remedial_draft.count} items • {insights.remedial_draft.difficulty})
                    </div>
                  </div>
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={draftingRemedial}
                    isLoading={draftingRemedial}
                    onClick={() => onDraftRemedialQuiz(insights.remedial_draft!)}
                  >
                    <Wand2 size={14} /> Draft Remedial Quiz
                  </Button>
                </div>
              )}
            </GlassCard>

            <GlassCard style={{ borderLeft: '4px solid var(--primary-400)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: 'var(--primary-300)', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                    <Target size={15} /> Mastery Bands &amp; Integrity
                  </span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white' }}>
                    {insights.summary.average_percentage}% avg
                  </span>
                </div>

                {/* Mastery distribution bars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {[
                    { label: 'Proficient (80%–100%)', data: insights.mastery_bands.proficient, color: '#34d399' },
                    { label: 'Developing (60%–79%)', data: insights.mastery_bands.developing, color: '#fbbf24' },
                    { label: 'At Risk (< 60%)', data: insights.mastery_bands.at_risk, color: '#f87171' },
                  ].map((band) => (
                    <div key={band.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.3rem', color: 'var(--neutral-200)' }}>
                        <span>{band.label}</span>
                        <span style={{ fontWeight: 700, color: band.color }}>
                          {band.data.count} ({band.data.pct}%)
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ width: `${band.data.pct}%`, height: '100%', background: band.color, transition: 'width 0.35s ease' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.65rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.85rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--neutral-400)', textTransform: 'uppercase' }}>Pass Rate (&ge;75%)</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#6ee7b7' }}>{insights.summary.pass_rate}%</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--neutral-400)', textTransform: 'uppercase' }}>At-Risk Attempts</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: insights.summary.at_risk_count > 0 ? '#fca5a5' : 'white' }}>
                    {insights.summary.at_risk_count}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--neutral-400)', textTransform: 'uppercase' }}>Integrity Flags</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: insights.summary.flagged_attempts > 0 ? '#fde68a' : '#6ee7b7' }}>
                    {insights.summary.flagged_attempts}
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Row 2: AI Actionable Recommendations + Teaching Strategies */}
          <GlassCard>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <BookOpen size={18} style={{ color: '#fbbf24' }} /> Prioritized AI Teaching Recommendations
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--neutral-400)' }}>
                Ranked by classroom impact &amp; error frequency
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1rem' }}>
              {insights.ai.recommendations.map((rec, idx) => {
                const prio = PRIORITY_BADGE[rec.priority] ?? PRIORITY_BADGE.medium;
                return (
                  <div
                    key={`${rec.title}-${idx}`}
                    style={{
                      background: 'rgba(255,255,255,0.035)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '0.65rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem', flexWrap: 'wrap' }}>
                        <Badge variant={prio.variant}>{prio.label}</Badge>
                        <span style={{ fontSize: '0.72rem', color: 'var(--neutral-400)', fontWeight: 600 }}>
                          {CATEGORY_LABEL[rec.category] || 'Teaching Action'}
                        </span>
                      </div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'white', margin: '0 0 0.35rem' }}>{rec.title}</h4>
                      <p style={{ fontSize: '0.84rem', color: 'var(--neutral-300)', lineHeight: 1.5, margin: 0 }}>
                        {rec.rationale}
                      </p>
                    </div>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.6rem', fontSize: '0.82rem', color: '#fde68a', lineHeight: 1.45 }}>
                      <strong>Next Action:</strong> {rec.action_step}
                      <div style={{ fontSize: '0.74rem', color: 'var(--neutral-400)', marginTop: '0.25rem' }}>
                        Target Group: {rec.target_group}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {insights.ai.teaching_strategies.length > 0 && (
              <div style={{ marginTop: '1.15rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '0.6rem' }}>
                  Suggested Next-Session Lesson Tactics
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.65rem' }}>
                  {insights.ai.teaching_strategies.map((strategy, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.84rem', color: 'var(--neutral-200)', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 'var(--radius-sm)', padding: '0.65rem 0.8rem' }}>
                      <CheckCircle2 size={15} style={{ color: '#34d399', flexShrink: 0, marginTop: '0.15rem' }} />
                      <span>{strategy}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>

          {/* Row 3: Weakest Competencies + Most Missed Questions */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
            <GlassCard>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', margin: '0 0 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <TrendingDown size={18} style={{ color: '#f87171' }} /> Competency Accuracy Breakdown
              </h3>
              {insights.weak_competencies.length === 0 ? (
                <p style={{ color: 'var(--neutral-400)', fontSize: '0.88rem' }}>No skill-level item breakdown recorded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {insights.weak_competencies.map((comp, idx) => {
                    const barColor = comp.status === 'critical' ? '#f87171' : comp.status === 'needs_review' ? '#fbbf24' : '#34d399';
                    return (
                      <div key={`${comp.competency}-${idx}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', fontSize: '0.86rem', marginBottom: '0.28rem' }}>
                          <span style={{ color: 'white', fontWeight: 600 }}>{comp.competency}</span>
                          <span style={{ color: barColor, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {comp.accuracy}% ({comp.missed_count} missed)
                          </span>
                        </div>
                        <div style={{ width: '100%', height: '7px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ width: `${comp.accuracy}%`, height: '100%', background: barColor }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </GlassCard>

            <GlassCard>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', margin: '0 0 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={18} style={{ color: '#fbbf24' }} /> Most Missed Assessment Items
              </h3>
              {insights.missed_questions.length === 0 ? (
                <p style={{ color: 'var(--neutral-400)', fontSize: '0.88rem' }}>No missed items detected across submitted responses.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {insights.missed_questions.map((item) => (
                    <div
                      key={`${item.quiz_id}-${item.question_index}`}
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-sm)', padding: '0.75rem 0.85rem' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--neutral-400)' }}>
                          {item.quiz_title} • Q{item.question_index} ({item.skill})
                        </span>
                        <Badge variant={item.miss_rate >= 50 ? 'error' : 'warning'}>{item.miss_rate}% Missed</Badge>
                      </div>
                      <div style={{ color: 'white', fontSize: '0.86rem', fontWeight: 600, lineHeight: 1.4 }}>{item.prompt}</div>
                      {item.most_common_wrong_answer && (
                        <div style={{ fontSize: '0.76rem', color: '#fca5a5', marginTop: '0.3rem' }}>
                          Common Misconception: {item.most_common_wrong_answer}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>

          {/* Row 4: Section Comparison & At-Risk Student Intervention List */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
            <GlassCard>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', margin: '0 0 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <Layers size={18} style={{ color: 'var(--primary-300)' }} /> Block Performance Comparison
              </h3>
              {insights.section_breakdown.length === 0 ? (
                <p style={{ color: 'var(--neutral-400)', fontSize: '0.88rem' }}>No block-level attempts recorded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {insights.section_breakdown.map((sec) => (
                    <div
                      key={sec.section}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.8rem', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div>
                        <div style={{ color: 'white', fontWeight: 700, fontSize: '0.9rem' }}>
                          {sec.section} <span style={{ color: 'var(--neutral-400)', fontWeight: 500, fontSize: '0.78rem' }}>({sec.year_level})</span>
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--neutral-400)' }}>
                          {sec.students_count} student(s) • {sec.attempts_count} attempt(s)
                          {sec.flagged_attempts > 0 && ` • ${sec.flagged_attempts} integrity flag(s)`}
                        </div>
                      </div>
                      <Badge variant={sec.status === 'strong' ? 'success' : sec.status === 'developing' ? 'warning' : 'error'}>
                        {sec.average_percentage}% avg
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            <GlassCard>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', margin: '0 0 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={18} style={{ color: '#f87171' }} /> Priority Student Interventions
              </h3>
              {insights.at_risk_students.length === 0 ? (
                <div style={{ color: '#6ee7b7', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={16} /> No learners currently flagged below the 75% mastery threshold.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {insights.at_risk_students.map((st) => (
                    <div
                      key={st.student_id}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.8rem', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)' }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: 'white', fontWeight: 700, fontSize: '0.9rem' }}>
                          {st.name} <span style={{ color: 'var(--neutral-400)', fontWeight: 500, fontSize: '0.78rem' }}>({st.section})</span>
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--neutral-300)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span>Latest: {st.latest_quiz_title}</span>
                          {st.violations > 0 && (
                            <span style={{ color: '#fde68a', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                              <ShieldAlert size={12} /> {st.violations} flag(s)
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant={st.priority === 'high' ? 'error' : 'warning'}>
                        {st.average_percentage}% avg
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        </>
      )}
    </div>
  );
}
