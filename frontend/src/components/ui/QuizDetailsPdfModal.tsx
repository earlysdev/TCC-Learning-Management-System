import { useEffect, useState } from 'react';
import {
  BookOpen,
  Clock,
  Download,
  FileQuestion,
  FileText,
  Info,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { lmsFetch } from '../../lmsApi';
import type { Quiz } from '../../lib/types';
import Button from './Button';
import Badge from './Badge';

interface QuizPdfResponse {
  id: number;
  title: string;
  subject: string;
  topic: string;
  instructions: string | null;
  time_limit_minutes: number;
  question_count: number;
  reference_pdf_name: string | null;
  reference_pdf_text: string | null;
  reference_pdf_data: string | null;
  has_pdf_data: boolean;
}

interface QuizDetailsPdfModalProps {
  quiz: Quiz;
  onClose: () => void;
  onStartQuiz?: (quiz: Quiz) => void;
  inAssessmentWindow?: boolean;
}

function getStructuredModuleNotes(title: string, subject: string, topic: string): string[] {
  const combined = `${title} ${topic} ${subject}`.toLowerCase();
  if (combined.includes('secure data storage') || combined.includes('storage') || combined.includes('encryption')) {
    return [
      'Encryption at Rest & in Transit: Sensitive data stored on disks, databases, or cloud volumes must be encrypted at rest (e.g., AES-256) and protected in transit using TLS.',
      'Principle of Least Privilege (RBAC): Access to data repositories should be restricted so users and services only have permissions necessary for their assigned roles.',
      'Cryptographic Key Management: Encryption keys must be stored separately from encrypted data using dedicated key management systems (KMS/HSM) and rotated periodically.',
      'Data Integrity & Checksums: Cryptographic hashes (SHA-256) and message authentication codes verify that stored records have not been altered or corrupted.',
      'Redundant Backups & Recovery (3-2-1 Rule): Maintain encrypted, off-site, and immutable backups with regular restoration testing to ensure resilience against ransomware or hardware failure.',
    ];
  }

  return [
    `Core Objective: Understand the fundamental principles, terminology, and practical applications of ${topic || title} in ${subject}.`,
    `Analytical Review: Carefully read each question stem and evaluate all four options before selecting the most accurate statement.`,
    `Verification & Best Practices: Apply standard ${subject} methodologies, validation checks, and structured problem-solving throughout the assessment.`,
  ];
}

export default function QuizDetailsPdfModal({
  quiz,
  onClose,
  onStartQuiz,
  inAssessmentWindow = false,
}: QuizDetailsPdfModalProps) {
  const [loadingPdf, setLoadingPdf] = useState(Boolean(quiz.reference_pdf_name));
  const [pdfData, setPdfData] = useState<QuizPdfResponse | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    if (!quiz.reference_pdf_name) {
      setLoadingPdf(false);
      return;
    }

    setLoadingPdf(true);
    lmsFetch<QuizPdfResponse>(`/student/quizzes/${quiz.id}/pdf`)
      .then((data) => {
        if (!active) return;
        setPdfData(data);
        if (data.reference_pdf_data) {
          try {
            const cleanBase64 = data.reference_pdf_data.replace(/^data:application\/pdf;base64,/i, '');
            const binaryStr = window.atob(cleanBase64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i += 1) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/pdf' });
            createdUrl = URL.createObjectURL(blob);
            setPdfBlobUrl(createdUrl);
          } catch {
            setPdfBlobUrl(null);
          }
        }
      })
      .catch(() => {
        // Fallback to quiz prop fields if endpoint fails
      })
      .finally(() => {
        if (active) setLoadingPdf(false);
      });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [quiz.id, quiz.reference_pdf_name]);

  const pdfName = pdfData?.reference_pdf_name ?? quiz.reference_pdf_name ?? null;
  const pdfText = pdfData?.reference_pdf_text ?? quiz.reference_pdf_text ?? null;
  const instructions =
    pdfData?.instructions ??
    quiz.instructions ??
    'Choose the best answer for each question. Alt-tabbing, taking screenshots, or opening developer tools is strictly prohibited and monitored.';
  const questionCount = quiz.questions?.length || pdfData?.question_count || quiz.question_count || 0;
  const timeLimit = pdfData?.time_limit_minutes || quiz.time_limit_minutes || 15;
  const fallbackNotes = getStructuredModuleNotes(quiz.title, quiz.subject, quiz.topic);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-details-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(8, 4, 6, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: pdfName ? '920px' : '680px',
          maxHeight: '90vh',
          background: 'linear-gradient(180deg, rgba(42, 12, 18, 0.98), rgba(24, 8, 12, 0.99))',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '16px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.65)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'white',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.15rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
              <Badge variant="primary">{quiz.subject}</Badge>
              {quiz.attempted ? (
                <Badge variant="success">Completed</Badge>
              ) : (
                <Badge variant="warning">Published Assessment</Badge>
              )}
              {pdfName && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                    background: 'rgba(139, 92, 246, 0.2)',
                    border: '1px solid rgba(139, 92, 246, 0.4)',
                    color: '#ddd6fe',
                    fontWeight: 600,
                  }}
                >
                  <FileText size={12} /> PDF Attached
                </span>
              )}
            </div>
            <h2
              id="quiz-details-modal-title"
              style={{ fontSize: '1.35rem', fontWeight: 800, color: 'white', margin: 0, lineHeight: 1.25 }}
            >
              {quiz.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: 'var(--neutral-300)',
              borderRadius: '8px',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '1.35rem 1.5rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.15rem',
          }}
        >
          {/* Metadata Pills */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '0.75rem',
            }}
          >
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '0.7rem 0.9rem',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 700 }}>
                Topic / Unit
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'white', marginTop: '0.2rem' }}>
                {quiz.topic || quiz.title}
              </div>
            </div>

            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '0.7rem 0.9rem',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 700 }}>
                Total Questions
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'white', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <FileQuestion size={15} style={{ color: 'var(--primary-300)' }} /> {questionCount} Questions
              </div>
            </div>

            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '0.7rem 0.9rem',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 700 }}>
                Time Limit
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fbbf24', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Clock size={15} /> {timeLimit} Minutes
              </div>
            </div>

            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '0.7rem 0.9rem',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 700 }}>
                Exam Security
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#a5d6a7', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <ShieldCheck size={15} /> Anti-Cheat Active
              </div>
            </div>
          </div>

          {/* Instructions Box */}
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '12px',
              padding: '1rem 1.15rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.78rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                color: '#93c5fd',
                marginBottom: '0.45rem',
              }}
            >
              <Info size={15} /> Instructions for Students
            </div>
            <p style={{ margin: 0, color: '#eff6ff', fontSize: '0.95rem', lineHeight: 1.6 }}>
              {instructions}
            </p>
          </div>

          {/* Attached PDF Handout & Reference Viewer */}
          {pdfName && (
            <div
              style={{
                background: 'rgba(139, 92, 246, 0.08)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: '12px',
                padding: '1.1rem 1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.9rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: 'rgba(139, 92, 246, 0.25)',
                      border: '1px solid rgba(139, 92, 246, 0.45)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ddd6fe',
                      flexShrink: 0,
                    }}
                  >
                    <FileText size={20} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.72rem', color: '#c4b5fd', textTransform: 'uppercase', fontWeight: 700 }}>
                      Attached Reference PDF / Handout
                    </div>
                    <div
                      style={{
                        fontSize: '0.98rem',
                        fontWeight: 700,
                        color: 'white',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {pdfName}
                    </div>
                  </div>
                </div>

                {pdfBlobUrl && (
                  <a
                    href={pdfBlobUrl}
                    download={pdfName}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.45rem 0.9rem',
                      borderRadius: '8px',
                      background: 'rgba(139, 92, 246, 0.3)',
                      border: '1px solid rgba(139, 92, 246, 0.55)',
                      color: 'white',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    <Download size={14} /> Download PDF
                  </a>
                )}
              </div>

              {loadingPdf ? (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: '#ddd6fe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.6rem',
                  }}
                >
                  <Loader2 size={18} className="spin-icon" /> Loading attached PDF reference material...
                </div>
              ) : pdfBlobUrl ? (
                <div
                  style={{
                    width: '100%',
                    height: '440px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    background: '#1a1a1a',
                  }}
                >
                  <iframe
                    src={pdfBlobUrl}
                    title={pdfName}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.32)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '10px',
                    padding: '1rem 1.15rem',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: '#c4b5fd',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      marginBottom: '0.55rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <Sparkles size={14} /> Reference Handout Key Points ({pdfName})
                  </div>
                  {pdfText ? (
                    <div
                      style={{
                        color: 'var(--neutral-200)',
                        fontSize: '0.9rem',
                        lineHeight: 1.65,
                        maxHeight: '280px',
                        overflowY: 'auto',
                        whiteSpace: 'pre-line',
                      }}
                    >
                      {pdfText}
                    </div>
                  ) : (
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: '1.25rem',
                        color: 'var(--neutral-200)',
                        fontSize: '0.9rem',
                        lineHeight: 1.65,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem',
                      }}
                    >
                      {fallbackNotes.map((note, idx) => (
                        <li key={idx}>{note}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(0, 0, 0, 0.25)',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <Button variant="outline" onClick={onClose}>
            {inAssessmentWindow ? 'Back to Assessment Questions' : 'Close'}
          </Button>
          {!inAssessmentWindow && onStartQuiz && (
            quiz.attempted || quiz.started || quiz.is_locked ? (
              <>
                {quiz.attempted && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const target = quiz;
                      onClose();
                      onStartQuiz(target);
                    }}
                  >
                    <BookOpen size={16} /> View Result & Recommendations <ArrowRight size={15} />
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled
                  title="Single-attempt policy: You have already started or completed this quiz and cannot click Take Quiz a second time."
                  style={{
                    opacity: 0.72,
                    cursor: 'not-allowed',
                    background: 'rgba(239, 68, 68, 0.12)',
                    borderColor: 'rgba(239, 68, 68, 0.35)',
                    color: '#fca5a5',
                  }}
                >
                  <Lock size={15} /> Take Quiz (Locked)
                </Button>
              </>
            ) : (
              <Button
                variant="accent"
                onClick={() => {
                  const target = quiz;
                  onClose();
                  onStartQuiz(target);
                }}
              >
                <BookOpen size={16} /> Take Quiz <ArrowRight size={15} />
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

