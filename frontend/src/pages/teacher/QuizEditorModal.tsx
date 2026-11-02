import { useEffect, useState, useRef } from 'react';
import { 
  Plus, Trash2, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, 
  Award, CheckCircle2, Clock3, Shuffle, FileText, Sparkles, Upload, X 
} from 'lucide-react';
import type { Question, Quiz, Subject } from '../../lib/types';
import { BSIT_SUBJECT_OPTIONS } from '../../lib/constants';
import { readPdfFile } from '../../lib/pdfUtils';
import { lmsFetch } from '../../lmsApi';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';

export interface QuizEditorValues {
  id: number;
  title: string;
  subject: string;
  topic: string;
  instructions: string;
  reference_pdf_name?: string | null;
  reference_pdf_text?: string | null;
  pdf_base64?: string | null;
  quiz_type: 'formative' | 'summative';
  allow_review: boolean;
  time_limit_minutes: number;
  shuffle_questions: boolean;
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
  const qList = quiz.questions || [];
  return {
    id: quiz.id,
    title: quiz.title,
    subject: quiz.subject,
    topic: quiz.topic,
    instructions: quiz.instructions || '',
    reference_pdf_name: quiz.reference_pdf_name || null,
    reference_pdf_text: quiz.reference_pdf_text || null,
    pdf_base64: null,
    quiz_type: quiz.quiz_type === 'summative' ? 'summative' : 'formative',
    allow_review: Boolean(quiz.allow_review),
    time_limit_minutes: Number(quiz.time_limit_minutes) > 0 ? Number(quiz.time_limit_minutes) : 15,
    shuffle_questions: qList.length >= 3 ? Boolean(quiz.shuffle_questions ?? true) : false,
    questions: qList.map((question) => ({
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
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'challenging'>('medium');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!quiz) {
      setDraft(null);
      return;
    }
    const savedRaw = localStorage.getItem(`tcc_quiz_draft_${quiz.id}`);
    if (savedRaw) {
      try {
        const parsed = JSON.parse(savedRaw) as QuizEditorValues;
        if (parsed && parsed.id === quiz.id && Array.isArray(parsed.questions)) {
          setDraft(parsed);
          setValidationError(null);
          return;
        }
      } catch {
        // Ignore invalid local draft
      }
    }
    setDraft(toEditorValues(quiz));
    setValidationError(null);
  }, [quiz, isOpen]);

  useEffect(() => {
    if (quiz && draft && draft.id === quiz.id) {
      localStorage.setItem(`tcc_quiz_draft_${quiz.id}`, JSON.stringify(draft));
    }
  }, [quiz, draft]);

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

  // Shuffle questions order when there are 3 or more questions
  const shuffleQuestionsOrder = () => {
    if (!draft || draft.questions.length < 3) return;
    setDraft((current) => {
      if (!current || current.questions.length < 3) return current;
      const shuffled = [...current.questions];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = temp;
      }
      return { ...current, questions: shuffled };
    });
  };

  // Randomize option positions (A, B, C, D) for all questions while preserving the real answer
  const randomizeAnswerChoices = () => {
    if (!draft || draft.questions.length === 0) return;
    setDraft((current) => {
      if (!current) return current;
      let prevIdx = -1;
      const updatedQuestions = current.questions.map((q) => {
        const opts = [...q.options];
        const currentCorrectIdx = Math.max(0, Math.min(opts.length - 1, q.correct_index || 0));
        const realAnswerText = opts[currentCorrectIdx];
        const distractors = opts.filter((_, i) => i !== currentCorrectIdx);
        for (let i = distractors.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = distractors[i];
          distractors[i] = distractors[j];
          distractors[j] = tmp;
        }
        let targetPos = Math.floor(Math.random() * opts.length);
        if (targetPos === prevIdx && opts.length > 1) {
          targetPos = (targetPos + 1 + Math.floor(Math.random() * (opts.length - 1))) % opts.length;
        }
        distractors.splice(targetPos, 0, realAnswerText);
        prevIdx = targetPos;
        return {
          ...q,
          options: distractors,
          correct_index: targetPos,
        };
      });
      return { ...current, questions: updatedQuestions };
    });
    setAiNotice('Answer choices (A–D) have been randomized across all questions while preserving each true answer.');
  };

  const setQuestionCount = (nextCount: number) => {
    const safeCount = Math.max(1, Math.min(50, nextCount));
    setDraft((current) => {
      if (!current) return current;
      if (safeCount === current.questions.length) return current;
      if (safeCount > current.questions.length) {
        const additional = Array.from({ length: safeCount - current.questions.length }, () => emptyQuestion());
        return { ...current, questions: [...current.questions, ...additional] };
      }
      return { ...current, questions: current.questions.slice(0, safeCount) };
    });
  };

