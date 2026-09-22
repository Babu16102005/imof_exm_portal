import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { clearQuestions, deleteAttempt, deleteStudentsByExam, listAttempts, listExams, listQuestions, listStudents, updateExam } from '../../services/dataService.js'

export default function Results() {
  const [params, setParams] = useSearchParams()
  const [exams, setExams] = useState([])
  const [examId, setExamId] = useState(params.get('exam') || '')
  const [attempts, setAttempts] = useState([])
  const [students, setStudents] = useState([])
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState('desc')
  const [marksSaved, setMarksSaved] = useState(false)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    listExams().then((all) => {
      setExams(all)
      if (!examId && all.length) setExamId(params.get('exam') || all[0].id)
    }).catch((e) => setErr(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = async (id) => {
    if (!id) return
    setLoading(true)
    try {
      // listAttempts(id) already carries the joined `student` (attempts -> students
      // on student_id). listStudents(id) is assignment-scoped, so it is used only
      // for the wind-up login count — unassigned takers resolve via the join.
      const [atts, stus, qs] = await Promise.all([
        listAttempts(id), listStudents(id), listQuestions(id),
      ])
      setAttempts(atts); setStudents(stus); setQuestions(qs)
      setErr('')
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (examId) {
      setParams((p) => { const n = new URLSearchParams(p); n.set('exam', examId); return n }, { replace: true })
      refresh(examId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId])

  const byStudent = useMemo(() => Object.fromEntries(students.map((s) => [String(s.id), s])), [students])
  const total = useMemo(() => questions.reduce((s, q) => s + Number(q.marks ?? 1), 0), [questions])

  const rows = useMemo(() => {
    // Prefer the joined a.student from listAttempts; fall back to the
    // assignment-scoped map (String-normalized keys) for stale caches.
    let r = attempts.map((a) => ({ ...a, student: a.student || byStudent[String(a.student_id)] || null }))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter((x) =>
        [x.student?.user_id, x.student?.name, x.student?.school, x.student_id].some((v) => String(v || '').toLowerCase().includes(q)),
      )
    }
    r = [...r].sort((a, b) => (sortDir === 'desc' ? Number(b.score ?? -1) - Number(a.score ?? -1) : Number(a.score ?? 9999) - Number(b.score ?? 9999)))
    return r
  }, [attempts, byStudent, search, sortDir])

  const topScore = rows.length ? Math.max(...rows.map((r) => Number(r.score ?? -1))) : null
  const examCode = exams.find((e) => e.id === examId)?.code || examId || 'results'
  const examStatus = exams.find((e) => e.id === examId)?.status

  const markRows = () => rows.map((r, i) => {
    const pct = total > 0 ? Math.round((Number(r.score ?? 0) / total) * 100) : 0
    return {
      Rank: i + 1,
      'User ID': r.student?.user_id || `[deleted:${String(r.student_id).slice(0, 8)}]`,
      Name: r.student?.name || '[deleted]',
      Class: r.student?.class || '',
      School: r.student?.school || '',
      Score: r.score ?? '',
      Total: total,
      'Percent %': pct,
      Status: r.submitted_at ? 'Submitted' : 'In-progress',
      Submitted_At: r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '',
    }
  })

  const exportXlsx = () => {
    if (!rows.length) return
    const ws = XLSX.utils.json_to_sheet(markRows())
    ws['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 22 }, { wch: 8 }, { wch: 24 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 20 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Marks')
    XLSX.writeFile(wb, `marks_${examCode}.xlsx`)
    setMarksSaved(true)
  }

  const exportCsv = () => {
    const head = 'rank,user_id,name,class,school,score,total,percent,status,submitted_at'
    const lines = rows.map((r, i) => {
      const pct = total > 0 ? Math.round((Number(r.score ?? 0) / total) * 100) : 0
      const cells = [i + 1, r.student?.user_id || `[deleted:${String(r.student_id).slice(0, 8)}]`, r.student?.name || '[deleted]', r.student?.class || '', r.student?.school || '', r.score ?? '', total, `${pct}%`, r.submitted_at ? 'Submitted' : 'In-progress', r.submitted_at || '']
      return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
    })
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `marks_${examCode}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    setMarksSaved(true)
  }

  const windUp = async (kind) => {
    if (!examId) return
    if (kind === 'logins') {
      if (!marksSaved) return
      // students.length is the assigned-login count; unassigned takers are
      // still resolved via the attempts join, so export before clearing.
      const n = students.length
      if (!window.confirm(`Delete ALL ${n} login(s) (user IDs + passwords) for ${examCode}?\n\nTheir attempts are removed too. This CANNOT be undone.\n\nOnly proceed if the mark record is downloaded.`)) return
      setBusy('logins')
      try { const removed = await deleteStudentsByExam(examId); await refresh(examId); setErr(''); alert(`Cleared ${removed} login(s).`) }
      catch (e) { setErr(e.message) }
      finally { setBusy('') }
    }
    if (kind === 'questions') {
      if (!window.confirm(`Delete ALL ${questions.length} question(s) for ${examCode}? This CANNOT be undone.`)) return
      setBusy('questions')
      try { await clearQuestions(examId); await refresh(examId); setErr('') }
      catch (e) { setErr(e.message) }
      finally { setBusy('') }
    }
    if (kind === 'close') {
      if (!window.confirm(`Close exam ${examCode}? Students will no longer be able to start it.`)) return
      setBusy('close')
      try {
        await updateExam(examId, { status: 'closed' })
        setExams((all) => all.map((e) => (e.id === examId ? { ...e, status: 'closed' } : e)))
        setErr('')
      } catch (e) { setErr(e.message) }
      finally { setBusy('') }
    }
  }

  const reset = async (a) => {
    if (!window.confirm(`Reset attempt for ${a.student?.user_id || (a.student_id ? `deleted:${String(a.student_id).slice(0, 8)}` : 'student')}? They will be able to re-take the exam.`)) return
    try { await deleteAttempt(a.id); await refresh(examId) }
    catch (e) { setErr(e.message) }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">Results</h1>
          <p className="text-sm text-slate-500">Leaderboard, export &amp; re-allow attempts.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportXlsx} disabled={!rows.length} className="btn-primary !px-4 !py-2 disabled:opacity-50">
            ⬇ Marks Excel
          </button>
          <button onClick={exportCsv} disabled={!rows.length} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            ⬇ CSV
          </button>
        </div>
      </div>
      {err && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <div className="card mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Exam</label>
          <select className="input" value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">— Select exam —</option>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.title}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Search</label>
          <input className="input" placeholder="User ID / name / school…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label className="label">Sort by score</label>
          <button onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))} className="input text-left font-semibold">
            {sortDir === 'desc' ? '↓ Highest first' : '↑ Lowest first'}
          </button>
        </div>
      </div>

      <div className="card mt-4 border-red-200 bg-red-50/40">
        <h2 className="font-display text-base font-bold text-slate-900">Exam wind-up — {examCode}</h2>
        <p className="mt-1 text-[13px] text-slate-600">
          Finish in order: <strong>1.</strong> download marks → <strong>2.</strong> clear logins (user IDs + passwords) → <strong>3.</strong> clear questions → <strong>4.</strong> close exam. Clearing cannot be undone.
        </p>
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <input type="checkbox" checked={marksSaved} onChange={(e) => setMarksSaved(e.target.checked)} className="mt-1 h-4 w-4 accent-[#0B2F6B]" />
          <span>I have downloaded the mark record (Excel/CSV) for this exam.</span>
        </label>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <button onClick={() => windUp('logins')} disabled={!examId || !marksSaved || busy !== ''} className="btn-danger disabled:opacity-40">
            {busy === 'logins' ? 'Clearing…' : `Clear logins (${students.length})`}
          </button>
          <button onClick={() => windUp('questions')} disabled={!examId || busy !== ''} className="btn-ghost !border-red-300 !text-red-700 hover:!bg-red-50 disabled:opacity-40">
            {busy === 'questions' ? 'Clearing…' : `Clear questions (${questions.length})`}
          </button>
          <button onClick={() => windUp('close')} disabled={!examId || examStatus !== 'published' || busy !== ''} className="btn-ghost disabled:opacity-40" title={examStatus !== 'published' ? `Status: ${examStatus || '—'}` : 'Close the exam window'}>
            {busy === 'close' ? 'Closing…' : examStatus === 'published' ? 'Close exam' : `Status: ${examStatus || '—'}`}
          </button>
        </div>
      </div>

      <div className="card mt-4 p-0">
        <p className="px-5 py-3 font-display text-base font-bold">
          Attempts — {rows.length}{total ? <span className="ml-2 text-sm font-medium text-slate-500">Total {total} marks</span> : null}
        </p>
        {loading ? <p className="px-5 pb-5 text-sm text-slate-500">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">#</th><th className="px-4 py-2">User ID / Name</th><th className="px-4 py-2 text-right">Score</th><th className="px-4 py-2">Time</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Action</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const isTop = Number(r.score) === topScore && topScore != null && r.submitted_at
                  return (
                    <tr key={r.id} className={`border-t border-slate-100 ${isTop ? 'bg-amber-50' : ''}`}>
                      <td className="px-4 py-2 font-bold">{isTop ? '🏆' : i + 1}</td>
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs font-bold">{r.student?.user_id || `deleted:${String(r.student_id).slice(0, 8)}`}</span>
                        <span className="ml-2 font-semibold">{r.student?.name || '[deleted]'}</span>
                        {!r.student && (
                          <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                            Deleted/Unknown
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-display font-extrabold">{r.score ?? '—'}{total ? <span className="text-xs font-medium text-slate-400">/{total}</span> : null}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.submitted_at ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {r.submitted_at ? 'Submitted' : 'In-progress'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => reset(r)} className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200">Reset attempt</button>
                      </td>
                    </tr>
                  )
                })}
                {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">No attempts yet for this exam.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
