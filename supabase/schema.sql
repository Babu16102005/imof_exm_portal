-- ============================================================================
-- IMOF Exam Portal — Supabase Schema (MVP, production-ready baseline)
-- File: supabase/schema.sql
-- Run: Supabase Dashboard > SQL Editor > New Query > paste this file > Run
-- Rerunnable: uses IF NOT EXISTS / ON CONFLICT-safe patterns where possible.
-- ============================================================================

-- Required for gen_random_uuid() as UUID PK default.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- Table: exams
-- One row per olympiad exam paper (e.g. IMOF-SVMO-2026).
-- total_questions is ADMIN-MAINTAINED metadata (see README + footer note).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exams (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT        UNIQUE NOT NULL,
  title           TEXT,
  olympiad        TEXT,
  class_from      INT         CHECK (class_from IS NULL OR class_from >= 1),
  class_to        INT         CHECK (class_to IS NULL OR class_to >= 1),
  duration_minutes INT        CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  total_questions INT         CHECK (total_questions IS NULL OR total_questions > 0),
  marks_per_q     NUMERIC     NOT NULL DEFAULT 1 CHECK (marks_per_q >= 0),
  negative_marks  NUMERIC     NOT NULL DEFAULT 0 CHECK (negative_marks >= 0),
  instructions    TEXT,
  status          TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'closed', 'archived')),
  start_at        TIMESTAMPTZ,
  end_at          TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (class_from IS NULL OR class_to IS NULL OR class_from <= class_to),
  CHECK (start_at IS NULL OR end_at IS NULL OR start_at < end_at)
);

COMMENT ON TABLE public.exams IS 'Exam papers. code is the human key used by CSV imports (e.g. IMOF-SVMO-2026).';
COMMENT ON COLUMN public.exams.code IS 'Unique human-readable exam code. Used by import templates as exam_code.';
COMMENT ON COLUMN public.exams.total_questions IS 'Admin-maintained intended question count. Keep in sync with questions rows (see README).';
COMMENT ON COLUMN public.exams.status IS 'Workflow: draft -> published -> closed (-> archived). Student app should only list published exams within window.';

-- ----------------------------------------------------------------------------
-- Table: questions
-- MCQ bank rows belonging to one exam. (exam_id, q_no) is unique.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.questions (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id        UUID    NOT NULL REFERENCES public.exams (id) ON DELETE CASCADE,
  q_no           INT     NOT NULL CHECK (q_no > 0),
  question_text  TEXT    NOT NULL,
  option_a       TEXT    NOT NULL,
  option_b       TEXT    NOT NULL,
  option_c       TEXT    NOT NULL,
  option_d       TEXT    NOT NULL,
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  marks          NUMERIC NOT NULL DEFAULT 1 CHECK (marks >= 0),
  UNIQUE (exam_id, q_no)
);

COMMENT ON TABLE public.questions IS 'MCQ bank. Each row is one question for an exam, ordered by q_no.';
COMMENT ON COLUMN public.questions.correct_option IS 'One of A/B/C/D. Must match option_a..d.';

-- ----------------------------------------------------------------------------
-- Table: students
-- Demo-login model for MVP: user_id + password (plaintext, see WARNING below).
-- exam_id = default/assigned exam for the student (nullable so a student can
-- exist before assignment; SET NULL if the exam is deleted).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.students (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        UNIQUE NOT NULL CHECK (char_length(user_id) >= 3),
  password   TEXT        NOT NULL,
  name       TEXT,
  class      TEXT,
  school     TEXT,
  exam_id    UUID        REFERENCES public.exams (id) ON DELETE SET NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.students IS 'Student login accounts (MVP custom auth, NOT Supabase Auth).';
COMMENT ON COLUMN public.students.user_id IS 'Login username, e.g. demo001. Case-sensitive; trim on import.';
COMMENT ON COLUMN public.students.password IS 'WARNING: plaintext for MVP demo only. TODO: store bcrypt/scrypt hash.';
COMMENT ON COLUMN public.students.exam_id IS 'Assigned exam. Nullable; cleared (SET NULL) if exam deleted.';

-- ----------------------------------------------------------------------------
-- Table: attempts
-- One row per (student, exam) pair. answers is a JSONB map: {"1":"A","2":"C"}.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attempts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID        NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  exam_id      UUID        NOT NULL REFERENCES public.exams (id) ON DELETE CASCADE,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  score        NUMERIC     CHECK (score IS NULL OR score >= 0),
  answers      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (student_id, exam_id),
  CHECK (submitted_at IS NULL OR submitted_at >= started_at)
);

