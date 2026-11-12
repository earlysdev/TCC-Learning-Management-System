import { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Layers, Shuffle, UserRoundCheck, UsersRound } from 'lucide-react';
import type { Quiz, User } from '../../lib/types';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { useToastContext } from '../../contexts/ToastContext';

export type AudienceType = 'all' | 'section' | 'individual';

export interface SectionOption {
  id: string | number;
  label: string;
  studentCount?: number;
}

export interface PublishAudience {
  type: AudienceType;
  section_ids: Array<string | number>;
  student_ids: number[];
  time_limit_minutes: number;
  shuffle_questions: boolean;
  quiz_type: 'formative' | 'summative';
  allow_review: boolean;
}

interface PublishQuizModalProps {
  quiz: Quiz | null;
  isOpen: boolean;
  students: User[];
  sections: SectionOption[];
  handledYearLevel?: string | null;
  busy?: boolean;
  onClose: () => void;
  onPublish: (audience: PublishAudience) => void;
}

const audienceChoices: Array<{ type: AudienceType; label: string; detail: string; icon: typeof UsersRound }> = [
  { type: 'all', label: 'All students', detail: 'Make this quiz available to every enrolled student.', icon: UsersRound },
  { type: 'section', label: 'Selected blocks', detail: 'Choose one or more class blocks (Block - 1A..4E).', icon: Layers },
  { type: 'individual', label: 'Individual students', detail: 'Choose specific learners from your roster.', icon: UserRoundCheck },
];

const presetMinutes = [5, 10, 15, 20, 30, 45, 60];

