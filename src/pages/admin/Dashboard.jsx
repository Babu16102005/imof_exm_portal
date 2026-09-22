import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAttempts, listExams, listQuestions, listStudents } from '../../services/dataService.js'

export default function Dashboard() {
  const [stats, setStats] = useState({ exams: 0, questions: 0, students: 0, schools: 0, attempts: 0 })
  const [recent, setRecent] = useState([])
  const [recentAttempts, setRecentAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const exams = await listExams()
        let qTotal = 0
        for (const e of exams) {
          const qs = await listQuestions(e.id)
          qTotal += qs.length
        }
        const students = await listStudents()
        const attempts = await listAttempts()
        if (!alive) return
        const schools = new Set(students.map((s) => s.school).filter(Boolean)).size
        const sortedAttempts = [...(attempts || [])]
          .sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')))
          .slice(0, 5)
        setStats({ exams: exams.length, questions: qTotal, students: students.length, schools, attempts: attempts.length })
        setRecent(exams.slice(0, 5))
        setRecentAttempts(sortedAttempts)
      } catch (e) {
        alive && setErr(e.message || 'Failed to load dashboard')
      } finally {
        alive && setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  const cards = [
    { label: 'Total Exams', value: stats.exams, to: '/admin/exams', colorClass: 'text-[#0B2F6B]', accent: 'rgba(20,80,160,0.08)' },
    { label: 'Questions', value: stats.questions, to: '/admin/questions', colorClass: 'text-violet-800', accent: 'rgba(124,58,237,0.08)' },
    { label: 'Students', value: stats.students, to: '/admin/students', colorClass: 'text-amber-800', accent: 'rgba(245,158,11,0.08)' },
    { label: 'Schools', value: stats.schools, to: '/admin/students', colorClass: 'text-sky-800', accent: 'rgba(14,165,233,0.08)' },
    { label: 'Attempts', value: stats.attempts, to: '/admin/results', colorClass: 'text-emerald-800', accent: 'rgba(16,185,129,0.08)' },
  ]

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">Overview of exams, papers, students and submissions.</p>
      {err && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          {/* Stat cards — premium glass */}
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {cards.map((c) => (
              <Link
                key={c.label}
                to={c.to}
                className="stat-card p-5"
                style={{ '--accent-bg': c.accent }}
              >
                <p className={`font-display text-3xl font-extrabold ${c.colorClass}`}>{c.value}</p>
                <p className={`mt-1 text-sm font-semibold ${c.colorClass} opacity-80`}>{c.label}</p>
              </Link>
            ))}
          </div>

          {/* Recent exams table */}
          <div className="card mt-5 overflow-x-auto p-0">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="font-display text-base font-bold text-slate-900">Recent exams</h2>
              <Link to="/admin/exams" className="text-sm font-bold text-[#1450A0] hover:underline">Manage →</Link>
            </div>
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">Code</th>
                  <th className="px-5 py-2.5">Title</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100/80">
                    <td className="px-5 py-2.5 font-mono text-xs font-bold">{e.code}</td>
                    <td className="px-5 py-2.5">{e.title || '—'}</td>
                    <td className="px-5 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${e.status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}
                        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.70)' }}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right">{e.duration_minutes ? `${e.duration_minutes}m` : '—'}</td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-6 text-center text-sm text-slate-500">No exams yet. Create one →</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Recent attempts table */}
          <div className="card mt-5 overflow-x-auto p-0">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="font-display text-base font-bold text-slate-900">Recent attempts</h2>
              <Link to="/admin/results" className="text-sm font-bold text-[#1450A0] hover:underline">Results →</Link>
            </div>
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">Student</th>
                  <th className="px-5 py-2.5">Score</th>
                  <th className="px-5 py-2.5 text-right">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {recentAttempts.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100/80">
                    <td className="px-5 py-2.5">
                      <span className="font-mono text-xs font-bold">{a.student?.user_id || a.student_id || '—'}</span>
                      <span className="ml-2 text-slate-500">{a.student?.name || ''}</span>
                    </td>
                    <td className="px-5 py-2.5 font-bold">{a.score ?? '—'}</td>
                    <td className="px-5 py-2.5 text-right text-slate-500">{a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {recentAttempts.length === 0 && (
                  <tr><td colSpan={3} className="px-5 py-6 text-center text-sm text-slate-500">No attempts yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Quick action glass cards */}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { to: '/admin/exams', t: 'Create exam', d: 'New paper, window & marks' },
              { to: '/admin/questions', t: 'Upload questions', d: 'Excel bulk import' },
              { to: '/admin/students', t: 'Upload students', d: 'User IDs & passwords' },
            ].map((q) => (
              <Link key={q.to} to={q.to} className="card transition hover:-translate-y-1 hover:shadow-xl">
                <p className="font-display text-sm font-bold text-[#0B2F6B]">{q.t} →</p>
                <p className="mt-1 text-[13px] text-slate-500">{q.d}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