COMMENT ON TABLE public.attempts IS 'One attempt per student per exam. answers JSONB maps q_no -> chosen option.';
COMMENT ON COLUMN public.attempts.answers IS 'Example: {"1":"A","2":"C"}. Keys are q_no as text.';

-- ----------------------------------------------------------------------------
-- Table: admins
-- MVP admin login (custom user_id + password, NOT Supabase Auth).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admins (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   TEXT        UNIQUE NOT NULL CHECK (char_length(admin_id) >= 3),
  password   TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admins IS 'Admin login accounts (MVP custom auth).';
COMMENT ON COLUMN public.admins.password IS 'WARNING: plaintext for MVP demo only. TODO: store hash + move to Supabase Auth / RPC.';

-- ============================================================================
-- Indexes (query hot paths: login lookups, exam question lists, result boards)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_exams_code     ON public.exams (code);
CREATE INDEX IF NOT EXISTS idx_exams_status   ON public.exams (status);
CREATE INDEX IF NOT EXISTS idx_exams_olympiad ON public.exams (olympiad);

CREATE INDEX IF NOT EXISTS idx_questions_exam_id  ON public.questions (exam_id);
CREATE INDEX IF NOT EXISTS idx_questions_exam_qno ON public.questions (exam_id, q_no);

CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students (user_id);
CREATE INDEX IF NOT EXISTS idx_students_exam_id ON public.students (exam_id);
CREATE INDEX IF NOT EXISTS idx_students_active  ON public.students (is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_attempts_student_id ON public.attempts (student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_exam_id   ON public.attempts (exam_id);
-- Leaderboard / result export: top scores per exam.
CREATE INDEX IF NOT EXISTS idx_attempts_exam_score ON public.attempts (exam_id, score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_admins_admin_id ON public.admins (admin_id);

-- ============================================================================
-- Row Level Security (RLS) — MVP PERMISSIVE MODE
-- ----------------------------------------------------------------------------
-- WARNING: The policies below allow the anon key FULL read/write on all
-- tables so the MVP works without Supabase Auth / backend tokens.
-- DO NOT ship to real students with these policies.
-- TODO (hardening before production):
--   1) Enable Supabase Auth (or keep custom login ONLY via service_role).
--   2) Drop these permissive policies; replace with least-privilege policies.
--   3) Move login + scoring + submit into SECURITY DEFINER RPC functions
--      (e.g. rpc_student_login, rpc_submit_attempt) that validate inputs,
--      enforce exam windows, and never expose correct_option / passwords
--      to the client. Frontend should use only the anon key + RPC.
-- ============================================================================
ALTER TABLE public.exams    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mvp_anon_all_exams" ON public.exams;
CREATE POLICY "mvp_anon_all_exams"
  ON public.exams FOR ALL TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "mvp_anon_all_questions" ON public.questions;
CREATE POLICY "mvp_anon_all_questions"
  ON public.questions FOR ALL TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "mvp_anon_all_students" ON public.students;
CREATE POLICY "mvp_anon_all_students"
  ON public.students FOR ALL TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "mvp_anon_all_attempts" ON public.attempts;
CREATE POLICY "mvp_anon_all_attempts"
  ON public.attempts FOR ALL TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "mvp_anon_all_admins" ON public.admins;
CREATE POLICY "mvp_anon_all_admins"
  ON public.admins FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- ============================================================================
-- NOTE: updated_at trigger intentionally NOT included (per spec — no
-- updated_at columns in this schema, so no trigger needed).
-- ============================================================================
-- HOW ADMIN CUSTOMIZES total_questions:
--   total_questions on exams is plain metadata, NOT auto-computed.
--   After adding/removing question rows, run:
--     UPDATE public.exams SET total_questions = <N> WHERE code = '<CODE>';
--   Or reconcile from reality:
--     UPDATE public.exams e
--     SET total_questions = q.cnt
--     FROM (SELECT exam_id, COUNT(*) AS cnt FROM public.questions GROUP BY exam_id) q
--     WHERE e.id = q.exam_id AND e.code = '<CODE>';
-- ============================================================================
