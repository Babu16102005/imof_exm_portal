import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { buildScopedTemplateRows, parseQuestionRows, SCOPED_TEMPLATE_HEADER, validateFile } from '../../lib/questionImport.js'
import { bulkInsertQuestions, clearQuestions, deleteQuestion, listExams, listQuestions } from '../../services/dataService.js'

export default function Questions() {
  const [params, setParams] = useSearchParams()
  const [exams, setExams] = useState([])
  const [examId, setExamId] = useState(params.get('exam') || '')
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  // Single-question Add form
  const [showAdd, setShowAdd] = useState(false)
  const [single, setSingle] = useState({ q_no: '', question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'A', marks: 1 })
  const [singleErr, setSingleErr] = useState('')
  const [singleSaving, setSingleSaving] = useState(false)
  // Excel/CSV import (scoped to examId, pattern from Exams.jsx uploadStep)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState([])
  const [previewErrs, setPreviewErrs] = useState([])
  const [hadExamCode, setHadExamCode] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')

  useEffect(() => {
    listExams().then((all) => {
      setExams(all)
      if (!examId && all.length) {
        const first = params.get('exam') || all[0].id
        setExamId(first)
      }
    }).catch((e) => setErr(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = async (id) => {
    if (!id) return
    setLoading(true)
    try {
      setQuestions(await listQuestions(id))
      setErr('')
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (examId) {
      setParams((p) => { const n = new URLSearchParams(p); n.set('exam', examId); return n }, { replace: true })
      refresh(examId)
    } else {
      setQuestions([])
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId])

  const maxQ = useMemo(() => questions.reduce((m, q) => Math.max(m, Number(q.q_no) || 0), 0), [questions])
  const nextQ = maxQ + 1

  useEffect(() => {
    setSingle((f) => (f.q_no === '' ? { ...f, q_no: String(nextQ) } : f))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextQ])

  const validPreview = useMemo(() => preview.filter((r) => (r._errors || []).length === 0), [preview])

  const setS = (k, v) => setSingle((f) => ({ ...f, [k]: v }))

  const saveSingle = async (e) => {
    e.preventDefault()
    if (!examId) { setSingleErr('Select an exam first'); return }
    setSingleErr('')
    setSingleSaving(true)
    try {
      const row = {
        q_no: Number(single.q_no) || nextQ,
        question_text: single.question_text,
        option_a: single.option_a,
        option_b: single.option_b,
        option_c: single.option_c,
        option_d: single.option_d,
        correct_option: single.correct_option,
        marks: single.marks === '' || single.marks == null ? 1 : Number(single.marks),
      }
      await bulkInsertQuestions(examId, [row])
      setSingle({ q_no: String((Number(single.q_no) || nextQ) + 1), question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'A', marks: 1 })
      setShowAdd(false)
      await refresh(examId)
    } catch (ex) { setSingleErr(ex.message || 'Add failed') }
    finally { setSingleSaving(false) }
  }

  const downloadTemplateXlsx = () => {
    const rows = buildScopedTemplateRows()
    const aoa = [
      SCOPED_TEMPLATE_HEADER,
      ...rows.map((r) => [r.q_no, r.question_text, r.option_a, r.option_b, r.option_c, r.option_d, r.correct_option, r.marks]),
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 8 }, { wch: 44 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 15 }, { wch: 8 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Questions')
    XLSX.writeFile(wb, 'questions_template.xlsx')
  }

  const downloadTemplateCsv = () => {
    const rows = buildScopedTemplateRows()
    const esc = (v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [
      SCOPED_TEMPLATE_HEADER.join(','),
      ...rows.map((r) => [r.q_no, r.question_text, r.option_a, r.option_b, r.option_c, r.option_d, r.correct_option, r.marks].map(esc).join(',')),
    ]
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'questions_template.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const onFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadErr('')
    try {
      validateFile(file)
    } catch (ex) {
      setUploadErr(ex.message || 'Invalid file')
      e.target.value = ''
      return
    }
    setFileName(file.name)
    setProgress('Reading file…')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
        const { rows, errors, hadExamCode: had } = parseQuestionRows(json)
        setPreview(rows)
        setPreviewErrs(errors)
        setHadExamCode(Boolean(had))
        setProgress('')
        if (!rows.length && errors.length) setUploadErr(errors[0])
      } catch (ex) {
        setPreview([])
        setPreviewErrs([ex.message || 'Could not parse file'])
        setUploadErr(ex.message || 'Could not parse file')
        setProgress('')
      }
    }
    reader.onerror = () => { setUploadErr('Could not read file'); setProgress('') }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const clearUpload = () => {
    setFileName('')
    setPreview([])
    setPreviewErrs([])
    setHadExamCode(false)
    setUploadErr('')
    setProgress('')
  }

  const saveImport = async () => {
    if (!examId || !validPreview.length) return
    setSaving(true)
    setUploadErr('')
    try {
      const rows = validPreview.map(({ _line, _errors, ...rest }) => rest)
      setProgress(`Saving ${rows.length} question(s)…`)
      await bulkInsertQuestions(examId, rows, (done, total) => setProgress(`Uploading ${done}/${total}…`))
      clearUpload()
      await refresh(examId)
    } catch (ex) { setUploadErr(ex.message || 'Import failed'); setProgress('') }
    finally { setSaving(false); setProgress('') }
  }

  const removeOne = async (id) => {
    if (!window.confirm('Delete this question?')) return
    try {
      await deleteQuestion(id)
      await refresh(examId)
    } catch (e) { setErr(e.message) }
  }

  const clearAll = async () => {
    if (!examId) return
    if (!window.confirm('Delete ALL questions for this exam?')) return
    try {
      await clearQuestions(examId)
      await refresh(examId)
    } catch (e) { setErr(e.message) }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">Exam Questions</h1>
          <p className="text-sm text-slate-500">Add single questions or bulk-import Excel/CSV for the selected exam.</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Questions can also be added during Exam creation (Admin &gt; Exams &gt; + New exam).{' '}
        <Link to="/admin/exams" className="font-bold underline hover:text-blue-700">Go to Exams</Link>
      </div>

      {err && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <div className="card mt-4">
        <div>
          <label className="label" htmlFor="q-exam">Exam</label>
          <select id="q-exam" className="input" value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">— Select exam —</option>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.title}</option>)}
          </select>
        </div>
      </div>

      <div className="card mt-4">
        <button type="button" onClick={() => setShowAdd((v) => !v)} className="flex w-full items-center justify-between text-left" aria-expanded={showAdd}>
          <span className="font-display text-base font-bold">Add single question {questions.length > 0 && <span className="text-sm font-semibold text-slate-500">(next Q# {nextQ})</span>}</span>
          <span className="text-sm font-bold text-[#1450A0]">{showAdd ? 'Hide ▲' : 'Show ▼'}</span>
        </button>
        {showAdd && (
          <form onSubmit={saveSingle} className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="q-no">Q#</label>
              <input id="q-no" type="number" min="1" className="input font-mono" value={single.q_no} onChange={(e) => setS('q_no', e.target.value)} placeholder={String(nextQ)} />
            </div>
            <div>
              <label className="label" htmlFor="q-marks">Marks</label>
              <input id="q-marks" type="number" min="0" step="0.5" className="input" value={single.marks} onChange={(e) => setS('marks', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="q-text">Question *</label>
              <textarea id="q-text" rows={2} className="input" value={single.question_text} onChange={(e) => setS('question_text', e.target.value)} placeholder="Enter question text…" required />
            </div>
            <div><label className="label" htmlFor="q-a">Option A *</label><input id="q-a" className="input" value={single.option_a} onChange={(e) => setS('option_a', e.target.value)} required /></div>
            <div><label className="label" htmlFor="q-b">Option B *</label><input id="q-b" className="input" value={single.option_b} onChange={(e) => setS('option_b', e.target.value)} required /></div>
            <div><label className="label" htmlFor="q-c">Option C *</label><input id="q-c" className="input" value={single.option_c} onChange={(e) => setS('option_c', e.target.value)} required /></div>
            <div><label className="label" htmlFor="q-d">Option D *</label><input id="q-d" className="input" value={single.option_d} onChange={(e) => setS('option_d', e.target.value)} required /></div>
            <div>
              <label className="label" htmlFor="q-ans">Correct option *</label>
              <select id="q-ans" className="input font-mono" value={single.correct_option} onChange={(e) => setS('correct_option', e.target.value)}>
                {['A', 'B', 'C', 'D'].map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="flex items-end justify-end">
              <button type="submit" disabled={singleSaving || !examId} className="btn-primary !px-4 !py-2">{singleSaving ? 'Adding…' : 'Add question'}</button>
            </div>
            {singleErr && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{singleErr}</p>}
            {!examId && <p className="text-sm text-slate-500 sm:col-span-2">Select an exam above first.</p>}
          </form>
        )}
      </div>

      <div className="card mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold">Import Excel / CSV</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadTemplateXlsx} className="btn-primary !px-4 !py-1.5">⬇ Template (Excel)</button>
            <button type="button" onClick={downloadTemplateCsv} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">⬇ Template (CSV)</button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">Columns: q_no, question_text, option_a–d, correct_option, marks. Saved to the selected exam only.</p>
        <div className="mt-3">
          <label className="label" htmlFor="q-file">Upload Excel / CSV (.xlsx, .xls, .csv)</label>
          <input id="q-file" type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={!examId} className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#0B2F6B] file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-[#1450A0] disabled:opacity-50" />
          {fileName && (
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span className="truncate">{fileName}</span>
              <button type="button" onClick={clearUpload} className="font-bold text-slate-500 hover:text-slate-700">Clear</button>
            </div>
          )}
        </div>
        {!examId && <p className="mt-2 text-sm text-slate-500">Select an exam above to enable import.</p>}
        {hadExamCode && (
          <p role="note" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Heads up: This file has an older exam_code column — it was safely ignored. All questions will be saved to this exam only. No action needed.
          </p>
        )}
        {uploadErr && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{uploadErr}</p>}
        {progress && <p role="status" className="mt-2 text-sm font-semibold text-[#0B2F6B]">{progress}</p>}
        {preview.length > 0 && (
          <div className="mt-3 rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <h3 className="font-display text-sm font-bold">Preview — {validPreview.length}/{preview.length} valid</h3>
              <div className="flex gap-2">
                <button type="button" onClick={saveImport} disabled={!validPreview.length || saving || !examId} className="btn-primary !px-4 !py-1.5">{saving ? 'Saving…' : `Save ${validPreview.length}`}</button>
                <button type="button" onClick={clearUpload} className="text-sm text-slate-500 hover:text-slate-700">Clear</button>
              </div>
            </div>
            {previewErrs.length > 0 && (
              <ul className="mx-4 max-h-28 overflow-y-auto rounded-lg bg-red-50 p-2 text-xs text-red-700">
                {previewErrs.slice(0, 30).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            )}
            <div className="mt-2 overflow-x-auto px-2 pb-2">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead><tr className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
                  <th className="px-2 py-1.5">Q#</th><th className="px-2 py-1.5">Question</th><th className="px-2 py-1.5">A–D</th><th className="px-2 py-1.5">Ans</th><th className="px-2 py-1.5">Err</th>
                </tr></thead>
                <tbody>
                  {preview.slice(0, 50).map((r, i) => (
                    <tr key={i} className={`border-t ${(r._errors || []).length ? 'bg-red-50/50' : ''}`}>
                      <td className="px-2 py-1.5 font-mono">{r.q_no}</td>
                      <td className="max-w-[280px] truncate px-2 py-1.5">{r.question_text || '—'}</td>
                      <td className="max-w-[220px] truncate px-2 py-1.5 text-slate-500">{[r.option_a, r.option_b, r.option_c, r.option_d].join(' / ')}</td>
                      <td className="px-2 py-1.5 font-mono font-bold">{r.correct_option || '—'}</td>
                      <td className="px-2 py-1.5 text-xs text-red-600">{(r._errors || []).join('; ') || '✓'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="card mt-4 p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="font-display text-base font-bold">Bank — {questions.length} question(s)</h2>
          {questions.length > 0 && <button onClick={clearAll} className="text-sm font-bold text-red-600 hover:underline">Clear all</button>}
        </div>
        {!examId ? (
          <p className="px-5 pb-5 text-sm text-slate-500">Select an exam above to view its questions.</p>
        ) : loading ? <p className="px-5 pb-5 text-sm text-slate-500">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Q#</th><th className="px-4 py-2">Question</th><th className="px-4 py-2">Correct</th><th className="px-4 py-2 text-right">Action</th>
              </tr></thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono font-bold">{q.q_no}</td>
                    <td className="max-w-[420px] truncate px-4 py-2">{q.question_text}</td>
                    <td className="px-4 py-2"><span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-xs font-bold text-emerald-800">{q.correct_option}</span></td>
                    <td className="px-4 py-2 text-right"><button onClick={() => removeOne(q.id)} className="rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-200">Delete</button></td>
                  </tr>
                ))}
                {questions.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">No questions yet — add one above or import a file.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
