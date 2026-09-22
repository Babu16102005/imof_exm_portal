-- ============================================================================
-- IMOF Exam Portal — Hardening Migration
-- File: supabase/hardening.sql
-- Run order: schema.sql -> seed.sql -> hardening.sql
--   1) Run supabase/schema.sql  (base tables + permissive MVP RLS)
--   2) Run supabase/seed.sql    (demo exam / questions / students / admin)
--   3) Run supabase/hardening.sql (THIS FILE — safe to re-run any time)
-- Rerunnable: uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS throughout.
--
-- SEED COMPATIBILITY NOTE:
--   seed.sql uses ON CONFLICT DO UPDATE with PLAINTEXT passwords
--   ('demo123', 'imof2026'), so re-running seed.sql WILL reset those rows
--   back to plaintext and overwrite the bcrypt hashes created here.
--   Fix: ALWAYS re-run this hardening.sql AFTER any seed.sql re-run.
--   The hash UPDATEs in §1 and §5 are guarded by
--   WHERE password NOT LIKE '$2%' so re-running is safe (already-hashed
--   rows are skipped) regardless of ordering.
-- ============================================================================

-- pgcrypto provides crypt()/gen_salt('bf') for bcrypt + gen_random_bytes().
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- §1. Hash existing plaintext passwords in place (bcrypt, idempotent).
-- Only rows NOT already bcrypt-hashed are touched.
-- ============================================================================
UPDATE public.students
SET password = crypt(password, gen_salt('bf'))
WHERE password NOT LIKE '$2%';

UPDATE public.admins
SET password = crypt(password, gen_salt('bf'))
WHERE password NOT LIKE '$2%';

COMMENT ON COLUMN public.students.password IS
  'bcrypt hash via pgcrypto crypt() + gen_salt(bf). Plaintext is never stored; verify with crypt(candidate, password) = password. Re-run the guarded UPDATE in hardening.sql after any seed.sql re-run.';
COMMENT ON COLUMN public.admins.password IS
  'bcrypt hash via pgcrypto crypt() + gen_salt(bf). Plaintext is never stored; verify with crypt(candidate, password) = password. Re-run the guarded UPDATE in hardening.sql after any seed.sql re-run.';

-- ============================================================================
-- §2. New tables: admin_sessions + login_attempts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  token      TEXT        PRIMARY KEY DEFAULT encode(gen_random_bytes(32), 'hex'),
  admin_id   UUID        NOT NULL REFERENCES public.admins (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '12 hours'
);

COMMENT ON TABLE public.admin_sessions IS 'Opaque admin bearer tokens. Frontend sends as x-admin-token header; validated by _admin_token_ok(). RLS enabled with NO policies (SECURITY DEFINER RPCs only).';

