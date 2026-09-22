# IMOF Exam Portal — Supabase Setup

> MVP uses **permissive anon RLS policies + plaintext demo passwords** so it works
> out of the box. **Harden before giving to real students** (see §5).

## 1. Run the SQL in Supabase Dashboard

1. Go to [supabase.com](https://supabase.com) → your project → **SQL Editor**.
2. Click **New Query**.
3. Open `supabase/schema.sql` in this repo, copy **entire contents**, paste into the editor, click **Run**.
   - Expected: `Success. No rows returned` (tables + indexes + RLS policies created).
4. Click **New Query** again.
5. Open `supabase/seed.sql`, copy entire contents, paste, click **Run**.
   - Expected: `Success` (1 exam, 10 questions, 3 students, 1 admin).
6. Verify via **Table Editor**: `exams` should contain `IMOF-SVMO-2026`
   (`status = published`), `questions` 10 rows, `students` `demo001–003`,
   `admins` `admin`.

Re-running either file is safe (uses `IF NOT EXISTS` / `ON CONFLICT` upserts).

## 2. Environment Variables Needed

Create a `.env.local` (Next.js) or `.env` (Vite) in the project root — **never commit it**.

```bash
# Required — find both in Supabase Dashboard > Project Settings > API
NEXT_PUBLIC_SUPABASE_URL=https://xyzcompany.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi... (anon / public key)

# Server-only (NEVER expose with NEXT_PUBLIC_ / VITE_ prefix).
# Needed only for secure admin imports / future RPC hardening.
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... (service_role key)
```

Vite equivalents: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

| Var | Where | Purpose |
| --- | ----- | ------- |
| `*_SUPABASE_URL` | client | Supabase project endpoint |
| `*_SUPABASE_ANON_KEY` | client | MVP client access (gated by RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Bulk CSV imports, password rotation, post-MVP RPC |

## 3. Excel / CSV Column Specs

Use the starter files in `templates/`. Save Excel sheets as **CSV UTF-8**.
For students, `exam_code` must already exist in `exams.code`.
For questions, the file is exam-scoped (no `exam_code` column) — pick the exam in the admin UI; every row is saved to that exam.

### `templates/students_template.csv` → `students` table

| Column | Required | Format / Rules | Example |
| ------ | -------- | -------------- | ------- |
| `user_id` | ✅ | unique, ≥3 chars, no spaces (`demo001`) | `demo001` |
| `password` | ✅ | plaintext for MVP (hash later) | `demo123` |
| `name` | – | free text | `Aarav Sharma` |
| `class` | – | text as-is (`5`, `VI`, `Grade 5`) | `5` |
| `school` | – | free text | `SVMO Demo School` |
| `exam_code` | – | must match `exams.code`, else left unassigned | `IMOF-SVMO-2026` |
| `is_active` | – | `true` / `false` (default `true`) | `true` |

Import order: `exams` first → then `students` (lookup `exam_id` from `exam_code`).

### `templates/questions_template.csv` → `questions` table (exam-scoped)

> No `exam_code` column — the target exam comes from the admin UI
> (Exams wizard step 2, or the Questions page exam picker). Legacy files
> with `exam_code` still import; that column is ignored.

| Column | Required | Format / Rules | Example |
| ------ | -------- | -------------- | ------- |
| `q_no` | – | integer > 0, unique within the exam (blank = row order) | `1` |
| `question_text` | ✅ | plain text (avoid commas/newlines or quote the cell) | `What is 12 × 8?` |
| `option_a` | ✅ | text | `84` |
| `option_b` | ✅ | text | `96` |
| `option_c` | ✅ | text | `108` |
| `option_d` | ✅ | text | `92` |
| `correct_option` | ✅ | exactly `A`, `B`, `C`, or `D` (uppercase) | `B` |
| `marks` | – | number ≥ 0 (default `1`) | `1` |

Tips: keep `q_no` sequential 1..N; after import run the reconcile query in §4.

## 4. How Admin Customizes `total_questions`

`exams.total_questions` is **manual metadata** — it does NOT auto-update when
you add/delete rows in `questions`. Recommended flow:

1. Import/edit questions for exam code `<CODE>`.
2. Set the intended count explicitly:
   ```sql
   UPDATE public.exams SET total_questions = 25 WHERE code = 'IMOF-SVMO-2026';
   ```
3. Or reconcile from actual rows:
   ```sql
   UPDATE public.exams e
   SET total_questions = q.cnt
   FROM (SELECT exam_id, COUNT(*)::INT AS cnt
         FROM public.questions GROUP BY exam_id) q
   WHERE e.id = q.exam_id AND e.code = 'IMOF-SVMO-2026';
   ```
4. Frontend should render `min(total_questions, count(questions))` and warn if
   they differ (catches half-finished imports).

## 5. Security TODO Before Production

- [ ] Replace anon permissive RLS policies in `schema.sql` with least-privilege ones.
- [ ] Move student/admin login, exam fetch (without `correct_option`), and
      submit/scoring into `SECURITY DEFINER` RPC functions.
- [ ] Hash all passwords (bcrypt/scrypt) or migrate to Supabase Auth; rotate
      `admin/imof2026` and `demo00x/demo123` immediately.
- [ ] Restrict `service_role` key to server-side import scripts only.
