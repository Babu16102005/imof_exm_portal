import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  buildScopedTemplateRows,
  parseQuestionRows,
  SCOPED_TEMPLATE_HEADER,
  validateFile,
} from '../../lib/questionImport.js'
import {
  createExam,
  createExamWithQuestions,
  deleteExam,
  listExams,
  updateExam,
} from '../../services/dataService.js'

export const OLYMPIADS = ['SIRO', 'SVMO', 'SISO', 'SCTO', 'NIKO', 'NIPO-Art', 'NIEO', 'NIGKO', 'NIPO-Phy', 'NICO', 'NIBO']
export const CUSTOM_OLYMPIAD = '__custom__'

function formatClass(ex) {
  const a = ex?.class_from ?? null
  const b = ex?.class_to ?? null
  // Legacy rows may have a range (e.g. 3–10); new rows store single class in both.
  if (a != null && b != null && a !== b) return `${a}–${b}`
  const single = a ?? b
  return single ?? '—'
}

const emptyForm = {
  code: '', title: '', olympiad: 'SVMO', custom_olympiad: '', class_from: '',
  duration_minutes: 60, total_questions: '', marks_per_q: 1, status: 'draft',
  start_at: '', end_at: '', instructions: '',
}

function toInput(dt) {
  if (!dt) return ''
  try {
    const d = new Date(dt)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return '' }
}

const emptyUpload = { fileName: '', preview: [], previewErrs: [], hadExamCode: false }

