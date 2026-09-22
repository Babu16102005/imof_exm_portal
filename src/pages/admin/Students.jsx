import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { deleteStudent, listExams, listStudents, updateStudent, upsertStudents } from '../../services/dataService.js'

const norm = (v) => String(v ?? '').trim()
const nkey = (k) => String(k ?? '').trim().toLowerCase().replace(/[\s_]+/g, '')

function parseStudentRows(raw) {
  const rows = []
  const errors = []
  raw.forEach((row, i) => {
    const line = i + 2
    const r = {}
    for (const [k, v] of Object.entries(row)) r[nkey(k)] = v
    const user_id = norm(r.userid ?? r.username ?? r.rollno)
    const password = norm(r.password ?? r.pass) || 'mcq@imof'
    const name = norm(r.name ?? r.studentname)
    const cls = norm(r.class ?? r.grade ?? r.std)
    const school = norm(r.school ?? r.schoolname)
    const exam_code = norm(r.examcode ?? r.exam_code ?? r.code)
    const is_active = norm(r.isactive ?? r.active ?? 'true').toLowerCase() !== 'false'
    const rowErrs = []
    if (!user_id) rowErrs.push('user_id required')
    else if (user_id.length < 3) rowErrs.push('user_id min 3 chars')
    if (!name) rowErrs.push('name required')
    rows.push({ user_id, password, name, class: cls, school, exam_code, is_active, _line: line, _errors: rowErrs })
    rowErrs.forEach((m) => errors.push(`Row ${line}: ${m}`))
  })
  return { rows, errors }
}

