import { useEffect, useState, useRef } from 'react';
import { 
  Plus, Trash2, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, 
  Award, CheckCircle2 
} from 'lucide-react';
import type { Question, Quiz, Subject } from '../../lib/types';
import { BSIT_SUBJECT_OPTIONS } from '../../lib/constants';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';

export interface QuizEditorValues {
  id: number;
  title: string;
  subject: string;
  topic: string;
  instructions: string;
  allow_review: boolean;
  questions: Array<Required<Pick<Question, 'prompt' | 'options' | 'correct_index'>> & { skill?: string; points?: number }>;
}

interface QuizEditorModalProps {
  quiz: Quiz | null;
  isOpen: boolean;
  busy?: boolean;
  subjects?: Subject[];
  onClose: () => void;
  onSave: (quiz: QuizEditorValues) => void;
}

const emptyQuestion = (): QuizEditorValues['questions'][number] => ({
  prompt: '',
  skill: '',
  points: 1,
  options: ['', '', '', ''],
  correct_index: 0,
});

function toEditorValues(quiz: Quiz): QuizEditorValues {
  return {
    id: quiz.id,
    title: quiz.title,
    subject: quiz.subject,
    topic: quiz.topic,
    instructions: quiz.instructions || '',
    allow_review: Boolean(quiz.allow_review),
    questions: (quiz.questions || []).map((question) => ({
      prompt: question.prompt || '',
      skill: question.skill || '',
      points: Number.isInteger(question.points) && Number(question.points) > 0 ? Number(question.points) : 1,
      options: Array.from({ length: 4 }, (_, index) => question.options?.[index] || ''),
      correct_index: Number.isInteger(question.correct_index) ? Number(question.correct_index) : 0,
    })),
  };
}