  const handleSelectPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setValidationError('Please upload a valid PDF (.pdf) document.');
      return;
    }
    try {
      setValidationError(null);
      const parsed = await readPdfFile(file);
      setDraft((current) => {
        if (!current) return current;
        const nextInstructions = current.instructions.trim()
          ? current.instructions
          : `Refer to the attached PDF handout (${parsed.name}) and choose the best answer for each question. Alt-tabbing, taking screenshots, or opening developer tools is strictly prohibited and monitored.`;
        return {
          ...current,
          reference_pdf_name: parsed.name,
          reference_pdf_text: parsed.text,
          pdf_base64: parsed.base64,
          instructions: nextInstructions,
        };
      });
      setAiNotice(`PDF "${parsed.name}" attached for quiz instructions, AI question generation, and post-quiz study feedback.`);
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : 'Could not read the selected PDF file.');
    } finally {
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const handleGenerateQuestionsWithAi = async () => {
    if (!draft) return;
    const cleanTopic = draft.topic.trim() || draft.title.trim();
    const cleanSubject = draft.subject.trim();
    if (!cleanTopic || !cleanSubject) {
      setValidationError('Enter a Subject and Topic / Unit before generating questions with AI.');
      return;
    }
    setAiGenerating(true);
    setValidationError(null);
    setAiNotice(null);
    try {
      const targetCount = Math.max(1, Math.min(50, draft.questions.length || 5));
      const res = await lmsFetch<{
        questions: Array<{ prompt: string; options: string[]; correct_index: number; skill?: string }>;
        generation_source?: string;
        reference_pdf_name?: string | null;
        reference_pdf_text?: string | null;
      }>('/teacher/quizzes/generate', {
        method: 'POST',
        body: JSON.stringify({
          preview_only: true,
          title: draft.title.trim() || cleanTopic,
          subject: cleanSubject,
          topic: cleanTopic,
          count: targetCount,
          difficulty: aiDifficulty,
          pdf_name: draft.reference_pdf_name,
          pdf_text: draft.reference_pdf_text,
          pdf_base64: draft.pdf_base64,
        }),
      });
      if (Array.isArray(res.questions) && res.questions.length > 0) {
        setDraft((current) => {
          if (!current) return current;
          return {
            ...current,
            reference_pdf_name: res.reference_pdf_name ?? current.reference_pdf_name,
            reference_pdf_text: res.reference_pdf_text ?? current.reference_pdf_text,
            questions: res.questions.map((q) => ({
              prompt: q.prompt || '',
              skill: q.skill || cleanTopic,
              points: 1,
              options: Array.from({ length: 4 }, (_, idx) => q.options?.[idx] || ''),
              correct_index: Number.isInteger(q.correct_index) ? Number(q.correct_index) : 0,
            })),
          };
        });
        setAiNotice(
          draft.reference_pdf_name
            ? `Generated ${res.questions.length} questions from PDF "${draft.reference_pdf_name}". Review and save when ready.`
            : `Generated ${res.questions.length} questions based on topic "${cleanTopic}". Review and save when ready.`
        );
      }
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : 'Could not generate AI questions.');
    } finally {
      setAiGenerating(false);
    }
  };

  const submit = () => {
    const rawTitle = draft.title.trim();
    const rawTopic = draft.topic.trim();
    const title = rawTitle || rawTopic;
    const topic = rawTopic || rawTitle;
    const subject = draft.subject.trim();
    const instructions = draft.instructions.trim();

    if (!title || !subject || !topic) {
      setValidationError('Add a quiz title/topic and subject before saving the quiz.');
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
    localStorage.removeItem(`tcc_quiz_draft_${draft.id}`);
    onSave({
      ...draft,
      title,
      subject,
      topic,
      instructions,
      time_limit_minutes: Math.max(1, Math.min(300, Number(draft.time_limit_minutes) || 15)),
      shuffle_questions: draft.questions.length >= 3 ? Boolean(draft.shuffle_questions) : false,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--neutral-300)', fontSize: '0.85rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <Award size={15} style={{ color: '#fbbf24' }} />
              Total Points: <strong style={{ color: 'white' }}>{totalPoints} pts</strong> ({draft.questions.length} questions)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#a5d6a7', background: 'rgba(67, 160, 71, 0.15)', border: '1px solid rgba(67, 160, 71, 0.3)', padding: '0.15rem 0.55rem', borderRadius: '999px' }}>
              <CheckCircle2 size={12} /> Local Draft Auto-Saved
            </span>
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

        {aiNotice && (
          <div style={{ border: '1px solid rgba(67, 160, 71, 0.45)', background: 'rgba(67, 160, 71, 0.15)', color: '#c8e6c9', borderRadius: 'var(--radius-md)', padding: '0.7rem 1rem', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{aiNotice}</span>
          </div>
        )}

        {/* Quiz Metadata — Organized & Aligned 2-Row Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255, 255, 255, 0.02)', padding: '1.1rem', borderRadius: 'var(--radius-lg, 12px)', border: '1px solid rgba(255, 255, 255, 0.07)' }}>
          {/* Metadata Row 1: Quiz Title + Full Course Code & Subject Description */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', alignItems: 'end' }}>
            <label className="form-group" style={{ margin: 0 }}>
              <span className="form-label" style={{ display: 'flex', alignItems: 'center', minHeight: '22px', marginBottom: '0.45rem' }}>
                Quiz Title
              </span>
              <input
                className="form-input"
                value={draft.title}
                placeholder="Enter quiz title..."
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="form-label" style={{ display: 'flex', alignItems: 'center', minHeight: '22px', marginBottom: '0.45rem' }}>
                Course Code & Subject Description
              </span>
              <Select
                value={draft.subject}
                onChange={(val) => setDraft({ ...draft, subject: val })}
                style={{ margin: 0 }}
                options={subjects && subjects.length > 0
                  ? subjects.map((s) => ({
                      value: s.code && !s.name.startsWith(s.code) ? `${s.code} - ${s.name}` : s.name,
                      label: s.code && !s.name.startsWith(s.code) ? `${s.code} — ${s.name}` : s.name,
                    }))
                  : BSIT_SUBJECT_OPTIONS
                }
              />
            </div>
          </div>

          {/* Metadata Row 2: Topic / Unit + Quiz Type (Formative / Summative) + Time Limit (Minutes) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
            <label className="form-group" style={{ margin: 0 }}>
              <span className="form-label" style={{ display: 'flex', alignItems: 'center', minHeight: '22px', marginBottom: '0.45rem' }}>
                Topic / Unit
              </span>
              <input
                className="form-input"
                value={draft.topic}
                placeholder="e.g. Data Structures, Relational Databases"
                onChange={(event) => setDraft({ ...draft, topic: event.target.value })}
              />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="form-label" style={{ display: 'flex', alignItems: 'center', minHeight: '22px', marginBottom: '0.45rem' }}>
                Quiz Type (Assessment Mode)
              </span>
              <Select
                value={draft.quiz_type || 'formative'}
                onChange={(val) => setDraft({ ...draft, quiz_type: (val === 'summative' ? 'summative' : 'formative') })}
                style={{ margin: 0 }}
                options={[
                  { value: 'formative', label: 'Formative — Live Student Monitoring' },
                  { value: 'summative', label: 'Summative — Final Submission Only' },
                ]}
              />
            </div>

            <label className="form-group" style={{ margin: 0 }}>
              <span className="form-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', minHeight: '22px', marginBottom: '0.45rem' }}>
                <Clock3 size={14} style={{ color: '#fbbf24' }} /> Time Limit (Minutes)
              </span>
              <input
                type="number"
                min={1}
                max={300}
                className="form-input"
                value={draft.time_limit_minutes ?? 15}
                onChange={(event) => setDraft({ ...draft, time_limit_minutes: Math.max(1, Math.min(300, Number(event.target.value) || 15)) })}
              />
            </label>
          </div>
        </div>

        {/* Instructions for Students */}
        <label className="form-group" style={{ margin: 0 }}>
          <span className="form-label" style={{ marginBottom: '0.45rem' }}>Instructions for Students</span>
          <textarea
            className="form-input"
            rows={2}
            value={draft.instructions}
            onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
            style={{ minHeight: '68px', lineHeight: 1.5, resize: 'vertical' }}
          />
        </label>

        {/* PDF Reference Upload & AI Question Generation Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.85rem',
            padding: '0.9rem 1.1rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(245, 158, 11, 0.06)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 280px', minWidth: 0 }}>
            <div style={{ background: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24', padding: '0.5rem', borderRadius: 'var(--radius-md)', flexShrink: 0 }}>
              <FileText size={19} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: 'white', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                <span>PDF Reference & AI Quiz Generator</span>
                {draft.reference_pdf_name && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', background: 'rgba(67, 160, 71, 0.2)', color: '#a5d6a7', border: '1px solid rgba(67, 160, 71, 0.4)', padding: '0.12rem 0.5rem', borderRadius: '999px' }}>
                    <FileText size={11} /> {draft.reference_pdf_name}
                    <button
                      type="button"
                      title="Remove attached PDF"
                      onClick={() => setDraft({ ...draft, reference_pdf_name: null, reference_pdf_text: null, pdf_base64: null })}
                      style={{ background: 'transparent', border: 'none', color: '#ffcdd2', cursor: 'pointer', padding: 0, display: 'inline-flex' }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
              </div>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--neutral-300)', lineHeight: 1.4 }}>
                {draft.reference_pdf_name
                  ? 'AI will read this PDF to generate questions and provide post-quiz study feedback.'
                  : 'Upload a PDF handout for instructions & AI questions, or generate directly from the Topic / Unit.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleSelectPdf}
              style={{ display: 'none' }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => pdfInputRef.current?.click()}
              style={{ gap: '0.35rem' }}
            >
              <Upload size={14} /> {draft.reference_pdf_name ? 'Replace PDF' : 'Upload PDF'}
            </Button>

            <select
              aria-label="AI Question Difficulty"
              value={aiDifficulty}
              onChange={(e) => setAiDifficulty(e.target.value as 'easy' | 'medium' | 'challenging')}
              className="form-select"
              style={{ width: 'auto', height: '34px', padding: '0 2rem 0 0.7rem', fontSize: '0.78rem' }}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="challenging">Challenging</option>
            </select>

            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={aiGenerating || busy}
              isLoading={aiGenerating}
              onClick={handleGenerateQuestionsWithAi}
              style={{ gap: '0.35rem' }}
            >
              <Sparkles size={14} />
              {aiGenerating
                ? 'Generating...'
                : draft.reference_pdf_name
                  ? `Generate ${draft.questions.length} from PDF`
                  : `Generate ${draft.questions.length} from Topic`}
            </Button>
          </div>
        </div>

        {/* Settings Checkboxes Row — Equal Height & Aligned */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem', alignItems: 'stretch' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem', color: 'var(--neutral-200)', fontSize: '0.88rem', cursor: 'pointer', background: draft.allow_review ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.03)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: `1px solid ${draft.allow_review ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255,255,255,0.07)'}`, margin: 0 }}>
            <input
              type="checkbox"
              checked={draft.allow_review}
              onChange={(event) => setDraft({ ...draft, allow_review: event.target.checked })}
              style={{ accentColor: 'var(--accent-gold, #f59e0b)', marginTop: '0.2rem', width: '16px', height: '16px', flexShrink: 0 }}
            />
            <span>
              <strong style={{ color: 'white', display: 'block', marginBottom: '0.15rem' }}>Allow Answer Review After Submission</strong>
              Students can review full answer keys and explanations once they submit.
            </span>
          </label>

          {draft.questions.length >= 3 && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem', color: 'var(--neutral-200)', fontSize: '0.88rem', cursor: 'pointer', background: draft.shuffle_questions ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.03)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: `1px solid ${draft.shuffle_questions ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255,255,255,0.07)'}`, margin: 0 }}>
              <input
                type="checkbox"
                checked={Boolean(draft.shuffle_questions)}
                onChange={(event) => setDraft({ ...draft, shuffle_questions: event.target.checked })}
                style={{ accentColor: 'var(--accent-gold, #f59e0b)', marginTop: '0.2rem', width: '16px', height: '16px', flexShrink: 0 }}
              />
              <span>
                <strong style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.15rem' }}>
                  <Shuffle size={14} style={{ color: '#fbbf24' }} /> Shuffle Questions
                </strong>
                Randomize question order for each student attempt ({draft.questions.length} questions).
              </span>
            </label>
          )}
        </div>

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
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.05)', padding: '0.28rem 0.6rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--neutral-300)', fontWeight: 600 }}>Question Count:</span>
              <input
                type="number"
                min={1}
                max={50}
                aria-label="Total question count"
                value={draft.questions.length}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  if (!Number.isNaN(parsed)) {
                    setQuestionCount(parsed);
                  }
                }}
                style={{
                  width: '50px',
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
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={randomizeAnswerChoices}
              title="Randomize Option Positions (A–D) while keeping each question's real answer"
              style={{ gap: '0.35rem', borderColor: 'rgba(76, 175, 80, 0.4)', color: '#a5d6a7' }}
            >
              <Shuffle size={14} /> Randomize Answers (A–D)
            </Button>
            {draft.questions.length >= 3 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={shuffleQuestionsOrder}
                title="Shuffle Question Order"
                style={{ gap: '0.35rem', borderColor: 'rgba(251, 191, 36, 0.35)', color: '#fbbf24' }}
              >
                <Shuffle size={14} /> Shuffle Order
              </Button>
            )}
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
