/**
 * Class / grade helpers — canonical client-side mirror of SQL `try_parse_class()`.
 *
 * Why this file exists:
 *  - `students.class` is free-form TEXT ('5', 'Class 5', 'Grade 5', 'V', ...).
 *  - `exams.class_from / class_to` are INT range bounds (NULL = open to all).
 *  - Both the mock DB path and the RPC safety-net path in
 *    `src/services/dataService.js` need the SAME parsing rule, and the
 *    Supabase RPCs (`get_my_exams` / `get_exam_paper` / `submit_attempt`)
 *    enforce the same rule server-side via `try_parse_class()`.
 *
 * SQL parity — the server function this mirrors (for the DB/RPC owner):
 * (see supabase/class-visibility.sql §1a — numeric + roman only, no words)
 *
 * ```sql
 * CREATE OR REPLACE FUNCTION public.try_parse_class(p_input TEXT)
 * RETURNS INT
 * LANGUAGE plpgsql IMMUTABLE AS $$
 * DECLARE v_trimmed TEXT; v_lower TEXT; v_num_text TEXT; v_num INT; v_roman TEXT;
 * BEGIN
 *   IF p_input IS NULL THEN RETURN NULL; END IF;
 *   v_trimmed := btrim(p_input);
 *   IF v_trimmed = '' THEN RETURN NULL; END IF;
 *   -- 1) First embedded number 1..12 wins ('Class 5', 'Grade 5', '5th', 'Std 5').
 *   v_num_text := substring(v_trimmed from '([0-9]{1,2})');
 *   IF v_num_text IS NOT NULL AND v_num_text <> '' THEN
 *     v_num := v_num_text::INT;
 *     IF v_num BETWEEN 1 AND 12 THEN RETURN v_num; ELSE RETURN NULL; END IF;
 *   END IF;
 *   -- 2) Roman numerals I..XII (case-insensitive, exact or standalone token).
 *   -- 3) Otherwise NULL (unparseable => treated as unknown grade).
 *   RETURN NULL;
 * END; $$;
 * ```
 *
 * JS contract:
 *  - `normalizeClassGrade(raw)` -> INT 1..12, or NULL when unknown.
 *  - `isGradeInRange(grade, classFrom, classTo)` -> boolean. Open exams
 *    (both bounds NULL) are visible to everyone; ranged exams require a
 *    known grade inside [from, to] (strict: unknown grade => false).
 */

export const CLASS_MISMATCH_CODE = 'CLASS_MISMATCH'

const ROMAN_TO_INT = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
}

/**
 * Parse a free-form class label to a grade 1..12.
 * Mirrors SQL `try_parse_class()`:
 *  1) numbers first (first `\d{1,2}` in range 1..12 wins),
 *  2) then ROMAN tokens I..XII,
 *  3) else NULL.
 *
 * @param {unknown} raw - students.class value (TEXT) or a number.
 * @returns {number|null} grade 1..12, or null when unknown/unparseable.
 */
export function normalizeClassGrade(raw) {
  if (raw == null) return null
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    const n = Math.trunc(raw)
    return n >= 1 && n <= 12 ? n : null
  }
  const s = String(raw).trim().toUpperCase()
  if (!s) return null

  // 1) First embedded number 1..12 wins. Out-of-range numbers (0, 13+)
  //    mean "not a school grade" => NULL (do NOT fall through to roman).
  const m = s.match(/(\d{1,2})/)
  if (m) {
    const n = parseInt(m[1], 10)
    return n >= 1 && n <= 12 ? n : null
  }

  // 2) Roman numerals, matched as standalone tokens
  //    so 'CIVIL' does not parse as 'IV'.
  const tokens = s.split(/[^A-Z]+/).filter(Boolean)
  for (const t of tokens) {
    if (ROMAN_TO_INT[t] != null) return ROMAN_TO_INT[t]
  }
  return null
}

function toBound(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Strict range check for an already-normalized grade.
 *  - No bounds (both NULL) => true (open to all, incl. unknown grades).
 *  - Ranged exam + unknown grade (null) => false (strict).
 *  - Otherwise grade must satisfy from <= grade <= to (null bound = open).
 *
 * @param {number|null} grade - normalized grade 1..12, or null.
 * @param {unknown} classFrom - exams.class_from (INT|null).
 * @param {unknown} classTo - exams.class_to (INT|null).
 * @returns {boolean}
 */
export function isGradeInRange(grade, classFrom, classTo) {
  const from = toBound(classFrom)
  const to = toBound(classTo)
  if (from == null && to == null) return true
  if (grade == null || grade < 1 || grade > 12) return false
  if (from != null && to != null && from > to) return false
  if (from != null && grade < from) return false
  if (to != null && grade > to) return false
  return true
}

/**
 * Convenience: is this exam row visible to this grade?
 * Accepts either an already-normalized grade or a raw class label
 * (raw labels are normalized internally).
 *
 * @param {object} exam - exam row with class_from / class_to.
 * @param {number|string|null} gradeOrRaw - normalized grade or raw label.
 * @returns {boolean}
 */
export function isExamVisibleForGrade(exam, gradeOrRaw) {
  if (!exam) return false
  const grade =
    typeof gradeOrRaw === 'number' || gradeOrRaw == null
      ? gradeOrRaw
      : normalizeClassGrade(gradeOrRaw)
  return isGradeInRange(grade ?? null, exam.class_from, exam.class_to)
}

/**
 * Human-readable eligibility message for CLASS_MISMATCH errors.
 * Always contains the canonical phrase
 * 'Student is not eligible for this class exam' (client + tests match on
 * this substring) plus range/code context when available.
 * @param {object|null} exam - exam row (for range + code context).
 * @param {number|null} grade - normalized student grade (null = unknown).
 * @returns {string}
 */
export function classMismatchMessage(exam, grade) {
  const base = 'Student is not eligible for this class exam'
  const from = exam?.class_from ?? null
  const to = exam?.class_to ?? null
  let range = ''
  if (from != null && to != null && from !== to) range = `Class ${from}\u2013${to}`
  else if (from != null || to != null) range = `Class ${from ?? to}`
  const code = exam?.code ? ` [${exam.code}]` : ''
  const yours = grade != null ? `Your class (${grade}) is` : 'Your class is'
  if (range) return `${base}${code} — this exam is for ${range}. ${yours} not eligible. (CLASS_MISMATCH)`
  return `${base}${code}. (CLASS_MISMATCH)`
}

/**
 * Human label for an exam's class window (client badge/meta).
 *  - both null      => 'All classes'
 *  - from == to     => 'Class X'
 *  - range          => 'Class A–B' (en dash)
 *  - one side only  => 'Class X+' / 'Class up to Y'
 */
export function formatClassLabel(exam) {
  const a = toBound(exam?.class_from ?? null)
  const b = toBound(exam?.class_to ?? null)
  if (a == null && b == null) return 'All classes'
  if (a != null && b != null) {
    if (a === b) return `Class ${a}`
    return `Class ${a}\u2013${b}`
  }
  if (a != null) return `Class ${a}+`
  return `Class up to ${b}`
}

/**
 * Convenience: normalize a raw student class then range-check an exam row.
 * Open exams (both bounds null) pass for every grade, including null.
 */
export function isEligibleForExam(studentClass, exam) {
  if (!exam) return false
  return isGradeInRange(
    normalizeClassGrade(studentClass),
    exam?.class_from ?? null,
    exam?.class_to ?? null,
  )
}

export default { normalizeClassGrade, isGradeInRange, isExamVisibleForGrade, classMismatchMessage, formatClassLabel, isEligibleForExam, CLASS_MISMATCH_CODE }
