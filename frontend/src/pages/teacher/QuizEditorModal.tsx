import { useEffect, useState, useRef } from 'react';
import { 
  Plus, Trash2, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, 
  Award, CheckCircle2, Clock3, Shuffle, FileText, Sparkles, Upload, X 
} from 'lucide-react';
import type { Question, QuestionType, Quiz, Subject } from '../../lib/types';
import { BSIT_SUBJECT_OPTIONS } from '../../lib/constants';
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

  const rawIndices = Array.isArray(question.correct_indices) && question.correct_indices.length > 0
    ? question.correct_indices
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0 && n < options.length)
    : [correctIndex];
  const correctIndices = rawIndices.length > 0 ? Array.from(new Set(rawIndices)).sort((a, b) => a - b) : [0];

  const correctAnswer = typeof question.correct_answer === 'string'
    ? question.correct_answer
    : qType === 'identification'
      ? (rawOptions[0] || '')
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
    questions: qList.map(normalizeQuestionForEditor),
  };
}

export default function QuizEditorModal({ quiz, isOpen, busy = false, subjects = [], handledYearLevel, onClose, onSave }: QuizEditorModalProps) {
  const { showToast } = useToastContext();
  const [draft, setDraft] = useState<QuizEditorValues | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'challenging'>('medium');
  const [newQuestionType, setNewQuestionType] = useState<QuestionType>('multiple_choice');
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
          setDraft({
            ...parsed,
            questions: parsed.questions.map(normalizeQuestionForEditor),
          });
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
        // multiple_choice or multiple_answer
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
    const currentIndices = Array.isArray(q.correct_indices) && q.correct_indices.length > 0
      ? [...q.correct_indices]
      : [q.correct_index || 0];
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

  // Randomize option positions (A, B, C, D) for all multiple-choice/multiple-answer questions while preserving the real answer
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
          const newIndices = pairs
            .map((p, idx) => (p.isCorrect ? idx : -1))
            .filter((idx) => idx >= 0);
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
    const msg = 'Answer choices have been randomized across multiple-choice questions while preserving each true answer.';
    setAiNotice(msg);
    showToast('Answer choices randomized.', 'info');
  };

  const setQuestionCount = (nextCount: number) => {
    const safeCount = Math.max(1, Math.min(50, nextCount));
    setDraft((current) => {
      if (!current) return current;
      if (safeCount === current.questions.length) return current;
      if (safeCount > current.questions.length) {
        const additional = Array.from({ length: safeCount - current.questions.length }, () => emptyQuestion(newQuestionType));
        return { ...current, questions: [...current.questions, ...additional] };
      }
      return { ...current, questions: current.questions.slice(0, safeCount) };
    });
    showToast(`Question count set to ${safeCount}.`, 'info');
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
      const msg = `PDF "${parsed.name}" attached for quiz instructions, AI question generation, and post-quiz study feedback.`;
      setAiNotice(msg);
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
    const cleanTopic = draft.topic.trim() || draft.title.trim();
    const cleanSubject = draft.subject.trim();
    if (!cleanTopic || !cleanSubject) {
      const msg = 'Enter a Subject and Topic / Unit before generating questions with AI.';
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
          ? `Generated ${res.questions.length} questions from PDF "${draft.reference_pdf_name}". Review and save when ready.`
          : `Generated ${res.questions.length} questions based on topic "${cleanTopic}". Review and save when ready.`;
        setAiNotice(msg);
        showToast(`Generated ${res.questions.length} AI questions!`, 'success');
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

    for (let i = 0; i < draft.questions.length; i += 1) {
      const q = draft.questions[i];
      const qNum = i + 1;
      if (!q.prompt.trim()) {
        setValidationError(`Question ${qNum}: Please enter a question prompt.`);
        return;
      }
      if (q.type === 'multiple_choice' || q.type === 'multiple_answer') {
        if (q.options.length < 2 || q.options.some((opt) => !opt.trim())) {
          setValidationError(`Question ${qNum} (${QUESTION_TYPE_LABELS[q.type]}): Fill in all answer choices before saving.`);
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
            skill: question.skill?.trim() || 'General Knowledge',
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
            skill: question.skill?.trim() || 'General Knowledge',
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
            ? Array.from(new Set(question.correct_indices.filter((idx) => idx >= 0 && idx < cleanedOptions.length))).sort((a, b) => a - b)
            : [safeCorrectIndex];
        return {
          ...question,
          type: qType,
          prompt: question.prompt.trim(),
          skill: question.skill?.trim() || 'General Knowledge',
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
          Review the quiz draft, customize question types (Multiple Choice, Identification, True/False, Multiple Answer, Essay), set point values, and adjust sequencing before publishing to students.
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

        {/* Quiz Metadata · Organized & Aligned 2-Row Grid */}
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
                {handledYearLevel
                  ? `Course Code & Subject Description (${handledYearLevel})`
                  : 'Course Code & Subject Description'}
              </span>
              <Select
                value={draft.subject}
                onChange={(val) => setDraft({ ...draft, subject: val })}
                style={{ margin: 0 }}
                options={(() => {
                  const base = handledYearLevel
                    ? BSIT_SUBJECT_OPTIONS.filter((o) => o.yearLevel === handledYearLevel)
                    : [...BSIT_SUBJECT_OPTIONS];
                  const seen = new Set(base.map((o) => o.value.toLowerCase()));
                  (subjects || []).forEach((s) => {
                    if (/^prac/i.test(s.code || '') || /practicum/i.test(s.name || '')) return;
                    if (handledYearLevel && s.grade && s.grade !== handledYearLevel) return;
                    const val = s.code && !s.name.startsWith(s.code) ? `${s.code} - ${s.name}` : s.name;
                    if (!seen.has(val.toLowerCase())) {
                      seen.add(val.toLowerCase());
                      base.push({
                        value: val,
                        label: `[${s.grade || handledYearLevel || 'BSIT'}] ${s.code ? `${s.code} — ${s.name}` : s.name}`,
                        yearLevel: (s.grade as any) || handledYearLevel || '1st Year',
                        semester: '1st Semester',
                      });
                    }
                  });
                  return base;
                })()}
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
                  { value: 'formative', label: 'Formative · Live Student Monitoring' },
                  { value: 'summative', label: 'Summative · Final Submission Only' },
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

        {/* Settings Checkboxes Row · Equal Height & Aligned */}
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
              Choose question type (Multiple Choice, Identification, True/False, Multiple Answer, Essay), set points, and configure the answer key.
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

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
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
              >
                <Plus size={15} /> Add Question
              </Button>
            </div>
          </div>
        </div>

        {/* Questions List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {draft.questions.map((question, questionIndex) => {
            const qType: QuestionType = question.type || 'multiple_choice';
            return (
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
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

                    {/* Question Type Selector */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(139, 92, 246, 0.14)', border: '1px solid rgba(167, 139, 250, 0.35)', borderRadius: '8px', padding: '0.2rem 0.55rem' }}>
                      <span style={{ fontSize: '0.74rem', color: '#c4b5fd', fontWeight: 700, textTransform: 'uppercase' }}>Type:</span>
                      <select
                        aria-label={`Question ${questionIndex + 1} Type`}
                        value={qType}
                        onChange={(e) => changeQuestionType(questionIndex, e.target.value as QuestionType)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'white',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          outline: 'none',
                        }}
                      >
                        <option value="multiple_choice" style={{ background: '#1a0b2e', color: 'white' }}>Multiple Choice</option>
                        <option value="identification" style={{ background: '#1a0b2e', color: 'white' }}>Identification</option>
                        <option value="true_false" style={{ background: '#1a0b2e', color: 'white' }}>True or False</option>
                        <option value="multiple_answer" style={{ background: '#1a0b2e', color: 'white' }}>Multiple Answer</option>
                        <option value="essay" style={{ background: '#1a0b2e', color: 'white' }}>Essay</option>
                      </select>
                    </div>
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

                {/* Question Prompt */}
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

                {/* Dynamic Answer Format Section based on Question Type */}
                {qType === 'multiple_choice' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--neutral-300)' }}>
                        Multiple Choice Options (Select 1 correct answer):
                      </span>
                      {question.options.length < 6 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addOptionChoice(questionIndex)}
                          style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}
                        >
                          <Plus size={12} /> Add Choice ({question.options.length}/6)
                        </Button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                      {question.options.map((option, optionIndex) => {
                        const isCorrect = question.correct_index === optionIndex;
                        return (
                          <div 
                            key={optionIndex} 
                            onClick={() => updateQuestion(questionIndex, { correct_index: optionIndex, correct_indices: [optionIndex] })}
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
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: isCorrect ? '#a5d6a7' : 'var(--neutral-300)', fontWeight: 700 }}>
                                <input
                                  type="radio"
                                  name={`correct-${questionIndex}`}
                                  checked={isCorrect}
                                  onChange={() => updateQuestion(questionIndex, { correct_index: optionIndex, correct_indices: [optionIndex] })}
                                  style={{ accentColor: 'var(--success)', cursor: 'pointer', width: '15px', height: '15px' }}
                                />
                                Option {String.fromCharCode(65 + optionIndex)}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
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
                                      updateQuestion(questionIndex, { correct_index: optionIndex, correct_indices: [optionIndex] });
                                    }}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: 'var(--neutral-400)',
                                      fontSize: '0.72rem',
                                      cursor: 'pointer',
                                      padding: '0.1rem 0.35rem',
                                      borderRadius: '4px',
                                    }}
                                  >
                                    Set as Correct
                                  </button>
                                )}
                                {question.options.length > 2 && (
                                  <button
                                    type="button"
                                    title="Remove this choice"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeOptionChoice(questionIndex, optionIndex);
                                    }}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: '#ef5350',
                                      cursor: 'pointer',
                                      padding: '0.1rem 0.25rem',
                                      display: 'inline-flex',
                                    }}
                                  >
                                    <X size={13} />
                                  </button>
                                )}
                              </div>
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
                )}

                {qType === 'true_false' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--neutral-300)' }}>
                      True or False (Select the correct answer):
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                      {['True', 'False'].map((tfLabel, tfIndex) => {
                        const isCorrect = question.correct_index === tfIndex;
                        return (
                          <div
                            key={tfLabel}
                            onClick={() =>
                              updateQuestion(questionIndex, {
                                options: ['True', 'False'],
                                correct_index: tfIndex,
                                correct_indices: [tfIndex],
                                correct_answer: tfLabel,
                              })
                            }
                            style={{
                              border: `1.5px solid ${isCorrect ? 'var(--success)' : 'rgba(255, 255, 255, 0.1)'}`,
                              background: isCorrect ? 'rgba(67, 160, 71, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                              borderRadius: 'var(--radius-md)',
                              padding: '0.9rem 1rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: 'pointer',
                              transition: 'all 0.18s ease',
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1rem', fontWeight: 700, color: isCorrect ? '#c8e6c9' : 'white' }}>
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
                                style={{ accentColor: 'var(--success)', width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                              {tfLabel}
                            </span>
                            {isCorrect && (
                              <span style={{
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: '#81c784',
                                background: 'rgba(67, 160, 71, 0.25)',
                                padding: '0.18rem 0.55rem',
                                borderRadius: '999px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                              }}>
                                <CheckCircle2 size={12} /> Correct Answer
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {qType === 'identification' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(67, 160, 71, 0.07)', border: '1px solid rgba(76, 175, 80, 0.3)', borderRadius: 'var(--radius-md)', padding: '0.95rem 1.05rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#a5d6a7', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <CheckCircle2 size={14} /> Identification · Expected Correct Answer
                      </span>
                      <span style={{ fontSize: '0.74rem', color: 'var(--neutral-300)' }}>
                        Case-insensitive matching • Separate acceptable synonyms with commas
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
                      style={{
                        background: 'rgba(20, 12, 35, 0.75)',
                        borderColor: 'rgba(76, 175, 80, 0.45)',
                        fontSize: '0.95rem',
                      }}
                    />
                  </div>
                )}

                {qType === 'multiple_answer' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--neutral-300)' }}>
                        Multiple Answer Choices (Check ALL correct answers · {(question.correct_indices || [question.correct_index]).length} selected):
                      </span>
                      {question.options.length < 6 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addOptionChoice(questionIndex)}
                          style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}
                        >
                          <Plus size={12} /> Add Choice ({question.options.length}/6)
                        </Button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                      {question.options.map((option, optionIndex) => {
                        const checkedIndices = Array.isArray(question.correct_indices) && question.correct_indices.length > 0
                          ? question.correct_indices
                          : [question.correct_index || 0];
                        const isCorrect = checkedIndices.includes(optionIndex);
                        return (
                          <div
                            key={optionIndex}
                            onClick={() => toggleMultipleAnswerIndex(questionIndex, optionIndex)}
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
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: isCorrect ? '#a5d6a7' : 'var(--neutral-300)', fontWeight: 700 }}>
                                <input
                                  type="checkbox"
                                  checked={isCorrect}
                                  onChange={() => toggleMultipleAnswerIndex(questionIndex, optionIndex)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ accentColor: 'var(--success)', cursor: 'pointer', width: '15px', height: '15px' }}
                                />
                                Choice {String.fromCharCode(65 + optionIndex)}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                {isCorrect ? (
                                  <span style={{
                                    fontSize: '0.74rem',
                                    fontWeight: 600,
                                    color: '#81c784',
                                    background: 'rgba(67, 160, 71, 0.25)',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '999px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                  }}>
                                    <CheckCircle2 size={12} /> Correct Choice
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.72rem', color: 'var(--neutral-400)' }}>
                                    Click to mark correct
                                  </span>
                                )}
                                {question.options.length > 2 && (
                                  <button
                                    type="button"
                                    title="Remove this choice"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeOptionChoice(questionIndex, optionIndex);
                                    }}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: '#ef5350',
                                      cursor: 'pointer',
                                      padding: '0.1rem 0.25rem',
                                      display: 'inline-flex',
                                    }}
                                  >
                                    <X size={13} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <input
                              className="form-input"
                              value={option}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)}
                              placeholder={`Enter choice ${String.fromCharCode(65 + optionIndex)} text...`}
                              aria-label={`Question ${questionIndex + 1}, choice ${String.fromCharCode(65 + optionIndex)}`}
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
                )}

                {qType === 'essay' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: 'var(--radius-md)', padding: '0.95rem 1.05rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ddd6fe' }}>
                        Essay Response · Model Answer / Expected Keywords (Optional)
                      </span>
                      <span style={{ fontSize: '0.74rem', color: 'var(--neutral-300)' }}>
                        Students will write an open-ended paragraph response
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
                      placeholder="Optional: Enter a sample model answer, grading rubric, or key concepts to look for..."
                      style={{
                        minHeight: '68px',
                        background: 'rgba(20, 12, 35, 0.7)',
                        borderColor: 'rgba(167, 139, 250, 0.35)',
                        fontSize: '0.88rem',
                        lineHeight: 1.5,
                        resize: 'vertical',
                      }}
                    />
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Bottom Action Footer with Direct Move thru the Top */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap', gap: '0.5rem' }}>
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            onClick={() => {
              setDraft({ ...draft, questions: [...draft.questions, emptyQuestion(newQuestionType)] });
              setTimeout(scrollToBottom, 50);
            }}
          >
            <Plus size={15} /> Add Another {QUESTION_TYPE_LABELS[newQuestionType]} Question
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
