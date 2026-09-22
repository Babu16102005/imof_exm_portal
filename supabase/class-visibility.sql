-- ============================================================================
-- IMOF Exam Portal — Class-Based Exam Visibility (STRICT overlay)
-- File: supabase/class-visibility.sql
-- Run order:
--   1) supabase/schema.sql
--   2) supabase/seed.sql
--   3) supabase/hardening.sql (+ hardening-fix1/2/3.sql if present)
--   4) supabase/class-visibility.sql (THIS FILE)
-- Rerunnable: uses CREATE OR REPLACE / DROP IF EXISTS-safe patterns only.
--   Safe to re-run any time; re-running never duplicates data or drops tables.
--
-- Purpose:
--   Enforce server-side class-based exam visibility (STRICT policy):
--     exam visible iff:
--       student is_active
--       AND exam status = 'published'
--       AND within start/end window (where applicable)
--       AND class_match
--   class_match rules:
--     - class_from IS NULL AND class_to IS NULL => TRUE (open to all)
--     - student grade unparsable / NULL          => FALSE (only open exams)
--     - one bound NULL => open-ended
--         from=8,to=NULL  means grade >= 8
--         from=NULL,to=5  means grade <= 5
--     - from > to (both NOT NULL) => FALSE
--     - else student_grade BETWEEN from AND to (inclusive)
--   Assigned students.exam_id does NOT bypass the class check.
--
-- Contents:
--   §1  Helpers: try_parse_class(TEXT), is_exam_visible_for_grade(INT,INT,INT)
--   §2  get_my_exams      — both branches filtered by class gate
--   §3  get_exam_paper    — RAISE on class mismatch
--   §4  submit_attempt    — RAISE on class mismatch
--   §5  get_my_result     — RAISE on class mismatch
--   §6  Verification queries (commented)
--
-- Design note on hardening.sql:
--   hardening.sql is intentionally LEFT UNTOUCHED. This file is an overlay
--   that CREATE OR REPLACE's the four RPCs with class-gated versions that
--   otherwise preserve hardening.sql semantics exactly (SECURITY DEFINER,
--   SET search_path = public, extensions, REVOKE/GRANT to anon).
-- ============================================================================

-- ============================================================================
-- §1a. Helper: try_parse_class(TEXT) -> INT (IMMUTABLE)
--   Trim, extract leading integer via regexp, validate 1..12.
--   Roman numerals i..xii (case-insensitive) as fallback.
--   Returns NULL when unparsable or out of range.
--   Examples:
--     '5' -> 5, ' 8 ' -> 8, 'Class 10' -> 10, 'Grade 8A' -> 8,
--     'VIII'/'viii' -> 8, 'Class VIII' -> 8, 'iv' -> 4, 'XII' -> 12,
--     NULL/''/'abc'/'0'/'13' -> NULL
-- ============================================================================
CREATE OR REPLACE FUNCTION public.try_parse_class(p_input TEXT)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
DECLARE
  v_trimmed  TEXT;
  v_lower    TEXT;
  v_num_text TEXT;
  v_num      INT;
  v_roman    TEXT;
