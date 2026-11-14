import { useEffect, useState, useRef } from 'react';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  CheckCircle2,
  Shuffle,
  FileText,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type { Question, QuestionType, Quiz, Subject } from '../../lib/types';
import { buildSubjectOptionsForYear, extractSubjectName, formatCourseLabel } from '../../lib/constants';
import { readPdfFile } from '../../lib/pdfUtils';
import { lmsFetch } from '../../lmsApi';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import { useToastContext } from '../../contexts/ToastContext';

export interface QuizEditorQuestion extends Required<Pick<Question, 'prompt' | 'options' | 'correct_index'>> {
  type: QuestionType;
  correct_indices: number[];
  correct_answer: string;
  skill?: string;
  points?: number;
}

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
  questions: QuizEditorQuestion[];
}

interface QuizEditorModalProps {
  quiz: Quiz | null;
  isOpen: boolean;
  busy?: boolean;
  subjects?: Subject[];
  handledYearLevel?: string | null;
  onClose: () => void;
  onSave: (quiz: QuizEditorValues) => void;
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  identification: 'Identification',
  true_false: 'True or False',
  multiple_answer: 'Multiple Answer',
  essay: 'Essay',
};

const emptyQuestion = (type: QuestionType = 'multiple_choice'): QuizEditorQuestion => {
  if (type === 'true_false') {
    return {
      type: 'true_false',
      prompt: '',
      skill: '',
      points: 1,
      options: ['True', 'False'],
      correct_index: 0,
      correct_indices: [0],
      correct_answer: 'True',
    };
  }
  if (type === 'identification') {
    return {
      type: 'identification',
      prompt: '',
      skill: '',
      points: 1,
      options: ['', ''],
      correct_index: 0,
      correct_indices: [0],
      correct_answer: '',
    };
  }
  if (type === 'essay') {
    return {
      type: 'essay',
      prompt: '',
      skill: '',
      points: 5,
      options: ['', ''],
      correct_index: 0,
      correct_indices: [0],
      correct_answer: '',
    };
  }
  return {
    type,
    prompt: '',
    skill: '',
    points: 1,
    options: ['', '', '', ''],
    correct_index: 0,
    correct_indices: [0],
    correct_answer: '',
  };
};

function normalizeQuestionForEditor(question: Question): QuizEditorQuestion {
  const validTypes: QuestionType[] = ['multiple_choice', 'identification', 'true_false', 'multiple_answer', 'essay'];
  const qType: QuestionType = validTypes.includes(question.type as QuestionType)
    ? (question.type as QuestionType)
    : 'multiple_choice';

  const rawOptions = Array.isArray(question.options) ? question.options.map((o) => String(o ?? '')) : [];
  let options: string[];
  if (qType === 'true_false') {
    options = ['True', 'False'];
  } else if (qType === 'identification' || qType === 'essay') {
    const ans = question.correct_answer ?? rawOptions[0] ?? '';
    options = [ans, rawOptions[1] ?? ''];
  } else {
    const count = Math.max(2, Math.min(6, rawOptions.length || 4));
    options = Array.from({ length: count }, (_, idx) => rawOptions[idx] || '');
  }

  const correctIndex = Number.isInteger(question.correct_index)
    ? Math.max(0, Math.min(options.length - 1, Number(question.correct_index)))
    : 0;

  const rawIndices =
    Array.isArray(question.correct_indices) && question.correct_indices.length > 0
      ? question.correct_indices
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 0 && n < options.length)
      : [correctIndex];
  const correctIndices = rawIndices.length > 0 ? Array.from(new Set(rawIndices)).sort((a, b) => a - b) : [0];

  const correctAnswer =
    typeof question.correct_answer === 'string'
      ? question.correct_answer
      : qType === 'identification'
        ? rawOptions[0] || ''
        : '';

  return {
    type: qType,
    prompt: question.prompt || '',
    skill: question.skill || '',
    points: Number.isInteger(question.points) && Number(question.points) > 0 ? Number(question.points) : 1,
    options,
    correct_index: correctIndex,
    correct_indices: correctIndices,
    correct_answer: correctAnswer,
  };
}

function toEditorValues(quiz: Quiz): QuizEditorValues {
  const qList = quiz.questions || [];
  const normalizedSubject = formatCourseLabel(quiz.subject);
  return {
    id: quiz.id,
    title: quiz.title,
    subject: normalizedSubject,
    topic: quiz.topic || extractSubjectName(normalizedSubject),
    instructions: quiz.instructions || '',
    reference_pdf_name: quiz.reference_pdf_name || null,
    reference_pdf_text: quiz.reference_pdf_text || null,
    pdf_base64: null,
    quiz_type: quiz.quiz_type === 'summative' ? 'summative' : 'formative',
    allow_review: Boolean(quiz.allow_review),
    time_limit_minutes: Number(quiz.time_limit_minutes) > 0 ? Number(quiz.time_limit_minutes) : 15,
    shuffle_questions: qList.length >= 3 ? Boolean(quiz.shuffle_questions ?? true) : false,
    questions: qList.map(normalizeQuestionForEditor),
  };
}

function toStorageDraftPayload(values: QuizEditorValues): QuizEditorValues {
  return {
    ...values,
    reference_pdf_text: null,
    pdf_base64: null,
  };
}

const sectionCardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.025)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 'var(--radius-lg, 10px)',
  padding: '1.15rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.9rem',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'rgba(255, 255, 255, 0.55)',
  margin: 0,
};

const iconActionBtnStyle = (disabled = false, destructive = false): React.CSSProperties => ({
  width: '30px',
  height: '30px',
  borderRadius: '6px',
  border: destructive ? '1px solid rgba(239, 83, 80, 0.28)' : '1px solid rgba(255, 255, 255, 0.1)',
  background: destructive ? 'rgba(239, 83, 80, 0.08)' : 'rgba(255, 255, 255, 0.04)',
  color: disabled ? 'rgba(255, 255, 255, 0.25)' : destructive ? '#fca5a5' : 'rgba(255, 255, 255, 0.78)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: disabled ? 'not-allowed' : 'pointer',
  padding: 0,
  flexShrink: 0,
  transition: 'all 0.15s ease',
});

