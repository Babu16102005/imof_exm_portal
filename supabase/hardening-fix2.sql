-- ============================================================================
-- IMOF Exam Portal � Hardening Fix 2 (run AFTER hardening.sql + fix1)
-- Fixes two bugs found by live attack re-test:
--   1) submit_attempt never persisted: bare FOUND after the scoring FOR loop
--      is always TRUE, so fresh submits took the finalize-UPDATE path that
--      matched 0 rows. Now uses an explicit v_found boolean.
--   2) login rate-limit buckets never worked: the failure path ends in RAISE,
--      which rolls back the counter write. Replaced with a 2s pg_sleep
--      tarpit on every failed login (elapsed time cannot be rolled back).
-- Safe to re-run (OR REPLACE). hardening.sql already contains these fixes
-- for fresh installs.
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
