-- ============================================================================
-- IMOF Exam Portal — Hardening Fix 1 (run AFTER hardening.sql)
-- Reason: on Supabase, pgcrypto installs into the `extensions` schema, so
-- SECURITY DEFINER functions pinned to `search_path = public` could not find
-- crypt() / gen_random_bytes() ("function crypt(text, text) does not exist").
-- This patch widens every hardening function to `public, extensions`.
-- Safe to re-run. hardening.sql itself is already patched for fresh installs.
-- ============================================================================

ALTER FUNCTION public._rls_fail(TEXT, INT, INT)              SET search_path = public, extensions;
ALTER FUNCTION public._rls_note_fail(TEXT)                   SET search_path = public, extensions;
ALTER FUNCTION public._rls_clear(TEXT)                       SET search_path = public, extensions;
ALTER FUNCTION public._admin_token_ok(TEXT)                  SET search_path = public, extensions;
ALTER FUNCTION public.verify_student_login(TEXT, TEXT)       SET search_path = public, extensions;
ALTER FUNCTION public.verify_admin_login(TEXT, TEXT)         SET search_path = public, extensions;
ALTER FUNCTION public.admin_touch(TEXT)                      SET search_path = public, extensions;
ALTER FUNCTION public.get_my_exams(UUID)                     SET search_path = public, extensions;
ALTER FUNCTION public.get_exam_paper(UUID, UUID)             SET search_path = public, extensions;
ALTER FUNCTION public.submit_attempt(UUID, UUID, JSONB)      SET search_path = public, extensions;
ALTER FUNCTION public.get_my_result(UUID, UUID)              SET search_path = public, extensions;

-- Confirm passwords actually got bcrypt-hashed by hardening.sql §1/§5
-- (both counts must be 0; if not, run the two UPDATEs from hardening.sql §5):
SELECT COUNT(*) AS plaintext_students FROM public.students WHERE password NOT LIKE '$2%';
SELECT COUNT(*) AS plaintext_admins FROM public.admins WHERE password NOT LIKE '$2%';

-- Smoke test (expect one JSON row back, no password field):
-- SELECT public.verify_student_login('demo002', 'demo123');
