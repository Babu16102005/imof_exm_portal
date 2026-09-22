import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { isMockMode } from '../../lib/supabaseClient.js'
import {
  getAttempt,
  getPlayerPaper,
  saveAttempt,
  submitExam,
} from '../../services/dataService.js'
import { formatTime } from '../../lib/helpers.js'

const INELIGIBLE_NOTICE = 'You are not eligible for this exam (class mismatch). Showing only exams for your class.'

function shuffleArr(a) {
  const arr = [...a]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function answerKey(studentId, examId) {
  return `imof_answers_${studentId}_${examId}`
}

export default function Player() {
  const { examId } = useParams()
  const { student } = useAuth()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState({})
  const [marked, setMarked] = useState({})
  const [startedAt, setStartedAt] = useState(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [endStep, setEndStep] = useState(0) // 0 none, 1 first confirm, 2 final confirm
  const [submitting, setSubmitting] = useState(false)
  const [lastAlert, setLastAlert] = useState(null)
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const submittedRef = useRef(false)
  const firedAlertsRef = useRef(new Set())
  const prevTimeRef = useRef(null)

  const storageKey = useMemo(
    () => (student ? answerKey(student.id, examId) : null),
    [student, examId],
  )

  // Load exam + questions
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        // LIVE: paper via RPC (questions carry NO correct_option — never
        // assumed below). Submitted guard via get_my_result. Timer base is a
        // localStorage start timestamp; single-attempt is enforced server-side.
        if (!isMockMode) {
          let paper
          try {
            paper = await getPlayerPaper(examId, student?.id, student?.class)
          } catch (e) {
            if (!alive) return
            if (/already submitted/i.test(e?.message || '')) {
              navigate(`/result/${examId}`, { replace: true })
              return
            }
            if (e?.code === 'CLASS_MISMATCH' || /eligible for this class|not eligible/i.test(e?.message || '')) {
              navigate('/my-exams', { replace: true, state: { notice: INELIGIBLE_NOTICE } })
              return
            }
            throw e
          }
          const ex = paper?.exam
          if (!ex) { alive && setErr('Exam not found'); return }
          if (ex.status && ex.status !== 'published') { alive && setErr('This exam is not published yet. Contact admin.'); alive && setLoading(false); return }
          const nowT = Date.now()
          if (ex.start_at && nowT < new Date(ex.start_at).getTime()) { alive && setErr('This exam has not started yet.'); alive && setLoading(false); return }
          if (ex.end_at && nowT > new Date(ex.end_at).getTime()) { alive && setErr('This exam window has closed.'); alive && setLoading(false); return }
          let qs = [...(paper.questions || [])].sort((a, b) => (a.q_no || 0) - (b.q_no || 0))
          const limit = Number(ex.total_questions) || qs.length
          qs = qs.slice(0, limit)
          // Shuffle display options per student (stable for this session).
          // NOTE: options only — there is no correct_option on these rows.
          const withDisplay = qs.map((q) => ({
            ...q,
            display: shuffleArr([
              { k: 'A', t: q.option_a },
              { k: 'B', t: q.option_b },
              { k: 'C', t: q.option_c },
              { k: 'D', t: q.option_d },
            ]),
          }))
          // Local start timestamp (first load wins) drives the countdown.
          let startTs = null
          let restored = null
          try {
            const raw = storageKey ? localStorage.getItem(storageKey) : null
            if (raw) restored = JSON.parse(raw)
          } catch { /* ignore */ }
          if (restored && typeof restored === 'object') {
            if (typeof restored.startedAt === 'number') startTs = restored.startedAt
          }
          if (!startTs) {
            startTs = nowT
            try {
              storageKey && localStorage.setItem(
                storageKey,
                JSON.stringify({ ...(restored || {}), startedAt: startTs }),
              )
            } catch { /* ignore */ }
          }
          if (!alive) return
          setExam(ex)
          setQuestions(withDisplay)
          setStartedAt(startTs)
          const durationSec = Number(ex.duration_minutes || 60) * 60
          const elapsedSec = Math.max(0, Math.floor((Date.now() - startTs) / 1000))
          setTimeLeft(Math.max(0, durationSec - elapsedSec))
          // Restore saved answers
          if (restored && typeof restored === 'object') {
            if (restored.answers && typeof restored.answers === 'object') setAnswers(restored.answers)
            if (restored.marked && typeof restored.marked === 'object') setMarked(restored.marked)
            if (typeof restored.current === 'number') setCurrent(restored.current)
          }
          return
        }
        // MOCK: class-gated via getPlayerPaper mock path — ineligible
        // students are redirected with no questions/timer leak (local
        // scoring via correct_option still applies once eligible).
        let gate
        try {
          gate = await getPlayerPaper(examId, student?.id, student?.class)
        } catch (e) {
          if (!alive) return
          if (/already submitted/i.test(e?.message || '')) {
            navigate(`/result/${examId}`, { replace: true })
            return
          }
          if (e?.code === 'CLASS_MISMATCH' || /eligible for this class|not eligible/i.test(e?.message || '')) {
            navigate('/my-exams', { replace: true, state: { notice: INELIGIBLE_NOTICE } })
            return
          }
          throw e
        }
        const ex = gate?.exam
        if (!ex) { alive && setErr('Exam not found'); return }
        if (ex.status && ex.status !== 'published') { alive && setErr('This exam is not published yet. Contact admin.'); alive && setLoading(false); return }
        const nowT = Date.now()
        if (ex.start_at && nowT < new Date(ex.start_at).getTime()) { alive && setErr('This exam has not started yet.'); alive && setLoading(false); return }
        if (ex.end_at && nowT > new Date(ex.end_at).getTime()) { alive && setErr('This exam window has closed.'); alive && setLoading(false); return }
        let att = student ? await getAttempt(student.id, ex.id) : null
        if (att?.submitted_at) {
          navigate(`/result/${ex.id}`, { replace: true })
          return
        }
        // Ensure a started_at exists so refresh resumes correct remaining time
        if (student && !att?.started_at) {
          try { att = await saveAttempt({ student_id: student.id, exam_id: ex.id, answers: att?.answers || {} }) } catch { /* ignore start-race */ }
        }
        const startedAtSrv = att?.started_at ? new Date(att.started_at).getTime() : nowT
        // Reuse the gated paper's questions — never refetch outside the gate.
        let qs = [...(gate.questions || [])]
        qs = [...qs].sort((a, b) => (a.q_no || 0) - (b.q_no || 0))
        const limit = Number(ex.total_questions) || qs.length
        qs = qs.slice(0, limit)
        // Shuffle display options per student (stable for this session)
        const withDisplay = qs.map((q) => ({
          ...q,
          display: shuffleArr([
            { k: 'A', t: q.option_a },
            { k: 'B', t: q.option_b },
            { k: 'C', t: q.option_c },
            { k: 'D', t: q.option_d },
          ]),
        }))
        if (!alive) return
        setExam(ex)
        setQuestions(withDisplay)
        const durationSec = Number(ex.duration_minutes || 60) * 60
        const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAtSrv) / 1000))
        setTimeLeft(Math.max(0, durationSec - elapsedSec))
        // Restore saved answers
        try {
          const raw = storageKey ? localStorage.getItem(storageKey) : null
          if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed && typeof parsed === 'object') {
              setAnswers(parsed.answers || {})
              setMarked(parsed.marked || {})
              if (typeof parsed.current === 'number') setCurrent(parsed.current)
            }
          }
        } catch { /* ignore */ }
      } catch (e) {
        alive && setErr(e.message || 'Failed to load paper')
      } finally {
        alive && setLoading(false)
      }
    }
    load()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId])

  // Persist answers
  useEffect(() => {
    if (!storageKey || loading) return
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ answers, marked, current, ...(startedAt ? { startedAt } : {}) }),
      )
    } catch { /* ignore */ }
  }, [answers, marked, current, startedAt, storageKey, loading])

  const doSubmit = useCallback(async () => {
    if (submittedRef.current || !exam || !student) return
    submittedRef.current = true
    setSubmitting(true)
    try {
      // LIVE: server-side scoring — send ONLY answers, use returned score.
      if (!isMockMode) {
        await submitExam(exam.id, student.id, answers)
        try { storageKey && localStorage.removeItem(storageKey) } catch { /* ignore */ }
        navigate(`/result/${exam.id}`, { replace: true })
        return
      }
      // MOCK: local scoring, unchanged.
      let score = 0
      for (const q of questions) {
        if (answers[String(q.q_no)] === q.correct_option) score += Number(q.marks ?? 1)
      }
      const total = questions.reduce((s, q) => s + Number(q.marks ?? 1), 0)
      await saveAttempt({ student_id: student.id, exam_id: exam.id, answers, score, total })
      try { storageKey && localStorage.removeItem(storageKey) } catch { /* ignore */ }
      navigate(`/result/${exam.id}`, { replace: true })
    } catch (e) {
      submittedRef.current = false
      const base = e.message || 'Submit failed.'
      setErr(`${base} Please retry — your answers are auto-saved locally.`)
      setEndStep(0)
    } finally {
      setSubmitting(false)
    }
  }, [exam, student, questions, answers, navigate, storageKey])

  // Timer
  useEffect(() => {
    if (loading || !exam) return
    if (timeLeft <= 0) { doSubmit(); return }
    const t = setInterval(() => setTimeLeft((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [loading, exam, timeLeft, doSubmit])

  // Online / offline tracking — answers stay in localStorage while offline
  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Timer alerts at 10 / 5 / 1 min remaining — visual banner only, no sound.
  // Uses a ref to avoid repeat firing; crossing detection (prev > t >= cur)
  // handles throttled ticks and skips past thresholds on late reloads.
  useEffect(() => {
    if (loading || !exam) return
    const thresholds = [
      { t: 600, msg: '10 minutes remaining — please review your answers.' },
      { t: 300, msg: '5 minutes remaining — the paper auto-submits at 00:00.' },
      { t: 60, msg: '1 minute remaining — finish up, auto-submit is near.' },
    ]
    const prev = prevTimeRef.current
    for (const { t, msg } of thresholds) {
      if (firedAlertsRef.current.has(t)) continue
      // Late load below a threshold: mark larger thresholds silently fired.
      if (prev === null) {
        if (timeLeft < t) {
          firedAlertsRef.current.add(t)
          continue
        }
        if (timeLeft === t) {
          firedAlertsRef.current.add(t)
          setLastAlert({ t, msg })
          break
        }
        continue
      }
      if (prev > t && timeLeft <= t && timeLeft > 0) {
        firedAlertsRef.current.add(t)
        setLastAlert({ t, msg })
        break
      }
    }
    prevTimeRef.current = timeLeft
  }, [timeLeft, loading, exam])

  // beforeunload guard
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const choose = (qNo, letter) => setAnswers((p) => ({ ...p, [String(qNo)]: letter }))
  const toggleMark = (qNo) => setMarked((p) => ({ ...p, [String(qNo)]: !p[String(qNo)] }))
  const clearCurrent = useCallback(() => {
    const cur = questions[current]
    if (!cur) return
    setAnswers((p) => {
      if (!(String(cur.q_no) in p)) return p
      const next = { ...p }
      delete next[String(cur.q_no)]
      return next
    })
  }, [questions, current])

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading paper…</div>
  if (err && !exam) return <div className="mx-auto max-w-lg p-4 sm:p-8"><p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p></div>
  if (!questions.length) return <div className="mx-auto max-w-lg p-4 text-sm text-slate-500 sm:p-8">No questions in this paper yet.</div>

  const q = questions[current]
  const answeredCount = questions.filter((x) => answers[String(x.q_no)]).length
  const danger = timeLeft < 300

  return (
    <div
      className="flex min-h-screen flex-col bg-[#F6F8FC] pb-24 lg:pb-0"
      onCopy={(e) => e.preventDefault()}
    >
      {/* Top bar — wraps on mobile */}
      <header className="glass-ink sticky top-0 z-40 text-white">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-bold">{exam.code} • {exam.title}</p>
              <p className="mt-0.5 text-[12px] font-medium text-white/70">Q {current + 1} of {questions.length} • Answered {answeredCount} • Saved ✓</p>
            </div>
            <div className={`shrink-0 rounded-xl px-3 py-2 font-mono text-lg font-bold tabular-nums ${danger ? 'bg-red-600' : 'bg-white/10'}`} role="timer" aria-label={`Time remaining ${formatTime(timeLeft)}`}>
              {formatTime(timeLeft)}
            </div>
          </div>
          <div className="mt-2.5 flex gap-2">
            <button onClick={() => setEndStep(1)} className="min-h-[44px] flex-1 rounded-xl bg-amber-400 px-4 py-2.5 font-display text-sm font-bold text-[#071E45] hover:brightness-95 sm:flex-none sm:px-6">
              End Test
            </button>
            <p className="hidden items-center text-[12px] text-white/60 sm:flex">Double confirmation protects against accidental taps.</p>
          </div>
        </div>
        <div className="h-1 bg-white/10" aria-hidden="true">
          <div className="h-full bg-amber-400 transition-[width] duration-300" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
        </div>
      </header>

      {/* Offline + timer-alert banners */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-3" aria-live="polite">
        {!isOnline && (
          <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            You are offline — answers are auto-saved locally. Submit will retry.
          </p>
        )}
        {lastAlert && (
          <div role="alert" className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-[#071E45]">
            <span>⏰ {lastAlert.msg}</span>
            <button
              onClick={() => setLastAlert(null)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-[#071E45] hover:bg-blue-100"
              aria-label="Dismiss time alert"
            >
              Dismiss ✕
            </button>
          </div>
        )}
      </div>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 lg:grid-cols-[1fr_264px]">
        {/* Question card */}
        <section className="card" aria-live="polite" aria-label={`Question ${q.q_no}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-lg bg-[#071E45] px-2.5 py-1.5 font-mono text-xs font-bold text-white">Q{q.q_no}</span>
            <span className="stamp border-slate-300 text-slate-500">{q.marks} mark{q.marks == 1 ? '' : 's'}</span>
          </div>
          <h2 className="mt-3 text-[17px] font-medium leading-relaxed text-slate-900 sm:text-lg">{q.question_text}</h2>
          <div className="mt-4 space-y-2.5" role="radiogroup" aria-label={`Options for question ${q.q_no}`}>
            {q.display.map((opt) => {
              const selected = answers[String(q.q_no)] === opt.k
              return (
                <label
                  key={opt.k}
                  className={`omr-option flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border-2 p-3.5 text-[15px] transition-colors sm:text-base ${
                    selected ? 'border-[#071E45] bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-400'
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${q.q_no}`}
                    checked={selected}
                    onChange={() => choose(q.q_no, opt.k)}
                    className="h-5 w-5 shrink-0 accent-[#071E45]"
                    aria-label={`Option ${opt.k}: ${opt.t}`}
                  />
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold ${selected ? 'bg-[#071E45] text-white' : 'bg-slate-100 text-slate-600'}`} aria-hidden="true">
                    {opt.k}
                  </span>
                  <span className="text-slate-800">{opt.t}</span>
                </label>
              )
            })}
          </div>
          {err && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          {/* Desktop nav */}
          <div className="mt-5 hidden flex-wrap gap-2 lg:flex">
            <button disabled={current === 0} onClick={() => setCurrent((c) => Math.max(0, c - 1))} className="btn-ghost">
              ← Prev
            </button>
            <button disabled={current === questions.length - 1} onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))} className="btn-ghost">
              Save &amp; Next →
            </button>
            <button onClick={() => toggleMark(q.q_no)} className={`min-h-[44px] rounded-xl px-5 py-2.5 font-display text-sm font-bold ${marked[String(q.q_no)] ? 'bg-violet-600 text-white' : 'border border-violet-300 text-violet-700 hover:bg-violet-50'}`}>
              {marked[String(q.q_no)] ? '★ Marked' : '☆ Mark for review'}
            </button>
            <button
              onClick={clearCurrent}
              disabled={!answers[String(q.q_no)]}
              className="min-h-[44px] rounded-xl border border-slate-300 px-5 py-2.5 font-display text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Clear response
            </button>
          </div>
        </section>

        {/* Palette */}
        <aside className="card h-fit lg:sticky lg:top-24" aria-label="Question palette">
          <div className="flex items-center justify-between">
            <p className="font-display text-sm font-bold text-slate-800">Palette</p>
            <button onClick={() => toggleMark(q.q_no)} className={`rounded-lg px-3 py-2 text-xs font-bold lg:hidden ${marked[String(q.q_no)] ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700'}`}>
              {marked[String(q.q_no)] ? '★ Marked' : '☆ Mark'}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-4">
            {questions.map((x, i) => {
              const ans = answers[String(x.q_no)]
              const mk = marked[String(x.q_no)]
              const isCur = i === current
              let cls = 'bg-white text-slate-600 ring-2 ring-inset ring-slate-200'
              if (ans) cls = 'bg-emerald-500 text-white'
              if (mk) cls = 'bg-violet-500 text-white'
              return (
                <button
                  key={x.id}
                  onClick={() => setCurrent(i)}
                  aria-label={`Go to question ${x.q_no}${ans ? ', answered' : ', unanswered'}${mk ? ', marked for review' : ''}${isCur ? ', current' : ''}`}
                  aria-current={isCur ? 'true' : undefined}
                  className={`flex h-11 items-center justify-center rounded-xl text-sm font-bold transition-colors ${cls} ${isCur ? 'outline outline-[3px] outline-offset-2 outline-[#071E45]' : ''}`}
                >
                  {x.q_no}
                </button>
              )
            })}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center lg:grid-cols-1 lg:text-left">
            <p className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] font-bold text-emerald-800">● Answered ({answeredCount})</p>
            <p className="rounded-lg bg-violet-50 px-2 py-1.5 text-[11px] font-bold text-violet-800">● Marked</p>
            <p className="rounded-lg bg-slate-100 px-2 py-1.5 text-[11px] font-bold text-slate-600">● Left ({questions.length - answeredCount})</p>
          </div>
        </aside>
      </div>

      {/* Sticky thumb bar — mobile only */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/60 bg-white/75 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-xl lg:hidden" aria-label="Exam navigation">
        <div className="mx-auto max-w-6xl">
          <button
            onClick={clearCurrent}
            disabled={!answers[String(q.q_no)]}
            className="mb-2 min-h-[40px] w-full rounded-xl border border-slate-300 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Clear response{q.q_no ? ` (Q${q.q_no})` : ''}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button disabled={current === 0} onClick={() => setCurrent((c) => Math.max(0, c - 1))} className="min-h-[48px] rounded-xl border border-slate-300 text-[15px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              ← Prev
            </button>
            <button disabled={current === questions.length - 1} onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))} className="min-h-[48px] rounded-xl bg-[#071E45] text-[15px] font-bold text-white hover:bg-[#1450A0] disabled:opacity-40">
              Save &amp; Next →
            </button>
          </div>
        </div>
      </nav>

      {/* Double-confirm modal */}
      {endStep > 0 && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Confirm submission">
          <div className="modal-sheet w-full max-w-sm rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl">
            {endStep === 1 ? (
              <>
                <h3 className="font-display text-lg font-bold text-slate-900">End test?</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  You have answered <strong>{answeredCount}</strong> of <strong>{questions.length}</strong> questions.
                  Unanswered questions score zero.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button onClick={() => setEndStep(0)} className="btn-ghost">
                    Keep writing
                  </button>
                  <button onClick={() => setEndStep(2)} className="btn-primary">
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-display text-lg font-bold text-red-700">Final confirmation</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  This will <strong>submit your paper permanently</strong>. You cannot re-enter after this.
                  Are you absolutely sure?
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button onClick={() => setEndStep(0)} disabled={submitting} className="btn-ghost">
                    Cancel
                  </button>
                  <button onClick={doSubmit} disabled={submitting} className="btn-danger">
                    {submitting ? 'Submitting…' : 'Submit paper'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