export default function QuizEditorModal({
  quiz,
  isOpen,
  busy = false,
  subjects = [],
  handledYearLevel,
  onClose,
  onSave,
}: QuizEditorModalProps) {
  const { showToast } = useToastContext();
  const [draft, setDraft] = useState<QuizEditorValues | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'challenging'>('medium');
  const [newQuestionType, setNewQuestionType] = useState<QuestionType>('multiple_choice');
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number | null>(null);
  const topAnchorRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const initialDraftJsonRef = useRef<string>('');

  useEffect(() => {
    if (!quiz) {
      setDraft(null);
      setConfirmRemoveIdx(null);
      initialDraftJsonRef.current = '';
      return;
    }
    const serverValues = toEditorValues(quiz);
    initialDraftJsonRef.current = JSON.stringify(toStorageDraftPayload(serverValues));

    const savedRaw = localStorage.getItem(`tcc_quiz_draft_${quiz.id}`);
    if (savedRaw) {
      try {
        const parsed = JSON.parse(savedRaw) as QuizEditorValues;
        if (parsed && parsed.id === quiz.id && Array.isArray(parsed.questions)) {
          setDraft({
            ...parsed,
            subject: formatCourseLabel(parsed.subject || quiz.subject),
            reference_pdf_text: parsed.reference_pdf_text ?? serverValues.reference_pdf_text,
            questions: parsed.questions.map(normalizeQuestionForEditor),
          });
          setValidationError(null);
          setConfirmRemoveIdx(null);
          return;
        }
      } catch {
        // Ignore invalid local draft
      }
    }
    setDraft(serverValues);
    setValidationError(null);
    setConfirmRemoveIdx(null);
  }, [quiz, isOpen]);

  useEffect(() => {
    if (!quiz || !draft || draft.id !== quiz.id) return;
    const serialized = JSON.stringify(toStorageDraftPayload(draft));
    if (serialized === initialDraftJsonRef.current) return;

    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(`tcc_quiz_draft_${quiz.id}`, serialized);
      } catch {
        // Ignore QuotaExceededError or private-browsing storage restrictions
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [quiz, draft]);

  if (!quiz || !draft) return null;

  const handleCancel = () => {
    try {
      localStorage.removeItem(`tcc_quiz_draft_${quiz.id}`);
    } catch {
      // Ignore storage errors
    }
    onClose();
  };

  const scrollToBottom = () => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  const handleCourseSelect = (nextSubject: string) => {
    const prevAutoTopic = extractSubjectName(draft.subject);
    const nextAutoTopic = extractSubjectName(nextSubject);
    const currentTopic = draft.topic.trim();
    const shouldAutoPopulate = !currentTopic || currentTopic.toLowerCase() === prevAutoTopic.toLowerCase();

    setDraft({
      ...draft,
      subject: nextSubject,
      topic: shouldAutoPopulate && nextAutoTopic ? nextAutoTopic : draft.topic,
    });
  };

  const updateQuestion = (questionIndex: number, update: Partial<QuizEditorValues['questions'][number]>) => {
    setDraft((current) => {
      if (!current) return current;
      const questions = current.questions.map((question, index) =>
        index === questionIndex ? { ...question, ...update } : question
      );
      return { ...current, questions };
    });
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const options = [...draft.questions[questionIndex].options];
    options[optionIndex] = value;
    updateQuestion(questionIndex, { options });
  };

  const changeQuestionType = (questionIndex: number, nextType: QuestionType) => {
    setDraft((current) => {
      if (!current) return current;
      const questions = current.questions.map((question, idx) => {
        if (idx !== questionIndex) return question;
        if (nextType === 'true_false') {
          return {
            ...question,
            type: 'true_false' as QuestionType,
            options: ['True', 'False'],
            correct_index: question.correct_index === 1 ? 1 : 0,
            correct_indices: [question.correct_index === 1 ? 1 : 0],
            correct_answer: question.correct_index === 1 ? 'False' : 'True',
          };
        }
        if (nextType === 'identification') {
          const prevCorrectText =
            question.correct_answer?.trim() ||
            (question.type !== 'true_false' ? (question.options[question.correct_index] || '').trim() : '');
          return {
            ...question,
            type: 'identification' as QuestionType,
            options: [prevCorrectText, ''],
            correct_index: 0,
            correct_indices: [0],
            correct_answer: prevCorrectText,
          };
        }
        if (nextType === 'essay') {
          return {
            ...question,
            type: 'essay' as QuestionType,
            options: [question.correct_answer || '', ''],
            correct_index: 0,
            correct_indices: [0],
            correct_answer: question.correct_answer || '',
          };
        }
        const existingOpts =
          question.type === 'true_false' || question.type === 'identification' || question.type === 'essay'
            ? ['', '', '', '']
            : question.options.length >= 2
              ? [...question.options]
              : ['', '', '', ''];
        const safeCorrectIdx = Math.max(0, Math.min(existingOpts.length - 1, question.correct_index || 0));
        const safeIndices =
          Array.isArray(question.correct_indices) && question.correct_indices.length > 0
            ? question.correct_indices.filter((i) => i >= 0 && i < existingOpts.length)
            : [safeCorrectIdx];
        return {
          ...question,
          type: nextType,
          options: existingOpts,
          correct_index: safeCorrectIdx,
          correct_indices: safeIndices.length > 0 ? safeIndices : [safeCorrectIdx],
        };
      });
      return { ...current, questions };
    });
  };

  const addOptionChoice = (questionIndex: number) => {
    const q = draft.questions[questionIndex];
    if (!q || q.options.length >= 6) return;
    updateQuestion(questionIndex, { options: [...q.options, ''] });
  };

  const removeOptionChoice = (questionIndex: number, optionIndex: number) => {
    const q = draft.questions[questionIndex];
    if (!q || q.options.length <= 2) return;
    const nextOptions = q.options.filter((_, idx) => idx !== optionIndex);
    const nextCorrectIndex =
      q.correct_index === optionIndex
        ? 0
        : q.correct_index > optionIndex
          ? q.correct_index - 1
          : q.correct_index;
    const nextCorrectIndices = (q.correct_indices || [0])
      .filter((i) => i !== optionIndex)
      .map((i) => (i > optionIndex ? i - 1 : i));
    updateQuestion(questionIndex, {
      options: nextOptions,
      correct_index: Math.max(0, Math.min(nextOptions.length - 1, nextCorrectIndex)),
      correct_indices: nextCorrectIndices.length > 0 ? nextCorrectIndices : [0],
    });
  };

  const toggleMultipleAnswerIndex = (questionIndex: number, optionIndex: number) => {
    const q = draft.questions[questionIndex];
    if (!q) return;
    const currentIndices =
      Array.isArray(q.correct_indices) && q.correct_indices.length > 0 ? [...q.correct_indices] : [q.correct_index || 0];
    const exists = currentIndices.includes(optionIndex);
    let nextIndices: number[];
    if (exists) {
      nextIndices = currentIndices.filter((i) => i !== optionIndex);
      if (nextIndices.length === 0) {
        nextIndices = [optionIndex];
      }
    } else {
      nextIndices = [...currentIndices, optionIndex].sort((a, b) => a - b);
    }
    updateQuestion(questionIndex, {
      correct_indices: nextIndices,
      correct_index: nextIndices[0] ?? 0,
    });
  };

  const moveQuestionToTop = (index: number) => {
    if (index === 0) return;
    setConfirmRemoveIdx(null);
    setDraft((current) => {
      if (!current) return current;
      const questions = [...current.questions];
      const [item] = questions.splice(index, 1);
      questions.unshift(item);
      return { ...current, questions };
    });
  };

  const moveQuestionToBottom = (index: number) => {
    if (!draft || index === draft.questions.length - 1) return;
    setConfirmRemoveIdx(null);
    setDraft((current) => {
      if (!current) return current;
      const questions = [...current.questions];
      const [item] = questions.splice(index, 1);
      questions.push(item);
      return { ...current, questions };
    });
  };

  const moveQuestionUp = (index: number) => {
    if (index <= 0) return;
    setConfirmRemoveIdx(null);
    setDraft((current) => {
      if (!current) return current;
      const questions = [...current.questions];
      const temp = questions[index - 1];
      questions[index - 1] = questions[index];
      questions[index] = temp;
      return { ...current, questions };
    });
  };

  const moveQuestionDown = (index: number) => {
    if (!draft || index >= draft.questions.length - 1) return;
    setConfirmRemoveIdx(null);
    setDraft((current) => {
      if (!current) return current;
      const questions = [...current.questions];
      const temp = questions[index + 1];
      questions[index + 1] = questions[index];
      questions[index] = temp;
      return { ...current, questions };
    });
  };

  const handleRemoveQuestion = (questionIndex: number) => {
    if (draft.questions.length <= 1) return;
    const target = draft.questions[questionIndex];
    const hasContent =
      Boolean(target.prompt.trim()) ||
      target.options.some((opt) => Boolean(opt.trim()) && opt !== 'True' && opt !== 'False');

    if (hasContent && confirmRemoveIdx !== questionIndex) {
      setConfirmRemoveIdx(questionIndex);
      return;
    }

    setConfirmRemoveIdx(null);
    setDraft({
      ...draft,
      questions: draft.questions.filter((_, index) => index !== questionIndex),
    });
  };

  const shuffleQuestionsOrder = () => {
    if (!draft || draft.questions.length < 3) return;
    setConfirmRemoveIdx(null);
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
    showToast('Question order shuffled.', 'info');
  };

  const randomizeAnswerChoices = () => {
    if (!draft || draft.questions.length === 0) return;
    setDraft((current) => {
      if (!current) return current;
      let prevIdx = -1;
      const updatedQuestions = current.questions.map((q) => {
        if (q.type !== 'multiple_choice' && q.type !== 'multiple_answer') {
          return q;
        }
        if (q.type === 'multiple_answer') {
          const pairs = q.options.map((text, idx) => ({
            text,
            isCorrect: (q.correct_indices || [q.correct_index]).includes(idx),
          }));
          for (let i = pairs.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = pairs[i];
            pairs[i] = pairs[j];
            pairs[j] = tmp;
          }
          const newIndices = pairs.map((p, idx) => (p.isCorrect ? idx : -1)).filter((idx) => idx >= 0);
          return {
            ...q,
            options: pairs.map((p) => p.text),
            correct_indices: newIndices.length > 0 ? newIndices : [0],
            correct_index: newIndices[0] ?? 0,
          };
        }
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
          correct_indices: [targetPos],
        };
      });
      return { ...current, questions: updatedQuestions };
    });
    const msg = 'Answer choices randomized across multiple-choice items.';
    setAiNotice(msg);
    showToast('Answer choices randomized.', 'info');
  };

  const setQuestionCount = (nextCount: number) => {
    const safeCount = Math.max(1, Math.min(50, nextCount));
    setDraft((current) => {
      if (!current) return current;
      if (safeCount === current.questions.length) return current;
      if (safeCount > current.questions.length) {
        const additional = Array.from({ length: safeCount - current.questions.length }, () =>
          emptyQuestion(newQuestionType)
        );
        return { ...current, questions: [...current.questions, ...additional] };
      }
      return { ...current, questions: current.questions.slice(0, safeCount) };
    });
  };

  const handleSelectPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      const msg = 'Please upload a valid PDF (.pdf) document.';
      setValidationError(msg);
      showToast(msg, 'warning');
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
      setAiNotice(`PDF "${parsed.name}" attached.`);
      showToast(`PDF "${parsed.name}" attached.`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not read the selected PDF file.';
      setValidationError(msg);
      showToast(msg, 'error');
    } finally {
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const handleGenerateQuestionsWithAi = async () => {
    if (!draft) return;
    const cleanTopic = draft.topic.trim() || extractSubjectName(draft.subject) || draft.title.trim();
    const cleanSubject = draft.subject.trim();
    if (!cleanTopic || !cleanSubject) {
      const msg = 'Select a Course Code & Subject and Topic / Unit before generating questions.';
      setValidationError(msg);
      showToast(msg, 'warning');
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
            questions: res.questions.map((q) =>
              normalizeQuestionForEditor({
                type: 'multiple_choice',
                prompt: q.prompt || '',
                skill: q.skill || cleanTopic,
                points: 1,
                options: Array.from({ length: 4 }, (_, idx) => q.options?.[idx] || ''),
                correct_index: Number.isInteger(q.correct_index) ? Number(q.correct_index) : 0,
              })
            ),
          };
        });
        const msg = draft.reference_pdf_name
          ? `Generated ${res.questions.length} questions from "${draft.reference_pdf_name}".`
          : `Generated ${res.questions.length} questions for "${cleanTopic}".`;
        setAiNotice(msg);
        showToast(msg, 'success');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not generate AI questions.';
      setValidationError(msg);
      showToast(msg, 'error');
    } finally {
      setAiGenerating(false);
    }
  };

  const submit = () => {
    const rawTitle = draft.title.trim();
    const subject = formatCourseLabel(draft.subject.trim());
    const rawTopic = draft.topic.trim() || extractSubjectName(subject);
    const title = rawTitle;
    const topic = rawTopic || title || 'Course Unit';
    const instructions = draft.instructions.trim();

    if (!subject || !topic) {
      setValidationError('Please select a Course Code & Subject and enter a Topic / Unit before saving.');
      return;
    }
    if (draft.questions.length === 0) {
      setValidationError('A quiz requires at least one question.');
      return;
    }

    for (let i = 0; i < draft.questions.length; i += 1) {
      const q = draft.questions[i];
      const qNum = i + 1;
      if (!q.prompt.trim()) {
        setValidationError(`Question ${qNum}: Please enter the question text.`);
        return;
      }
      if (q.type === 'multiple_choice' || q.type === 'multiple_answer') {
        if (q.options.length < 2 || q.options.some((opt) => !opt.trim())) {
          setValidationError(`Question ${qNum} (${QUESTION_TYPE_LABELS[q.type]}): Fill in all answer choices.`);
          return;
        }
        if (q.type === 'multiple_answer' && (!Array.isArray(q.correct_indices) || q.correct_indices.length === 0)) {
          setValidationError(`Question ${qNum} (Multiple Answer): Select at least one correct choice.`);
          return;
        }
      } else if (q.type === 'identification') {
        const expected = (q.correct_answer || q.options[0] || '').trim();
        if (!expected) {
          setValidationError(`Question ${qNum} (Identification): Enter the expected correct answer.`);
          return;
        }
      }
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
      questions: draft.questions.map((question) => {
        const qType = question.type || 'multiple_choice';
        if (qType === 'true_false') {
          const cIdx = question.correct_index === 1 ? 1 : 0;
          return {
            ...question,
            type: 'true_false' as QuestionType,
            prompt: question.prompt.trim(),
            skill: question.skill?.trim() || topic,
            points: Number.isInteger(question.points) && Number(question.points) > 0 ? Number(question.points) : 1,
            options: ['True', 'False'],
            correct_index: cIdx,
            correct_indices: [cIdx],
            correct_answer: cIdx === 1 ? 'False' : 'True',
          };
        }
        if (qType === 'identification') {
          const ans = (question.correct_answer || question.options[0] || '').trim();
          const altRaw = (question.options[1] || '').trim();
          return {
            ...question,
            type: 'identification' as QuestionType,
            prompt: question.prompt.trim(),
            skill: question.skill?.trim() || topic,
            points: Number.isInteger(question.points) && Number(question.points) > 0 ? Number(question.points) : 1,
            options: [ans, altRaw || ans],
            correct_index: 0,
            correct_indices: [0],
            correct_answer: ans,
          };
        }
        if (qType === 'essay') {
          const rubric = (question.correct_answer || '').trim();
          return {
            ...question,
            type: 'essay' as QuestionType,
            prompt: question.prompt.trim(),
            skill: question.skill?.trim() || 'Critical Writing',
            points: Number.isInteger(question.points) && Number(question.points) > 0 ? Number(question.points) : 5,
            options: [rubric || 'Open-ended Essay Response', 'Essay'],
            correct_index: 0,
            correct_indices: [0],
            correct_answer: rubric,
          };
        }
        const cleanedOptions = question.options.map((opt) => opt.trim());
        const safeCorrectIndex = Math.max(0, Math.min(cleanedOptions.length - 1, Number(question.correct_index) || 0));
        const safeIndices =
          qType === 'multiple_answer' && Array.isArray(question.correct_indices) && question.correct_indices.length > 0
            ? Array.from(new Set(question.correct_indices.filter((idx) => idx >= 0 && idx < cleanedOptions.length))).sort(
                (a, b) => a - b
              )
            : [safeCorrectIndex];
        return {
          ...question,
          type: qType,
          prompt: question.prompt.trim(),
          skill: question.skill?.trim() || topic,
          points: Number.isInteger(question.points) && Number(question.points) > 0 ? Number(question.points) : 1,
          options: cleanedOptions,
          correct_index: safeIndices[0] ?? safeCorrectIndex,
          correct_indices: safeIndices,
          correct_answer: cleanedOptions[safeIndices[0] ?? safeCorrectIndex] || '',
        };
      }),
    });
  };

  const totalPoints = draft.questions.reduce((sum, q) => sum + (q.points || 1), 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Quiz • ${draft.title || quiz.title}`}
      subtitle={formatCourseLabel(draft.subject)}
      maxWidth="min(96vw, 960px)"
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.84rem' }}>
            <span>
              <strong style={{ color: '#f8fafc' }}>{draft.questions.length}</strong>{' '}
              {draft.questions.length === 1 ? 'Question' : 'Questions'} •{' '}
              <strong style={{ color: '#f8fafc' }}>{totalPoints}</strong> pts total
            </span>
            <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>•</span>
            <span style={{ fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.5)' }}>Draft auto-saved</span>
          </div>
          <div style={{ display: 'flex', gap: '0.65rem' }}>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="accent"
              onClick={submit}
              isLoading={busy}
              disabled={busy}
              style={{ boxShadow: 'none' }}
            >
              Save Changes
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div ref={topAnchorRef} style={{ display: 'none' }} />

        {validationError && (
          <div
            role="alert"
            style={{
              border: '1px solid rgba(239, 154, 154, 0.4)',
              background: 'rgba(211, 47, 47, 0.14)',
              color: '#ffcdd2',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              fontSize: '0.86rem',
            }}
          >
            {validationError}
          </div>
        )}

        {aiNotice && (
          <div
            style={{
              border: '1px solid rgba(129, 199, 132, 0.35)',
              background: 'rgba(46, 125, 50, 0.14)',
              color: '#c8e6c9',
              borderRadius: 'var(--radius-md)',
              padding: '0.7rem 1rem',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
              {aiNotice}
            </span>
            <button
              type="button"
              onClick={() => setAiNotice(null)}
              style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* 1. Basic Information */}
        <section style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>1. Basic Information</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem', alignItems: 'start' }}>
            <label className="form-group" style={{ margin: 0 }}>
              <span className="form-label">Quiz Title</span>
              <input
                className="form-input"
                value={draft.title}
                placeholder="e.g. Quiz 1, Midterm Examination"
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>

            <div>
              <Select
                label="Course Code & Subject"
                value={draft.subject}
                onChange={handleCourseSelect}
                style={{ margin: 0 }}
                options={buildSubjectOptionsForYear(handledYearLevel, subjects || [], draft.subject)}
              />
            </div>

            <label className="form-group" style={{ margin: 0 }}>
              <span className="form-label">Topic / Unit</span>
              <input
                className="form-input"
                value={draft.topic}
                placeholder="e.g. Introduction to Computing"
                onChange={(event) => setDraft({ ...draft, topic: event.target.value })}
              />
            </label>
          </div>
        </section>

        {/* 2. Quiz Settings & 3. Instructions for Students */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {/* 2. Quiz Settings */}
          <section style={sectionCardStyle}>
            <h3 style={sectionTitleStyle}>2. Quiz Settings</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', alignItems: 'start' }}>
              <Select
                label="Quiz Type"
                value={draft.quiz_type || 'formative'}
                onChange={(val) => setDraft({ ...draft, quiz_type: val === 'summative' ? 'summative' : 'formative' })}
                style={{ margin: 0 }}
                options={[
                  { value: 'formative', label: 'Formative • Live Monitoring' },
                  { value: 'summative', label: 'Summative • Final Submission' },
                ]}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label className="form-group" style={{ margin: 0 }}>
                  <span className="form-label">Time Limit (Minutes)</span>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    className="form-input"
                    value={draft.time_limit_minutes ?? 15}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        time_limit_minutes: Math.max(1, Math.min(300, Number(event.target.value) || 15)),
                      })
                    }
                  />
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                  {[10, 15, 30, 45, 60].map((mins) => {
                    const active = draft.time_limit_minutes === mins;
                    return (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setDraft({ ...draft, time_limit_minutes: mins })}
                        style={{
                          height: '22px',
                          padding: '0 0.5rem',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: active ? '1px solid rgba(245, 158, 11, 0.6)' : '1px solid rgba(255,255,255,0.1)',
                          background: active ? 'rgba(245, 158, 11, 0.16)' : 'rgba(255,255,255,0.03)',
                          color: active ? '#fbbf24' : 'rgba(255,255,255,0.65)',
                        }}
                      >
                        {mins}m
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* 3. Instructions for Students */}
          <section style={sectionCardStyle}>
            <h3 style={sectionTitleStyle}>3. Instructions for Students</h3>
            <label className="form-group" style={{ margin: 0, flex: 1 }}>
              <textarea
                className="form-input"
                rows={3}
                value={draft.instructions}
                placeholder="Enter instructions for students taking this assessment..."
                onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
                style={{ minHeight: '78px', lineHeight: 1.5, resize: 'vertical' }}
              />
            </label>
          </section>
        </div>

        {/* 4. AI Question Generation & 5. Quiz Options */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {/* 4. AI Question Generation */}
          <section style={sectionCardStyle}>
            <h3 style={sectionTitleStyle}>4. AI Question Generation</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, flex: '1 1 180px' }}>
                <FileText size={16} style={{ color: 'rgba(255, 255, 255, 0.6)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {draft.reference_pdf_name ? draft.reference_pdf_name : 'Topic or PDF Source'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.55)' }}>
                    {draft.reference_pdf_name ? 'PDF attached for AI & study review' : `Generates ${draft.questions.length} items from topic or PDF`}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleSelectPdf}
                  style={{ display: 'none' }}
                />
                {draft.reference_pdf_name && (
                  <button
                    type="button"
                    title="Remove attached PDF"
                    onClick={() => {
                      const cleanedInstructions = draft.instructions.replace(
                        /^Refer to the attached PDF handout \([^)]+\) and choose/i,
                        'Choose'
                      );
                      setDraft({
                        ...draft,
                        reference_pdf_name: null,
                        reference_pdf_text: null,
                        pdf_base64: null,
                        instructions: cleanedInstructions,
                      });
                    }}
                    style={iconActionBtnStyle(false, false)}
                  >
                    <X size={14} />
                  </button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => pdfInputRef.current?.click()}
                >
                  <Upload size={13} /> {draft.reference_pdf_name ? 'Replace PDF' : 'Upload PDF'}
                </Button>

                <select
                  aria-label="AI Question Difficulty"
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value as 'easy' | 'medium' | 'challenging')}
                  className="form-select"
                  style={{ width: 'auto', height: '32px', padding: '0 1.85rem 0 0.65rem', fontSize: '0.78rem' }}
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
                  style={{ boxShadow: 'none' }}
                >
                  {!aiGenerating && <Sparkles size={13} />}
                  {aiGenerating ? 'Generating...' : 'Generate Questions'}
                </Button>
              </div>
            </div>
          </section>

          {/* 5. Quiz Options */}
          <section style={sectionCardStyle}>
            <h3 style={sectionTitleStyle}>5. Quiz Options</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  cursor: 'pointer',
                  margin: 0,
                }}
              >
                <input
                  type="checkbox"
                  checked={draft.allow_review}
                  onChange={(event) => setDraft({ ...draft, allow_review: event.target.checked })}
                  style={{ accentColor: 'var(--accent-gold, #f59e0b)', width: '16px', height: '16px', flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>Allow Answer Review</div>
                  <div style={{ fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.55)' }}>
                    Show answer key after submission
                  </div>
                </div>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  cursor: draft.questions.length >= 3 ? 'pointer' : 'not-allowed',
                  opacity: draft.questions.length >= 3 ? 1 : 0.55,
                  margin: 0,
                }}
              >
                <input
                  type="checkbox"
                  disabled={draft.questions.length < 3}
                  checked={draft.questions.length >= 3 && Boolean(draft.shuffle_questions)}
                  onChange={(event) => setDraft({ ...draft, shuffle_questions: event.target.checked })}
                  style={{ accentColor: 'var(--accent-gold, #f59e0b)', width: '16px', height: '16px', flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>Shuffle Questions</div>
                  <div style={{ fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.55)' }}>
                    Randomize order per student
                  </div>
                </div>
              </label>
            </div>
          </section>
        </div>

        {/* 6. Questions & Answer Key */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '0.25rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <h3 style={{ color: '#f8fafc', margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                6. Questions &amp; Answer Key
              </h3>
              <span
                style={{
                  fontSize: '0.75rem',
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: 'rgba(255, 255, 255, 0.75)',
                  padding: '0.15rem 0.55rem',
                  borderRadius: '999px',
                  fontWeight: 600,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                {draft.questions.length} {draft.questions.length === 1 ? 'question' : 'questions'} • {totalPoints} pts
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: 'rgba(255,255,255,0.03)',
                  padding: '0 0.55rem',
                  height: '32px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <span style={{ fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 600 }}>Count:</span>
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
                    width: '42px',
                    height: '22px',
                    background: 'transparent',
                    border: 'none',
                    color: '#f8fafc',
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                />
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={randomizeAnswerChoices}
                title="Randomize answer choice positions (A, B, C, D) while keeping each correct answer"
              >
                <Shuffle size={13} /> Randomize Choices
              </Button>

              {draft.questions.length >= 3 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={shuffleQuestionsOrder}
                  title="Shuffle question sequence"
                >
                  <Shuffle size={13} /> Shuffle Order
                </Button>
              )}

              <select
                aria-label="New Question Type"
                value={newQuestionType}
                onChange={(e) => setNewQuestionType(e.target.value as QuestionType)}
                className="form-select"
                style={{ width: 'auto', height: '32px', padding: '0 1.8rem 0 0.65rem', fontSize: '0.78rem' }}
              >
                <option value="multiple_choice">Multiple Choice</option>
                <option value="identification">Identification</option>
                <option value="true_false">True or False</option>
                <option value="multiple_answer">Multiple Answer</option>
                <option value="essay">Essay</option>
              </select>

              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={() => {
                  setDraft({ ...draft, questions: [...draft.questions, emptyQuestion(newQuestionType)] });
                  setTimeout(scrollToBottom, 50);
                }}
                style={{ boxShadow: 'none' }}
              >
                <Plus size={14} /> Add Question
              </Button>
            </div>
          </div>

          {/* Individual Question Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {draft.questions.map((question, questionIndex) => {
              const qType: QuestionType = question.type || 'multiple_choice';
              const isConfirmingRemove = confirmRemoveIdx === questionIndex;

              return (
                <div
                  key={questionIndex}
                  style={{
                    padding: '1.1rem',
                    borderRadius: 'var(--radius-lg, 10px)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem',
                  }}
                >
                  {/* Question Card Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.65rem',
                      paddingBottom: '0.65rem',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          background: 'rgba(245, 158, 11, 0.14)',
                          border: '1px solid rgba(245, 158, 11, 0.35)',
                          color: '#fbbf24',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '6px',
                        }}
                      >
                        Q{questionIndex + 1}
                      </span>

                      <select
                        aria-label={`Question ${questionIndex + 1} Type`}
                        value={qType}
                        onChange={(e) => changeQuestionType(questionIndex, e.target.value as QuestionType)}
                        className="form-select"
                        style={{
                          width: 'auto',
                          height: '32px',
                          padding: '0 1.85rem 0 0.65rem',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        <option value="multiple_choice">Multiple Choice</option>
                        <option value="identification">Identification</option>
                        <option value="true_false">True or False</option>
                        <option value="multiple_answer">Multiple Answer</option>
                        <option value="essay">Essay</option>
                      </select>

                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          background: 'rgba(255, 255, 255, 0.03)',
                          padding: '0 0.55rem',
                          height: '32px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                      >
                        <span style={{ fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 600 }}>
                          Points:
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          aria-label={`Question ${questionIndex + 1} Points`}
                          value={question.points ?? 1}
                          onChange={(e) =>
                            updateQuestion(questionIndex, { points: Math.max(1, parseInt(e.target.value, 10) || 1) })
                          }
                          style={{
                            width: '40px',
                            height: '22px',
                            background: 'transparent',
                            border: 'none',
                            color: '#f8fafc',
                            textAlign: 'center',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            outline: 'none',
                          }}
                        />
                        <span style={{ fontSize: '0.73rem', color: 'rgba(255, 255, 255, 0.45)' }}>pts</span>
                      </div>
                    </div>

                    {/* Question Secondary Actions (Compact Icon Buttons with Tooltips) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <button
                        type="button"
                        disabled={questionIndex === 0}
                        title="Move to Top"
                        aria-label="Move to Top"
                        onClick={() => moveQuestionToTop(questionIndex)}
                        style={iconActionBtnStyle(questionIndex === 0)}
                      >
                        <ChevronsUp size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={questionIndex === 0}
                        title="Move Up"
                        aria-label="Move Up"
                        onClick={() => moveQuestionUp(questionIndex)}
                        style={iconActionBtnStyle(questionIndex === 0)}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={questionIndex === draft.questions.length - 1}
                        title="Move Down"
                        aria-label="Move Down"
                        onClick={() => moveQuestionDown(questionIndex)}
                        style={iconActionBtnStyle(questionIndex === draft.questions.length - 1)}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={questionIndex === draft.questions.length - 1}
                        title="Move to Bottom"
                        aria-label="Move to Bottom"
                        onClick={() => moveQuestionToBottom(questionIndex)}
                        style={iconActionBtnStyle(questionIndex === draft.questions.length - 1)}
                      >
                        <ChevronsDown size={14} />
                      </button>

                      {isConfirmingRemove ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginLeft: '0.2rem' }}>
                          <Button
                            type="button"
                            variant="error"
                            size="sm"
                            onClick={() => handleRemoveQuestion(questionIndex)}
                            style={{ height: '30px', padding: '0 0.6rem', fontSize: '0.74rem' }}
                          >
                            Confirm Remove
                          </Button>
                          <button
                            type="button"
                            title="Cancel remove"
                            onClick={() => setConfirmRemoveIdx(null)}
                            style={iconActionBtnStyle(false)}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={draft.questions.length === 1}
                          title={draft.questions.length === 1 ? 'At least one question is required' : 'Remove Question'}
                          aria-label="Remove Question"
                          onClick={() => handleRemoveQuestion(questionIndex)}
                          style={iconActionBtnStyle(draft.questions.length === 1, true)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Question Text & Optional Competency */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.65rem' }}>
                    <label className="form-group" style={{ margin: 0 }}>
                      <span className="form-label" style={{ fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                        Question Text
                      </span>
                      <textarea
                        className="form-input"
                        rows={2}
                        value={question.prompt}
                        onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })}
                        placeholder="Enter the question text..."
                        style={{
                          minHeight: '66px',
                          lineHeight: 1.5,
                          resize: 'vertical',
                          padding: '0.65rem 0.85rem',
                        }}
                      />
                    </label>

                    <label className="form-group" style={{ margin: 0 }}>
                      <span className="form-label" style={{ fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.55)', marginBottom: '0.25rem' }}>
                        Competency / Subtopic (Optional)
                      </span>
                      <input
                        className="form-input"
                        value={question.skill || ''}
                        placeholder="e.g. CPU Architecture, Normalization, OOP Principles"
                        onChange={(event) => updateQuestion(questionIndex, { skill: event.target.value })}
                        style={{ height: '38px', fontSize: '0.85rem' }}
                      />
                    </label>
                  </div>

                  {/* Answer Choices by Question Type */}
                  {qType === 'multiple_choice' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.6)' }}>
                          Answer Choices • Select one correct option
                        </span>
                        {question.options.length < 6 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addOptionChoice(questionIndex)}
                            style={{ height: '26px', padding: '0 0.55rem', fontSize: '0.73rem' }}
                          >
                            <Plus size={12} /> Add Choice ({question.options.length}/6)
                          </Button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.6rem' }}>
                        {question.options.map((option, optionIndex) => {
                          const isCorrect = question.correct_index === optionIndex;
                          const letter = String.fromCharCode(65 + optionIndex);
                          return (
                            <div
                              key={optionIndex}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.45rem 0.65rem',
                                borderRadius: 'var(--radius-md)',
                                border: isCorrect
                                  ? '1px solid rgba(129, 199, 132, 0.5)'
                                  : '1px solid rgba(255, 255, 255, 0.08)',
                                background: isCorrect ? 'rgba(46, 125, 50, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                              }}
                            >
                              <input
                                type="radio"
                                name={`correct-${questionIndex}`}
                                checked={isCorrect}
                                title={`Mark Option ${letter} as correct`}
                                onChange={() =>
                                  updateQuestion(questionIndex, {
                                    correct_index: optionIndex,
                                    correct_indices: [optionIndex],
                                  })
                                }
                                style={{ accentColor: 'var(--success)', cursor: 'pointer', width: '15px', height: '15px', flexShrink: 0 }}
                              />
                              <span
                                style={{
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  color: isCorrect ? '#a5d6a7' : 'rgba(255, 255, 255, 0.6)',
                                  minWidth: '18px',
                                }}
                              >
                                {letter}.
                              </span>
                              <input
                                className="form-input"
                                value={option}
                                onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)}
                                placeholder={`Option ${letter}`}
                                aria-label={`Question ${questionIndex + 1}, option ${letter}`}
                                style={{
                                  height: '34px',
                                  fontSize: '0.86rem',
                                  padding: '0 0.65rem',
                                  flex: 1,
                                  background: 'rgba(18, 4, 7, 0.7)',
                                }}
                              />
                              {question.options.length > 2 && (
                                <button
                                  type="button"
                                  title="Remove choice"
                                  onClick={() => removeOptionChoice(questionIndex, optionIndex)}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'rgba(255, 255, 255, 0.45)',
                                    cursor: 'pointer',
                                    padding: '0.15rem',
                                    display: 'inline-flex',
                                  }}
                                >
                                  <X size={13} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {qType === 'true_false' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.6)' }}>
                        Correct Answer
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 200px))', gap: '0.6rem' }}>
                        {['True', 'False'].map((tfLabel, tfIndex) => {
                          const isCorrect = question.correct_index === tfIndex;
                          return (
                            <label
                              key={tfLabel}
                              style={{
                                border: isCorrect
                                  ? '1px solid rgba(129, 199, 132, 0.5)'
                                  : '1px solid rgba(255, 255, 255, 0.08)',
                                background: isCorrect ? 'rgba(46, 125, 50, 0.14)' : 'rgba(255, 255, 255, 0.02)',
                                borderRadius: 'var(--radius-md)',
                                padding: '0.55rem 0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.55rem',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: '0.88rem',
                                color: isCorrect ? '#c8e6c9' : '#f8fafc',
                                margin: 0,
                              }}
                            >
                              <input
                                type="radio"
                                name={`tf-${questionIndex}`}
                                checked={isCorrect}
                                onChange={() =>
                                  updateQuestion(questionIndex, {
                                    options: ['True', 'False'],
                                    correct_index: tfIndex,
                                    correct_indices: [tfIndex],
                                    correct_answer: tfLabel,
                                  })
                                }
                                style={{ accentColor: 'var(--success)', width: '15px', height: '15px', cursor: 'pointer' }}
                              />
                              {tfLabel}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {qType === 'identification' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.6)' }}>
                          Expected Correct Answer
                        </span>
                        <span style={{ fontSize: '0.73rem', color: 'rgba(255, 255, 255, 0.45)' }}>
                          Case-insensitive • Separate acceptable synonyms with commas
                        </span>
                      </div>
                      <input
                        className="form-input"
                        value={question.correct_answer ?? question.options[0] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateQuestion(questionIndex, {
                            correct_answer: val,
                            options: [val, question.options[1] || ''],
                          });
                        }}
                        placeholder="e.g. Central Processing Unit, CPU"
                        aria-label={`Question ${questionIndex + 1} identification answer`}
                        style={{ height: '38px', fontSize: '0.88rem' }}
                      />
                    </div>
                  )}

                  {qType === 'multiple_answer' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.6)' }}>
                          Answer Choices • Check all correct options ({(question.correct_indices || [question.correct_index]).length} selected)
                        </span>
                        {question.options.length < 6 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addOptionChoice(questionIndex)}
                            style={{ height: '26px', padding: '0 0.55rem', fontSize: '0.73rem' }}
                          >
                            <Plus size={12} /> Add Choice ({question.options.length}/6)
                          </Button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.6rem' }}>
                        {question.options.map((option, optionIndex) => {
                          const checkedIndices =
                            Array.isArray(question.correct_indices) && question.correct_indices.length > 0
                              ? question.correct_indices
                              : [question.correct_index || 0];
                          const isCorrect = checkedIndices.includes(optionIndex);
                          const letter = String.fromCharCode(65 + optionIndex);
                          return (
                            <div
                              key={optionIndex}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.45rem 0.65rem',
                                borderRadius: 'var(--radius-md)',
                                border: isCorrect
                                  ? '1px solid rgba(129, 199, 132, 0.5)'
                                  : '1px solid rgba(255, 255, 255, 0.08)',
                                background: isCorrect ? 'rgba(46, 125, 50, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isCorrect}
                                title={`Toggle Option ${letter} as correct`}
                                onChange={() => toggleMultipleAnswerIndex(questionIndex, optionIndex)}
                                style={{ accentColor: 'var(--success)', cursor: 'pointer', width: '15px', height: '15px', flexShrink: 0 }}
                              />
                              <span
                                style={{
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  color: isCorrect ? '#a5d6a7' : 'rgba(255, 255, 255, 0.6)',
                                  minWidth: '18px',
                                }}
                              >
                                {letter}.
                              </span>
                              <input
                                className="form-input"
                                value={option}
                                onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)}
                                placeholder={`Choice ${letter}`}
                                aria-label={`Question ${questionIndex + 1}, choice ${letter}`}
                                style={{
                                  height: '34px',
                                  fontSize: '0.86rem',
                                  padding: '0 0.65rem',
                                  flex: 1,
                                  background: 'rgba(18, 4, 7, 0.7)',
                                }}
                              />
                              {question.options.length > 2 && (
                                <button
                                  type="button"
                                  title="Remove choice"
                                  onClick={() => removeOptionChoice(questionIndex, optionIndex)}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'rgba(255, 255, 255, 0.45)',
                                    cursor: 'pointer',
                                    padding: '0.15rem',
                                    display: 'inline-flex',
                                  }}
                                >
                                  <X size={13} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {qType === 'essay' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.6)' }}>
                          Model Answer / Grading Notes (Optional)
                        </span>
                        <span style={{ fontSize: '0.73rem', color: 'rgba(255, 255, 255, 0.45)' }}>
                          Open-ended paragraph response
                        </span>
                      </div>
                      <textarea
                        className="form-input"
                        rows={2}
                        value={question.correct_answer ?? ''}
                        onChange={(e) =>
                          updateQuestion(questionIndex, {
                            correct_answer: e.target.value,
                            options: [e.target.value, 'Essay'],
                          })
                        }
                        placeholder="Optional: Enter reference key points or grading criteria..."
                        style={{ minHeight: '60px', fontSize: '0.86rem', lineHeight: 1.5, resize: 'vertical' }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Add Question Bar */}
          <div
            ref={bottomAnchorRef}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '0.5rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDraft({ ...draft, questions: [...draft.questions, emptyQuestion(newQuestionType)] });
                setTimeout(scrollToBottom, 50);
              }}
            >
              <Plus size={14} /> Add {QUESTION_TYPE_LABELS[newQuestionType]} Question
            </Button>

            {draft.questions.length > 3 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => topAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                <ChevronsUp size={14} /> Back to Top
              </Button>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
