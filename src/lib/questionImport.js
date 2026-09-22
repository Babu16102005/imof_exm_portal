/**
 * Shared, exam-scoped question import logic.
 *
 * Used by the admin exam wizard (and any future importer) to validate
 * spreadsheet rows BEFORE they reach dataService.bulkInsertQuestions().
 *
 * Design rules:
 * - Pure functions only: no XLSX import, no FileReader, no DOM. Callers
 *   parse the file (XLSX / CSV) into row objects first (e.g. via
 *   XLSX.utils.sheet_to_json) and pass the array here. Fully unit-testable.
 * - Exam scoping comes from the wizard's selected examId. A legacy
 *   `exam_code` column in the sheet is IGNORED (never returned); when one
 *   is detected `hadExamCode` is set so the UI can show a notice.
 * - Sanitisation here is trim + strip <script> blocks/tags
 *   (defence-in-depth against stored XSS; React escapes text on render).
 *   Formula-looking cell values (=, +, - leading) are NOT rejected — maths
 *   content may legitimately start with those characters.
 */

export const LETTERS = ['A', 'B', 'C', 'D']

/** Max accepted upload size for question files (5 MB). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024

/** Max question rows per import. Enforced here and in dataService. */
export const MAX_ROWS = 1000

/** Accepted file extensions for question imports. */
export const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv']

/** Canonical scoped-template column order (no exam_code). */
export const SCOPED_TEMPLATE_HEADER = [
  'q_no',
  'question_text',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'correct_option',
  'marks',
]

/** Trimmed string form of any cell value (null-safe). */
export const norm = (v) => String(v ?? '').trim()

/** Normalised header key: lowercase with spaces/underscores removed. */
export const nkey = (k) =>
  String(k ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '')

const SCRIPT_BLOCK_RE = /<script.*?>.*?<\/script\s*>/gis
const SCRIPT_TAG_RE = /<\/?script[^>]*>/gi

/**
 * Trim + strip <script> blocks and stray script tags.
 * Keeps the remaining text (escaped later at render time).
 */
export function sanitizeText(v) {
  return String(v ?? '').replace(SCRIPT_BLOCK_RE, '').replace(SCRIPT_TAG_RE, '').trim()
}

/** Map arbitrary header casing/spacing to canonical lookup keys. */
function normaliseKeys(row) {
  const out = {}
  if (!row || typeof row !== 'object') return out
  for (const [k, v] of Object.entries(row)) out[nkey(k)] = v
  return out
}

/**
 * Back-compat mapping for numeric answers (trimmed + upper-cased first):
 * legacy 0-based files use 0-3 -> A-D; some 1-based files use 1-4 -> A-D.
 * Historic rule (kept): 0->A, 1->B, 2->C, 3->D, 4->D.
 * Returns the mapped letter, a valid A-D letter, or the raw value when
 * invalid (caller records an error).
 */
function mapCorrectOption(raw) {
  const v = norm(raw).toUpperCase()
  if (LETTERS.includes(v)) return v
  if (['0', '1', '2', '3'].includes(v)) return LETTERS[Number(v)]
  if (v === '4') return 'D'
  return v
}

/**
 * Validate already-parsed sheet rows (array of objects, header row excluded).
 *
 * Returns { rows, errors, hadExamCode }:
 * - rows: one entry PER input row (valid or not) shaped for
 *   bulkInsertQuestions(), each with `_line` (1-based incl. header) and
 *   `_errors` (array of "Row X: ..." messages for that row). Import only
 *   rows with `_errors.length === 0`.
 * - errors: flat list of "Row X: msg" strings in sheet order.
 * - hadExamCode: true when a legacy exam_code/code column was present
 *   (ignored — exam scope comes from the wizard examId).
 * - When input exceeds MAX_ROWS, rows is [] with a single cap error.
 */
