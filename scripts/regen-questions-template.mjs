/**
 * Regen templates/questions_template.xlsx (exam-scoped, no exam_code).
 *
 * Mirrors the in-app download in src/pages/admin/Exams.jsx
 * (downloadTemplateXlsx) + src/lib/questionImport.js
 * (SCOPED_TEMPLATE_HEADER / buildScopedTemplateRows).
 *
 * Usage: node scripts/regen-questions-template.mjs
 */
import * as XLSX from 'xlsx'
import { buildScopedTemplateRows, SCOPED_TEMPLATE_HEADER } from '../src/lib/questionImport.js'

const rows = buildScopedTemplateRows()
const aoa = [
  SCOPED_TEMPLATE_HEADER,
  ...rows.map((r) => [
    r.q_no,
    r.question_text,
    r.option_a,
    r.option_b,
    r.option_c,
    r.option_d,
    r.correct_option,
    r.marks,
  ]),
]

const wb = XLSX.utils.book_new()
const ws = XLSX.utils.aoa_to_sheet(aoa)
ws['!cols'] = [
  { wch: 8 },
  { wch: 44 },
  { wch: 16 },
  { wch: 16 },
  { wch: 16 },
  { wch: 16 },
  { wch: 15 },
  { wch: 8 },
]
XLSX.utils.book_append_sheet(wb, ws, 'Questions')
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ['Column', 'Required', 'Rule'],
    ['q_no', 'No', 'Positive integer, unique within the exam (defaults to row order)'],
    ['question_text', 'YES', 'Plain text of the question'],
    ['option_a / b / c / d', 'YES', 'All 4 options required'],
    ['correct_option', 'YES', 'Exactly one letter: A, B, C or D'],
    ['marks', 'No', 'Number 0 or more (default 1)'],
    ['Note', '', 'Questions belong to the exam you create - no exam_code needed.'],
  ]),
  'Instructions',
)

XLSX.writeFile(wb, 'templates/questions_template.xlsx')
console.log('Wrote templates/questions_template.xlsx (scoped, no exam_code)')
