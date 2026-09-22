/**
 * Unified data layer — mock (localStorage) vs Supabase branching.
 *
 * LIVE mode (Supabase configured, VITE_MOCK_MODE != 'true'):
 *  - Student auth/paper/scoring go through anon-callable RPCs only, so the
 *    client never sees correct answers or other students' data:
 *      verify_student_login / verify_admin_login / admin_touch /
 *      get_my_exams / get_exam_paper / submit_attempt / get_my_result
 *  - Admin table access goes through an admin-scoped client that sends the
 *    `x-admin-token` header (validated server-side by RLS policies).
 *  - The anon `supabase` client is used ONLY for RPC calls in live mode.
 *
 * MOCK mode: 100% local demo behaviour (plaintext fine), unchanged.
 */
import { supabase, isMockMode, getAdminClient } from '../lib/supabaseClient.js'
import { mockDb, uid } from '../lib/mockDb.js'
import { MAX_ROWS as QUESTION_MAX_ROWS, sanitizeText } from '../lib/questionImport.js'
import {
  normalizeClassGrade,
  isGradeInRange,
  classMismatchMessage,
  CLASS_MISMATCH_CODE,
} from '../lib/classGrade.js'

export { CLASS_MISMATCH_CODE }

const shouldUseMock = () => isMockMode || !supabase
const SESSION_KEY = 'imof_session'

function readAdminToken() {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    return s?.adminToken || null
  } catch {
    return null
  }
}

/** Live-mode admin DB handle. Throws when there is no admin session. */
function requireAdminDb() {
  const token = readAdminToken()
  if (!token) throw new Error('Admin session expired')
  const db = getAdminClient(token)
  if (!db) throw new Error('Admin session expired')
  return db
}

/* ------------------- class-based visibility helpers ------------------ */
/* Server is the source of truth (RPCs enforce try_parse_class + range).
 * The client helpers below are a SUBTRACTIVE safety net only: they may hide
 * extra rows the server let through on stale backends, but they NEVER re-add
 * rows the server filtered out. Mock mode applies a STRICT filter instead
 * (unparseable grade => only open-range exams). */

function throwClassMismatch(exam, grade) {
  const err = new Error(classMismatchMessage(exam || null, grade ?? null))
  err.code = CLASS_MISMATCH_CODE
  if (exam?.id) err.examId = exam.id
  if (grade != null) err.grade = grade
  throw err
}

/** True for server or client CLASS_MISMATCH-style eligibility failures. */
function isClassMismatchError(err) {
  if (!err) return false
  if (err?.code === CLASS_MISMATCH_CODE) return true
  const msg = String(err?.message || err?.hint || err || '')
  if (/CLASS_MISMATCH/i.test(msg)) return true
  // Friendly server wordings from present/future RPCs.
  if (/not eligible|not.*your class|class.*(mismatch|range|eligible)|grade.*(mismatch|range|eligible)/i.test(msg))
    return true
  return false
}

/** Normalize any RPC eligibility failure to Error with code CLASS_MISMATCH. */
function normalizeRpcEligibilityError(err) {
  if (!isClassMismatchError(err)) return err
  const rawMsg = String(err?.message || 'You are not eligible for this exam.')
  const msg = /CLASS_MISMATCH/i.test(rawMsg) ? rawMsg : `${rawMsg} (CLASS_MISMATCH)`
  const nice = new Error(msg)
  nice.code = CLASS_MISMATCH_CODE
  nice.cause = err
  return nice
}

/** Best-effort cached student from sessionStorage (student login session). */
function readCachedStudent(studentId) {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    const stu = s?.student || null
    if (!stu) return null
    if (studentId && String(stu.id) !== String(studentId)) return null
    return stu
  } catch {
    return null
  }
}

/**
 * Resolve a student's NORMALIZED grade (1..12 | null) for client-side
 * safety filtering. Priority: explicit options -> session cache -> null.
 * `options` may be an object ({ studentClass | student | class | grade }),
 * a raw class label, or a number. Returns null when unresolvable.
 */
function resolveStudentGradeSync(studentId, options) {
  let raw = null
  if (options != null) {
    if (typeof options === 'string' || typeof options === 'number') raw = options
    else if (typeof options === 'object') {
      raw =
        options.studentClass ??
        options.grade ??
        options.class ??
        options.student?.class ??
        options.student?.grade ??
        null
    }
  }
  if (raw == null) {
    const cached = readCachedStudent(studentId)
    raw = cached?.class ?? cached?.grade ?? null
  }
  if (raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 && raw <= 12) return Math.trunc(raw)
  return normalizeClassGrade(raw)
}