export default function PublishQuizModal({ quiz, isOpen, students, sections, handledYearLevel = null, busy = false, onClose, onPublish }: PublishQuizModalProps) {
  const { showToast } = useToastContext();
  const [audienceType, setAudienceType] = useState<AudienceType>('all');
  const [sectionIds, setSectionIds] = useState<Array<string | number>>([]);
  const [studentIds, setStudentIds] = useState<number[]>([]);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(15);
  const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(false);
  const [quizType, setQuizType] = useState<'formative' | 'summative'>('formative');
  const [allowReview, setAllowReview] = useState<boolean>(true);
  const [search, setSearch] = useState('');

  const questionCount = quiz ? (quiz.questions?.length ?? quiz.question_count ?? 0) : 0;
  const canShuffle = questionCount >= 3;

  useEffect(() => {
    if (isOpen && quiz) {
      setAudienceType(quiz.target_type || quiz.audience_type || 'all');
      setSectionIds(quiz.target_sections || []);
      setStudentIds(quiz.target_student_ids || []);
      setTimeLimitMinutes(Number(quiz.time_limit_minutes) > 0 ? Number(quiz.time_limit_minutes) : 15);
      const qCount = quiz.questions?.length ?? quiz.question_count ?? 0;
      setShuffleQuestions(qCount >= 3 ? Boolean(quiz.shuffle_questions ?? true) : false);
      setQuizType(quiz.quiz_type === 'summative' ? 'summative' : 'formative');
      setAllowReview(quiz.allow_review ?? true);
      setSearch('');
    }
  }, [isOpen, quiz]);

  const matchingStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students;
    return students.filter((student) => [student.name, student.email, student.lrn, student.grade, student.section]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term)));
  }, [search, students]);

  if (!quiz) return null;

  const canPublish = (
    audienceType === 'all'
    || (audienceType === 'section' && sectionIds.length > 0)
    || (audienceType === 'individual' && studentIds.length > 0)
  ) && timeLimitMinutes >= 1 && timeLimitMinutes <= 300;

  const toggleSection = (id: string | number) => {
    setSectionIds((current) => {
      const next = current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id];
      showToast(`Selected ${next.length} block${next.length === 1 ? '' : 's'}.`, 'info');
      return next;
    });
  };

  const toggleStudent = (id: number) => {
    setStudentIds((current) => {
      const next = current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id];
      showToast(`Selected ${next.length} student${next.length === 1 ? '' : 's'}.`, 'info');
      return next;
    });
  };

  const audienceSummary = audienceType === 'all'
    ? (handledYearLevel ? `all ${handledYearLevel} students` : 'all enrolled students')
    : audienceType === 'section'
      ? `${sectionIds.length} selected block${sectionIds.length === 1 ? '' : 's'}`
      : `${studentIds.length} selected student${studentIds.length === 1 ? '' : 's'}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Publish: ${quiz.title}`}
      footer={(
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="success"
            disabled={!canPublish || busy}
            isLoading={busy}
            onClick={() => onPublish({
              type: audienceType,
              section_ids: sectionIds,
              student_ids: studentIds,
              time_limit_minutes: Math.max(1, Math.min(300, timeLimitMinutes || 15)),
              shuffle_questions: canShuffle ? shuffleQuestions : false,
              quiz_type: quizType,
              allow_review: allowReview,
            })}
          >
            Publish to {audienceSummary}
          </Button>
        </>
      )}
    >
      <div style={{ maxHeight: '68vh', overflowY: 'auto', paddingRight: '0.35rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        <p style={{ margin: 0, color: 'var(--neutral-300)', fontSize: '0.9rem' }}>
          Choose the target student audience, assessment mode (Formative or Summative), countdown timer, and answer review settings.
        </p>

        {/* Quiz Type Selector (Formative vs Summative) */}
        <div>
          <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            Quiz Type (Assessment Mode)
          </strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setQuizType('formative')}
              style={{
                textAlign: 'left',
                color: 'white',
                cursor: 'pointer',
                border: `1px solid ${quizType === 'formative' ? 'var(--success)' : 'var(--glass-border)'}`,
                background: quizType === 'formative' ? 'rgba(67,160,71,0.18)' : 'rgba(255,255,255,0.035)',
                borderRadius: 'var(--radius-md)',
                padding: '0.8rem 0.9rem',
              }}
            >
              <strong style={{ display: 'block', fontSize: '0.9rem', color: quizType === 'formative' ? '#a5d6a7' : 'white' }}>
                Formative · Live Student View
              </strong>
              <span style={{ display: 'block', color: 'var(--neutral-300)', fontSize: '0.78rem', lineHeight: 1.4, marginTop: '0.25rem' }}>
                Watch a live real-time view of students currently taking the quiz.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setQuizType('summative')}
              style={{
                textAlign: 'left',
                color: 'white',
                cursor: 'pointer',
                border: `1px solid ${quizType === 'summative' ? '#fbbf24' : 'var(--glass-border)'}`,
                background: quizType === 'summative' ? 'rgba(245,158,11,0.16)' : 'rgba(255,255,255,0.035)',
                borderRadius: 'var(--radius-md)',
                padding: '0.8rem 0.9rem',
              }}
            >
              <strong style={{ display: 'block', fontSize: '0.9rem', color: quizType === 'summative' ? '#fbbf24' : 'white' }}>
                Summative · Wait Until Submitted
              </strong>
              <span style={{ display: 'block', color: 'var(--neutral-300)', fontSize: '0.78rem', lineHeight: 1.4, marginTop: '0.25rem' }}>
                Formal exam mode: results appear only after students finish and submit.
              </span>
            </button>
          </div>
        </div>

        {/* Target Audience Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
          {audienceChoices.map((choice) => {
            const Icon = choice.icon;
            const selected = audienceType === choice.type;
            return (
              <button
                type="button"
                key={choice.type}
                onClick={() => setAudienceType(choice.type)}
                style={{ textAlign: 'left', color: 'white', cursor: 'pointer', border: `1px solid ${selected ? 'var(--primary-400)' : 'var(--glass-border)'}`, background: selected ? 'rgba(63,81,181,0.22)' : 'rgba(255,255,255,0.035)', borderRadius: 'var(--radius-md)', padding: '0.85rem' }}
              >
                <Icon size={19} style={{ color: selected ? 'var(--primary-300)' : 'var(--neutral-400)', marginBottom: '0.45rem' }} />
                <strong style={{ display: 'block', fontSize: '0.9rem' }}>{choice.label}</strong>
                <span style={{ display: 'block', color: 'var(--neutral-300)', fontSize: '0.78rem', lineHeight: 1.4, marginTop: '0.25rem' }}>{choice.detail}</span>
              </button>
            );
          })}
        </div>

        {audienceType === 'section' && (
          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
            <h3 style={{ color: 'white', fontSize: '1rem', margin: 0 }}>Select blocks</h3>
            {sections.length === 0 ? (
              <p style={{ color: 'var(--neutral-300)', fontSize: '0.88rem' }}>No blocks are available in the current roster. Add student block details first.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginTop: '0.75rem' }}>
                {sections.map((section) => {
                  const selected = sectionIds.includes(section.id);
                  return (
                    <label key={String(section.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', border: `1px solid ${selected ? 'var(--success)' : 'var(--glass-border)'}`, background: selected ? 'rgba(67,160,71,0.12)' : 'rgba(255,255,255,0.025)', padding: '0.65rem', borderRadius: 'var(--radius-sm)' }}>
                      <input type="checkbox" checked={selected} onChange={() => toggleSection(section.id)} style={{ accentColor: 'var(--success)' }} />
                      <span style={{ color: 'white', fontSize: '0.88rem', flex: 1 }}>{section.label}</span>
                      {section.studentCount !== undefined && <span style={{ color: 'var(--neutral-400)', fontSize: '0.75rem' }}>{section.studentCount}</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {audienceType === 'individual' && (
          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
            <label className="form-group">
              <span className="form-label">Find a student</span>
              <input className="form-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, ID, or block" />
            </label>
            {students.length === 0 ? (
              <p style={{ color: 'var(--neutral-300)', fontSize: '0.88rem' }}>No students are available in the current roster.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '220px', overflowY: 'auto' }}>
                {matchingStudents.map((student) => {
                  const selected = studentIds.includes(student.id);
                  return (
                    <label key={student.id} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.65rem', border: `1px solid ${selected ? 'var(--success)' : 'var(--glass-border)'}`, background: selected ? 'rgba(67,160,71,0.12)' : 'rgba(255,255,255,0.025)', padding: '0.65rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                      <input type="checkbox" checked={selected} onChange={() => toggleStudent(student.id)} style={{ accentColor: 'var(--success)' }} />
                      <span style={{ flex: 1 }}>
                        <strong style={{ display: 'block', color: 'white', fontSize: '0.88rem' }}>{student.name}</strong>
                        <span style={{ display: 'block', color: 'var(--neutral-400)', fontSize: '0.75rem' }}>{[student.section, student.lrn].filter(Boolean).join(' · ') || student.email}</span>
                      </span>
                      {selected && <Check size={16} style={{ color: 'var(--success)' }} />}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Time Limit Configuration */}
        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock3 size={18} style={{ color: '#fbbf24' }} />
              <strong style={{ color: 'white', fontSize: '0.95rem' }}>Time Limit (Minutes)</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <input
                type="number"
                min={1}
                max={300}
                value={timeLimitMinutes}
                onChange={(event) => setTimeLimitMinutes(Math.max(1, Math.min(300, Number(event.target.value) || 1)))}
                className="form-input"
                style={{ width: '82px', padding: '0.35rem 0.55rem', textAlign: 'center', fontWeight: 700, color: '#fbbf24' }}
                aria-label="Time Limit in Minutes"
              />
              <span style={{ fontSize: '0.82rem', color: 'var(--neutral-300)' }}>mins</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            {presetMinutes.map((mins) => {
              const active = timeLimitMinutes === mins;
              return (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setTimeLimitMinutes(mins)}
                  style={{
                    cursor: 'pointer',
                    padding: '0.35rem 0.7rem',
                    borderRadius: '999px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    border: `1px solid ${active ? '#fbbf24' : 'var(--glass-border)'}`,
                    background: active ? 'rgba(251, 191, 36, 0.18)' : 'rgba(255,255,255,0.03)',
                    color: active ? '#fbbf24' : 'var(--neutral-300)',
                  }}
                >
                  {mins}m
                </button>
              );
            })}
          </div>
        </div>

        {/* Allow Answer Review Checkbox */}
        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
          <label
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.85rem',
              padding: '0.8rem 0.95rem',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${allowReview ? 'rgba(67,160,71,0.45)' : 'var(--glass-border)'}`,
              background: allowReview ? 'rgba(67,160,71,0.14)' : 'rgba(255,255,255,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ background: allowReview ? 'rgba(67, 160, 71, 0.25)' : 'rgba(255,255,255,0.06)', padding: '0.5rem', borderRadius: '8px', color: allowReview ? '#a5d6a7' : 'var(--neutral-400)' }}>
                <Check size={18} />
              </div>
              <div>
                <strong style={{ display: 'block', color: 'white', fontSize: '0.92rem' }}>
                  Allow Answer Review After Submission
                </strong>
                <span style={{ display: 'block', color: 'var(--neutral-300)', fontSize: '0.78rem', marginTop: '0.15rem' }}>
                  When checked, students can review the quiz questions, their selected answers, and the correct answer key after submitting.
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={allowReview}
              onChange={(event) => setAllowReview(event.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--success)', cursor: 'pointer' }}
            />
          </label>
        </div>

        {/* Shuffle Questions Toggle · Visible only when the quiz has 3 or more questions */}
        {canShuffle && (
          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
            <label
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.85rem',
                padding: '0.8rem 0.95rem',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${shuffleQuestions ? 'var(--primary-400)' : 'var(--glass-border)'}`,
                background: shuffleQuestions ? 'rgba(63,81,181,0.18)' : 'rgba(255,255,255,0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ background: shuffleQuestions ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255,255,255,0.06)', padding: '0.5rem', borderRadius: '8px', color: shuffleQuestions ? '#fbbf24' : 'var(--neutral-400)' }}>
                  <Shuffle size={18} />
                </div>
                <div>
                  <strong style={{ display: 'block', color: 'white', fontSize: '0.92rem' }}>
                    Shuffle Questions
                  </strong>
                  <span style={{ display: 'block', color: 'var(--neutral-300)', fontSize: '0.78rem', marginTop: '0.15rem' }}>
                    Randomize question order for each student attempt ({questionCount} questions available).
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(event) => setShuffleQuestions(event.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--primary-400)', cursor: 'pointer' }}
              />
            </label>
          </div>
        )}

        <div style={{ borderRadius: 'var(--radius-md)', padding: '0.75rem 0.9rem', background: 'rgba(63,81,181,0.14)', color: 'var(--neutral-200)', fontSize: '0.85rem' }}>
          This quiz will be published to <strong style={{ color: 'white' }}>{audienceSummary}</strong> with a <strong style={{ color: '#fbbf24' }}>{timeLimitMinutes}-minute</strong> time limit{canShuffle ? (shuffleQuestions ? ' and shuffled questions' : ' (fixed question order)') : ''}.
        </div>
      </div>
    </Modal>
  );
}