export default function Students() {
  const [params, setParams] = useSearchParams()
  const [exams, setExams] = useState([])
  const [filter, setFilter] = useState(params.get('exam') || 'all')
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState([])
  const [previewErrs, setPreviewErrs] = useState([])
  const [fileName, setFileName] = useState('')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ user_id: '', password: 'mcq@imof', name: '', class: '', school: '', exam_id: '', is_active: true })
  const [addErr, setAddErr] = useState('')
  const [adding, setAdding] = useState(false)

  const examById = useMemo(() => Object.fromEntries(exams.map((e) => [e.id, e])), [exams])
  const examByCode = useMemo(() => Object.fromEntries(exams.map((e) => [e.code, e])), [exams])

  const refresh = async () => {
    setLoading(true)
    try {
      setStudents(await listStudents())
      setErr('')
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    listExams().then(setExams).catch((e) => setErr(e.message))
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setParams((p) => {
      const n = new URLSearchParams(p)
      if (filter && filter !== 'all') n.set('exam', filter)
      else n.delete('exam')
      return n
    }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const visible = useMemo(() => {
    let rows = filter === 'all' ? students : students.filter((s) => s.exam_id === filter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter((s) =>
        [s.user_id, s.name, s.school, s.class].some((v) => String(v || '').toLowerCase().includes(q)),
      )
    }
    return rows
  }, [students, filter, search])

  const downloadTemplateXlsx = () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['user_id', 'password', 'name', 'class', 'school', 'exam_code', 'is_active'],
      ['IMOF1001', 'mcq@imof', 'Aarav Sharma', '5', 'SVMO Demo School', 'IMOF-SVMO-2026', 'true'],
      ['IMOF1002', 'mcq@imof', 'Diya Patel', '5', 'SVMO Demo School', 'IMOF-SVMO-2026', 'true'],
    ])
    ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 24 }, { wch: 18 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Students')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Column', 'Required', 'Rule'],
      ['user_id', 'YES', 'Unique login ID, min 3 chars, no spaces'],
      ['password', 'YES', 'Login password — auto-encrypted on upload (blank = mcq@imof)'],
      ['name', 'YES', 'Student full name'],
      ['class', 'No', 'Class as text'],
      ['school', 'No', 'School name'],
      ['exam_code', 'No', 'Must match Exam Code, else unassigned'],
      ['is_active', 'No', 'true / false (default true)'],
    ]), 'Instructions - READ FIRST')
    XLSX.writeFile(wb, 'students_template.xlsx')
  }

  const downloadTemplate = () => {
    const csv = 'user_id,password,name,class,school,exam_code,is_active\nIMOF1001,mcq@imof,Aarav Sharma,5,SVMO Demo School,IMOF-SVMO-2026,true\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'students_template.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const onFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
        let { rows, errors } = parseStudentRows(json)
        // Duplicate check: within file + against existing user_ids
        const seen = new Set()
        const existing = new Set(students.map((s) => s.user_id))
        rows = rows.map((r) => {
          const dup = []
          if (seen.has(r.user_id)) dup.push('duplicate in file')
          if (existing.has(r.user_id)) dup.push('user_id exists — will update')
          seen.add(r.user_id)
          if (r.exam_code && !examByCode[r.exam_code]) dup.push(`unknown exam_code ${r.exam_code}`)
          return { ...r, _errors: [...r._errors, ...dup.filter((d) => d.startsWith('duplicate') || d.startsWith('unknown'))], _warn: dup.filter((d) => d.includes('will update')) }
        })
        setPreview(rows)
        setPreviewErrs(errors)
      } catch (ex) {
        setPreviewErrs([ex.message || 'Could not parse file'])
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const validPreview = useMemo(() => preview.filter((r) => r._errors.length === 0), [preview])

  const saveBulk = async () => {
    if (!validPreview.length) return
    setSaving(true)
    setProgress('')
    try {
      const rows = validPreview.map((r) => ({
        user_id: r.user_id, password: r.password, name: r.name,
        class: r.class, school: r.school,
        exam_id: r.exam_code ? examByCode[r.exam_code]?.id || null : (filter !== 'all' ? filter : null),
        is_active: r.is_active,
      }))
      await upsertStudents(rows, (done, total) => setProgress(`Uploading ${done}/${total}…`))
      setPreview([]); setPreviewErrs([]); setFileName(''); setProgress('')
      await refresh()
    } catch (e) { setErr(e.message); setProgress('') }
    finally { setSaving(false) }
  }

  const resetPw = async (s) => {
    if (!window.confirm(`Reset password for ${s.user_id} to "mcq@imof"?`)) return
    try { await updateStudent(s.id, { password: 'mcq@imof' }); await refresh() }
    catch (e) { setErr(e.message) }
  }

  const toggleActive = async (s) => {
    try { await updateStudent(s.id, { is_active: !s.is_active }); await refresh() }
    catch (e) { setErr(e.message) }
  }

  const setAdd = (k, v) => setAddForm((f) => ({ ...f, [k]: v }))

  const addSingle = async (e) => {
    e.preventDefault()
    setAddErr('')
    if (addForm.user_id.trim().length < 3) { setAddErr('user_id min 3 chars'); return }
    if (!addForm.name.trim()) { setAddErr('name required'); return }
    setAdding(true)
    try {
      await upsertStudents([{
        user_id: addForm.user_id.trim(),
        password: addForm.password || 'mcq@imof',
        name: addForm.name.trim(),
        class: addForm.class,
        school: addForm.school,
        exam_id: addForm.exam_id || (filter !== 'all' ? filter : null),
        is_active: addForm.is_active,
      }])
      setAddForm({ user_id: '', password: 'mcq@imof', name: '', class: '', school: '', exam_id: '', is_active: true })
      setShowAdd(false)
      await refresh()
    } catch (ex) { setAddErr(ex.message || 'Add failed') }
    finally { setAdding(false) }
  }

  const remove = async (s) => {
    if (!window.confirm(`Delete student ${s.user_id}? Their attempt will also be removed.`)) return
    try { await deleteStudent(s.id); await refresh() }
    catch (e) { setErr(e.message) }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">Students</h1>
          <p className="text-sm text-slate-500">Bulk import logins, search, reset passwords.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadTemplateXlsx} className="btn-primary !px-4 !py-2">⬇ Template (Excel)</button>
          <button onClick={downloadTemplate} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            ⬇ Template (CSV)
          </button>
        </div>
      </div>
      {err && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <div className="card mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Filter by exam</label>
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All exams ({students.length})</option>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.code}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Search</label>
          <input className="input" placeholder="Name / user ID / school…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label className="label">Upload Excel / CSV</label>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#0B2F6B] file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-[#1450A0]" />
          {fileName && <p className="mt-1 text-xs text-slate-500">{fileName}</p>}
        </div>
      </div>

      <div className="card mt-4">
        <button type="button" onClick={() => setShowAdd((v) => !v)} className="flex w-full items-center justify-between text-left" aria-expanded={showAdd}>
          <span className="font-display text-base font-bold">Add student</span>
          <span className="text-sm font-bold text-[#1450A0]">{showAdd ? 'Hide ▲' : 'Show ▼'}</span>
        </button>
        {showAdd && (
          <form onSubmit={addSingle} className="mt-3 grid gap-3 sm:grid-cols-3">
            <div><label className="label" htmlFor="add-uid">User ID *</label><input id="add-uid" className="input font-mono" value={addForm.user_id} onChange={(e) => setAdd('user_id', e.target.value)} placeholder="IMOF1003" required /></div>
            <div><label className="label" htmlFor="add-pw">Password</label><input id="add-pw" className="input font-mono" value={addForm.password} onChange={(e) => setAdd('password', e.target.value)} placeholder="mcq@imof" /></div>
            <div><label className="label" htmlFor="add-name">Name *</label><input id="add-name" className="input" value={addForm.name} onChange={(e) => setAdd('name', e.target.value)} placeholder="Student name" required /></div>
            <div><label className="label" htmlFor="add-class">Class</label><input id="add-class" className="input" value={addForm.class} onChange={(e) => setAdd('class', e.target.value)} placeholder="e.g. 5" /></div>
            <div><label className="label" htmlFor="add-school">School</label><input id="add-school" className="input" value={addForm.school} onChange={(e) => setAdd('school', e.target.value)} placeholder="School name" /></div>
            <div>
              <label className="label" htmlFor="add-exam">Exam</label>
              <select id="add-exam" className="input" value={addForm.exam_id} onChange={(e) => setAdd('exam_id', e.target.value)}>
                <option value="">{filter !== 'all' ? `Current filter (${examById[filter]?.code || filter})` : 'Unassigned'}</option>
                {exams.map((e) => <option key={e.id} value={e.id}>{e.code}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input id="add-active" type="checkbox" checked={addForm.is_active} onChange={(e) => setAdd('is_active', e.target.checked)} className="h-4 w-4" />
              <label htmlFor="add-active" className="text-sm font-semibold text-slate-700">Active</label>
            </div>
            <div className="sm:col-span-1 sm:text-right">
              <button type="submit" disabled={adding} className="btn-primary !px-4 !py-2">{adding ? 'Adding…' : 'Add student'}</button>
            </div>
            {addErr && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-3">{addErr}</p>}
          </form>
        )}
      </div>

      {preview.length > 0 && (
        <div className="card mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold">Preview — {validPreview.length}/{preview.length} valid</h2>
            <div className="flex gap-2">
              <button onClick={saveBulk} disabled={!validPreview.length || saving} className="btn-primary !px-4 !py-1.5">{saving ? 'Saving…' : `Save ${validPreview.length}`}</button>
              <button onClick={() => setPreview([])} className="text-sm text-slate-500 hover:text-slate-700">Clear</button>
            </div>
          </div>
          {saving && progress && <p role="status" className="mt-2 text-sm font-semibold text-[#0B2F6B]">{progress}</p>}
          {previewErrs.length > 0 && (
            <ul className="mt-2 max-h-24 overflow-y-auto rounded-lg bg-red-50 p-2 text-xs text-red-700">
              {previewErrs.slice(0, 20).map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          )}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead><tr className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
                <th className="px-2 py-1.5">User ID</th><th className="px-2 py-1.5">Name</th><th className="px-2 py-1.5">Class</th><th className="px-2 py-1.5">Exam</th><th className="px-2 py-1.5">Status</th>
              </tr></thead>
              <tbody>
                {preview.slice(0, 40).map((r, i) => (
                  <tr key={i} className={`border-t ${r._errors.length ? 'bg-red-50/50' : ''}`}>
                    <td className="px-2 py-1.5 font-mono font-bold">{r.user_id}</td>
                    <td className="px-2 py-1.5">{r.name}</td>
                    <td className="px-2 py-1.5">{r.class}</td>
                    <td className="px-2 py-1.5 font-mono text-xs">{r.exam_code || '—'}</td>
                    <td className="px-2 py-1.5 text-xs">{r._errors.join('; ') || (r._warn?.join('; ') || '✓')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card mt-4 p-0">
        <p className="px-5 py-3 font-display text-base font-bold">Students — {visible.length}</p>
        {loading ? <p className="px-5 pb-5 text-sm text-slate-500">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">User ID</th><th className="px-4 py-2">Name</th><th className="px-4 py-2">Class / School</th><th className="px-4 py-2">Exam</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Actions</th>
              </tr></thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono text-xs font-bold">{s.user_id}</td>
                    <td className="px-4 py-2 font-semibold">{s.name || '—'}</td>
                    <td className="px-4 py-2 text-slate-500">{s.class || '—'} • {s.school || '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs">{s.exam_id ? examById[s.exam_id]?.code || '—' : '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.is_active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                        {s.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1.5 text-xs font-bold">
                        <button onClick={() => toggleActive(s)} className="rounded bg-slate-100 px-2 py-1 text-slate-700 hover:bg-slate-200">{s.is_active !== false ? 'Deactivate' : 'Activate'}</button>
                        <button onClick={() => resetPw(s)} className="rounded bg-amber-100 px-2 py-1 text-amber-800 hover:bg-amber-200">Reset PW</button>
                        <button onClick={() => remove(s)} className="rounded bg-red-100 px-2 py-1 text-red-700 hover:bg-red-200">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">No students match.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