export default function QuizEditorModal({ quiz, isOpen, busy = false, subjects = [], onClose, onSave }: QuizEditorModalProps) {
  const [draft, setDraft] = useState<QuizEditorValues | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(quiz ? toEditorValues(quiz) : null);
    setValidationError(null);
  }, [quiz, isOpen]);

  if (!quiz || !draft) return null;

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  const updateQuestion = (questionIndex: number, update: Partial<QuizEditorValues['questions'][number]>) => {
    setDraft((current) => {
      if (!current) return current;
      const questions = current.questions.map((question, index) => index === questionIndex ? { ...question, ...update } : question);
      return { ...current, questions };
    });
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const options = [...draft.questions[questionIndex].options];
    options[optionIndex] = value;
    updateQuestion(questionIndex, { options });
  };

  // Direct move to top (Question reordering)
  const moveQuestionToTop = (index: number) => {
    if (index === 0) return;
    setDraft((current) => {
      if (!current) return current;
      const questions = [...current.questions];
      const [item] = questions.splice(index, 1);
      questions.unshift(item);
      return { ...current, questions };
    });
  };

  // Direct move to bottom (Question reordering)
  const moveQuestionToBottom = (index: number) => {
    if (!draft || index === draft.questions.length - 1) return;
    setDraft((current) => {
      if (!current) return current;
      const questions = [...current.questions];
      const [item] = questions.splice(index, 1);
      questions.push(item);
      return { ...current, questions };
    });
  };

  // Move up one step
  const moveQuestionUp = (index: number) => {
    if (index <= 0) return;
    setDraft((current) => {
      if (!current) return current;
      const questions = [...current.questions];
      const temp = questions[index - 1];
      questions[index - 1] = questions[index];
      questions[index] = temp;
      return { ...current, questions };
    });
  };

  // Move down one step
  const moveQuestionDown = (index: number) => {
    if (!draft || index >= draft.questions.length - 1) return;
    setDraft((current) => {
      if (!current) return current;
      const questions = [...current.questions];
      const temp = questions[index + 1];
      questions[index + 1] = questions[index];
      questions[index] = temp;
      return { ...current, questions };
    });
  };

  const submit = () => {
    const title = draft.title.trim();
    const subject = draft.subject.trim();
    const topic = draft.topic.trim();
    const instructions = draft.instructions.trim();

    if (!title || !subject || !topic) {
      setValidationError('Add a title, subject, and topic before saving the quiz.');
      return;
    }
    if (draft.questions.length === 0) {
      setValidationError('A quiz needs at least one question.');
      return;
    }
    if (draft.questions.some((question) => !question.prompt.trim() || question.options.some((option) => !option.trim()))) {
      setValidationError('Complete every question and all four answer choices before saving.');
      return;
    }

    setValidationError(null);
    onSave({
      ...draft,
      title,
      subject,
      topic,
      instructions,
      questions: draft.questions.map((question) => ({
        ...question,
        prompt: question.prompt.trim(),
        skill: question.skill?.trim() || 'General Knowledge',
        points: Number.isInteger(question.points) && Number(question.points) > 0 ? Number(question.points) : 1,
        options: question.options.map((option) => option.trim()),
      })),
    });
  };

  const totalPoints = draft.questions.reduce((sum, q) => sum + (q.points || 1), 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Quiz: ${quiz.title}`}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--neutral-300)', fontSize: '0.85rem' }}>
            <Award size={15} style={{ color: '#fbbf24' }} />
            <span>Total Points: <strong style={{ color: 'white' }}>{totalPoints} pts</strong> ({draft.questions.length} questions)</span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={submit} isLoading={busy}>Save Quiz Changes</Button>
          </div>
        </div>
      )}
    >
      <div 
        ref={scrollContainerRef}
        className="no-scrollbar smooth-scroll"
        style={{ 
          maxHeight: '68vh', 
          overflowY: 'auto', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1.25rem',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <p style={{ color: 'var(--neutral-300)', fontSize: '0.9rem', margin: 0 }}>
          Review the quiz draft, customize questions, set point values, and adjust sequencing before publishing to students.
        </p>

        {validationError && (
          <div role="alert" style={{ border: '1px solid var(--error)', background: 'rgba(239, 83, 80, 0.14)', color: '#ffcdd2', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem' }}>
            {validationError}
          </div>
        )}

        {/* Quiz Metadata */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <label className="form-group" style={{ margin: 0 }}>
            <span className="form-label">Quiz Title</span>
            <input className="form-input" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <Select
            label="Course Code & Subject Description"
            value={draft.subject}
            onChange={(val) => setDraft({ ...draft, subject: val })}
            options={subjects && subjects.length > 0
              ? subjects.map((s) => ({
                  value: s.code && !s.name.startsWith(s.code) ? `${s.code} - ${s.name}` : s.name,
                  label: s.code && !s.name.startsWith(s.code) ? `${s.code} — ${s.name}` : s.name,
                }))
              : BSIT_SUBJECT_OPTIONS
            }
          />
          <label className="form-group" style={{ margin: 0 }}>
            <span className="form-label">Topic / Unit</span>
            <input className="form-input" value={draft.topic} onChange={(event) => setDraft({ ...draft, topic: event.target.value })} />
          </label>
        </div>

        <label className="form-group" style={{ margin: 0 }}>
          <span className="form-label">Instructions for Students</span>
          <textarea
            className="form-input"
            rows={2}
            value={draft.instructions}
            onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
            style={{ minHeight: '64px', lineHeight: 1.5, resize: 'vertical' }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', color: 'var(--neutral-200)', fontSize: '0.9rem', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <input
            type="checkbox"
            checked={draft.allow_review}
            onChange={(event) => setDraft({ ...draft, allow_review: event.target.checked })}
            style={{ accentColor: 'var(--primary-400)', marginTop: '0.2rem', width: '16px', height: '16px' }}
          />
          <span>
            <strong style={{ color: 'white', display: 'block' }}>Allow Answer Review After Submission</strong>
            Students can review full answer keys and explanations once they submit.
          </span>
        </label>

        {/* Questions Header with Direct Move Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h3 style={{ color: 'white', margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Questions & Answer Key</h3>
              <span style={{ fontSize: '0.8rem', background: 'rgba(124, 58, 237, 0.25)', color: '#c4b5fd', padding: '0.2rem 0.65rem', borderRadius: '999px', fontWeight: 600, border: '1px solid rgba(167, 139, 250, 0.3)' }}>
                {draft.questions.length} questions • {totalPoints} total pts
              </span>
            </div>
            <p style={{ color: 'var(--neutral-400)', margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
              Set points, select correct answer, and customize question order.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={scrollToBottom}
              title="Direct Move to the Bottom"
              style={{ gap: '0.35rem', borderColor: 'rgba(167, 139, 250, 0.3)', color: '#ddd6fe' }}
            >
              <ChevronsDown size={14} /> Move to Bottom
            </Button>
            <Button 
              type="button" 
              variant="accent" 
              size="sm" 
              onClick={() => {
                setDraft({ ...draft, questions: [...draft.questions, emptyQuestion()] });
                setTimeout(scrollToBottom, 50);
              }}
            >
              <Plus size={15} /> Add Question
            </Button>
          </div>
        </div>

        {/* Questions List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {draft.questions.map((question, questionIndex) => (
            <section 
              key={questionIndex} 
              style={{ 
                padding: '1.25rem', 
                borderRadius: 'var(--radius-lg, 12px)', 
                border: '1px solid rgba(255, 255, 255, 0.08)', 
                background: 'rgba(255, 255, 255, 0.025)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              {/* Question Header & Action Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span style={{
                    background: 'linear-gradient(135deg, var(--primary-600), var(--accent-purple))',
                    color: 'white',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    padding: '0.2rem 0.6rem',
                    borderRadius: 'var(--radius-sm)',
                  }}>
                    Q{questionIndex + 1}
                  </span>
                  <strong style={{ color: 'white', fontSize: '1.05rem' }}>Question {questionIndex + 1}</strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {/* Question Points Input */}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <Award size={14} style={{ color: '#fbbf24' }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--neutral-300)', fontWeight: 600 }}>Points:</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={question.points ?? 1}
                      onChange={(e) => updateQuestion(questionIndex, { points: Math.max(1, parseInt(e.target.value) || 1) })}
                      style={{
                        width: '46px',
                        height: '26px',
                        background: 'rgba(16, 10, 28, 0.85)',
                        border: '1px solid rgba(167, 139, 250, 0.35)',
                        borderRadius: '4px',
                        color: 'white',
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--neutral-400)' }}>pts</span>
                  </div>

                  {/* Direct Move Controls */}
                  <div style={{ display: 'inline-flex', gap: '2px', background: 'rgba(255,255,255,0.04)', padding: '2px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={questionIndex === 0}
                      title="Direct Move thru the Top"
                      onClick={() => moveQuestionToTop(questionIndex)}
                      style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }}
                    >
                      <ChevronsUp size={14} /> Top
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={questionIndex === 0}
                      title="Move up one step"
                      onClick={() => moveQuestionUp(questionIndex)}
                      style={{ padding: '0.25rem 0.4rem' }}
                    >
                      <ArrowUp size={13} />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={questionIndex === draft.questions.length - 1}
                      title="Move down one step"
                      onClick={() => moveQuestionDown(questionIndex)}
                      style={{ padding: '0.25rem 0.4rem' }}
                    >
                      <ArrowDown size={13} />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={questionIndex === draft.questions.length - 1}
                      title="Direct Move to the Bottom"
                      onClick={() => moveQuestionToBottom(questionIndex)}
                      style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }}
                    >
                      <ChevronsDown size={14} /> Bottom
                    </Button>
                  </div>

                  {/* Remove Question */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={draft.questions.length === 1}
                    title={draft.questions.length === 1 ? 'A quiz needs at least one question' : 'Remove this question'}
                    onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, index) => index !== questionIndex) })}
                    style={{ color: '#ef5350', borderColor: 'rgba(239, 83, 80, 0.3)', padding: '0.25rem 0.55rem' }}
                  >
                    <Trash2 size={13} /> Remove
                  </Button>
                </div>
              </div>

              {/* Question Prompt (Auto-fitting with proper gap & no cramped scrollbar) */}
              <label className="form-group" style={{ margin: 0 }}>
                <span className="form-label">Question Prompt</span>
                <textarea
                  className="form-input"
                  rows={3}
                  value={question.prompt}
                  onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })}
                  placeholder="Type or edit the question prompt here..."
                  style={{
                    minHeight: '84px',
                    lineHeight: 1.55,
                    resize: 'vertical',
                    padding: '0.75rem 1rem',
                  }}
                />
              </label>

              {/* Skill / Learning Competency */}
              <label className="form-group" style={{ margin: 0 }}>
                <span className="form-label">Skill or Learning Competency (Optional)</span>
                <input 
                  className="form-input" 
                  value={question.skill || ''} 
                  placeholder="e.g. Concept recall, Critical analysis, Terminology"
                  onChange={(event) => updateQuestion(questionIndex, { skill: event.target.value })} 
                />
              </label>

              {/* 4 Multiple-Choice Options Grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--neutral-300)' }}>
                  Answer Choices (Select the correct answer):
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                  {question.options.map((option, optionIndex) => {
                    const isCorrect = question.correct_index === optionIndex;
                    return (
                      <div 
                        key={optionIndex} 
                        onClick={() => updateQuestion(questionIndex, { correct_index: optionIndex })}
                        style={{ 
                          border: `1.5px solid ${isCorrect ? 'var(--success)' : 'rgba(255, 255, 255, 0.08)'}`, 
                          background: isCorrect ? 'rgba(67, 160, 71, 0.12)' : 'rgba(255, 255, 255, 0.025)', 
                          borderRadius: 'var(--radius-md)', 
                          padding: '0.75rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                          transition: 'all 0.18s ease',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: isCorrect ? '#a5d6a7' : 'var(--neutral-300)', fontWeight: 700 }}>
                            <input
                              type="radio"
                              name={`correct-${questionIndex}`}
                              checked={isCorrect}
                              onChange={() => updateQuestion(questionIndex, { correct_index: optionIndex })}
                              style={{ accentColor: 'var(--success)', cursor: 'pointer', width: '15px', height: '15px' }}
                            />
                            Option {String.fromCharCode(65 + optionIndex)}
                          </span>
                          {isCorrect ? (
                            <span style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: '#81c784',
                              background: 'rgba(67, 160, 71, 0.25)',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '999px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}>
                              <CheckCircle2 size={12} /> Correct Answer
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateQuestion(questionIndex, { correct_index: optionIndex });
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--neutral-400)',
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                                padding: '0.1rem 0.35rem',
                                borderRadius: '4px',
                                transition: 'color 0.15s',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#c4b5fd')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--neutral-400)')}
                            >
                              Set as Correct
                            </button>
                          )}
                        </div>
                        <input 
                          className="form-input" 
                          value={option} 
                          onClick={(e) => e.stopPropagation()}
                          onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} 
                          placeholder={`Enter option ${String.fromCharCode(65 + optionIndex)} text...`} 
                          aria-label={`Question ${questionIndex + 1}, option ${String.fromCharCode(65 + optionIndex)}`} 
                          style={{
                            height: '42px',
                            fontSize: '0.9rem',
                            background: 'rgba(20, 12, 35, 0.65)',
                            borderColor: isCorrect ? 'rgba(76, 175, 80, 0.4)' : 'rgba(255,255,255,0.08)',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* Bottom Action Footer with Direct Move thru the Top */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            onClick={() => {
              setDraft({ ...draft, questions: [...draft.questions, emptyQuestion()] });
              setTimeout(scrollToBottom, 50);
            }}
          >
            <Plus size={15} /> Add Another Question
          </Button>
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            onClick={scrollToTop}
            title="Direct Move thru the Top"
            style={{ gap: '0.35rem', borderColor: 'rgba(167, 139, 250, 0.3)', color: '#ddd6fe' }}
          >
            <ChevronsUp size={14} /> Move to Top
          </Button>
        </div>
      </div>
    </Modal>
  );
}
