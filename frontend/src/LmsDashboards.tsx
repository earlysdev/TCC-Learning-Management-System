import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Clock3, FileQuestion,
  GraduationCap, LayoutDashboard, LogOut, Send, ShieldCheck, Sparkles,
  Target, Users,
} from 'lucide-react'
import { getLmsUser, lmsFetch, signOut } from './lmsApi'
import './LmsDashboards.css'

type Quiz = {
  id: number; title: string; subject: string; topic: string; instructions: string | null
  question_count: number; is_published?: boolean; generated_by_ai?: boolean; attempts_count?: number
  average?: number; attempted?: boolean; score?: number | null; max_score?: number | null
  percentage?: number | null; recommendation?: Recommendation | null
  questions?: Question[]
}
type Question = { prompt: string; options: string[]; correct_index?: number; skill?: string }
type Recommendation = { summary: string; focus_topics: string[]; action_steps: string[]; source?: string }

function QuizIcon({ green = false }: { green?: boolean }) {
  return <span className={`lms-icon ${green ? 'lms-icon-green' : ''}`}><FileQuestion size={19} /></span>
}

function Shell({ role, children }: { role: 'teacher' | 'student'; children: ReactNode }) {
  const user = getLmsUser()
  const navigate = useNavigate()
  const teacher = role === 'teacher'
  async function logout() { await signOut(); navigate('/login') }
  return <div className="lms-layout">
    <aside className="lms-sidebar">
      <Link to="/" className="lms-brand"><img src="/assets/images/logo.png" alt="" /><span><strong>LNHS</strong><small>Learning space</small></span></Link>
      <div className="lms-side-label">WORKSPACE</div>
      <div className="lms-side-active"><LayoutDashboard size={17} /> Overview</div>
      <a className="lms-side-item" href={teacher ? '#quizzes' : '#available-quizzes'}><BookOpen size={17} /> {teacher ? 'My quizzes' : 'My quizzes'}</a>
      <a className="lms-side-item" href={teacher ? '#generator' : '#recommendations'}>{teacher ? <Sparkles size={17} /> : <Target size={17} />}{teacher ? 'AI quiz builder' : 'Study recommendations'}</a>
      <div className="lms-sidebar-bottom"><div className="lms-side-label">ACCOUNT</div><div className="lms-account"><span className="lms-avatar">{(user?.name ?? role).slice(0, 1).toUpperCase()}</span><span><strong>{user?.name ?? `${role} demo`}</strong><small>{user?.email ?? ''}</small></span></div><button className="lms-signout" onClick={() => void logout()}><LogOut size={16} /> Sign out</button></div>
    </aside>
    <main className="lms-main"><header className="lms-topbar"><div><span>LNHS LMS</span><ChevronRight size={14} /><strong>{teacher ? 'Teacher workspace' : 'Student workspace'}</strong></div><span className="lms-secure"><ShieldCheck size={15} /> Secure session</span></header>{children}<footer className="lms-footer">Tagoloan Community College <span>·</span> Learning Management System <span className="lms-footer-role">Signed in as {teacher ? 'Teacher' : 'Student'}</span></footer></main>
  </div>
}

