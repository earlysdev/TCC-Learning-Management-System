import { useEffect, useMemo, useState } from 'react';
import { Check, Layers, UserRoundCheck, UsersRound } from 'lucide-react';
import type { Quiz, User } from '../../lib/types';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';

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
}

interface PublishQuizModalProps {
  quiz: Quiz | null;
  isOpen: boolean;
  students: User[];
  sections: SectionOption[];
  busy?: boolean;
  onClose: () => void;
  onPublish: (audience: PublishAudience) => void;
}

const audienceChoices: Array<{ type: AudienceType; label: string; detail: string; icon: typeof UsersRound }> = [
  { type: 'all', label: 'All students', detail: 'Make this quiz available to every enrolled student.', icon: UsersRound },
  { type: 'section', label: 'Selected blocks', detail: 'Choose one or more class blocks.', icon: Layers },
  { type: 'individual', label: 'Individual students', detail: 'Choose specific learners from your roster.', icon: UserRoundCheck },
];

export default function PublishQuizModal({ quiz, isOpen, students, sections, busy = false, onClose, onPublish }: PublishQuizModalProps) {
  const [audienceType, setAudienceType] = useState<AudienceType>('all');
  const [sectionIds, setSectionIds] = useState<Array<string | number>>([]);
  const [studentIds, setStudentIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAudienceType('all');
      setSectionIds([]);
      setStudentIds([]);
      setSearch('');
    }
  }, [isOpen, quiz?.id]);

  const matchingStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students;
    return students.filter((student) => [student.name, student.email, student.lrn, student.grade, student.section]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term)));
  }, [search, students]);

  if (!quiz) return null;

  const canPublish = audienceType === 'all'
    || (audienceType === 'section' && sectionIds.length > 0)
    || (audienceType === 'individual' && studentIds.length > 0);

  const toggleSection = (id: string | number) => {
    setSectionIds((current) => current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id]);
  };

  const toggleStudent = (id: number) => {
    setStudentIds((current) => current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id]);
  };

  const audienceSummary = audienceType === 'all'
    ? 'all enrolled students'
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
          <Button variant="success" disabled={!canPublish || busy} isLoading={busy} onClick={() => onPublish({ type: audienceType, section_ids: sectionIds, student_ids: studentIds })}>
            Publish to {audienceSummary}
          </Button>
        </>
      )}
    >
      <div style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: '0.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p style={{ margin: 0, color: 'var(--neutral-300)', fontSize: '0.9rem' }}>
          Choose the students who can access this quiz. You can unpublish it later from the quiz list.
        </p>

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
              <input className="form-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, ID, grade, or block" />
            </label>
            {students.length === 0 ? (
              <p style={{ color: 'var(--neutral-300)', fontSize: '0.88rem' }}>No students are available in the current roster.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '260px', overflowY: 'auto' }}>
                {matchingStudents.map((student) => {
                  const selected = studentIds.includes(student.id);
                  return (
                    <label key={student.id} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.65rem', border: `1px solid ${selected ? 'var(--success)' : 'var(--glass-border)'}`, background: selected ? 'rgba(67,160,71,0.12)' : 'rgba(255,255,255,0.025)', padding: '0.65rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                      <input type="checkbox" checked={selected} onChange={() => toggleStudent(student.id)} style={{ accentColor: 'var(--success)' }} />
                      <span style={{ flex: 1 }}>
                        <strong style={{ display: 'block', color: 'white', fontSize: '0.88rem' }}>{student.name}</strong>
                        <span style={{ display: 'block', color: 'var(--neutral-400)', fontSize: '0.75rem' }}>{[student.grade, student.section, student.lrn].filter(Boolean).join(' · ') || student.email}</span>
                      </span>
                      {selected && <Check size={16} style={{ color: 'var(--success)' }} />}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div style={{ borderRadius: 'var(--radius-md)', padding: '0.75rem 0.9rem', background: 'rgba(63,81,181,0.14)', color: 'var(--neutral-200)', fontSize: '0.85rem' }}>
          This quiz will be published to <strong style={{ color: 'white' }}>{audienceSummary}</strong>.
        </div>
      </div>
    </Modal>
  );
}