BEGIN
  IF p_input IS NULL THEN
    RETURN NULL;
  END IF;

  v_trimmed := btrim(p_input);
  IF v_trimmed = '' THEN
    RETURN NULL;
  END IF;

  -- 1) Numeric path: first 1-2 digit run.
  --    e.g. substring(' 8 ' from '([0-9]{1,2})') = '8'.
  v_num_text := substring(v_trimmed from '([0-9]{1,2})');
  IF v_num_text IS NOT NULL AND v_num_text <> '' THEN
    BEGIN
      v_num := v_num_text::INT;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    IF v_num BETWEEN 1 AND 12 THEN
      RETURN v_num;
    ELSE
      RETURN NULL;
    END IF;
  END IF;

  -- 2) Roman-numeral fallback, case-insensitive.
  v_lower := lower(v_trimmed);

  -- Exact-match fast path.
  CASE v_lower
    WHEN 'i'    THEN RETURN 1;
    WHEN 'ii'   THEN RETURN 2;
    WHEN 'iii'  THEN RETURN 3;
    WHEN 'iv'   THEN RETURN 4;
    WHEN 'v'    THEN RETURN 5;
    WHEN 'vi'   THEN RETURN 6;
    WHEN 'vii'  THEN RETURN 7;
    WHEN 'viii' THEN RETURN 8;
    WHEN 'ix'   THEN RETURN 9;
    WHEN 'x'    THEN RETURN 10;
    WHEN 'xi'   THEN RETURN 11;
    WHEN 'xii'  THEN RETURN 12;
    ELSE NULL; -- fall through to word-boundary search below
  END CASE;

  -- Standalone roman token search (handles 'Class VIII', 'Grade V',
  -- 'VIII-A', etc). Longest alternatives first so 'xii' wins over
  -- 'xi'/'x'/'ii'/'i'. \m / \M are Postgres word boundaries, so the 'i'
  -- inside 'class'/'civil' does NOT match.
  v_roman := substring(v_lower from '\m(xii|xi|ix|viii|vii|vi|iv|iii|ii|x|v|i)\M');
  IF v_roman IS NULL OR v_roman = '' THEN
    RETURN NULL;
  END IF;

  CASE v_roman
    WHEN 'i'    THEN RETURN 1;
    WHEN 'ii'   THEN RETURN 2;
    WHEN 'iii'  THEN RETURN 3;
    WHEN 'iv'   THEN RETURN 4;
    WHEN 'v'    THEN RETURN 5;
    WHEN 'vi'   THEN RETURN 6;
    WHEN 'vii'  THEN RETURN 7;
    WHEN 'viii' THEN RETURN 8;
    WHEN 'ix'   THEN RETURN 9;
    WHEN 'x'    THEN RETURN 10;
    WHEN 'xi'   THEN RETURN 11;
    WHEN 'xii'  THEN RETURN 12;
    ELSE RETURN NULL;
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.try_parse_class(TEXT) IS
  'Parse free-form students.class to grade 1..12 or NULL. Numeric path via substring(x from ([0-9]{1,2})) with 1..12 range check; roman i..xii (case-insensitive, exact or standalone word token) as fallback. IMMUTABLE so usable in indexes/policies.';

