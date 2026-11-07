import { useState } from 'react';
import {
  ShieldCheck,
  LockKeyhole,
  Eye,
  MonitorOff,
  Clock,
  FileQuestion,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  X,
  Info,
} from 'lucide-react';
import type { Quiz } from '../../lib/types';
import Button from './Button';
import Badge from './Badge';

interface QuizPrivacyRulesModalProps {
  quiz: Quiz | null;
  isOpen: boolean;
  isStarting?: boolean;
  onClose: () => void;
  onConfirmStart: (quiz: Quiz) => void;
}

export default function QuizPrivacyRulesModal({
  quiz,
  isOpen,
  isStarting = false,
  onClose,
  onConfirmStart,
}: QuizPrivacyRulesModalProps) {
  const [acknowledged, setAcknowledged] = useState(true);

  if (!isOpen || !quiz) return null;

  const questionCount = quiz.questions?.length || quiz.question_count || 0;
  const timeLimit = Number(quiz.time_limit_minutes) > 0 ? Number(quiz.time_limit_minutes) : 15;
  const isSummative = quiz.quiz_type === 'summative';

  const handleConfirm = () => {
    setAcknowledged(true);
    onConfirmStart(quiz);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-privacy-rules-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        background: 'rgba(6, 4, 8, 0.86)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.15rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '660px',
          maxHeight: '92vh',
          background: 'linear-gradient(180deg, rgba(44, 12, 20, 0.99) 0%, rgba(20, 7, 12, 0.99) 100%)',
          border: '1.5px solid rgba(251, 191, 36, 0.35)',
          borderRadius: '18px',
          boxShadow: '0 28px 70px rgba(0, 0, 0, 0.78), 0 0 0 1px rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'white',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.2rem 1.45rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.14), rgba(139, 92, 246, 0.08))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', minWidth: 0 }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(251, 191, 36, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fbbf24',
                flexShrink: 0,
              }}
            >
              <ShieldCheck size={24} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.7px',
                    color: '#fde68a',
                    background: 'rgba(245, 158, 11, 0.2)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    padding: '0.15rem 0.55rem',
                    borderRadius: '999px',
                  }}
                >
                  Pre-Quiz Privacy & Rules Notice
                </span>
                <Badge variant="primary">{quiz.subject}</Badge>
                <Badge variant={isSummative ? 'warning' : 'success'}>
                  {isSummative ? 'Summative Exam' : 'Formative Quiz'}
                </Badge>
              </div>
              <h2
                id="quiz-privacy-rules-title"
                style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', margin: 0, lineHeight: 1.25 }}
              >
                {quiz.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close privacy and rules notice"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
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

        {/* Body */}
        <div
          style={{
            padding: '1.25rem 1.45rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {/* Assessment Quick Summary */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.65rem',
            }}
          >
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.09)',
                borderRadius: '10px',
                padding: '0.6rem 0.8rem',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 700 }}>
                Total Items
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <FileQuestion size={14} style={{ color: '#c4b5fd' }} /> {questionCount} Questions
              </div>
            </div>

            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.09)',
                borderRadius: '10px',
                padding: '0.6rem 0.8rem',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 700 }}>
                Time Limit
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fbbf24', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Clock size={14} /> {timeLimit} Minutes
              </div>
            </div>

            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.09)',
                borderRadius: '10px',
                padding: '0.6rem 0.8rem',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 700 }}>
                Security Mode
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#a5d6a7', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <LockKeyhole size={14} /> Full-Screen Lock
              </div>
            </div>
          </div>

          {/* Data Privacy & Proctoring Notice */}
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.32)',
              borderRadius: '12px',
              padding: '0.9rem 1.05rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.76rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: '#93c5fd',
                marginBottom: '0.35rem',
              }}
            >
              <Eye size={15} /> Quiz Data Privacy & Proctoring Telemetry Notice
            </div>
            <p style={{ margin: 0, fontSize: '0.86rem', color: '#e2e8f0', lineHeight: 1.55 }}>
              To uphold academic integrity at Tagoloan Community College, this assessment window monitors full-screen lock status, window focus/tab switches, restricted keyboard shortcuts, and live question progress. Recorded proctoring telemetry is strictly confidential and visible only to your subject instructor and authorized academic administrators.
            </p>
          </div>

          {/* Anti-Cheat Exam Rules */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '0.95rem 1.05rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.7rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.76rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: '#fde68a',
              }}
            >
              <AlertTriangle size={15} /> Mandatory Exam & Anti-Cheat Rules
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.65rem' }}>
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.28)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '0.7rem 0.85rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.84rem', color: '#fde68a', marginBottom: '0.25rem' }}>
                  <LockKeyhole size={14} /> 1. Full-Screen Exam Lock
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--neutral-300)', lineHeight: 1.45 }}>
                  Starting the quiz automatically locks your screen into full-screen mode. Pressing <code style={{ color: 'white' }}>Esc</code> or exiting full-screen triggers a blackout shield and logs a violation.
                </p>
              </div>

              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.28)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '0.7rem 0.85rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.84rem', color: '#ff8a80', marginBottom: '0.25rem' }}>
                  <MonitorOff size={14} /> 2. No Tab Switching / Alt-Tab
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--neutral-300)', lineHeight: 1.45 }}>
                  Switching tabs, minimizing the browser, or clicking outside the window immediately blacks out the assessment and reports an incident to your teacher.
                </p>
              </div>

              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.28)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '0.7rem 0.85rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.84rem', color: '#c4b5fd', marginBottom: '0.25rem' }}>
                  <ShieldCheck size={14} /> 3. No Screenshots or Copying
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--neutral-300)', lineHeight: 1.45 }}>
                  PrintScreen, Snipping Tool shortcuts, right-clicking, copying/cutting text, printing, and Developer Tools (<code style={{ color: 'white' }}>F12</code>) are blocked and recorded.
                </p>
              </div>

              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.28)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '0.7rem 0.85rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.84rem', color: '#a5d6a7', marginBottom: '0.25rem' }}>
                  <Clock size={14} /> 4. Single Attempt & Auto-Submit
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--neutral-300)', lineHeight: 1.45 }}>
                  You may only submit this quiz once. When the {timeLimit}-minute countdown timer reaches zero, your current answers are automatically submitted.
                </p>
              </div>
            </div>
          </div>

          {/* Teacher's Instructions if available */}
          {quiz.instructions && (
            <div
              style={{
                background: 'rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: '10px',
                padding: '0.75rem 0.95rem',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: '#c4b5fd', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Info size={13} /> Instructor&apos;s Directions
              </div>
              <div style={{ fontSize: '0.85rem', color: '#ede9fe', lineHeight: 1.5 }}>
                {quiz.instructions}
              </div>
            </div>
          )}

          {/* Student Acknowledgment Checkbox */}
          <label
            onClick={() => setAcknowledged((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.7rem',
              padding: '0.8rem 0.95rem',
              borderRadius: '10px',
              background: acknowledged ? 'rgba(76, 175, 80, 0.14)' : 'rgba(255, 255, 255, 0.04)',
              border: acknowledged ? '1px solid rgba(76, 175, 80, 0.45)' : '1px solid rgba(255, 255, 255, 0.14)',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'all 0.2s',
            }}
          >
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              style={{ marginTop: '0.18rem', width: '17px', height: '17px', accentColor: '#4caf50', flexShrink: 0 }}
            />
            <span style={{ fontSize: '0.84rem', color: acknowledged ? '#e8f5e9' : 'var(--neutral-200)', lineHeight: 1.45, fontWeight: 600 }}>
              I have read and understood the Quiz Privacy Notice and Anti-Cheat Exam Rules, and I agree to enter Full-Screen Exam Lock to begin this quiz.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.45rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(0, 0, 0, 0.35)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: '#a5d6a7', fontWeight: 600 }}>
            <CheckCircle2 size={15} /> Ready to launch secure full-screen window
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Button variant="outline" onClick={onClose} disabled={isStarting}>
              Cancel
            </Button>
            <Button
              variant="accent"
              onClick={handleConfirm}
              disabled={!acknowledged || isStarting}
            >
              <LockKeyhole size={15} /> {isStarting ? 'Entering Quiz...' : 'I Agree & Start Quiz'} <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
