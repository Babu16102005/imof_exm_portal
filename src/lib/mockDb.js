/**
 * IMOF mock DB — NEW shape mirrors supabase/schema.sql exactly.
 * Persisted to localStorage 'imof_mock_db'.
 */
import { normalizeClassGrade, isGradeInRange, classMismatchMessage, CLASS_MISMATCH_CODE } from './classGrade.js'

const STORAGE_KEY = 'imof_mock_db'

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function seedData() {
  const examId = 'exam-svmo-2026'
  return {
    exams: [
      {
        id: examId,
        code: 'IMOF-SVMO-2026',
        title: 'SVMO — Vedic Mathematics Olympiad 2026',
        olympiad: 'SVMO',
        class_from: 3,
        class_to: 10,
        duration_minutes: 60,
        total_questions: 5,
        marks_per_q: 1,
        status: 'published',
        start_at: null,
        end_at: null,
        instructions:
          'Answer all questions. Each question carries 1 mark. Do not refresh during the exam.',
      },
    ],
    questions: [
      {
        id: 'q-svmo-1',
        exam_id: examId,
        q_no: 1,
        question_text: 'What is 25 + 37?',
        option_a: '52',
        option_b: '62',
        option_c: '72',
        option_d: '60',
        correct_option: 'B',
        marks: 1,
      },
      {
        id: 'q-svmo-2',
        exam_id: examId,
        q_no: 2,
        question_text: 'What is 12 × 8?',
        option_a: '84',
        option_b: '96',
        option_c: '108',
        option_d: '92',
        correct_option: 'B',
        marks: 1,
      },
      {
        id: 'q-svmo-3',
        exam_id: examId,
        q_no: 3,
        question_text: 'Which is the smallest prime number?',
        option_a: '0',
        option_b: '1',
        option_c: '2',
        option_d: '3',
        correct_option: 'C',
        marks: 1,
      },
      {
        id: 'q-svmo-4',
        exam_id: examId,
        q_no: 4,
        question_text: 'What is 1/2 + 1/4?',
        option_a: '1/6',
        option_b: '2/6',
        option_c: '3/4',
        option_d: '1/4',
        correct_option: 'C',
        marks: 1,
      },
      {
        id: 'q-svmo-5',
        exam_id: examId,
        q_no: 5,
        question_text: 'Which number is divisible by both 3 and 4?',
        option_a: '7',
        option_b: '8',
        option_c: '12',
        option_d: '14',
        correct_option: 'C',
        marks: 1,
      },
    ],
    students: [
      {
        id: 'stu-demo001',
        user_id: 'demo001',
        password: 'mcq@imof',
        name: 'Demo Student',
        class: '5',
        school: 'IMOF Demo School',
        exam_id: examId,
        is_active: true,
      },
      {
        id: 'stu-demo002',
        user_id: 'demo002',
        password: 'mcq@imof',
        name: 'Demo Student Two',
        class: '6',
        school: 'IMOF Demo School',
        exam_id: examId,
        is_active: true,
      },
      {
        id: 'stu-demo003',
        user_id: 'demo003',
        password: 'mcq@imof',
        name: 'Demo Student Three',
        class: '7',
        school: 'IMOF Demo School',
        exam_id: examId,
        is_active: true,
      },
    ],
    attempts: [],
  }
}

function loadInitial() {
  try {
    if (typeof localStorage === 'undefined') return seedData()
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const seed = seedData()
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seed))
      } catch {
        /* ignore */
      }
      return seed
    }
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.exams)) return seedData()
    return {
      exams: parsed.exams || [],
      questions: parsed.questions || [],
      students: parsed.students || [],
      attempts: parsed.attempts || [],
    }
  } catch {
    return seedData()
  }
}

const _initial = loadInitial()

function persist() {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        exams: mockDb.exams,
        questions: mockDb.questions,
        students: mockDb.students,
        attempts: mockDb.attempts,
      }),
    )
  } catch {
    /* storage full / private mode — ignore */
  }
}

export const mockDb = {
  exams: _initial.exams,
  questions: _initial.questions,
  students: _initial.students,
  attempts: _initial.attempts,
  persist,
  reset() {
    const seed = seedData()
    mockDb.exams = seed.exams
    mockDb.questions = seed.questions
    mockDb.students = seed.students
    mockDb.attempts = seed.attempts
    persist()
    return mockDb
  },
}

export { STORAGE_KEY, uid, seedData }

/**
 * Mock class-gate guard (mirrors server RPC eligibility + dataService mock path).
 * Throws Error('Student is not eligible for this class exam') when the
 * student's normalized class falls outside exam.class_from..class_to.
 * Open exams (both null) pass for every grade, including unknown (null).
 */
export function assertMockClassEligibility(studentClass, exam) {
  const grade = normalizeClassGrade(studentClass)
  const ok = isGradeInRange(grade, exam?.class_from ?? null, exam?.class_to ?? null)
  if (!ok) {
    const err = new Error(classMismatchMessage(exam || null, grade))
    err.code = CLASS_MISMATCH_CODE
    throw err
  }
  return true
}

/**
 * Mock getPlayerPaper equivalent with class-gate enforcement.
 * Looks up exam by id/code, enforces eligibility when a studentId (or
 * student row) is known, and returns { exam, questions } sorted by q_no.
 */
export function getMockPlayerPaper(examId, studentId) {
  const exam = mockDb.exams.find((e) => e.id === examId || e.code === examId) || null
  if (!exam) return null
  if (studentId != null) {
    const stu = mockDb.students.find((s) => s.id === studentId) || null
    // Enforce only when the student is known; unknown callers (legacy admin
    // previews) skip the gate — dataService enforces when a hint is present.
    if (stu) assertMockClassEligibility(stu?.class, exam)
  }
  const questions = mockDb.questions
    .filter((q) => q.exam_id === exam.id)
    .sort((a, b) => (a.q_no || 0) - (b.q_no || 0))
  return { exam, questions }
}

export default mockDb
