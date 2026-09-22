import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { isMockMode } from '../../lib/supabaseClient.js'
import { getMyExams, getResultReview } from '../../services/dataService.js'

const INELIGIBLE_NOTICE = 'You are not eligible for this exam (class mismatch). Showing only exams for your class.'

export default function Result() {
  const { examId } = useParams()
  const { student } = useAuth()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  // LIVE state: server-scored review (no correct answers ever touch the client store).
  const [reviewData, setReviewData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        // LIVE: score + per-question review come from the get_my_result RPC;
        // exam header comes from the student's own exam list.
        if (!isMockMode) {
          let found = null
          try {
            const mine = await getMyExams(student?.id)
            found = (mine || []).find((e) => e.id === examId || e.code === examId) || null
          } catch {
            /* exam header is best-effort */
          }
          let rev = null
          try {
            rev = await getResultReview(examId, student?.id)
          } catch (e) {
            if (e?.code === 'CLASS_MISMATCH' || /eligible for this class|not eligible/i.test(e?.message || '')) {
              navigate('/my-exams', { replace: true, state: { notice: INELIGIBLE_NOTICE } })
              return
            }
            // No submission yet surfaces here on most backends.
            if (/no submission|not submitted|not found|no attempt/i.test(e?.message || '')) {
              rev = null
            } else throw e
          }
          if (!alive) return
          setExam(found || (rev ? { id: examId, code: examId, title: examId } : null))
          setReviewData(rev?.submitted_at ? rev : null)
          return
        }
        // MOCK: gated review path — never touches correct_option directly.
        // getResultReview enforces the class gate (dataService mock path).
        let rev = null
        try {
          rev = await getResultReview(examId, student?.id, student?.class)
        } catch (e) {
          if (e?.code === 'CLASS_MISMATCH' || /eligible for this class|not eligible/i.test(e?.message || '')) {
            navigate('/my-exams', { replace: true, state: { notice: INELIGIBLE_NOTICE } })
            return
          }
          if (/no submission|not submitted|not found|no attempt/i.test(e?.message || '')) {
            rev = null
          } else throw e
        }
        let found = null
        try {
          const mine = await getMyExams(student?.id)
          found = (mine || []).find((e) => e.id === examId || e.code === examId) || null
        } catch {
          /* exam header is best-effort */
        }
        if (!alive) return
        if (!found && !rev) { alive && setErr('Exam not found'); return }
        setExam(found || (rev ? { id: examId, code: examId, title: examId } : null))
        setReviewData(rev?.submitted_at ? rev : null)
        return
      } catch (e) {
        alive && setErr(e.message || 'Failed to load result')
      } finally {
        alive && setLoading(false)
      }
    }
    load()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, student])

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-500">Loading result…</div>
  if (err) return <div className="mx-auto max-w-3xl px-4 py-10"><p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p></div>

  // Gated review render (live + mock): score + review come from getResultReview.
  // Mock also renders from the gated review — never from ungated correct_option.
  if (!reviewData) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="card text-center">
          <h1 className="font-display text-xl font-bold text-slate-900">No submission yet</h1>
          <p className="mt-2 text-sm text-slate-500">You have not submitted this exam. Start from My Exams.</p>
          <Link to="/my-exams" className="btn-primary mt-4">Go to My Exams</Link>
        </div>
      </div>
    )
  }
  const score = Number(reviewData.score ?? 0)
  const total = Number(reviewData.total ?? 0)
  const pct = total > 0 ? (score / total) * 100 : 0
  const pass = pct >= 40
  const r = 54
  const circ = 2 * Math.PI * r
  const review = Array.isArray(reviewData.review) ? reviewData.review : []
  const liveTotalQ = review.length
  const liveAttempted = review.filter((row) => row.chosen && row.chosen !== '—').length
  const liveCorrect = review.filter((row) => Boolean(row.ok)).length
  const liveWrong = Math.max(0, liveAttempted - liveCorrect)
  const liveSkipped = Math.max(0, liveTotalQ - liveAttempted)
  const liveAccuracy = liveAttempted > 0 ? (liveCorrect / liveAttempted) * 100 : 0
  return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="font-display text-xs font-bold uppercase tracking-widest text-[#0B2F6B]">{exam?.code || examId} • Result</p>
        <h1 className="font-display text-2xl font-extrabold text-slate-900">{exam?.title || exam?.code || 'Result'}</h1>

        <div className="card mt-4 flex flex-col items-center gap-5 sm:flex-row">
          <div className="relative h-36 w-36 shrink-0" role="img" aria-label={`Score ${score} of ${total}, ${Math.round(pct)} percent`}>
            <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
              <circle cx="64" cy="64" r={r} fill="none" stroke="#E2E8F0" strokeWidth="12" />
              <circle
                cx="64" cy="64" r={r} fill="none"
                stroke={pass ? '#16A34A' : '#DC2626'} strokeWidth="12" strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={circ - (Math.min(100, pct) / 100) * circ}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-2xl font-extrabold text-slate-900">{score}/{total}</span>
              <span className="text-xs font-bold text-slate-500">{Math.round(pct)}%</span>
            </div>
          </div>
          <div className="text-center sm:text-left">
            <span className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${pass ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
              {pass ? 'PASS — Congratulations!' : 'FAIL — Keep practicing'}
            </span>
            <p className="mt-2 text-sm text-slate-600">
              {student?.name} (<span className="font-mono">{student?.user_id}</span>)
              {' • '}Submitted {reviewData.submitted_at ? new Date(reviewData.submitted_at).toLocaleString() : '—'}
            </p>
            <p className="mt-1 text-sm text-slate-500">Pass mark is 40%. You have already submitted — re-attempt is not allowed.</p>
            <p className="mt-1 text-xs text-slate-400">Rank available in admin leaderboard.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <button onClick={() => window.print()} className="btn-primary">Print</button>
              <Link to="/my-exams" className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Back to My Exams
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="card p-3 text-center">
            <p className="font-display text-xl font-extrabold text-emerald-700">{liveCorrect}</p>
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Correct</p>
          </div>
          <div className="card p-3 text-center">
            <p className="font-display text-xl font-extrabold text-red-600">{liveWrong}</p>
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Wrong</p>
          </div>
          <div className="card p-3 text-center">
            <p className="font-display text-xl font-extrabold text-slate-500">{liveSkipped}</p>
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Skipped</p>
          </div>
          <div className="card p-3 text-center">
            <p className="font-display text-xl font-extrabold text-[#071E45]">{Math.round(liveAccuracy)}%</p>
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Accuracy</p>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-slate-400 sm:text-left">
          Attempted {liveAttempted} of {liveTotalQ} • Accuracy = correct / attempted × 100
        </p>

        <div className="card mt-4 p-0">
          <div className="table-scroll overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Q</th>
                <th className="px-4 py-2.5">Chosen</th>
                <th className="px-4 py-2.5">Correct</th>
                <th className="px-4 py-2.5 text-right">Marks</th>
              </tr>
            </thead>
            <tbody>
              {review.map((row) => {
                const chosen = row.chosen ?? '—'
                const ok = Boolean(row.ok)
                return (
                  <tr key={row.q_no} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono font-bold">{row.q_no}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-2 py-0.5 font-mono font-bold ${chosen === '—' ? 'bg-slate-100 text-slate-400' : ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                        {chosen}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono font-bold text-slate-700">{row.correct}</td>
                    <td className="px-4 py-2 text-right font-bold">{ok ? Number(row.marks ?? 1) : 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    )
}
