import * as XLSX from 'xlsx'

function sheetToJson(file, { headerRow = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, {
          defval: '',
          range: headerRow,
        })
        resolve(rows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

function rowsFromFile(file) {
  return sheetToJson(file)
}

/** Resolve File-or-rows input so parsers are unit-testable without FileReader. */
async function resolveRows(input) {
  if (Array.isArray(input)) return input
  return rowsFromFile(input)
}

const norm = (v) => String(v ?? '').trim()
const normKey = (k) => String(k ?? '').trim().toLowerCase().replace(/[\s_]+/g, '')

/** Map arbitrary header casing to canonical keys. */
function normaliseKeys(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) out[normKey(k)] = v
  return out
}

/**
 * Expected student columns (case-insensitive, matches
 * templates/students_template.csv and the admin Students page):
 * user_id | password | name | class | school | exam_code | is_active
 *
 * Accepts a browser File (.xlsx/.xls/.csv) OR an array of row objects
 * (from XLSX.utils.sheet_to_json) so the mapping is unit-testable.
 * Returns rows shaped for upsertStudents(): the admin page resolves
 * exam_code → exam_id before saving.
 */
export async function parseStudentsExcel(input) {
  const raw = await resolveRows(input)
  const students = []
  const errors = []

  raw.forEach((row, i) => {
    const line = i + 2 // 1-based + header
    const r = normaliseKeys(row)
    const user_id = norm(r.userid ?? r.username ?? r.rollno ?? r.roll)
    const password = norm(r.password ?? r.pass) || 'mcq@imof'
    const name = norm(r.name ?? r.studentname)
    const cls = norm(r.class ?? r.grade ?? r.std)
    const school = norm(r.school ?? r.schoolname)
    const exam_code = norm(r.examcode ?? r.code)
    const is_active = norm(r.isactive ?? r.active ?? 'true').toLowerCase() !== 'false'

    if (!user_id) errors.push(`Row ${line}: user_id is required`)
    else if (user_id.length < 3) errors.push(`Row ${line}: user_id min 3 chars`)
    if (!name) errors.push(`Row ${line}: name is required`)

    if (user_id && name)
      students.push({ user_id, password, name, class: cls, school, exam_code, is_active })
  })

  return { students, errors }
}

/**
 * Expected question columns (case-insensitive):
 * q_no | question_text | option_a | option_b | option_c | option_d | correct_option (A-D) | marks
 *
 * NOTE: exam scoping comes from the wizard's examId — a legacy exam_code
 * column in the sheet is intentionally IGNORED and never returned.
 *
 * Accepts a browser File OR an array of row objects.
 * Returns rows shaped for bulkInsertQuestions().
 */
const LETTERS = ['A', 'B', 'C', 'D']

export async function parseQuestionsExcel(input) {
  const raw = await resolveRows(input)
  const questions = []
  const errors = []

  raw.forEach((row, i) => {
    const line = i + 2
    const r = normaliseKeys(row)
    const question_text = norm(r.questiontext ?? r.text ?? r.question ?? r.q)
    const option_a = norm(r.optiona ?? r.a)
    const option_b = norm(r.optionb ?? r.b)
    const option_c = norm(r.optionc ?? r.c)
    const option_d = norm(r.optiond ?? r.d)
    let correct_option = norm(r.correctoption ?? r.correct ?? r.answer).toUpperCase()
    // Back-compat: numeric 0-3 / 1-4 answers map to A-D
    if (['0', '1', '2', '3'].includes(correct_option))
      correct_option = LETTERS[Number(correct_option)]
    else if (correct_option === '4') correct_option = 'D'
    const q_no = Number(norm(r.qno ?? r.no) || i + 1) || i + 1
    // exam_code (if present) is ignored — exam scoping is via wizard examId.
    const marks = Number(norm(r.marks) || 1) || 1

    if (!question_text) errors.push(`Row ${line}: question text is required`)
    if (!option_a || !option_b || !option_c || !option_d)
      errors.push(`Row ${line}: all 4 options (A–D) are required`)
    if (!LETTERS.includes(correct_option))
      errors.push(`Row ${line}: correct_option must be A/B/C/D`)

    if (question_text && option_a && option_b && option_c && option_d && LETTERS.includes(correct_option))
      questions.push({ q_no, question_text, option_a, option_b, option_c, option_d, correct_option, marks })
  })

  return { questions, errors }
}

export default { parseStudentsExcel, parseQuestionsExcel }
