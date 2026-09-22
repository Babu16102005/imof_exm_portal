/** Fisher–Yates shuffle (non-mutating). */
export function shuffle(arr = []) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Score an exam.
 * Supports the canonical schema shape (correct_option 'A'–'D', answers keyed
 * by q_no as used in Player.jsx / Result.jsx) as well as the legacy shape
 * ({ id, correct_index: 0-3 }, answers keyed by question id).
 * @param {Array} questions [{ id?, q_no?, correct_option?, correct_index?, marks? }]
 * @param {Record<string, string|number>} answers { [questionId|q_no]: 'A'|'B'|'C'|'D'|0-3 }
 * @returns {{ score:number, total:number, correct:number, attempted:number }}
 */
const INDEX_TO_LETTER = ['A', 'B', 'C', 'D']

function toLetter(v) {
  if (v === undefined || v === null || v === '') return null
  const s = String(v).trim().toUpperCase()
  if (['A', 'B', 'C', 'D'].includes(s)) return s
  // Accept legacy numeric answers: 0-3 (0-based) or 1-4 (1-based)
  if (['0', '1', '2', '3'].includes(s)) return INDEX_TO_LETTER[Number(s)]
  if (s === '4') return 'D'
  return s
}

export function scoreExam(questions = [], answers = {}) {
  let score = 0
  let total = 0
  let correct = 0
  let attempted = 0

  for (const q of questions) {
    const marks = Number(q.marks ?? 1)
    total += marks
    const givenRaw =
      answers[q.id] ?? answers[String(q.q_no)] ?? answers[q.q_no] ?? null
    if (givenRaw !== undefined && givenRaw !== null && givenRaw !== '') {
      attempted += 1
      const expected = q.correct_option != null && q.correct_option !== ''
        ? String(q.correct_option).trim().toUpperCase()
        : INDEX_TO_LETTER[Number(q.correct_index)] ?? null
      // Compare as letters; fall back to raw numeric equality for legacy data
      const givenLetter = toLetter(givenRaw)
      if (
        (expected && givenLetter === expected) ||
        Number(givenRaw) === Number(q.correct_index ?? NaN)
      ) {
        score += marks
        correct += 1
      }
    }
  }

  return { score, total, correct, attempted }
}

/** mm:ss formatter for countdown timers. */
export function formatTime(totalSeconds = 0) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export default { shuffle, scoreExam, formatTime }