export function parseQuestionRows(rawArray) {
  const raw = Array.isArray(rawArray) ? rawArray : []

  let hadExamCode = false
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    for (const k of Object.keys(row)) {
      const nk = nkey(k)
      if (nk === 'examcode' || nk === 'code') {
        hadExamCode = true
        break
      }
    }
    if (hadExamCode) break
  }

  if (raw.length > MAX_ROWS) {
    return {
      rows: [],
      errors: [
        `Too many rows: ${raw.length} (max ${MAX_ROWS}). Split the file and import in parts.`,
      ],
      hadExamCode,
    }
  }

  const rows = []
  const errors = []

  raw.forEach((row, i) => {
    const line = i + 2 // 1-based + header row
    const r = normaliseKeys(row)
    const rowErrors = []

    // NOTE: exam_code / code column deliberately ignored here.
    const question_text = sanitizeText(r.questiontext ?? r.text ?? r.question ?? r.q)
    const option_a = sanitizeText(r.optiona ?? r.a)
    const option_b = sanitizeText(r.optionb ?? r.b)
    const option_c = sanitizeText(r.optionc ?? r.c)
    const option_d = sanitizeText(r.optiond ?? r.d)
    const correct_option = mapCorrectOption(r.correctoption ?? r.correct ?? r.answer)

    // q_no: defaults to sheet order (i+1); must be a positive integer.
    const qRaw = norm(r.qno ?? r.no)
    let q_no = qRaw === '' ? i + 1 : Number(qRaw)
    if (!Number.isFinite(q_no) || !Number.isInteger(q_no) || q_no <= 0) {
      rowErrors.push(`Row ${line}: q_no must be a positive integer (default ${i + 1})`)
      q_no = i + 1
    }

    // marks: defaults to 1; must be >= 0 (explicit 0 allowed).
    const mRaw = norm(r.marks)
    let marks = mRaw === '' ? 1 : Number(mRaw)
    if (!Number.isFinite(marks) || marks < 0) {
      rowErrors.push(`Row ${line}: marks must be >= 0 (default 1)`)
      marks = 1
    }

    if (!question_text) rowErrors.push(`Row ${line}: question text is required`)
    if (!option_a || !option_b || !option_c || !option_d)
      rowErrors.push(`Row ${line}: all 4 options (A–D) are required`)
    if (!LETTERS.includes(correct_option))
      rowErrors.push(`Row ${line}: correct_option must be A/B/C/D`)

    rows.push({
      q_no,
      question_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option,
      marks,
      _line: line,
      _errors: rowErrors,
    })
    errors.push(...rowErrors)
  })

  // Duplicate q_no corrupts Player answers/scores (keyed by q_no).
  // Mark every row sharing a q_no as invalid so callers skip them.
  const qNoCounts = {}
  for (const r of rows) qNoCounts[r.q_no] = (qNoCounts[r.q_no] || 0) + 1
  for (const r of rows) {
    if (qNoCounts[r.q_no] > 1) {
      const msg = `Row ${r._line}: duplicate q_no ${r.q_no} (must be unique within the exam)`
      r._errors.push(msg)
      errors.push(msg)
    }
  }

  return { rows, errors, hadExamCode }
}

/**
 * Validate a browser File before parsing.
 * Throws a user-facing Error when the type/size is unacceptable.
 */
export function validateFile(file) {
  if (!file) throw new Error('No file selected. Choose an .xlsx, .xls or .csv file.')
  const name = String(file.name || '')
  const lower = name.toLowerCase()
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw new Error(
      `Unsupported file type "${name || 'unknown'}". Use one of: ${ALLOWED_EXTENSIONS.join(', ')}.`,
    )
  }
  if (typeof file.size === 'number' && file.size > MAX_FILE_BYTES) {
    throw new Error(
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB (max ${MAX_FILE_BYTES / 1024 / 1024} MB).`,
    )
  }
  return true
}

/**
 * Two sample rows for the exam-scoped template download.
 * No exam_code — the wizard binds the import to its selected exam.
 */
export function buildScopedTemplateRows() {
  return [
    {
      q_no: 1,
      question_text: 'What is 12 × 8?',
      option_a: '84',
      option_b: '96',
      option_c: '108',
      option_d: '92',
      correct_option: 'B',
      marks: 1,
    },
    {
      q_no: 2,
      question_text: 'Which is the smallest prime number?',
      option_a: '0',
      option_b: '1',
      option_c: '2',
      option_d: '3',
      correct_option: 'C',
      marks: 1,
    },
  ]
}

export default {
  LETTERS,
  MAX_FILE_BYTES,
  MAX_ROWS,
  ALLOWED_EXTENSIONS,
  SCOPED_TEMPLATE_HEADER,
  norm,
  nkey,
  sanitizeText,
  parseQuestionRows,
  validateFile,
  buildScopedTemplateRows,
}
