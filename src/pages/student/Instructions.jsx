import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { isMockMode } from '../../lib/supabaseClient.js'
import {
  getAttempt,
  getPlayerPaper,
  saveAttempt,
} from '../../services/dataService.js'

const INELIGIBLE_NOTICE = 'You are not eligible for this exam (class mismatch). Showing only exams for your class.'

const RULES = [
  '1. Each question carries the marks shown against it. There is no negative marking unless specifically mentioned on the paper.',
  '2. Do not refresh, close or navigate away from the exam window. The timer keeps running and answers auto-save every few seconds.',
  '3. The countdown timer auto-submits your paper at 00:00. Unanswered questions are marked as zero — there is no extra time.',
  '4. You get only ONE attempt per exam. Once submitted, re-entry is blocked and the result page becomes final.',
  '5. Any malpractice — multiple logins, screen-sharing, copying or impersonation — leads to immediate disqualification without refund.',
  '6. Ensure a stable internet connection and a quiet room. In case of a technical issue, contact your coordinator or info@imofedu.com immediately.',
]

export default function Instructions() {
  const { examId } = useParams()
  const { student } = useAuth()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  const [qCount, setQCount] = useState(0)
  const [marksSum, setMarksSum] = useState(null)
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        // LIVE: paper comes from the RPC (no answers leak). get_exam_paper
        // doubles as the submitted guard ('already submitted' → result) and
        // the class gate ('not eligible' → back to list, no leak).
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
          if (!alive) return
          if (!paper?.exam) { setErr('Exam not found'); return }
          setExam(paper.exam)
          const qs = paper.questions || []
          const sorted = [...qs].sort((a, b) => (a.q_no || 0) - (b.q_no || 0))
          const limit = paper.exam.total_questions || qs.length
          setQCount(limit)
          setMarksSum(sorted.slice(0, limit).reduce((s, q) => s + Number(q.marks ?? 1), 0))
          return
        }
        // MOCK: same gate via getPlayerPaper mock path — never leak
        // questions/timer for an ineligible class.
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
        if (!alive) return
        if (!paper?.exam) { setErr('Exam not found'); return }
        setExam(paper.exam)
        const qs = paper.questions || []
        const sorted = [...qs].sort((a, b) => (a.q_no || 0) - (b.q_no || 0))
        const limit = paper.exam.total_questions || qs.length
        setQCount(limit)
        setMarksSum(sorted.slice(0, limit).reduce((s, q) => s + Number(q.marks ?? 1), 0))
      } catch (e) {
        if (alive) setErr(e.message || 'Failed to load exam')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId])

  const start = async () => {
    if (!agreed || !student || !exam) return
    setStarting(true)
    setErr('')
    try {
      // LIVE: the attempt row is created server-side on submit (which also
      // dedupes). The Player re-validates on mount and redirects re-entry
      // to the result page, so just navigate.
      if (!isMockMode) {
        navigate(`/exam/${exam.id}`)
        return
      }
      // MOCK: local demo path, unchanged.
      const existing = await getAttempt(student.id, exam.id)
      if (existing?.submitted_at) {
        navigate(`/result/${exam.id}`, { replace: true })
        return
      }
      if (!existing) {
        await saveAttempt({ student_id: student.id, exam_id: exam.id, answers: {}, started_at: new Date().toISOString() })
      }
      navigate(`/exam/${exam.id}`)
    } catch (e) {
      setErr(e.message || 'Could not start test')
    } finally {
      setStarting(false)
    }
  }

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-500">Loading instructions…</div>
  if (err && !exam) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
        <Link to="/my-exams" className="btn-primary mt-4">Back to My Exams</Link>
      </div>
    )
  }

  const totalMarks = marksSum ?? (qCount || 0) * Number(exam?.marks_per_q ?? 1)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <p className="font-display text-xs font-bold uppercase tracking-widest text-[#0B2F6B]">{exam.code}</p>
      <h1 className="font-display text-2xl font-extrabold text-slate-900">{exam.title || exam.code}</h1>

      <div className="ticket mt-4 grid grid-cols-3 gap-2 p-4 text-center sm:gap-3">
        <div><p className="font-display text-lg font-bold text-[#071E45] sm:text-2xl">{exam.duration_minutes || 60} min</p><p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-slate-400 sm:text-xs">Duration</p></div>
        <div className="border-x border-dashed border-slate-200"><p className="font-display text-lg font-bold text-[#071E45] sm:text-2xl">{qCount}</p><p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-slate-400 sm:text-xs">Questions</p></div>
        <div><p className="font-display text-lg font-bold text-[#071E45] sm:text-2xl">{totalMarks}</p><p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-slate-400 sm:text-xs">Total marks</p></div>
      </div>

      <div className="card mt-4">
        <h2 className="font-display text-base font-bold text-slate-900">General Instructions — read carefully</h2>
        <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-700">
          {RULES.map((r) => <li key={r.slice(0, 8)} className="rounded-lg bg-slate-50 p-3">{r}</li>)}
        </ol>
        {exam.instructions && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-bold">Paper-specific note</p>
            <p className="mt-1 whitespace-pre-line">{exam.instructions}</p>
          </div>
        )}
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 h-4 w-4 accent-[#0B2F6B]"
          />
          <span>I have read and understood all instructions above and agree to follow the IMOF exam rules.</span>
        </label>
        {err && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={start} disabled={!agreed || starting} className="btn-accent">
            {starting ? 'Starting…' : 'Start Test'}
          </button>
          <Link to="/my-exams" className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Back
          </Link>
        </div>
      </div>
    </div>
  )
}