/**
 * Live fallback: try a direct students lookup via the anon client when the
 * grade is not in options/session. RLS blocks this on hardened backends
 * (admin-token-only policies) — that failure is swallowed and yields null,
 * leaving the server-filtered list untouched.
 */
async function resolveStudentGradeLive(studentId, options) {
  const sync = resolveStudentGradeSync(studentId, options)
  if (sync != null) return sync
  if (!studentId || !supabase) return null
  try {
    const { data } = await supabase.from('students').select('class').eq('id', studentId).maybeSingle()
    if (data?.class != null) return normalizeClassGrade(data.class)
  } catch {
    /* RLS / network — ignore, server list stands */
  }
  return null
}

/** Subtractive safety filter: NEVER re-adds server-filtered rows. */
function applyClassSafetyFilter(exams, grade) {
  if (!Array.isArray(exams)) return exams
  if (grade == null) return exams
  return exams.filter((e) => isGradeInRange(grade, e?.class_from, e?.class_to))
}

/* Chunk size for bulk writes. Students use smaller chunks because each row
 * is bcrypt-hashed server-side by trigger (see hardening-fix3.sql). */
export const BULK_CHUNK = { students: 250, questions: 500 }

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/* ------------------------------ exams ------------------------------ */

export async function listExams() {
  if (shouldUseMock()) {
    return [...mockDb.exams].sort((a, b) =>
      String(b.created_at || b.code || '').localeCompare(String(a.created_at || a.code || '')),
    )
  }
  const db = requireAdminDb()
  const { data, error } = await db.from('exams').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getExam(id) {
  if (!id) return null
  if (shouldUseMock()) {
    return mockDb.exams.find((e) => e.id === id || e.code === id) || null
  }
  const db = requireAdminDb()
  let { data } = await db.from('exams').select('*').eq('id', id).maybeSingle()
  if (!data) {
    const res = await db.from('exams').select('*').eq('code', id).maybeSingle()
    data = res.data
    if (res.error) throw res.error
  }
  return data || null
}

export async function createExam(payload) {
  if (shouldUseMock()) {
    const row = {
      id: uid('exam'),
      code: payload.code,
      title: payload.title || '',
      olympiad: payload.olympiad || '',
      class_from: payload.class_from ?? null,
      class_to: payload.class_to ?? null,
      duration_minutes: payload.duration_minutes ?? 60,
      total_questions: payload.total_questions ?? null,
      marks_per_q: payload.marks_per_q ?? 1,
      status: payload.status || 'draft',
      start_at: payload.start_at || null,
      end_at: payload.end_at || null,
      instructions: payload.instructions || '',
      created_at: new Date().toISOString(),
    }
    mockDb.exams.push(row)
    mockDb.persist()
    return row
  }
  const db = requireAdminDb()
  const { data, error } = await db.from('exams').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateExam(id, payload) {
  if (shouldUseMock()) {
    const i = mockDb.exams.findIndex((e) => e.id === id)
    if (i < 0) throw new Error('Exam not found')
    mockDb.exams[i] = { ...mockDb.exams[i], ...payload }
    mockDb.persist()
    return mockDb.exams[i]
  }
  const db = requireAdminDb()
  const { data, error } = await db.from('exams').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteExam(id) {
  if (shouldUseMock()) {
    mockDb.exams = mockDb.exams.filter((e) => e.id !== id)
    mockDb.questions = mockDb.questions.filter((q) => q.exam_id !== id)
    mockDb.attempts = mockDb.attempts.filter((a) => a.exam_id !== id)
    mockDb.students = mockDb.students.map((s) => (s.exam_id === id ? { ...s, exam_id: null } : s))
    mockDb.persist()
    return true
  }
  const db = requireAdminDb()
  const { error } = await db.from('exams').delete().eq('id', id)
  if (error) throw error
  return true
}

/* ---------------------------- questions ---------------------------- */

export async function listQuestions(examId) {
  if (!examId) throw new Error('Exam is required')
  if (shouldUseMock()) {
    return mockDb.questions
      .filter((q) => q.exam_id === examId)
      .sort((a, b) => (a.q_no || 0) - (b.q_no || 0))
  }
  // Admin-only: includes correct_option. Player code must use getPlayerPaper.
  const db = requireAdminDb()
  const { data, error } = await db
    .from('questions')
    .select('*')
    .eq('exam_id', examId)
    .order('q_no', { ascending: true })
  if (error) throw error
  return data || []
}

export async function bulkInsertQuestions(examId, rows, onProgress) {
  if (!examId) throw new Error('Exam is required')
  const input = rows || []
  if (input.length > QUESTION_MAX_ROWS) {
    throw new Error(
      `Too many questions: ${input.length} (max ${QUESTION_MAX_ROWS}). Split the import into parts.`,
    )
  }
  // Validate ALL rows up front so a bad row never leaves a partial bank.
  // Sanitise (trim + strip <script> blocks/tags) before checking emptiness.
  const clean = input.map((r, i) => {
    const label = `Row ${i + 1}`
    const question_text = sanitizeText(r.question_text)
    const option_a = sanitizeText(r.option_a)
    const option_b = sanitizeText(r.option_b)
    const option_c = sanitizeText(r.option_c)
    const option_d = sanitizeText(r.option_d)
    const correct_option = String(r.correct_option ?? '').trim().toUpperCase()
    const q_no = Number(r.q_no ?? i + 1)
    if (!question_text) throw new Error(`${label}: question text is required`)
    if (!option_a || !option_b || !option_c || !option_d)
      throw new Error(`${label}: all 4 options (A–D) are required`)
    if (!['A', 'B', 'C', 'D'].includes(correct_option))
      throw new Error(`${label}: correct_option must be A/B/C/D`)
    if (!Number.isFinite(q_no) || q_no <= 0) throw new Error(`${label}: q_no must be > 0`)
    const mRaw = r.marks
    let marks = mRaw === '' || mRaw == null ? 1 : Number(mRaw)
    if (!Number.isFinite(marks) || marks < 0) marks = 1
    return {
      exam_id: examId,
      q_no,
      question_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option,
      marks,
    }
  })
  // P0-1: duplicate q_no corrupts Player answers/scores (keyed by q_no).
  // Reject within-batch duplicates before any write (avoids partial banks).
  const seenQNos = new Set()
  const dupInBatch = new Set()
  for (const r of clean) {
    if (seenQNos.has(r.q_no)) dupInBatch.add(r.q_no)
    else seenQNos.add(r.q_no)
  }
  if (dupInBatch.size > 0) {
    const dups = [...dupInBatch].sort((a, b) => a - b).join(', ')
    throw new Error(`Duplicate q_no ${dups}: must be unique within the exam`)
  }
  if (shouldUseMock()) {
    const existingQNos = new Set(
      mockDb.questions.filter((q) => q.exam_id === examId).map((q) => Number(q.q_no)),
    )
    const conflicts = [...seenQNos].filter((n) => existingQNos.has(n)).sort((a, b) => a - b)
    if (conflicts.length > 0) {
      throw new Error(`Duplicate q_no ${conflicts.join(', ')}: must be unique within the exam`)
    }
    const inserted = clean.map((r) => ({ id: uid('q'), ...r }))
    mockDb.questions.push(...inserted)
    mockDb.persist()
    return inserted
  }
  const db = requireAdminDb()
  // Prevent DB unique violation surfacing as cryptic error: check bank first.
  const { data: existingRows, error: existingError } = await db
    .from('questions')
    .select('q_no')
    .eq('exam_id', examId)
  if (existingError) throw existingError
  const existingQNos = new Set((existingRows || []).map((r) => Number(r.q_no)))
  const conflicts = [...seenQNos].filter((n) => existingQNos.has(n)).sort((a, b) => a - b)
  if (conflicts.length > 0) {
    throw new Error(`Duplicate q_no ${conflicts.join(', ')}: must be unique within the exam`)
  }
  // Chunked so 500–1000-row question banks don't hit payload/timeout limits.
  const chunks = chunkArray(clean, BULK_CHUNK.questions)
  const out = []
  for (let i = 0; i < chunks.length; i++) {
    const { data, error } = await db.from('questions').insert(chunks[i]).select()
    if (error) throw error
    out.push(...(data || []))
    if (onProgress) onProgress(out.length, clean.length)
  }
  return out
}

/* --------------------- exam + questions (wizard) ------------------- */

/**
 * Transactional exam creation with its question bank (admin wizard flow).
 * Creates the exam, bulk-inserts `questionRows` scoped to it, and auto-sets
 * total_questions = inserted.length when the payload leaves it null.
 * On any question failure the created exam is deleted (rollback) and the
 * original error is rethrown. Returns { exam, questions }.
 * (Live rollback deletes the exam row; question cleanup relies on the
 * questions.exam_id FK cascade — see supabase/schema.sql.)
 */
export async function createExamWithQuestions(examPayload, questionRows, options = {}) {
  const onProgress = typeof options === 'function' ? options : options?.onProgress
  const payload = examPayload || {}
  const rows = Array.isArray(questionRows) ? questionRows : []
  const exam = await createExam(payload)
  try {
    const questions = await bulkInsertQuestions(exam.id, rows, onProgress)
    if (payload.total_questions == null) {
      const updated = await updateExam(exam.id, { total_questions: questions.length })
      return { exam: updated, questions }
    }
    return { exam, questions }
  } catch (err) {
    try {
      await deleteExam(exam.id)
    } catch {
      /* keep the original import error */
    }
    throw err
  }
}

export async function deleteQuestion(id) {
  if (shouldUseMock()) {
    mockDb.questions = mockDb.questions.filter((q) => q.id !== id)
    mockDb.persist()
    return true
  }
  const db = requireAdminDb()
  const { error } = await db.from('questions').delete().eq('id', id)
  if (error) throw error
  return true
}

export async function clearQuestions(examId) {
  if (shouldUseMock()) {
    mockDb.questions = mockDb.questions.filter((q) => q.exam_id !== examId)
    mockDb.persist()
    return true
  }
  const db = requireAdminDb()
  const { error } = await db.from('questions').delete().eq('exam_id', examId)
  if (error) throw error
  return true
}

/* ---------------------------- students ----------------------------- */

export async function listStudents(examId) {
  if (shouldUseMock()) {
    const rows = examId ? mockDb.students.filter((s) => s.exam_id === examId) : [...mockDb.students]
    return rows.sort((a, b) => String(a.user_id || '').localeCompare(String(b.user_id || '')))
  }
  const db = requireAdminDb()
  // Explicit columns: never leak password hashes to the admin list path.
  // Callers that need credentials use RPC (login) or updateStudent (reset), not this read.
  let query = db
    .from('students')
    .select('id,user_id,name,class,school,exam_id,is_active,created_at')
    .order('user_id', { ascending: true })
  if (examId) query = query.eq('exam_id', examId)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function upsertStudents(rows, onProgress) {
  const clean = (rows || []).map((r) => ({
    user_id: String(r.user_id || '').trim(),
    password: String(r.password || ''),
    name: r.name || '',
    class: r.class != null ? String(r.class) : '',
    school: r.school || '',
    exam_id: r.exam_id || null,
    is_active: r.is_active !== false,
  }))
  if (shouldUseMock()) {
    const out = []
    for (const r of clean) {
      if (!r.user_id) continue
      const i = mockDb.students.findIndex((s) => s.user_id === r.user_id)
      if (i >= 0) {
        mockDb.students[i] = { ...mockDb.students[i], ...r }
        out.push(mockDb.students[i])
      } else {
        const row = { id: uid('stu'), ...r }
        mockDb.students.push(row)
        out.push(row)
      }
    }
    mockDb.persist()
    return out
  }
  const db = requireAdminDb()
  // Chunked: each row is bcrypt-hashed server-side (trigger), so small
  // batches keep every request comfortably inside timeout limits.
  // NOTE: plaintext travels over HTTPS; hashing happens in Postgres.
  const chunks = chunkArray(clean.filter((r) => r.user_id), BULK_CHUNK.students)
  const out = []
  for (let i = 0; i < chunks.length; i++) {
    const { data, error } = await db
      .from('students')
      .upsert(chunks[i], { onConflict: 'user_id' })
      .select('id,user_id,name,class,school,exam_id,is_active,created_at')
    if (error) throw error
    out.push(...(data || []))
    if (onProgress) onProgress(out.length, clean.length)
  }
  return out
}

export async function deleteStudent(id) {
  if (shouldUseMock()) {
    mockDb.students = mockDb.students.filter((s) => s.id !== id)
    mockDb.attempts = mockDb.attempts.filter((a) => a.student_id !== id)
    mockDb.persist()
    return true
  }
  const db = requireAdminDb()
  const { error } = await db.from('students').delete().eq('id', id)
  if (error) throw error
  return true
}

/* Wind-up: delete ALL logins (user IDs + passwords) assigned to one exam.
 * Attempts cascade (FK ON DELETE CASCADE). Export marks FIRST — this cannot
 * be undone. Returns number of logins removed. */
export async function deleteStudentsByExam(examId) {
  if (!examId) throw new Error('Exam is required')
  if (shouldUseMock()) {
    const before = mockDb.students.length
    const ids = new Set(mockDb.students.filter((s) => s.exam_id === examId).map((s) => s.id))
    mockDb.students = mockDb.students.filter((s) => s.exam_id !== examId)
    mockDb.attempts = mockDb.attempts.filter((a) => !ids.has(a.student_id))
    mockDb.persist()
    return before - mockDb.students.length
  }
  const db = requireAdminDb()
  const { data, error } = await db.from('students').delete().eq('exam_id', examId).select('id')
  if (error) throw error
  return (data || []).length
}

export async function updateStudent(id, payload) {
  if (shouldUseMock()) {
    const i = mockDb.students.findIndex((s) => s.id === id)
    if (i < 0) throw new Error('Student not found')
    mockDb.students[i] = { ...mockDb.students[i], ...payload }
    mockDb.persist()
    return mockDb.students[i]
  }
  const db = requireAdminDb()
  const { data, error } = await db.from('students').update(payload).eq('id', id).select('id,user_id,name,class,school,exam_id,is_active,created_at').single()
  if (error) throw error
  return data
}

export async function findStudent(user_id, password) {
  const u = String(user_id || '').trim()
  if (shouldUseMock()) {
    return (
      mockDb.students.find((s) => s.user_id === u && String(s.password) === String(password)) || null
    )
  }
  // LIVE: verify via RPC so password hashes never leave the server.
  // Returns the student row on success, null on bad credentials (compat).
  const { data, error } = await supabase.rpc('verify_student_login', {
    p_user_id: u,
    p_password: String(password),
  })
  if (error) {
    if (/invalid user id or password/i.test(error.message || '')) return null
    throw error
  }
  const row = Array.isArray(data) ? data[0] : data
  return row || null
}

/* ----------------- student RPC surface (live scoring) --------------- */

/**
 * Extract a raw class value from the optional `studentClassHint` second arg.
 * Accepts a primitive ("5", 5), null (explicit unknown), or an object
 * ({ class }, { student: { class } }, { studentClass }) for call-site comfort.
 * Returns undefined only when no hint was supplied at all.
 */
function extractClassValue(hint) {
  if (hint === undefined) return undefined
  if (hint === null) return null
  if (typeof hint === 'object') {
    return hint.class ?? hint.student?.class ?? hint.studentClass ?? hint.grade ?? null
  }
  return hint
}

/** Best-effort read of the signed-in student's class from sessionStorage. */
function readSessionStudentClass() {
  try {
    if (typeof sessionStorage === 'undefined') return undefined
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return undefined
    const s = JSON.parse(raw)
    if (!s || typeof s !== 'object' || !s.student || typeof s.student !== 'object') {
      return undefined
    }
    return s.student.class ?? null
  } catch {
    return undefined
  }
}

/**
 * LIVE: get_my_exams RPC — exams visible to this student, each with
 * `question_count` and `submitted` flags. Never exposes correct answers.
 *
 * Class visibility: the server RPC is the source of truth (filters by
 * try_parse_class(students.class) vs exams.class_from/to). The client
 * applies a SUBTRACTIVE safety filter only — when the student grade can be
 * resolved from the optional 2nd arg or the session cache (plus a
 * best-effort direct lookup that hardened RLS will block) — and never
 * re-adds rows. Mock mode applies a STRICT filter (unknown grade =>
 * open-range exams only).
 *
 * @param {string} studentId
 * @param {object|string|number|null} [studentClassHint] - raw class label,
 *   grade number, or { class|studentClass|grade|student:{class} }. Explicit
 *   hint wins over the mock row / session cache (lets tests pin a grade).
 */
export async function getMyExams(studentId, studentClassHint = undefined) {
  if (!studentId) return []
  if (shouldUseMock()) {
    const stu = mockDb.students.find((s) => String(s.id) === String(studentId)) || null
    // Explicit hint wins (lets tests pin a grade); else the mock student
    // row; else the session cache. STRICT: unknown grade => open exams only.
    const grade =
      studentClassHint !== undefined
        ? normalizeClassGrade(extractClassValue(studentClassHint))
        : (stu ? normalizeClassGrade(stu.class) : resolveStudentGradeSync(studentId, undefined))
    let candidates
    if (stu?.exam_id) {
      const mine = mockDb.exams.filter((e) => e.id === stu.exam_id)
      candidates = mine.length ? mine : mockDb.exams.filter((e) => e.status === 'published')
    } else {
      candidates = mockDb.exams.filter((e) => e.status === 'published')
    }
    // STRICT class gate: unknown grade sees only open-range exams.
    const rows = candidates.filter((e) =>
      isGradeInRange(grade, e?.class_from ?? null, e?.class_to ?? null),
    )
    return rows.map((e) => ({
      ...e,
      question_count: mockDb.questions.filter((q) => q.exam_id === e.id).length,
      submitted: Boolean(
        mockDb.attempts.find((a) => a.student_id === studentId && a.exam_id === e.id)?.submitted_at,
      ),
    }))
  }
  const { data, error } = await supabase.rpc('get_my_exams', { p_student_id: studentId })
  if (error) {
    if (isClassMismatchError(error)) throw normalizeRpcEligibilityError(error)
    throw error
  }
  let rows = data || []
  // Client safety net: re-apply the same class gate when the class is known.
  // Never re-adds rows the server filtered out; unknown grade => as-is.
  try {
    const grade =
      studentClassHint !== undefined
        ? normalizeClassGrade(extractClassValue(studentClassHint))
        : await resolveStudentGradeLive(studentId, undefined)
    rows = applyClassSafetyFilter(rows, grade)
  } catch {
    /* filter must never break server truth — return server rows */
  }
  return rows
}

/**
 * LIVE: get_exam_paper RPC — public exam cols + questions WITHOUT
 * correct_option. Player code MUST NOT assume correct_option exists.
 *
 * Mock path enforces the class gate and throws a CLASS_MISMATCH-coded
 * Error when ineligible. Live path propagates server CLASS_MISMATCH
 * errors cleanly (normalized to err.code === 'CLASS_MISMATCH') and keeps
 * the subtractive client guard so ineligible questions never reach the UI.
 */
export async function getPlayerPaper(examId, studentId, studentClassHint = undefined) {
  if (shouldUseMock()) {
    const exam = mockDb.exams.find((e) => e.id === examId || e.code === examId) || null
    if (!exam) return null
    const stu = studentId != null ? mockDb.students.find((s) => String(s.id) === String(studentId)) || null : null
    let shouldCheck = false
    let raw = null
    if (studentClassHint !== undefined) {
      raw = extractClassValue(studentClassHint)
      shouldCheck = true
    } else if (stu) {
      raw = stu.class
      shouldCheck = true
    } else if (studentId != null) {
      // Student id given but row missing (stale session): fall back to session hint.
      const sess = readSessionStudentClass()
      if (sess !== undefined) {
        raw = sess
        shouldCheck = true
      }
    }
    if (shouldCheck) {
      const grade = normalizeClassGrade(raw)
      if (!isGradeInRange(grade, exam?.class_from ?? null, exam?.class_to ?? null)) {
        throwClassMismatch(exam, grade)
      }
    }
    const questions = mockDb.questions
      .filter((q) => q.exam_id === exam.id)
      .sort((a, b) => (a.q_no || 0) - (b.q_no || 0))
    return { exam, questions }
  }
  const { data, error } = await supabase.rpc('get_exam_paper', {
    p_exam_id: examId,
    p_student_id: studentId,
  })
  if (error) {
    if (isClassMismatchError(error)) throw normalizeRpcEligibilityError(error)
    throw error
  }
  const paper = data || null
  // Client safety net: never hand ineligible questions to the UI.
  if (paper?.exam) {
    try {
      let hintProvided = studentClassHint !== undefined
      let raw = hintProvided ? extractClassValue(studentClassHint) : undefined
      if (!hintProvided) {
        const sess = readSessionStudentClass()
        if (sess !== undefined) {
          raw = sess
          hintProvided = true
        }
      }
      if (hintProvided) {
        const grade = normalizeClassGrade(raw)
        if (!isGradeInRange(grade, paper.exam?.class_from ?? null, paper.exam?.class_to ?? null)) {
          throwClassMismatch(paper.exam, grade)
        }
      }
    } catch (e) {
      if (isClassMismatchError(e)) throw e
      /* ignore filter failures — return server paper */
    }
  }
  return paper
}

/**
 * Submit answers for server-side scoring.
 * LIVE: submit_attempt RPC — sends ONLY answers (never a client score);
 * returns { score, total, correct, wrong, skipped, dedupe? }.
 * MOCK: scores locally (demo), unchanged behaviour.
 *
 * Class gate: mock path throws CLASS_MISMATCH before scoring/persisting;
 * live path normalizes server eligibility failures to err.code
 * === 'CLASS_MISMATCH' (other errors propagate untouched).
 */
export async function submitExam(examId, studentId, answers, options = undefined) {
  const ans = answers || {}
  if (shouldUseMock()) {
    const exam = mockDb.exams.find((e) => e.id === examId || e.code === examId) || null
    if (exam && studentId != null) {
      const stu = mockDb.students.find((s) => String(s.id) === String(studentId)) || null
      const grade =
        options !== undefined
          ? resolveStudentGradeSync(studentId, options)
          : stu
            ? normalizeClassGrade(stu.class)
            : resolveStudentGradeSync(studentId, undefined)
      // Strict: gate whenever the exam is ranged and we can evaluate.
      // Unknown grade + ranged exam => mismatch (only open exams submittable).
      if (exam.class_from != null || exam.class_to != null) {
        if (!isGradeInRange(grade, exam.class_from, exam.class_to)) throwClassMismatch(exam, grade)
      }
    }
    let qs = mockDb.questions
      .filter((q) => (exam ? q.exam_id === exam.id : q.exam_id === examId))
      .sort((a, b) => (a.q_no || 0) - (b.q_no || 0))
    const limit = Number(exam?.total_questions) || qs.length
    qs = qs.slice(0, limit)
    let score = 0
    let correct = 0
    let skipped = 0
    for (const q of qs) {
      const given = ans[String(q.q_no)]
      if (given === undefined || given === null || given === '') {
        skipped += 1
        continue
      }
      if (String(given) === String(q.correct_option)) {
        score += Number(q.marks ?? 1)
        correct += 1
      }
    }
    const total = qs.reduce((s, q) => s + Number(q.marks ?? 1), 0)
    const wrong = qs.length - correct - skipped
    // Persist via the mock single-attempt path (submitted papers are final).
    await saveAttempt({ student_id: studentId, exam_id: exam ? exam.id : examId, answers: ans, score, total })
    return { score, total, correct, wrong, skipped }
  }
  const { data, error } = await supabase.rpc('submit_attempt', {
    p_exam_id: examId,
    p_student_id: studentId,
    p_answers: ans,
  })
  if (error) {
    if (isClassMismatchError(error)) throw normalizeRpcEligibilityError(error)
    throw error
  }
  return data
}

/**
 * LIVE: get_my_result RPC — { score, total, submitted_at,
 * review: [{ q_no, chosen, correct, marks, ok }] }.
 *
 * Class gate: mock path throws CLASS_MISMATCH for out-of-range exams
 * (prevents cross-class review leaks via direct URLs); live path
 * normalizes server eligibility failures to err.code === 'CLASS_MISMATCH'.
 */
export async function getResultReview(examId, studentId, options = undefined) {
  if (shouldUseMock()) {
    const exam = mockDb.exams.find((e) => e.id === examId || e.code === examId) || null
    if (exam && studentId != null && (exam.class_from != null || exam.class_to != null)) {
      const stu = mockDb.students.find((s) => String(s.id) === String(studentId)) || null
      const grade =
        options !== undefined
          ? resolveStudentGradeSync(studentId, options)
          : stu
            ? normalizeClassGrade(stu.class)
            : resolveStudentGradeSync(studentId, undefined)
      if (!isGradeInRange(grade, exam.class_from, exam.class_to)) throwClassMismatch(exam, grade)
    }
    const eid = exam ? exam.id : examId
    const qs = mockDb.questions
      .filter((q) => q.exam_id === eid)
      .sort((a, b) => (a.q_no || 0) - (b.q_no || 0))
    const att =
      mockDb.attempts.find((a) => a.student_id === studentId && a.exam_id === eid) || null
    const answers = att?.answers || {}
    const review = qs.map((q) => {
      const chosen = answers[String(q.q_no)] ?? null
      return {
        q_no: q.q_no,
        chosen,
        correct: q.correct_option,
        marks: Number(q.marks ?? 1),
        ok: chosen != null && String(chosen) === String(q.correct_option),
      }
    })
    const total = qs.reduce((s, q) => s + Number(q.marks ?? 1), 0)
    return {
      score: Number(att?.score ?? 0),
      total,
      submitted_at: att?.submitted_at || null,
      review,
    }
  }
  const { data, error } = await supabase.rpc('get_my_result', {
    p_exam_id: examId,
    p_student_id: studentId,
  })
  if (error) {
    if (isClassMismatchError(error)) throw normalizeRpcEligibilityError(error)
    throw error
  }
  return data
}

/* ---------------------------- attempts ----------------------------- */

export async function getAttempt(student_id, exam_id) {
  if (shouldUseMock()) {
    return mockDb.attempts.find((a) => a.student_id === student_id && a.exam_id === exam_id) || null
  }
  // Compat: live reads go through the admin client (admin console use).
  // Player code must use getMyExams / getResultReview instead.
  const db = requireAdminDb()
  const { data, error } = await db
    .from('attempts')
    .select('*')
    .eq('student_id', student_id)
    .eq('exam_id', exam_id)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export async function saveAttempt({ student_id, exam_id, answers, score, total, started_at }) {
  const ans = answers || {}
  if (shouldUseMock()) {
    const i = mockDb.attempts.findIndex((a) => a.student_id === student_id && a.exam_id === exam_id)
    if (i >= 0) {
      const prev = mockDb.attempts[i]
      // Hard single-attempt: never overwrite a submitted paper
      if (prev.submitted_at) return prev
      mockDb.attempts[i] = {
        ...prev,
        answers: ans,
        ...(score !== undefined ? { score } : {}),
        ...(total !== undefined ? { total } : {}),
        ...(started_at ? { started_at } : {}),
        ...(score !== undefined ? { submitted_at: new Date().toISOString() } : {}),
      }
      mockDb.persist()
      return mockDb.attempts[i]
    }
    const row = {
      id: uid('att'),
      student_id,
      exam_id,
      answers: ans,
      score: score ?? null,
      ...(total !== undefined ? { total } : {}),
      started_at: started_at || new Date().toISOString(),
      submitted_at: score !== undefined ? new Date().toISOString() : null,
    }
    mockDb.attempts.push(row)
    mockDb.persist()
    return row
  }
  // Compat: live writes go through the admin client. Player code must use
  // submitExam (server-side scoring) instead.
  const db = requireAdminDb()
  // Supabase: attempts has NO `total` column — never send it.
  const { data: existing, error: readErr } = await db
    .from('attempts')
    .select('*')
    .eq('student_id', student_id)
    .eq('exam_id', exam_id)
    .maybeSingle()
  if (readErr) throw readErr
  if (existing) {
    // Hard single-attempt: submitted papers are final
    if (existing.submitted_at) return existing
    const patch = { answers: ans }
    if (score !== undefined) {
      patch.score = score
      patch.submitted_at = new Date().toISOString()
    }
    if (started_at && !existing.started_at) patch.started_at = started_at
    const { data, error } = await db
      .from('attempts')
      .update(patch)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    return data
  }
  const payload = {
    student_id,
    exam_id,
    answers: ans,
    score: score ?? null,
    started_at: started_at || new Date().toISOString(),
    ...(score !== undefined ? { submitted_at: new Date().toISOString() } : {}),
  }
  const { data, error } = await db.from('attempts').insert(payload).select().single()
  if (error) throw error
  return data
}

/**
 * List attempts for an exam with the taker's identity joined in.
 *
 * Why the join: `students.exam_id` is the *assigned/default* exam (nullable)
 * while `attempts.exam_id` is the exam *actually attempted*. Unassigned
 * students (`exam_id` NULL) can submit via RPC, so filtering students by
 * `exam_id` misses them. Joining `attempts -> students` on `student_id`
 * resolves every taker regardless of assignment. Uses a LEFT join so
 * attempts survive even if the student row was deleted. Explicit columns
 * avoid leaking password hashes.
 */
export async function listAttempts(examId) {
  if (shouldUseMock()) {
    const rows = examId ? mockDb.attempts.filter((a) => a.exam_id === examId) : [...mockDb.attempts]
    return rows
      .sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')))
      .map((a) => ({
        ...a,
        student: mockDb.students.find((s) => String(s.id) === String(a.student_id)) || null,
      }))
  }
  const db = requireAdminDb()
  let query = db
    .from('attempts')
    .select(
      'id,student_id,exam_id,score,started_at,submitted_at, students(id,user_id,name,class,school)',
    )
    .order('submitted_at', { ascending: false })
    .limit(5000)
  if (examId) query = query.eq('exam_id', examId)
  const { data, error } = await query
  if (error) throw error
  return (data || []).map((row) => {
    const { students, ...rest } = row
    const joined = Array.isArray(students) ? (students[0] ?? null) : (students ?? null)
    return { ...rest, student: joined }
  })
}

export async function deleteAttempt(id) {
  if (shouldUseMock()) {
    mockDb.attempts = mockDb.attempts.filter((a) => a.id !== id)
    mockDb.persist()
    return true
  }
  const db = requireAdminDb()
  const { error } = await db.from('attempts').delete().eq('id', id)
  if (error) throw error
  return true
}

export default {
  listExams,
  getExam,
  createExam,
  updateExam,
  deleteExam,
  listQuestions,
  bulkInsertQuestions,
  createExamWithQuestions,
  deleteQuestion,
  clearQuestions,
  listStudents,
  upsertStudents,
  updateStudent,
  deleteStudent,
  deleteStudentsByExam,
  findStudent,
  getMyExams,
  getPlayerPaper,
  submitExam,
  getResultReview,
  getAttempt,
  saveAttempt,
  listAttempts,
  deleteAttempt,
}
