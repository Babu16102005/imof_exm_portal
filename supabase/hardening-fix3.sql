-- ============================================================================
-- IMOF Exam Portal — Hardening Fix 3 (run AFTER hardening.sql)
-- Problem: admin Excel uploads (upsertStudents) and password resets write
-- PLAINTEXT passwords — the hash UPDATEs in hardening.sql only cover rows
-- existing at run time. This trigger hashes every future write transparently.
-- Safe to re-run. Included in hardening.sql for fresh installs? No —
-- keep as separate patch (run once).
-- NOTE: bcrypt per row costs ~30ms; bulk uploads are chunked (250/batch)
-- in the app to stay inside timeout limits.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._hash_password_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.password IS NOT NULL AND NEW.password NOT LIKE '$2%' THEN
    NEW.password := crypt(NEW.password, gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._hash_password_trigger() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_hash_student_password ON public.students;
CREATE TRIGGER trg_hash_student_password
  BEFORE INSERT OR UPDATE OF password ON public.students
  FOR EACH ROW EXECUTE FUNCTION public._hash_password_trigger();

DROP TRIGGER IF EXISTS trg_hash_admin_password ON public.admins;
CREATE TRIGGER trg_hash_admin_password
  BEFORE INSERT OR UPDATE OF password ON public.admins
  FOR EACH ROW EXECUTE FUNCTION public._hash_password_trigger();

-- Backfill anything still plaintext (guarded, safe to re-run):
UPDATE public.students SET password = crypt(password, gen_salt('bf')) WHERE password NOT LIKE '$2%';
UPDATE public.admins SET password = crypt(password, gen_salt('bf')) WHERE password NOT LIKE '$2%';

-- Verify (both must be 0; triggers must exist):
-- SELECT COUNT(*) FROM public.students WHERE password NOT LIKE '$2%';
-- SELECT COUNT(*) FROM public.admins WHERE password NOT LIKE '$2%';
-- SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_hash_%';
