-- ============================================================================
-- IMOF Exam Portal — Seed Data (demo / MVP)
-- File: supabase/seed.sql
-- Run AFTER supabase/schema.sql in Supabase Dashboard > SQL Editor.
-- Idempotent: safe to re-run (uses ON CONFLICT upserts).
-- Contents:
--   1 published demo exam  : IMOF-SVMO-2026 (SVMO, class 1-10, 30 min, 10 Qs)
--   10 sample maths/science MCQs for that exam
--   3 demo students        : demo001/demo123, demo002/demo123, demo003/demo123
--   1 admin                : admin/imof2026
-- NOTE: passwords are PLAINTEXT for MVP demo only. Hash before production.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Demo exam (this IS the "1 sample published exam")
-- ----------------------------------------------------------------------------
INSERT INTO public.exams (
  code, title, olympiad, class_from, class_to,
  duration_minutes, total_questions, marks_per_q, negative_marks,
  instructions, status, start_at, end_at
) VALUES (
  'IMOF-SVMO-2026',
  'SVMO Demo Olympiad 2026',
  'SVMO',
  1, 10,
  30, 10, 1, 0,
  'Demo exam: 10 questions, 30 minutes. Each question carries 1 mark. No negative marking. Do not refresh during the exam.',
  'published',
  now() - INTERVAL '1 day',
  now() + INTERVAL '90 days'
)
ON CONFLICT (code) DO UPDATE SET
  title            = EXCLUDED.title,
  olympiad         = EXCLUDED.olympiad,
  class_from       = EXCLUDED.class_from,
  class_to         = EXCLUDED.class_to,
  duration_minutes = EXCLUDED.duration_minutes,
  total_questions  = EXCLUDED.total_questions,
  marks_per_q      = EXCLUDED.marks_per_q,
  negative_marks   = EXCLUDED.negative_marks,
  instructions     = EXCLUDED.instructions,
  status           = EXCLUDED.status,
  start_at         = EXCLUDED.start_at,
  end_at           = EXCLUDED.end_at;

-- ----------------------------------------------------------------------------
-- 2) 10 sample maths/science MCQs (mixed difficulty, classes 1-10 friendly)
-- ----------------------------------------------------------------------------
-- Upsert key is (exam_id, q_no), so re-running updates text/options in place.
INSERT INTO public.questions (
  exam_id, q_no, question_text,
  option_a, option_b, option_c, option_d,
  correct_option, marks
) VALUES
  ((SELECT id FROM public.exams WHERE code = 'IMOF-SVMO-2026'), 1,
   'What is 25 + 37?',
   '52', '62', '72', '60', 'B', 1),
  ((SELECT id FROM public.exams WHERE code = 'IMOF-SVMO-2026'), 2,
   'What is 1/2 + 1/4?',
   '2/6', '3/4', '1/6', '2/4', 'B', 1),
  ((SELECT id FROM public.exams WHERE code = 'IMOF-SVMO-2026'), 3,
   'Which planet is known as the Red Planet?',
   'Venus', 'Jupiter', 'Mars', 'Mercury', 'C', 1),
  ((SELECT id FROM public.exams WHERE code = 'IMOF-SVMO-2026'), 4,
   'What is 9 x 7?',
   '63', '56', '72', '54', 'A', 1),
  ((SELECT id FROM public.exams WHERE code = 'IMOF-SVMO-2026'), 5,
   'Which gas do plants absorb from the air for photosynthesis?',
   'Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen', 'C', 1),
  ((SELECT id FROM public.exams WHERE code = 'IMOF-SVMO-2026'), 6,
   'What is the perimeter of a square with side 9 cm?',
   '18 cm', '27 cm', '36 cm', '81 cm', 'C', 1),
  ((SELECT id FROM public.exams WHERE code = 'IMOF-SVMO-2026'), 7,
   'Which of the following numbers is a prime number?',
   '21', '27', '29', '33', 'C', 1),
  ((SELECT id FROM public.exams WHERE code = 'IMOF-SVMO-2026'), 8,
   'What is the boiling point of water at sea level?',
   '90°C', '95°C', '100°C', '110°C', 'C', 1),
  ((SELECT id FROM public.exams WHERE code = 'IMOF-SVMO-2026'), 9,
   'What is 3/5 of 100?',
   '30', '35', '50', '60', 'D', 1),
  ((SELECT id FROM public.exams WHERE code = 'IMOF-SVMO-2026'), 10,
   'Which force pulls objects towards the Earth?',
   'Friction', 'Gravity', 'Magnetism', 'Tension', 'B', 1)
ON CONFLICT (exam_id, q_no) DO UPDATE SET
  question_text  = EXCLUDED.question_text,
  option_a       = EXCLUDED.option_a,
  option_b       = EXCLUDED.option_b,
  option_c       = EXCLUDED.option_c,
  option_d       = EXCLUDED.option_d,
  correct_option = EXCLUDED.correct_option,
  marks          = EXCLUDED.marks;

-- Keep total_questions metadata in sync with reality (admin can edit after).
UPDATE public.exams e
SET total_questions = q.cnt
FROM (SELECT exam_id, COUNT(*)::INT AS cnt FROM public.questions GROUP BY exam_id) q
WHERE e.id = q.exam_id AND e.code = 'IMOF-SVMO-2026';

-- ----------------------------------------------------------------------------
-- 3) Demo students (all assigned to IMOF-SVMO-2026, active)
-- ----------------------------------------------------------------------------
INSERT INTO public.students (user_id, password, name, class, school, exam_id, is_active) VALUES
  ('demo001', 'demo123', 'Demo Student One',   '5', 'SVMO Demo School', (SELECT id FROM public.exams WHERE code = 'IMOF-SVMO-2026'), true),
  ('demo002', 'demo123', 'Demo Student Two',   '6', 'SVMO Demo School', (SELECT id FROM public.exams WHERE code = 'IMOF-SVMO-2026'), true),
  ('demo003', 'demo123', 'Demo Student Three', '7', 'SVMO Demo School', (SELECT id FROM public.exams WHERE code = 'IMOF-SVMO-2026'), true)
ON CONFLICT (user_id) DO UPDATE SET
  password  = EXCLUDED.password,
  name      = EXCLUDED.name,
  class     = EXCLUDED.class,
  school    = EXCLUDED.school,
  exam_id   = EXCLUDED.exam_id,
  is_active = EXCLUDED.is_active;

-- ----------------------------------------------------------------------------
-- 4) Admin login (MVP plaintext — change immediately after first login)
-- ----------------------------------------------------------------------------
INSERT INTO public.admins (admin_id, password) VALUES
  ('admin', 'imof2026')
ON CONFLICT (admin_id) DO UPDATE SET
  password = EXCLUDED.password;

-- ----------------------------------------------------------------------------
-- Verify (result grid in SQL Editor should show 1 exam, 10 Qs, 3 students):
-- ----------------------------------------------------------------------------
-- SELECT code, title, olympiad, status, total_questions FROM public.exams;
-- SELECT q_no, left(question_text, 40), correct_option FROM public.questions
--   WHERE exam_id = (SELECT id FROM public.exams WHERE code='IMOF-SVMO-2026')
--   ORDER BY q_no;
-- SELECT user_id, name, class, is_active FROM public.students ORDER BY user_id;
-- SELECT admin_id FROM public.admins;