CREATE TABLE IF NOT EXISTS public.login_attempts (
  key     TEXT        PRIMARY KEY,
  fails   INT         NOT NULL DEFAULT 0 CHECK (fails >= 0),
  last_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.login_attempts IS 'Login rate-limit buckets. key = stu:<lower(user_id)> or adm:<lower(admin_id)>. RLS enabled with NO policies (SECURITY DEFINER helpers only).';

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id
  ON public.admin_sessions (admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
  ON public.admin_sessions (expires_at);

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies on admin_sessions / login_attempts:
-- anon has zero direct access; only SECURITY DEFINER functions touch them
-- (table owner bypasses RLS).

-- ============================================================================
-- §2b. Helpers: rate-limit + admin token check
-- ============================================================================

-- _rls_fail: TRUE when key is currently blocked (fails >= max AND last_at
-- inside the window). Pure check EXCEPT it resets an expired window bucket
-- so a stale bucket does not block forever. Does NOT increment (use
-- _rls_note_fail on each failed login).
CREATE OR REPLACE FUNCTION public._rls_fail(
  p_key TEXT,
  max_fails INT DEFAULT 8,
  window_s INT DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_fails INT;
  v_last  TIMESTAMPTZ;
BEGIN
  IF p_key IS NULL OR p_key = '' THEN
    RETURN FALSE;
  END IF;
  SELECT fails, last_at INTO v_fails, v_last
  FROM public.login_attempts
  WHERE key = p_key;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  IF v_last IS NULL OR v_last < now() - (window_s * INTERVAL '1 second') THEN
    UPDATE public.login_attempts
    SET fails = 0, last_at = now()
    WHERE key = p_key;
    RETURN FALSE;
  END IF;
  RETURN v_fails >= max_fails;
END;
$$;

COMMENT ON FUNCTION public._rls_fail(TEXT, INT, INT) IS
  'Rate-limit check: TRUE if blocked (fails>=max_fails within window_s seconds). Resets expired windows. Pair with _rls_note_fail() on failure and _rls_clear() on success.';

-- _rls_note_fail: upsert/increment the failure bucket (window-aware: an
-- expired bucket restarts at 1 instead of accumulating forever).
CREATE OR REPLACE FUNCTION public._rls_note_fail(p_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_key IS NULL OR p_key = '' THEN
    RETURN;
  END IF;
  INSERT INTO public.login_attempts (key, fails, last_at)
  VALUES (p_key, 1, now())
  ON CONFLICT (key) DO UPDATE SET
    fails = CASE
      WHEN public.login_attempts.last_at < now() - INTERVAL '5 minutes' THEN 1
      ELSE public.login_attempts.fails + 1
    END,
    last_at = now();
END;
$$;

COMMENT ON FUNCTION public._rls_note_fail(TEXT) IS
  'Records one failed login: upserts login_attempts row and increments fails (window-aware reset).';

-- _rls_clear: remove the bucket after a successful login.
CREATE OR REPLACE FUNCTION public._rls_clear(p_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_key IS NULL OR p_key = '' THEN
    RETURN;
  END IF;
  DELETE FROM public.login_attempts WHERE key = p_key;
END;
$$;

COMMENT ON FUNCTION public._rls_clear(TEXT) IS
  'Clears the rate-limit bucket after successful login.';

-- _admin_token_ok: TRUE when token exists and is not expired.
CREATE OR REPLACE FUNCTION public._admin_token_ok(t TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_sessions
    WHERE token = t AND expires_at > now()
  );
$$;

COMMENT ON FUNCTION public._admin_token_ok(TEXT) IS
  'TRUE if admin_sessions row exists for token and expires_at > now(). Used by RLS admin policies.';

-- Lock helpers down: definer-only, no direct anon/authenticated calls.
REVOKE ALL ON FUNCTION public._rls_fail(TEXT, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rls_note_fail(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rls_clear(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._admin_token_ok(TEXT) FROM PUBLIC;

-- ============================================================================
-- §3a. RPC: verify_student_login — bcrypt check, generic errors, tarpit delay
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verify_student_login(
  p_user_id TEXT,
  p_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_stu RECORD;
BEGIN
  IF p_user_id IS NULL OR trim(COALESCE(p_user_id, '')) = ''
     OR p_password IS NULL OR p_password = '' THEN
    PERFORM pg_sleep(2); -- tarpit: survives the rollback from RAISE below
    RAISE EXCEPTION 'Invalid user ID or password';
  END IF;

  -- Throttle note: login_attempts-bucket counting was removed on purpose.
  -- A counter incremented in these functions can never work: every failure
  -- path ends in RAISE EXCEPTION, which rolls the whole transaction back —
  -- including the counter write. Instead each failure burns 2s server-side
  -- (pg_sleep survives rollback — elapsed time cannot be rolled back), which
  -- makes online password guessing infeasible while honest typos cost ~2s.

  SELECT * INTO v_stu
  FROM public.students
  WHERE user_id = trim(p_user_id);

  -- Single generic message covers: unknown user, inactive account, and bad
  -- password (avoids user enumeration). crypt() comparison is only valid
  -- against bcrypt hashes; plaintext rows (pre-hash) never match.
  IF NOT FOUND
     OR v_stu.is_active IS NOT TRUE
     OR v_stu.password IS NULL
     OR crypt(p_password, v_stu.password) <> v_stu.password THEN
    PERFORM pg_sleep(2); -- tarpit: survives the rollback from RAISE below
    RAISE EXCEPTION 'Invalid user ID or password';
  END IF;

  -- (legacy throttle-bucket clear removed — buckets never persist; see note above)

  RETURN json_build_object(
    'id',      v_stu.id,
    'user_id', v_stu.user_id,
    'name',    v_stu.name,
    'class',   v_stu.class,
    'school',  v_stu.school,
    'exam_id', v_stu.exam_id
  );
END;
$$;

COMMENT ON FUNCTION public.verify_student_login(TEXT, TEXT) IS
  'Student login: bcrypt-verified with 2s tarpit on failure. Returns {id,user_id,name,class,school,exam_id} WITHOUT password; raises generic Invalid user ID or password on any failure (incl. inactive).';

REVOKE ALL ON FUNCTION public.verify_student_login(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_student_login(TEXT, TEXT) TO anon;

-- ============================================================================
-- §3b. RPC: verify_admin_login — on success mints admin_sessions token
-- (2s tarpit on failure; see §3a note on why counters can't work here)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verify_admin_login(
  p_admin_id TEXT,
  p_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_adm   RECORD;
  v_token TEXT;
BEGIN
  IF p_admin_id IS NULL OR trim(COALESCE(p_admin_id, '')) = ''
     OR p_password IS NULL OR p_password = '' THEN
    PERFORM pg_sleep(2); -- tarpit: survives the rollback from RAISE below
    RAISE EXCEPTION 'Invalid admin ID or password';
  END IF;

  -- Throttle note: login_attempts-bucket counting was removed on purpose.
  -- A counter incremented in these functions can never work: every failure
  -- path ends in RAISE EXCEPTION, which rolls the whole transaction back —
  -- including the counter write. Instead each failure burns 2s server-side
  -- (pg_sleep survives rollback — elapsed time cannot be rolled back), which
  -- makes online password guessing infeasible while honest typos cost ~2s.

  SELECT * INTO v_adm
  FROM public.admins
  WHERE admin_id = trim(p_admin_id);

  IF NOT FOUND
     OR v_adm.password IS NULL
     OR crypt(p_password, v_adm.password) <> v_adm.password THEN
    PERFORM pg_sleep(2); -- tarpit: survives the rollback from RAISE below
    RAISE EXCEPTION 'Invalid admin ID or password';
  END IF;

  -- (legacy throttle-bucket clear removed — buckets never persist; see note above)

  INSERT INTO public.admin_sessions (admin_id)
  VALUES (v_adm.id)
  RETURNING token INTO v_token;

  RETURN json_build_object(
    'token',    v_token,
    'admin_id', v_adm.admin_id
  );
END;
$$;

COMMENT ON FUNCTION public.verify_admin_login(TEXT, TEXT) IS
  'Admin login: bcrypt-verified with 2s tarpit on failure. On success inserts admin_sessions row and returns {token, admin_id}.';

REVOKE ALL ON FUNCTION public.verify_admin_login(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_admin_login(TEXT, TEXT) TO anon;

-- ============================================================================
-- §3c. RPC: admin_touch — validate + slide expiry by 12h
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_touch(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN FALSE;
  END IF;
  UPDATE public.admin_sessions
  SET expires_at = now() + INTERVAL '12 hours'
  WHERE token = p_token
    AND expires_at > now();
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.admin_touch(TEXT) IS
  'Validates admin token and extends expiry by 12h. Frontend calls on load; FALSE means force logout.';

REVOKE ALL ON FUNCTION public.admin_touch(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_touch(TEXT) TO anon;

-- ============================================================================
-- §3d. RPC: get_my_exams — assigned exam if set, else all published
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_my_exams(p_student_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_exam_id   UUID;
  v_is_active BOOLEAN;
  v_out       JSON;
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  SELECT exam_id, is_active INTO v_exam_id, v_is_active
  FROM public.students
  WHERE id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;
  IF v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Student account is inactive';
  END IF;

  IF v_exam_id IS NOT NULL THEN
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.code), '[]'::json)
    INTO v_out
    FROM (
      SELECT
        e.id, e.code, e.title, e.olympiad,
        e.class_from, e.class_to, e.duration_minutes,
        e.total_questions, e.marks_per_q, e.status,
        e.start_at, e.end_at, e.instructions,
        (SELECT COUNT(*)::INT FROM public.questions q WHERE q.exam_id = e.id) AS question_count,
        EXISTS (
          SELECT 1 FROM public.attempts a
          WHERE a.student_id = p_student_id
            AND a.exam_id = e.id
            AND a.submitted_at IS NOT NULL
        ) AS submitted
      FROM public.exams e
      WHERE e.id = v_exam_id
    ) t;
  ELSE
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.code), '[]'::json)
    INTO v_out
    FROM (
      SELECT
        e.id, e.code, e.title, e.olympiad,
        e.class_from, e.class_to, e.duration_minutes,
        e.total_questions, e.marks_per_q, e.status,
        e.start_at, e.end_at, e.instructions,
        (SELECT COUNT(*)::INT FROM public.questions q WHERE q.exam_id = e.id) AS question_count,
        EXISTS (
          SELECT 1 FROM public.attempts a
          WHERE a.student_id = p_student_id
            AND a.exam_id = e.id
            AND a.submitted_at IS NOT NULL
        ) AS submitted
      FROM public.exams e
      WHERE e.status = 'published'
      ORDER BY e.created_at, e.code
    ) t;
  END IF;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.get_my_exams(UUID) IS
  'Lists exams for a student: assigned exam if students.exam_id set, else all published. Includes question_count + submitted flag. Never returns correct_option or passwords.';

REVOKE ALL ON FUNCTION public.get_my_exams(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_exams(UUID) TO anon;

-- ============================================================================
-- §3e. RPC: get_exam_paper — window/assignment/submission guards, no answers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_exam_paper(
  p_exam_id UUID,
  p_student_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_stu  RECORD;
  v_exam RECORD;
  v_qs   JSON;
BEGIN
  IF p_exam_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'Missing exam or student';
  END IF;

  SELECT * INTO v_stu FROM public.students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;
  IF v_stu.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Student account is inactive';
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exam not found';
  END IF;
  IF v_exam.status <> 'published' THEN
    RAISE EXCEPTION 'Exam is not published';
  END IF;
  IF v_exam.start_at IS NOT NULL AND now() < v_exam.start_at THEN
    RAISE EXCEPTION 'Exam has not started yet';
  END IF;
  IF v_exam.end_at IS NOT NULL AND now() > v_exam.end_at THEN
    RAISE EXCEPTION 'Exam window has closed';
  END IF;
  -- Assigned students may only open their assigned exam; unassigned
  -- students (exam_id IS NULL) may open any published exam in its window.
  IF v_stu.exam_id IS NOT NULL AND v_stu.exam_id <> p_exam_id THEN
    RAISE EXCEPTION 'Student is not assigned to this exam';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.attempts
    WHERE student_id = p_student_id
      AND exam_id = p_exam_id
      AND submitted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Exam already submitted';
  END IF;

  SELECT COALESCE(
    json_agg(row_to_json(q) ORDER BY q.q_no),
    '[]'::json
  )
  INTO v_qs
  FROM (
    SELECT id, q_no, question_text,
           option_a, option_b, option_c, option_d, marks
    FROM public.questions
    WHERE exam_id = p_exam_id
    ORDER BY q_no
  ) q;

  RETURN json_build_object(
    'exam', json_build_object(
      'id', v_exam.id,
      'code', v_exam.code,
      'title', v_exam.title,
      'olympiad', v_exam.olympiad,
      'class_from', v_exam.class_from,
      'class_to', v_exam.class_to,
      'duration_minutes', v_exam.duration_minutes,
      'total_questions', v_exam.total_questions,
      'marks_per_q', v_exam.marks_per_q,
      'negative_marks', v_exam.negative_marks,
      'status', v_exam.status,
      'start_at', v_exam.start_at,
      'end_at', v_exam.end_at,
      'instructions', v_exam.instructions
    ),
    'questions', v_qs
  );
END;
$$;

COMMENT ON FUNCTION public.get_exam_paper(UUID, UUID) IS
  'Returns exam + questions WITHOUT correct_option after validating active student, published status, time window, assignment, and no prior submission. Raises a clear exception on each violation.';

REVOKE ALL ON FUNCTION public.get_exam_paper(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exam_paper(UUID, UUID) TO anon;

-- ============================================================================
-- §3f. RPC: submit_attempt — server-side scoring, insert-once, dedupe return
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_attempt(
  p_exam_id UUID,
  p_student_id UUID,
  p_answers JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_stu           RECORD;
  v_exam          RECORD;
  v_answers       JSONB := COALESCE(p_answers, '{}'::jsonb);
  v_q             RECORD;
  v_chosen        TEXT;
  v_total         NUMERIC := 0;
  v_correct       INT := 0;
  v_wrong         INT := 0;
  v_skipped       INT := 0;
  v_correct_total NUMERIC := 0;
  v_score         NUMERIC := 0;
  v_existing      RECORD;
  v_row           RECORD;
  v_found         BOOLEAN := FALSE;
BEGIN
  IF p_exam_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'Missing exam or student';
  END IF;
  IF jsonb_typeof(v_answers) <> 'object' THEN
    RAISE EXCEPTION 'Invalid answers format';
  END IF;

  -- Same re-validation as get_exam_paper (except submitted-ness, which
  -- becomes a dedupe return below instead of an exception).
  SELECT * INTO v_stu FROM public.students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;
  IF v_stu.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Student account is inactive';
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exam not found';
  END IF;
  IF v_exam.status <> 'published' THEN
    RAISE EXCEPTION 'Exam is not published';
  END IF;
  IF v_exam.start_at IS NOT NULL AND now() < v_exam.start_at THEN
    RAISE EXCEPTION 'Exam has not started yet';
  END IF;
  IF v_exam.end_at IS NOT NULL AND now() > v_exam.end_at THEN
    RAISE EXCEPTION 'Exam window has closed';
  END IF;
  IF v_stu.exam_id IS NOT NULL AND v_stu.exam_id <> p_exam_id THEN
    RAISE EXCEPTION 'Student is not assigned to this exam';
  END IF;

  -- Dedupe: never overwrite a submitted attempt. Recompute the breakdown
  -- from the STORED answers so the returned detail matches the stored score.
  SELECT * INTO v_existing
  FROM public.attempts
  WHERE student_id = p_student_id AND exam_id = p_exam_id;
  v_found := FOUND;

  IF v_found AND v_existing.submitted_at IS NOT NULL THEN
    SELECT COALESCE(SUM(marks), 0) INTO v_total
    FROM public.questions WHERE exam_id = p_exam_id;
    v_correct := 0; v_wrong := 0; v_skipped := 0;
    FOR v_q IN SELECT q_no, correct_option FROM public.questions
               WHERE exam_id = p_exam_id LOOP
      v_chosen := v_existing.answers ->> (v_q.q_no::text);
      IF v_chosen IS NULL OR trim(v_chosen) = '' THEN
        v_skipped := v_skipped + 1;
      ELSIF upper(trim(v_chosen)) = v_q.correct_option THEN
        v_correct := v_correct + 1;
      ELSE
        v_wrong := v_wrong + 1;
      END IF;
    END LOOP;
    RETURN json_build_object(
      'score', v_existing.score,
      'total', v_total,
      'correct', v_correct,
      'wrong', v_wrong,
      'skipped', v_skipped,
      'submitted_at', v_existing.submitted_at,
      'dedupe', true
    );
  END IF;

  -- Fresh scoring from the submitted answers:
  -- +marks per correct; wrong answers cost exam.negative_marks each;
  -- score = GREATEST(0, correct_total - wrong * negative_marks).
  SELECT COALESCE(SUM(marks), 0) INTO v_total
  FROM public.questions WHERE exam_id = p_exam_id;

  v_correct := 0; v_wrong := 0; v_skipped := 0; v_correct_total := 0;
  FOR v_q IN SELECT q_no, correct_option, marks FROM public.questions
             WHERE exam_id = p_exam_id LOOP
    v_chosen := v_answers ->> (v_q.q_no::text);
    IF v_chosen IS NULL OR trim(v_chosen) = '' THEN
      v_skipped := v_skipped + 1;
    ELSIF upper(trim(v_chosen)) = v_q.correct_option THEN
      v_correct := v_correct + 1;
      v_correct_total := v_correct_total + COALESCE(v_q.marks, 0);
    ELSE
      v_wrong := v_wrong + 1;
    END IF;
  END LOOP;

  v_score := GREATEST(0, v_correct_total - v_wrong * COALESCE(v_exam.negative_marks, 0));

  -- A leftover unsubmitted ("started") row is finalized. If the UPDATE
  -- matches nothing (row vanished / raced), fall through to INSERT below.
  -- NOTE: uses explicit v_found — never bare FOUND here, because the scoring
  -- FOR loop above overwrites FOUND.
  IF v_found THEN
    UPDATE public.attempts
    SET answers = v_answers,
        score = v_score,
        submitted_at = now()
    WHERE student_id = p_student_id
      AND exam_id = p_exam_id
      AND submitted_at IS NULL
    RETURNING * INTO v_row;
    IF FOUND THEN
      RETURN json_build_object(
        'score', v_score,
        'total', v_total,
        'correct', v_correct,
        'wrong', v_wrong,
        'skipped', v_skipped,
        'submitted_at', v_row.submitted_at,
        'dedupe', false
      );
    END IF;
  END IF;

  INSERT INTO public.attempts (student_id, exam_id, answers, score, submitted_at, started_at)
  VALUES (p_student_id, p_exam_id, v_answers, v_score, now(), now())
  ON CONFLICT (student_id, exam_id) DO NOTHING
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    -- Lost a race with a concurrent submit: return the winner, never overwrite.
    SELECT * INTO v_existing
    FROM public.attempts
    WHERE student_id = p_student_id AND exam_id = p_exam_id;
    RETURN json_build_object(
      'score', v_existing.score,
      'total', v_total,
      'correct', v_correct,
      'wrong', v_wrong,
      'skipped', v_skipped,
      'submitted_at', v_existing.submitted_at,
      'dedupe', true
    );
  END IF;

  RETURN json_build_object(
    'score', v_score,
    'total', v_total,
    'correct', v_correct,
    'wrong', v_wrong,
    'skipped', v_skipped,
    'submitted_at', v_row.submitted_at,
    'dedupe', false
  );
END;
$$;

COMMENT ON FUNCTION public.submit_attempt(UUID, UUID, JSONB) IS
  'Server-side grading: correct_total minus wrong*negative_marks floored at 0. INSERT ON CONFLICT DO NOTHING; submitted rows are never overwritten (dedupe:true return).';

REVOKE ALL ON FUNCTION public.submit_attempt(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_attempt(UUID, UUID, JSONB) TO anon;

-- ============================================================================
-- §3g. RPC: get_my_result — submitted attempt + per-question review
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_my_result(
  p_exam_id UUID,
  p_student_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_att   RECORD;
  v_total NUMERIC := 0;
  v_rev   JSON;
BEGIN
  IF p_exam_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'Missing exam or student';
  END IF;

  SELECT * INTO v_att
  FROM public.attempts
  WHERE student_id = p_student_id
    AND exam_id = p_exam_id
    AND submitted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No submission found for this exam';
  END IF;

  SELECT COALESCE(SUM(marks), 0) INTO v_total
  FROM public.questions WHERE exam_id = p_exam_id;

  SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.q_no), '[]'::json)
  INTO v_rev
  FROM (
    SELECT
      q.q_no,
      (v_att.answers ->> (q.q_no::text)) AS chosen,
      q.correct_option AS correct,
      q.marks,
      (upper(COALESCE(v_att.answers ->> (q.q_no::text), '')) = q.correct_option) AS ok
    FROM public.questions q
    WHERE q.exam_id = p_exam_id
    ORDER BY q.q_no
  ) r;

  RETURN json_build_object(
    'score', v_att.score,
    'total', v_total,
    'submitted_at', v_att.submitted_at,
    'review', v_rev
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_result(UUID, UUID) IS
  'Requires a submitted attempt. Returns {score,total,submitted_at,review:[{q_no,chosen,correct,marks,ok}]}.';

REVOKE ALL ON FUNCTION public.get_my_result(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_result(UUID, UUID) TO anon;

-- ============================================================================
-- §4. Lock RLS: drop permissive MVP policies, add admin-token-only policies.
-- Frontend uses RPCs (SECURITY DEFINER bypasses RLS); anon has ZERO direct
-- table access. PostgREST exposes headers via request.headers; COALESCE
-- guards a missing/NULL setting so the check safely returns FALSE.
-- ============================================================================

DROP POLICY IF EXISTS "mvp_anon_all_exams" ON public.exams;
DROP POLICY IF EXISTS "mvp_anon_all_questions" ON public.questions;
DROP POLICY IF EXISTS "mvp_anon_all_students" ON public.students;
DROP POLICY IF EXISTS "mvp_anon_all_attempts" ON public.attempts;
DROP POLICY IF EXISTS "mvp_anon_all_admins" ON public.admins;

DROP POLICY IF EXISTS "admin_full_access_exams" ON public.exams;
DROP POLICY IF EXISTS "admin_full_access_questions" ON public.questions;
DROP POLICY IF EXISTS "admin_full_access_students" ON public.students;
DROP POLICY IF EXISTS "admin_full_access_attempts" ON public.attempts;
DROP POLICY IF EXISTS "admin_full_access_admins" ON public.admins;

-- RLS must stay enabled (already enabled in schema.sql; repeat for safety).
ALTER TABLE public.exams     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins    ENABLE ROW LEVEL SECURITY;

-- Admin full access via x-admin-token header (anon key + header from frontend).
CREATE POLICY "admin_full_access_exams"
  ON public.exams FOR ALL TO anon, authenticated
  USING (public._admin_token_ok(COALESCE((NULLIF(current_setting('request.headers', true), '')::json ->> 'x-admin-token'), '')))
  WITH CHECK (public._admin_token_ok(COALESCE((NULLIF(current_setting('request.headers', true), '')::json ->> 'x-admin-token'), '')));

CREATE POLICY "admin_full_access_questions"
  ON public.questions FOR ALL TO anon, authenticated
  USING (public._admin_token_ok(COALESCE((NULLIF(current_setting('request.headers', true), '')::json ->> 'x-admin-token'), '')))
  WITH CHECK (public._admin_token_ok(COALESCE((NULLIF(current_setting('request.headers', true), '')::json ->> 'x-admin-token'), '')));

CREATE POLICY "admin_full_access_students"
  ON public.students FOR ALL TO anon, authenticated
  USING (public._admin_token_ok(COALESCE((NULLIF(current_setting('request.headers', true), '')::json ->> 'x-admin-token'), '')))
  WITH CHECK (public._admin_token_ok(COALESCE((NULLIF(current_setting('request.headers', true), '')::json ->> 'x-admin-token'), '')));

CREATE POLICY "admin_full_access_attempts"
  ON public.attempts FOR ALL TO anon, authenticated
  USING (public._admin_token_ok(COALESCE((NULLIF(current_setting('request.headers', true), '')::json ->> 'x-admin-token'), '')))
  WITH CHECK (public._admin_token_ok(COALESCE((NULLIF(current_setting('request.headers', true), '')::json ->> 'x-admin-token'), '')));

CREATE POLICY "admin_full_access_admins"
  ON public.admins FOR ALL TO anon, authenticated
  USING (public._admin_token_ok(COALESCE((NULLIF(current_setting('request.headers', true), '')::json ->> 'x-admin-token'), '')))
  WITH CHECK (public._admin_token_ok(COALESCE((NULLIF(current_setting('request.headers', true), '')::json ->> 'x-admin-token'), '')));

-- NOTE: zero anon table policies on students/questions/attempts (RPC-only),
-- and zero anon table policies on exams (frontend lists via get_my_exams /
-- get_exam_paper RPCs, never direct SELECT).

-- ============================================================================
-- §5. Seed-ordering safety: repeat the guarded hash UPDATE at the END so a
-- seed.sql re-run (which resets plaintext via ON CONFLICT DO UPDATE) followed
-- by this file always ends hashed. Guarded => already-hashed rows skipped.
-- ============================================================================
UPDATE public.students
SET password = crypt(password, gen_salt('bf'))
WHERE password NOT LIKE '$2%';

UPDATE public.admins
SET password = crypt(password, gen_salt('bf'))
WHERE password NOT LIKE '$2%';

-- ============================================================================
-- §6. Verification SELECTs (commented — uncomment to audit after running)
-- ============================================================================
-- -- No plaintext passwords remain (both counts must be 0):
-- SELECT COUNT(*) AS plaintext_students FROM public.students WHERE password NOT LIKE '$2%';
-- SELECT COUNT(*) AS plaintext_admins FROM public.admins WHERE password NOT LIKE '$2%';
--
-- -- New tables exist with RLS on and (for sessions/attempts buckets) no policies:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('admin_sessions', 'login_attempts');
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('exams', 'questions', 'students', 'attempts', 'admins', 'admin_sessions', 'login_attempts') ORDER BY tablename, policyname;
--
-- -- Permissive MVP policies are gone (must return 0 rows):
-- SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'mvp_anon_all_%';
--
-- -- RPCs present, SECURITY DEFINER, granted to anon:
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS is_definer
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('verify_student_login', 'verify_admin_login', 'admin_touch', 'get_my_exams', 'get_exam_paper', 'submit_attempt', 'get_my_result', '_rls_fail', '_rls_note_fail', '_rls_clear', '_admin_token_ok')
-- ORDER BY p.proname;
--
-- -- Smoke tests (replace placeholders with real ids):
-- -- SELECT public.verify_student_login('demo001', 'demo123');
-- -- SELECT public.verify_admin_login('admin', 'imof2026');
-- -- SELECT public.get_my_exams('<student_uuid>'::uuid);
-- -- SELECT public.get_exam_paper('<exam_uuid>'::uuid, '<student_uuid>'::uuid);
-- -- SELECT public.submit_attempt('<exam_uuid>'::uuid, '<student_uuid>'::uuid, '{"1":"B"}'::jsonb);
-- -- SELECT public.get_my_result('<exam_uuid>'::uuid, '<student_uuid>'::uuid);