REVOKE ALL ON FUNCTION public.try_parse_class(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_parse_class(TEXT) TO anon, authenticated;

-- ============================================================================
-- §1b. Helper: is_exam_visible_for_grade(g, f, t) -> BOOLEAN (IMMUTABLE)
--   g = student grade (1..12 or NULL), f = class_from, t = class_to.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_exam_visible_for_grade(g INT, f INT, t INT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT CASE
    -- Open to all: no class bounds at all.
    WHEN f IS NULL AND t IS NULL THEN TRUE
    -- Unparsable / missing grade sees ONLY open exams (handled above).
    -- Out-of-range grades (e.g. 0/13 from direct calls) likewise ineligible.
    WHEN g IS NULL OR g < 1 OR g > 12 THEN FALSE
    -- Inverted range is never visible (schema.sql CHECK normally prevents
    -- this, but hardening overlay treats it as closed, not open).
    WHEN f IS NOT NULL AND t IS NOT NULL AND f > t THEN FALSE
    -- Open-ended bounds.
    WHEN f IS NULL THEN g <= t
    WHEN t IS NULL THEN g >= f
    -- Closed range, inclusive.
    ELSE g BETWEEN f AND t
  END;
$$;

COMMENT ON FUNCTION public.is_exam_visible_for_grade(INT, INT, INT) IS
  'STRICT class gate: (NULL,NULL)->true; NULL grade->false except open; f>t->false; one NULL bound->open-ended (>=f / <=t); else g BETWEEN f AND t inclusive. IMMUTABLE.';

REVOKE ALL ON FUNCTION public.is_exam_visible_for_grade(INT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_exam_visible_for_grade(INT, INT, INT) TO anon, authenticated;

-- ============================================================================
-- §2. RPC: get_my_exams — BOTH branches filtered by class gate.
--   Assigned-but-ineligible => empty JSON array ('[]'), NOT an error.
--   (get_exam_paper / submit_attempt RAISE instead — see below.)
--   Otherwise identical to hardening.sql: active check, question_count +
--   submitted flag, no correct_option / passwords, same search_path/grants.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_my_exams(p_student_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_exam_id    UUID;
  v_is_active  BOOLEAN;
  v_class_text TEXT;
  v_grade      INT;
  v_out        JSON;
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  SELECT exam_id, is_active, class
    INTO v_exam_id, v_is_active, v_class_text
  FROM public.students
  WHERE id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;
  IF v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Student account is inactive';
  END IF;

  -- Single parse per call; is_exam_visible_for_grade() handles NULL grade
  -- (only open exams pass) so no extra NULL branching needed below.
  v_grade := public.try_parse_class(v_class_text);

  IF v_exam_id IS NOT NULL THEN
    -- Assigned branch: exam_id does NOT bypass the class check.
    -- Ineligible => zero rows => COALESCE => '[]'.
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
        AND public.is_exam_visible_for_grade(v_grade, e.class_from, e.class_to)
    ) t;
  ELSE
    -- Published-list branch: same columns, filtered by class gate.
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
        AND public.is_exam_visible_for_grade(v_grade, e.class_from, e.class_to)
      ORDER BY e.created_at, e.code
    ) t;
  END IF;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.get_my_exams(UUID) IS
  'Lists exams for a student with STRICT class gate on BOTH branches (assigned exam_id does NOT bypass). Assigned-but-ineligible returns [] (no error). Includes question_count + submitted flag. Never returns correct_option or passwords.';

REVOKE ALL ON FUNCTION public.get_my_exams(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_exams(UUID) TO anon;

-- ============================================================================
-- §3. RPC: get_exam_paper — window/assignment/submission guards + class gate.
--   Class mismatch RAISES (unlike get_my_exams which returns []).
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
  -- STRICT class gate: assigned exam_id does NOT bypass. Placed after the
  -- assignment check so both guards stay enforced; raised before the
  -- submitted check so ineligible students always see the class error.
  IF NOT public.is_exam_visible_for_grade(
    public.try_parse_class(v_stu.class),
    v_exam.class_from,
    v_exam.class_to
  ) THEN
    RAISE EXCEPTION 'Student is not eligible for this class exam';
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
  'Returns exam + questions WITHOUT correct_option after validating active student, published status, time window, assignment, STRICT class gate (assigned does NOT bypass; raises Student is not eligible for this class exam), and no prior submission.';

REVOKE ALL ON FUNCTION public.get_exam_paper(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exam_paper(UUID, UUID) TO anon;

-- ============================================================================
-- §4. RPC: submit_attempt — server-side scoring + class gate.
--   Same re-validation as get_exam_paper (incl. class RAISE) except
--   submitted-ness becomes a dedupe return. Scoring / v_found / race logic
--   unchanged from hardening.sql.
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
  -- STRICT class gate: assigned exam_id does NOT bypass. Before dedupe so
  -- ineligible students can never create or read back a score.
  IF NOT public.is_exam_visible_for_grade(
    public.try_parse_class(v_stu.class),
    v_exam.class_from,
    v_exam.class_to
  ) THEN
    RAISE EXCEPTION 'Student is not eligible for this class exam';
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
  'Server-side grading with STRICT class gate (raises Student is not eligible for this class exam; assigned does NOT bypass). correct_total minus wrong*negative_marks floored at 0. INSERT ON CONFLICT DO NOTHING; submitted rows never overwritten (dedupe:true return).';

REVOKE ALL ON FUNCTION public.submit_attempt(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_attempt(UUID, UUID, JSONB) TO anon;

-- ============================================================================
-- §5. RPC: get_my_result — submitted attempt + per-question review + class gate.
--   Class gate is enforced even though a submitted attempt already exists:
--   an ineligible grade raises instead of leaking review/correct_option.
--   Window/published checks are intentionally NOT re-enforced here so results
--   stay viewable after the exam closes (class + active + submission only).
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
  v_stu   RECORD;
  v_exam  RECORD;
  v_att   RECORD;
  v_total NUMERIC := 0;
  v_rev   JSON;
BEGIN
  IF p_exam_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'Missing exam or student';
  END IF;

  -- Active-student guard (mirrors get_my_exams / get_exam_paper).
  SELECT * INTO v_stu FROM public.students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;
  IF v_stu.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Student account is inactive';
  END IF;

  -- Exam must exist so we can evaluate the class gate.
  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exam not found';
  END IF;

  -- STRICT class gate (assigned exam_id does NOT bypass).
  IF NOT public.is_exam_visible_for_grade(
    public.try_parse_class(v_stu.class),
    v_exam.class_from,
    v_exam.class_to
  ) THEN
    RAISE EXCEPTION 'Student is not eligible for this class exam';
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
  'Requires active student + STRICT class gate (raises Student is not eligible for this class exam) + submitted attempt. Returns {score,total,submitted_at,review:[{q_no,chosen,correct,marks,ok}]}. Window not re-enforced so results survive closing.';

REVOKE ALL ON FUNCTION public.get_my_result(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_result(UUID, UUID) TO anon;

-- ============================================================================
-- §6. Verification queries (commented — uncomment to audit after running)
-- ============================================================================
-- -- Helpers: spot-check parsing + gate matrix (expected values in comments):
-- -- SELECT public.try_parse_class('5');        -- 5
-- -- SELECT public.try_parse_class(' 8 ');      -- 8
-- -- SELECT public.try_parse_class('Class 10'); -- 10
-- -- SELECT public.try_parse_class('VIII');     -- 8
-- -- SELECT public.try_parse_class('viii');     -- 8
-- -- SELECT public.try_parse_class('Class VIII'); -- 8
-- -- SELECT public.try_parse_class('iv');       -- 4
-- -- SELECT public.try_parse_class('XII');      -- 12
-- -- SELECT public.try_parse_class(NULL);       -- NULL
-- -- SELECT public.try_parse_class('');         -- NULL
-- -- SELECT public.try_parse_class('abc');      -- NULL
-- -- SELECT public.try_parse_class('13');       -- NULL
-- -- SELECT public.try_parse_class('0');        -- NULL
-- --
-- -- SELECT public.is_exam_visible_for_grade(5, NULL, NULL); -- true  (open)
-- -- SELECT public.is_exam_visible_for_grade(NULL, NULL, NULL); -- true (open even with NULL grade)
-- -- SELECT public.is_exam_visible_for_grade(NULL, 1, 5);    -- false (unparsable sees only open)
-- -- SELECT public.is_exam_visible_for_grade(8, 8, NULL);    -- true  (>=8)
-- -- SELECT public.is_exam_visible_for_grade(7, 8, NULL);    -- false
-- -- SELECT public.is_exam_visible_for_grade(5, NULL, 5);    -- true  (<=5)
-- -- SELECT public.is_exam_visible_for_grade(6, NULL, 5);    -- false
-- -- SELECT public.is_exam_visible_for_grade(5, 8, 5);       -- false (from>to)
-- -- SELECT public.is_exam_visible_for_grade(5, 1, 5);       -- true  (inclusive upper)
-- -- SELECT public.is_exam_visible_for_grade(1, 1, 5);       -- true  (inclusive lower)
-- -- SELECT public.is_exam_visible_for_grade(6, 1, 5);       -- false
-- --
-- -- RPCs present, SECURITY DEFINER, granted to anon:
-- -- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
-- --        p.prosecdef AS is_definer, p.provolatile AS volatility
-- -- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- -- WHERE n.nspname = 'public'
-- --   AND p.proname IN ('try_parse_class','is_exam_visible_for_grade','get_my_exams','get_exam_paper','submit_attempt','get_my_result')
-- -- ORDER BY p.proname;
-- --
-- -- Smoke tests (replace placeholders with real ids):
-- -- SELECT public.get_my_exams('<student_uuid>'::uuid);
-- --   -- assigned-but-ineligible student must get '[]', not an error.
-- -- SELECT public.get_exam_paper('<exam_uuid>'::uuid, '<student_uuid>'::uuid);
-- --   -- ineligible grade must RAISE 'Student is not eligible for this class exam'.
-- -- SELECT public.submit_attempt('<exam_uuid>'::uuid, '<student_uuid>'::uuid, '{"1":"B"}'::jsonb);
-- --   -- ineligible grade must RAISE 'Student is not eligible for this class exam'.
-- -- SELECT public.get_my_result('<exam_uuid>'::uuid, '<student_uuid>'::uuid);
-- --   -- ineligible grade must RAISE 'Student is not eligible for this class exam'.
