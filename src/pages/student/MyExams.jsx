import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { getMyExams } from '../../services/dataService.js'
import { normalizeClassGrade, formatClassLabel } from '../../lib/classGrade.js'

function formatClassSuffix(exam) {
  const label = formatClassLabel(exam)
  if (!label || label === 'All classes') return ' • All classes'
  return ` • ${label}`
}

function windowStatus(exam) {
  const now = new Date()
  if (exam.start_at && new Date(exam.start_at) > now) return { label: 'Upcoming', cls: 'bg-blue-100 text-blue-800' }
  if (exam.end_at && new Date(exam.end_at) < now) return { label: 'Closed', cls: 'bg-slate-200 text-slate-600' }
  if (exam.status === 'published') return { label: 'Available', cls: 'bg-emerald-100 text-emerald-800' }
  return { label: exam.status || 'Draft', cls: 'bg-amber-100 text-amber-800' }
}

export default function MyExams() {
  const { student } = useAuth()
  const location = useLocation()
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const notice = location.state?.notice || ''

  const studentGrade = normalizeClassGrade(student?.class)
  const classMissing = studentGrade == null

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        // Server RPC is source of truth; client passes class as a safety-net
        // hint so mis-scoped rows never render (mock + live share this path).
        // Assigned exams are NOT merged without the same class check — the
        // gate lives in getMyExams, not here.
        const rows = await getMyExams(student?.id, student?.class)
        if (alive) setExams(rows || [])
      } catch (e) {
        if (alive) setErr(e.message || 'Failed to load exams')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [student?.id, student?.class])

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Page header — glass panel */}
      <div
        className="rounded-2xl p-5"
        style={{
          background: 'rgba(255,255,255,0.68)',
          backdropFilter: 'blur(20px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.72)',
          boxShadow: '0 4px 16px rgba(7,30,69,0.08), inset 0 1px 0 rgba(255,255,255,0.90)',
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-widest text-[#0B2F6B]">
              Welcome{student?.name ? `, ${student.name}` : ''}
            </p>
            <h1 className="font-display text-2xl font-extrabold text-slate-900">My Exams</h1>
            {student && (
              <p className="mt-1 text-sm text-slate-500">
                User ID <span className="font-mono font-bold text-slate-700">{student.user_id}</span>
                {classMissing ? (
                  <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                    Class not set – contact admin
                  </span>
                ) : (
                  ` • Class ${studentGrade}`
                )}
                {student.school ? ` • ${student.school}` : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {loading && <p className="mt-6 text-sm text-slate-500">Loading exams…</p>}
      {notice && !loading && (
        <p role="alert" className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>
      )}
      {err && <p role="alert" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      {!loading && !err && exams.length === 0 && (
        <div className="card mt-6 text-center">
          {classMissing ? (
            <>
              <p className="font-display text-lg font-bold text-slate-800">No class assigned</p>
              <p className="mt-1 text-sm text-slate-500">Class not set – contact admin. Once your class is set, eligible exams will appear here.</p>
              <p className="mt-1 text-sm text-slate-500">Contact your school coordinator or IMOF support (info@imofedu.com).</p>
            </>
          ) : (
            <>
              <p className="font-display text-lg font-bold text-slate-800">No exams available for your class (Class {studentGrade})</p>
              <p className="mt-1 text-sm text-slate-500">Contact your school coordinator or IMOF support (info@imofedu.com).</p>
            </>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4">
        {exams.map((exam) => {
          const st = windowStatus(exam)
          const submitted = Boolean(exam.submitted)
          const qCount = exam.question_count ?? exam.total_questions
          const canStart = !submitted && exam.status === 'published' && st.label !== 'Closed' && st.label !== 'Upcoming'
          return (
            <article
              key={exam.id}
              className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
              style={{
                background: 'rgba(255,255,255,0.80)',
                backdropFilter: 'blur(24px) saturate(170%) brightness(1.03)',
                WebkitBackdropFilter: 'blur(24px) saturate(170%) brightness(1.03)',
                border: '1px solid rgba(255,255,255,0.78)',
                borderRadius: '1rem',
                padding: '1.25rem 1.5rem',
                boxShadow: '0 4px 16px rgba(7,30,69,0.09), 0 8px 32px rgba(7,30,69,0.07), inset 0 1px 0 rgba(255,255,255,0.90)',
                transition: 'transform 0.3s cubic-bezier(0.17,0.85,0.438,0.99), box-shadow 0.3s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(7,30,69,0.13), 0 24px 48px rgba(7,30,69,0.10), inset 0 1px 0 rgba(255,255,255,0.90)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='0 4px 16px rgba(7,30,69,0.09), 0 8px 32px rgba(7,30,69,0.07), inset 0 1px 0 rgba(255,255,255,0.90)'; }}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded px-2 py-0.5 font-mono text-[11px] font-bold text-white"
                    style={{
                      background: 'linear-gradient(135deg,#0e3576 0%,#071e45 100%)',
                      boxShadow: '0 2px 6px rgba(7,30,69,0.22), inset 0 1px 0 rgba(255,255,255,0.18)',
                    }}
                  >
                    {exam.code}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${submitted ? 'bg-emerald-100 text-emerald-800' : st.cls}`}
                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72)' }}
                  >
                    {submitted ? 'Submitted' : st.label}
                  </span>
                  <span
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600"
                    title="Eligible classes for this exam"
                  >
                    {formatClassLabel(exam)}
                  </span>
                  {exam.olympiad && <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{exam.olympiad}</span>}
                </div>
                <h2 className="mt-2 font-display text-lg font-bold text-slate-900">{exam.title || exam.code}</h2>
                <p className="mt-1 text-[13px] text-slate-500">
                  {exam.duration_minutes ? `${exam.duration_minutes} mins` : '—'}
                  {' • '}
                  {qCount ? `${qCount} questions` : 'Questions as per paper'}
                  {' • '}
                  {exam.marks_per_q ? `${exam.marks_per_q} mark(s)/q` : ''}
                  {formatClassSuffix(exam)}
                </p>
              </div>
              <div className="shrink-0">
                {submitted ? (
                  <Link to={`/result/${exam.id}`} className="btn-primary">View result →</Link>
                ) : canStart ? (
                  <Link to={`/instructions/${exam.id}`} className="btn-primary">Start →</Link>
                ) : (
                  <span
                    className="inline-flex cursor-not-allowed rounded-lg px-5 py-2.5 text-sm font-semibold text-slate-400"
                    style={{ background: 'rgba(241,245,249,0.80)', border: '1px solid rgba(226,232,240,0.80)' }}
                  >
                    {st.label}
                  </span>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