export default function Exams() {
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(1)
  const [modalErr, setModalErr] = useState('')
  const [progress, setProgress] = useState('')
  // Upload state (create flow only)
  const [fileName, setFileName] = useState(emptyUpload.fileName)
  const [preview, setPreview] = useState(emptyUpload.preview)
  const [previewErrs, setPreviewErrs] = useState(emptyUpload.previewErrs)
  const [hadExamCode, setHadExamCode] = useState(emptyUpload.hadExamCode)

  const refresh = async () => {
    setLoading(true)
    try {
      setExams(await listExams())
      setErr('')
    } catch (e) { setErr(e.message || 'Failed to load exams') }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  const resetUpload = () => {
    setFileName('')
    setPreview([])
    setPreviewErrs([])
    setHadExamCode(false)
    setProgress('')
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setStep(1)
    setModalErr('')
    resetUpload()
    setShowModal(true)
  }

  const openEdit = (ex) => {
    setEditing(ex)
    const isStandard = OLYMPIADS.includes(ex.olympiad)
    setForm({
      code: ex.code || '', title: ex.title || '',
      olympiad: isStandard ? (ex.olympiad || 'SVMO') : CUSTOM_OLYMPIAD,
      custom_olympiad: isStandard ? '' : (ex.olympiad || ''),
      class_from: ex.class_from ?? ex.class_to ?? '',
      duration_minutes: ex.duration_minutes ?? 60, total_questions: ex.total_questions ?? '',
      marks_per_q: ex.marks_per_q ?? 1, status: ex.status || 'draft',
      start_at: toInput(ex.start_at), end_at: toInput(ex.end_at),
      instructions: ex.instructions || '',
    })
    setStep(1)
    setModalErr('')
    resetUpload()
    setShowModal(true)
  }

  const closeModal = () => {
    if (saving) return
    setShowModal(false)
    setModalErr('')
    setProgress('')
    resetUpload()
    setStep(1)
    setEditing(null)
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const validPreview = useMemo(() => preview.filter((r) => (r._errors || []).length === 0), [preview])

  const getFinalOlympiad = () => (form.olympiad === CUSTOM_OLYMPIAD
    ? String(form.custom_olympiad || '').trim()
    : form.olympiad)

  const buildPayload = () => {
    const finalOlympiad = getFinalOlympiad()
    const classVal = form.class_from === '' ? null : Number(form.class_from)
    return {
      finalOlympiad,
      payload: {
        code: String(form.code || '').trim(),
        title: String(form.title || '').trim(),
        olympiad: finalOlympiad,
        class_from: classVal,
        // class_to removed from UI — mirror single class for backward compat with DB / legacy range display
        class_to: classVal,
        duration_minutes: Number(form.duration_minutes) || 60,
        total_questions: form.total_questions === '' ? null : Number(form.total_questions),
        marks_per_q: Number(form.marks_per_q) || 1,
        status: form.status,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        instructions: form.instructions,
      },
    }
  }

  /* ---------------- template downloads (scoped, NO exam_code) ---------------- */

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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Column', 'Required', 'Rule'],
      ['q_no', 'No', 'Positive integer, unique within the exam (defaults to row order)'],
      ['question_text', 'YES', 'Plain text of the question'],
      ['option_a / b / c / d', 'YES', 'All 4 options required'],
      ['correct_option', 'YES', 'Exactly one letter: A, B, C or D'],
      ['marks', 'No', 'Number 0 or more (default 1)'],
      ['Note', '', 'Questions belong to the exam you create - no exam_code needed.'],
    ]), 'Instructions')
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

  /* ---------------- upload parse ---------------- */

  const onFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setModalErr('')
    try {
      validateFile(file)
    } catch (ex) {
      setModalErr(ex.message || 'Invalid file')
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
        if (!rows.length && errors.length) {
          setModalErr(errors[0])
        }
      } catch (ex) {
        setPreview([])
        setPreviewErrs([ex.message || 'Could not parse file'])
        setModalErr(ex.message || 'Could not parse file')
        setProgress('')
      }
    }
    reader.onerror = () => {
      setModalErr('Could not read file')
      setProgress('')
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const clearUpload = () => {
    resetUpload()
    setModalErr('')
  }

  /* ---------------- wizard navigation + save ---------------- */

  const goNext = () => {
    setModalErr('')
    if (step === 1) {
      if (!String(form.code || '').trim()) { setModalErr('Exam code is required'); return }
      if (!getFinalOlympiad()) { setModalErr('Olympiad is required — pick a value or enter a custom one'); return }
    }
    setStep((s) => Math.min(3, s + 1))
  }

  const goBack = () => {
    setModalErr('')
    setStep((s) => Math.max(1, s - 1))
  }

  const handleSave = async () => {
    if (!String(form.code || '').trim()) { setModalErr('Exam code is required'); return }
    const { finalOlympiad, payload } = buildPayload()
    if (!finalOlympiad) { setModalErr('Olympiad is required — pick a value or enter a custom one'); return }
    setSaving(true)
    setModalErr('')
    try {
      if (editing) {
        await updateExam(editing.id, payload)
      } else if (preview.length === 0) {
        // No questions uploaded — preserve old behaviour (auto total_questions null).
        await createExam(payload)
      } else {
        if (validPreview.length === 0) {
          setModalErr('No valid questions to save — fix the file or clear the upload to create an empty exam.')
          setSaving(false)
          return
        }
        const validRows = validPreview.map(({ _line, _errors, ...rest }) => rest)
        const savePayload = {
          ...payload,
          total_questions: payload.total_questions == null ? validRows.length : payload.total_questions,
        }
        setProgress(`Saving exam + ${validRows.length} question(s)…`)
        await createExamWithQuestions(savePayload, validRows, {
          onProgress: (done, total) => setProgress(`Uploading ${done}/${total}…`),
        })
      }
      setShowModal(false)
      setStep(1)
      setEditing(null)
      resetUpload()
      setModalErr('')
      await refresh()
    } catch (e2) {
      setModalErr(e2.message || 'Save failed')
      setProgress('')
    } finally {
      setSaving(false)
    }
  }

  const togglePublish = async (ex) => {
    try {
      await updateExam(ex.id, { status: ex.status === 'published' ? 'draft' : 'published' })
      await refresh()
    } catch (e) { setErr(e.message) }
  }

  const remove = async (ex) => {
    if (!window.confirm(`Delete exam ${ex.code}? Questions & attempts will also be removed.`)) return
    try { await deleteExam(ex.id); await refresh() }
    catch (e) { setErr(e.message) }
  }

  const examDetailsFields = (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div><label className="label" htmlFor="ex-code">Code *</label><input id="ex-code" className="input font-mono" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="IMOF-SVMO-2026" required /></div>
      <div><label className="label" htmlFor="ex-olympiad">Olympiad</label>
        <select id="ex-olympiad" className="input" value={form.olympiad} onChange={(e) => set('olympiad', e.target.value)}>
          {OLYMPIADS.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value={CUSTOM_OLYMPIAD}>Custom…</option>
        </select>
      </div>
      {form.olympiad === CUSTOM_OLYMPIAD && (
        <div><label className="label" htmlFor="ex-custom">Custom olympiad *</label><input id="ex-custom" className="input font-mono uppercase" value={form.custom_olympiad} onChange={(e) => set('custom_olympiad', e.target.value)} placeholder="e.g. SVMO" required={form.olympiad === CUSTOM_OLYMPIAD} /></div>
      )}
      <div className="sm:col-span-2"><label className="label" htmlFor="ex-title">Title</label><input id="ex-title" className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="SVMO — Vedic Mathematics Olympiad 2026" /></div>
      <div><label className="label" htmlFor="ex-class">Class</label><input id="ex-class" type="number" min="1" max="12" className="input" value={form.class_from} onChange={(e) => set('class_from', e.target.value)} placeholder="e.g. 5" /></div>
      <div><label className="label" htmlFor="ex-dur">Duration (mins)</label><input id="ex-dur" type="number" min="1" className="input" value={form.duration_minutes} onChange={(e) => set('duration_minutes', e.target.value)} /></div>
      <div>
        <label className="label" htmlFor="ex-tq">Total questions</label>
        <input id="ex-tq" type="number" min="1" className="input" value={form.total_questions} onChange={(e) => set('total_questions', e.target.value)} placeholder={editing ? '' : 'Blank = auto from upload'} />
        {!editing && <p className="mt-1 text-xs text-slate-500">Leave blank to auto-fill from the uploaded file.</p>}
      </div>
      <div><label className="label" htmlFor="ex-mpq">Marks per question</label><input id="ex-mpq" type="number" min="0" step="0.5" className="input" value={form.marks_per_q} onChange={(e) => set('marks_per_q', e.target.value)} /></div>
      <div><label className="label" htmlFor="ex-status">Status</label>
        <select id="ex-status" className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
          <option value="draft">draft</option>
          <option value="published">published</option>
          <option value="closed">closed</option>
          <option value="archived">archived</option>
        </select>
      </div>
      <div><label className="label" htmlFor="ex-start">Start at</label><input id="ex-start" type="datetime-local" className="input" value={form.start_at} onChange={(e) => set('start_at', e.target.value)} /></div>
      <div><label className="label" htmlFor="ex-end">End at</label><input id="ex-end" type="datetime-local" className="input" value={form.end_at} onChange={(e) => set('end_at', e.target.value)} /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="ex-ins">Instructions</label><textarea id="ex-ins" rows={3} className="input" value={form.instructions} onChange={(e) => set('instructions', e.target.value)} /></div>
    </div>
  )

  const uploadStep = (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={downloadTemplateXlsx} className="btn-primary !px-4 !py-2">⬇ Template (Excel)</button>
        <button type="button" onClick={downloadTemplateCsv} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          ⬇ Template (CSV)
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">Columns: q_no, question_text, option_a–d, correct_option, marks. No exam_code needed.</p>
      <div className="mt-3">
        <label className="label" htmlFor="ex-file">Upload Excel / CSV (.xlsx, .xls, .csv)</label>
        <input id="ex-file" type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#0B2F6B] file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-[#1450A0]" />
        {fileName && (
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <span className="truncate">{fileName}</span>
            <button type="button" onClick={clearUpload} className="font-bold text-slate-500 hover:text-slate-700">Clear</button>
          </div>
        )}
      </div>
      {hadExamCode && (
        <p role="note" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Heads up: This file has an older exam_code column — it was safely ignored. All questions will be saved to this exam only. No action needed.
        </p>
      )}
      {progress && !saving && <p role="status" className="mt-2 text-sm font-semibold text-[#0B2F6B]">{progress}</p>}
      {preview.length > 0 && (
        <div className="mt-3 rounded-xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <h3 className="font-display text-sm font-bold">Preview — {validPreview.length}/{preview.length} valid</h3>
            {previewErrs.length > 0 && validPreview.length > 0 && (
              <span className="text-xs font-semibold text-amber-700">Only valid rows will be saved; error rows are skipped.</span>
            )}
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
      {preview.length === 0 && !fileName && (
        <p className="mt-3 text-sm text-slate-500">No file yet — you can skip this step to create an empty exam.</p>
      )}
    </div>
  )

  const reviewStep = (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
      <dl className="grid gap-2">
        <div className="flex gap-2"><dt className="w-36 shrink-0 font-bold text-slate-500">Exam code</dt><dd className="font-mono font-bold">{form.code || '—'}</dd></div>
        <div className="flex gap-2"><dt className="w-36 shrink-0 font-bold text-slate-500">Title</dt><dd>{form.title || '—'}</dd></div>
        <div className="flex gap-2"><dt className="w-36 shrink-0 font-bold text-slate-500">Olympiad</dt><dd>{getFinalOlympiad() || '—'}</dd></div>
        <div className="flex gap-2"><dt className="w-36 shrink-0 font-bold text-slate-500">Questions</dt><dd>{preview.length === 0 ? 'None (empty exam)' : `${validPreview.length} valid / ${preview.length} total`}</dd></div>
        <div className="flex gap-2"><dt className="w-36 shrink-0 font-bold text-slate-500">Total questions</dt><dd>{form.total_questions === '' ? (preview.length === 0 ? '— (empty)' : `${validPreview.length} (auto from upload)`) : form.total_questions}</dd></div>
      </dl>
      {preview.length > 0 && previewErrs.length > 0 && validPreview.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {previewErrs.length} row error(s) found — only the {validPreview.length} valid row(s) will be saved.
        </p>
      )}
      {preview.length > 0 && validPreview.length === 0 && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          All uploaded rows have errors. Fix the file, clear the upload, or go back.
        </p>
      )}
      {saving && progress && <p role="status" className="mt-3 font-semibold text-[#0B2F6B]">{progress}</p>}
    </div>
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">Exams</h1>
          <p className="text-sm text-slate-500">Create papers, set windows, publish to students.</p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ New exam</button>
      </div>
      {err && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {loading ? <p className="mt-6 text-sm text-slate-500">Loading…</p> : (
        <div className="card mt-4 p-0">
          <div className="table-scroll overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Title / Olympiad</th>
                <th className="px-4 py-2.5">Class</th>
                <th className="px-4 py-2.5">Dur / Qs</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((ex) => (
                <tr key={ex.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-bold">{ex.code}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold">{ex.title || '—'}</span>
                    <span className="ml-2 text-[11px] font-bold uppercase text-slate-400">{ex.olympiad || ''}</span>
                  </td>
                  <td className="px-4 py-2.5">{formatClass(ex)}</td>
                  <td className="px-4 py-2.5">{ex.duration_minutes || '—'}m / {ex.total_questions || '—'}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => togglePublish(ex)} title="Toggle publish" className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${ex.status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                      {ex.status}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap justify-end gap-1.5 text-xs font-bold">
                      <button onClick={() => openEdit(ex)} className="min-h-[36px] rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700 hover:bg-slate-200">Edit</button>
                      <Link to={`/admin/questions?exam=${ex.id}`} className="inline-flex min-h-[36px] items-center rounded-lg bg-blue-100 px-3 py-1.5 text-blue-800 hover:bg-blue-200">Questions</Link>
                      <Link to={`/admin/students?exam=${ex.id}`} className="inline-flex min-h-[36px] items-center rounded-lg bg-amber-100 px-3 py-1.5 text-amber-800 hover:bg-amber-200">Students</Link>
                      <Link to={`/admin/results?exam=${ex.id}`} className="inline-flex min-h-[36px] items-center rounded-lg bg-emerald-100 px-3 py-1.5 text-emerald-800 hover:bg-emerald-200">Results</Link>
                      <button onClick={() => remove(ex)} className="min-h-[36px] rounded-lg bg-red-100 px-3 py-1.5 text-red-700 hover:bg-red-200">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {exams.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No exams yet.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={editing ? 'Edit exam' : 'New exam wizard'}>
          <div className="modal-sheet max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6 shadow-xl">
            <h2 className="font-display text-lg font-bold">{editing ? 'Edit exam' : 'New exam'}</h2>

            {!editing && (
              <ol className="mt-3 flex items-center gap-2 text-xs font-bold" aria-label="Progress">
                {[1, 2, 3].map((s) => (
                  <li key={s} className="flex items-center gap-2">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full ${step === s ? 'bg-[#0B2F6B] text-white' : step > s ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`} aria-current={step === s ? 'step' : undefined}>{s}</span>
                    <span className={step === s ? 'text-slate-900' : 'text-slate-500'}>{s === 1 ? 'Exam details' : s === 2 ? 'Upload Questions' : 'Review & Save'}</span>
                    {s < 3 && <span className="mx-1 text-slate-300" aria-hidden="true">—</span>}
                  </li>
                ))}
              </ol>
            )}

            {modalErr && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{modalErr}</p>}

            {editing ? (
              <>
                {examDetailsFields}
                <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  Question bank editing happens at creation time. To view this exam&apos;s questions,{' '}
                  <Link to={`/admin/questions?exam=${editing.id}`} className="font-bold underline hover:text-blue-700">
                    open Exam Questions for {editing.code || 'this exam'}
                  </Link>.
                </div>
                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={closeModal} disabled={saving} className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
                  <button type="button" onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save exam'}</button>
                </div>
              </>
            ) : (
              <>
                {step === 1 && examDetailsFields}
                {step === 2 && uploadStep}
                {step === 3 && reviewStep}
                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={closeModal} disabled={saving} className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
                  {step > 1 && (
                    <button type="button" onClick={goBack} disabled={saving} className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Back</button>
                  )}
                  {step < 3 && (
                    <button type="button" onClick={goNext} disabled={saving} className="btn-primary flex-1">Next</button>
                  )}
                  {step === 3 && (
                    <button type="button" onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? (progress || 'Saving…') : 'Save exam'}</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