export function TeacherDashboard() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [metrics, setMetrics] = useState({ quizzes: 0, published: 0, submissions: 0, average: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [subject, setSubject] = useState('Science')
  const [topic, setTopic] = useState('Ecosystems')
  const [difficulty, setDifficulty] = useState('medium')
  const [count, setCount] = useState(5)

  async function load() {
    setError('')
    try {
      const data = await lmsFetch<{ metrics: typeof metrics; quizzes: Quiz[] }>('/teacher/dashboard')
      setMetrics(data.metrics); setQuizzes(data.quizzes)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load the teacher dashboard.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const data = await lmsFetch<{ quiz: Quiz; generation_source: string }>('/teacher/quizzes/generate', {
        method: 'POST', body: JSON.stringify({ subject, topic, count, difficulty }),
      })
      setNotice(data.generation_source === 'gemini'
        ? `AI draft created: “${data.quiz.title}”. Review its answer key below before publishing.`
        : `Demo question set created: “${data.quiz.title}”. Add a Gemini API key for AI-generated drafts on any topic.`)
      await load()
      document.getElementById(`quiz-${data.quiz.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not generate the quiz.') }
    finally { setBusy(false) }
  }

  async function publish(quiz: Quiz, isPublished: boolean) {
    setBusy(true); setError(''); setNotice('')
    try { await lmsFetch(`/teacher/quizzes/${quiz.id}/publish`, { method: 'PATCH', body: JSON.stringify({ is_published: isPublished }) }); setNotice(isPublished ? 'Quiz published. Students can now see it.' : 'Quiz unpublished.'); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the quiz.') }
    finally { setBusy(false) }
  }

  return <Shell role="teacher"><div className="lms-content">
    <div className="lms-welcome"><div><span className="lms-eyebrow">TEACHER WORKSPACE</span><h1>Your class, at a glance.</h1><p>Create useful practice and see where learners may need support.</p></div><div className="lms-date"><Clock3 size={15} /> Today’s learning, organized</div></div>
    {error && <div className="lms-alert" role="alert">{error}</div>}{notice && <div className="lms-notice" role="status"><Check size={16} />{notice}</div>}
    <section className="lms-stat-grid"><Stat icon={<BookOpen size={18} />} label="Quizzes created" value={loading ? '…' : metrics.quizzes} detail="In your workspace" /><Stat icon={<FileQuestion size={18} />} label="Published" value={loading ? '…' : metrics.published} detail="Visible to students" /><Stat icon={<Users size={18} />} label="Submissions" value={loading ? '…' : metrics.submissions} detail="Completed attempts" /><Stat icon={<Target size={18} />} label="Class average" value={`${loading ? '…' : metrics.average}%`} detail="Across submitted quizzes" /></section>

    <section className="lms-work-grid"><article className="lms-panel lms-generator" id="generator"><div className="lms-panel-head"><div><span className="lms-eyebrow">SYSTEM AI GENERATED QUIZ</span><h2>Build a practice quiz</h2></div><span className="lms-ai-badge"><Sparkles size={14} /> AI assisted</span></div><p className="lms-panel-copy">Choose a topic and create a draft. Review the questions and answer key, then publish when it is ready.</p>
      <form className="lms-generator-form" onSubmit={(event) => void generate(event)}><label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={100} required /></label><label>Topic<input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={120} required /></label><div className="lms-form-row"><label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="challenging">Challenging</option></select></label><label>Questions<select value={count} onChange={(event) => setCount(Number(event.target.value))}>{[3, 5].map((value) => <option key={value} value={value}>{value} questions</option>)}</select></label></div><button className="lms-button lms-button-primary" disabled={busy}><Sparkles size={16} />{busy ? 'Creating draft…' : 'Generate quiz draft'}<ArrowRight size={16} /></button></form>
      <div className="lms-ai-hint"><CircleHelp size={15} /><span><strong>AI recommendations:</strong> after students submit, they receive suggested topics and next study steps. Add a Gemini key to enable live generation and tailored suggestions.</span></div>
    </article>
    <article className="lms-panel lms-quick-panel"><span className="lms-eyebrow">TEACHING SNAPSHOT</span><h2>Keep feedback actionable.</h2><p>Quiz results are scored on the server. The dashboard summarizes participation and helps learners focus on skills they missed.</p><div className="lms-snapshot"><div><span className="lms-snapshot-icon"><GraduationCap size={18} /></span><span><strong>One attempt per student</strong><small>Prevents duplicate submissions</small></span></div><div><span className="lms-snapshot-icon"><ShieldCheck size={18} /></span><span><strong>Answer keys stay private</strong><small>Students only receive questions and choices</small></span></div><div><span className="lms-snapshot-icon"><Target size={18} /></span><span><strong>Supportive next steps</strong><small>Feedback focuses on missed skills</small></span></div></div></article></section>

    <section className="lms-panel lms-quiz-list" id="quizzes"><div className="lms-panel-head"><div><span className="lms-eyebrow">ASSESSMENTS</span><h2>Your quizzes</h2></div><span className="lms-muted-count">{quizzes.length} total</span></div>
      {loading ? <div className="lms-empty">Loading your quizzes…</div> : quizzes.length === 0 ? <div className="lms-empty"><QuizIcon green /><h3>No quizzes yet</h3><p>Use the quiz builder above to create the first draft for your students.</p></div> : <div className="lms-quiz-cards">{quizzes.map((quiz) => <article className="lms-quiz-card" id={`quiz-${quiz.id}`} key={quiz.id}><div className="lms-quiz-card-top"><QuizIcon green /><span className={`lms-status ${quiz.is_published ? 'is-published' : ''}`}>{quiz.is_published ? 'Published' : 'Draft'}</span></div><h3>{quiz.title}</h3><p className="lms-quiz-meta">{quiz.subject} <span>·</span> {quiz.question_count} questions <span>·</span> {quiz.generated_by_ai ? 'AI generated' : 'Question set'}</p><div className="lms-quiz-stats"><span><strong>{quiz.attempts_count ?? 0}</strong> submissions</span><span><strong>{quiz.average ?? 0}%</strong> average score</span></div>
        {quiz.questions?.length ? <details className="lms-answer-preview"><summary>Review questions and answer key</summary><ol>{quiz.questions.map((question, index) => <li key={`${quiz.id}-${index}`}><strong>{question.prompt}</strong><small>Answer: {question.options[question.correct_index ?? 0]}</small></li>)}</ol></details> : null}
        <button className={`lms-button ${quiz.is_published ? 'lms-button-outline' : 'lms-button-primary'} lms-quiz-action`} disabled={busy} onClick={() => void publish(quiz, !quiz.is_published)}>{quiz.is_published ? 'Unpublish quiz' : 'Publish to students'}<ArrowRight size={15} /></button></article>)}</div>}
    </section>
    <div className="lms-tip"><Sparkles size={16} /><span><strong>Teaching tip</strong> Use quiz recommendations to guide the next lesson or a small review group.</span></div>
  </div></Shell>
}

function Stat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string | number; detail: string }) {
  return <article className="lms-stat"><div className="lms-stat-top"><span>{label}</span><span className="lms-stat-icon">{icon}</span></div><strong>{value}</strong><small>{detail}</small></article>
}

export function StudentDashboard() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [selected, setSelected] = useState<Quiz | null>(null)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<{ score: number; max_score: number; percentage: string | number; recommendation: Recommendation } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function load() {
    setError('')
    try { const data = await lmsFetch<{ quizzes: Quiz[] }>('/student/quizzes'); setQuizzes(data.quizzes) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load quizzes.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  async function openQuiz(quiz: Quiz) {
    setError(''); setResult(null); setAnswers([]); setBusy(true)
    try {
      const data = await lmsFetch<{ quiz: Quiz; attempt: typeof result }>(`/student/quizzes/${quiz.id}`)
      setSelected(data.quiz); setResult(data.attempt)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open this quiz.') }
    finally { setBusy(false) }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || answers.length !== selected.questions?.length || answers.some((answer) => answer === undefined)) { setError('Please answer every question before submitting.'); return }
    setBusy(true); setError('')
    try {
      const data = await lmsFetch<{ attempt: NonNullable<typeof result> }>(`/student/quizzes/${selected.id}/submit`, { method: 'POST', body: JSON.stringify({ answers }) })
      setResult(data.attempt); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit your answers.') }
    finally { setBusy(false) }
  }

  const completed = quizzes.filter((quiz) => quiz.attempted).length
  const avg = quizzes.filter((quiz) => quiz.attempted).reduce((total, quiz) => total + Number(quiz.percentage ?? 0), 0) / (completed || 1)

  return <Shell role="student"><div className="lms-content">
    <div className="lms-welcome"><div><span className="lms-eyebrow">STUDENT WORKSPACE</span><h1>Keep your learning moving.</h1><p>Pick a quiz, check your progress, and get a helpful next step.</p></div><div className="lms-date"><GraduationCap size={16} /> Learning at your pace</div></div>
    {error && <div className="lms-alert" role="alert">{error}</div>}
    <section className="lms-stat-grid student-stats"><Stat icon={<BookOpen size={18} />} label="Available quizzes" value={loading ? '…' : quizzes.length} detail="Published by your teacher" /><Stat icon={<Check size={18} />} label="Completed" value={loading ? '…' : completed} detail="Submitted one time each" /><Stat icon={<Target size={18} />} label="Average score" value={`${loading ? '…' : avg.toFixed(0)}%`} detail="Across completed quizzes" /><Stat icon={<Sparkles size={18} />} label="Study suggestions" value={completed} detail="Based on your quiz results" /></section>
    {selected ? <section className="lms-panel lms-take-quiz"><div className="lms-panel-head"><div><button className="lms-back-link" onClick={() => { setSelected(null); setResult(null); setError('') }}>← All quizzes</button><span className="lms-eyebrow">{selected.subject.toUpperCase()} · {selected.topic.toUpperCase()}</span><h2>{selected.title}</h2></div><span className="lms-question-count">{selected.questions?.length} questions</span></div>
      {result ? <div className="lms-result"><div className="lms-result-score"><span>YOUR RESULT</span><strong>{result.score}<small>/{result.max_score}</small></strong><b>{Number(result.percentage).toFixed(0)}%</b></div><div className="lms-recommendation" id="recommendations"><div className="lms-recommendation-heading"><span className="lms-recommendation-icon"><Sparkles size={18} /></span><div><span className="lms-eyebrow">{result.recommendation.source === 'gemini' ? 'AI STUDY RECOMMENDATION' : 'PERSONALIZED STUDY RECOMMENDATION'}</span><h3>Your next step</h3></div></div><p>{result.recommendation.summary}</p>{result.recommendation.focus_topics.length > 0 && <><strong className="lms-rec-label">Focus on</strong><div className="lms-focus-tags">{result.recommendation.focus_topics.map((focus) => <span key={focus}>{focus}</span>)}</div></>}<strong className="lms-rec-label">Try this</strong><ul>{result.recommendation.action_steps.map((step) => <li key={step}>{step}</li>)}</ul><small className="lms-rec-source">{result.recommendation.source === 'gemini' ? 'Personalized with Gemini using your score and missed skills.' : 'Suggestions are based on the skills missed in this quiz.'}</small></div><button className="lms-button lms-button-outline" onClick={() => { setSelected(null); setResult(null) }}>Back to quizzes<ArrowRight size={15} /></button></div> : <form className="lms-question-form" onSubmit={(event) => void submit(event)}><p className="lms-panel-copy">{selected.instructions ?? 'Choose one answer for each question. Your progress is saved when you submit.'}</p>{selected.questions?.map((question, questionIndex) => <fieldset className="lms-question" key={questionIndex}><legend><span>{String(questionIndex + 1).padStart(2, '0')}</span>{question.prompt}</legend>{question.options.map((option, optionIndex) => <label className={`lms-option ${answers[questionIndex] === optionIndex ? 'lms-option-selected' : ''}`} key={optionIndex}><input type="radio" name={`question-${questionIndex}`} value={optionIndex} checked={answers[questionIndex] === optionIndex} onChange={() => setAnswers((current) => { const next = [...current]; next[questionIndex] = optionIndex; return next })} /><span className="lms-option-letter">{String.fromCharCode(65 + optionIndex)}</span>{option}</label>)}</fieldset>)}<button className="lms-button lms-button-primary" disabled={busy}><Send size={15} />{busy ? 'Submitting…' : 'Submit quiz'}<ArrowRight size={15} /></button><small className="lms-one-attempt-note">You can submit this quiz once. Your teacher will see your score.</small></form>}
    </section> : <section className="lms-panel lms-student-quizzes" id="available-quizzes"><div className="lms-panel-head"><div><span className="lms-eyebrow">READY WHEN YOU ARE</span><h2>Available quizzes</h2></div><span className="lms-muted-count">{quizzes.length} quizzes</span></div>{loading ? <div className="lms-empty">Loading published quizzes…</div> : quizzes.length === 0 ? <div className="lms-empty"><QuizIcon green /><h3>Your teacher hasn’t published a quiz yet</h3><p>When a new quiz is ready, it will show here for you to take.</p></div> : <div className="lms-quiz-cards">{quizzes.map((quiz) => <article className="lms-quiz-card student-quiz-card" key={quiz.id}><div className="lms-quiz-card-top"><QuizIcon green /><span className={`lms-status ${quiz.attempted ? 'is-completed' : ''}`}>{quiz.attempted ? 'Completed' : 'Ready'}</span></div><h3>{quiz.title}</h3><p className="lms-quiz-meta">{quiz.subject} <span>·</span> {quiz.question_count} questions</p>{quiz.attempted && <div className="lms-last-score"><strong>{quiz.score}/{quiz.max_score}</strong><span>{Number(quiz.percentage).toFixed(0)}% score</span></div>}<button className="lms-button lms-button-primary lms-quiz-action" disabled={busy} onClick={() => void openQuiz(quiz)}>{quiz.attempted ? 'View recommendation' : 'Take quiz'}<ArrowRight size={15} /></button></article>)}</div>}</section>}
    <div className="lms-tip"><Sparkles size={16} /><span><strong>Make it stick</strong> Short review sessions and practice help turn new ideas into lasting skills.</span></div>
  </div></Shell>
}
