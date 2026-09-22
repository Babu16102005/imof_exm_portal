# Excel / CSV Import Guide — Students & Questions

Templates: `templates/students_template.csv`, `templates/questions_template.csv`. Both `.csv` and `.xlsx` are accepted (first sheet / first worksheet used). Ready-made Excel files with an Instructions sheet: `templates/students_template.xlsx`, `templates/questions_template.xlsx` — or click **Template (Excel)** inside Admin > Students / Questions to download them from the app. Keep header row exactly as specified.

## 1. Students Import

**Exact columns (in order):**

`user_id,password,name,class,school,exam_code,is_active`

**Sample rows:**

```csv
user_id,password,name,class,school,exam_code,is_active
IMOF1001,mcq@imof,Aarav Sharma,5,SVMO Demo School,IMOF-SVMO-2026,true
IMOF1002,mcq@imof,Diya Patel,5,SVMO Demo School,IMOF-SVMO-2026,true
```

**Validation rules:**

- `user_id`: required, unique (case-sensitive). Allowed: letters, numbers, `- _ .`. Trim spaces. Duplicate `user_id` in file or DB → row rejected.
- `password`: required, min 4 chars. Stored plain-text in MVP — use exam-only passwords.
- `name`: required, max 100 chars.
- `class`: required. Accept `PreKG–12` labels or numerals (e.g., `5`, `UKG`, `11th`). Must match exam eligibility.
- `school`: required. Must match existing school name or be created first.
- `exam_code`: required. Must already exist in Exams (e.g., `IMOF-SVMO-2026`). Unknown code → row rejected.
- `is_active`: required. `true` / `false` (lowercase). Inactive students cannot log in.
- Empty rows are skipped. Extra columns are ignored. Max recommended batch: 2,000 rows per file.

## 2. Questions Import (exam-scoped)

Pick the exam first in Admin > Exams > + New exam (step 2 Upload Questions)
or Admin > Questions (Exam dropdown). The file has NO `exam_code` column —
every valid row is saved to that selected exam only.

**Exact columns (in order):**

`q_no,question_text,option_a,option_b,option_c,option_d,correct_option,marks`

**Sample rows:**

```csv
q_no,question_text,option_a,option_b,option_c,option_d,correct_option,marks
1,What is 12 × 8?,84,96,108,92,B,1
2,Which is the smallest prime number?,0,1,2,3,C,1
```

**Validation rules:**

- `q_no`: positive integer, unique within the exam. Blank defaults to row order (1, 2, …). Duplicates → rejected. Display order follows `q_no`.
- `question_text`: required, max 1,000 chars. Plain text (no HTML).
- `option_a` … `option_d`: all required, each max 500 chars, non-empty.
- `correct_option`: required. One of `A`, `B`, `C`, `D` (uppercase). Anything else → rejected.
- `marks`: number ≥ 0 (default `1` when blank). Explicit `0` allowed. No negative marking in MVP.
- Legacy files: an old `exam_code` column still imports — the column is ignored (questions go to the selected exam) and the UI shows an "exam_code column ignored" notice. Prefer the scoped template for new files.
- Images/formulas: not supported via import — add via admin UI if available.

## 3. Upload Workflow

1. Admin → Students (or Questions) → Import.
2. Download template if needed. Fill rows, keep header intact.
3. Upload `.csv` (UTF-8) or `.xlsx`. Use UTF-8 to preserve Tamil / special characters.
4. Review validation report → fix rejected rows → re-upload only failed rows.
5. Confirm. Verify counts in list view.

## 4. Common Errors

| Error | Cause | Fix |
|---|---|---|
| `Unknown exam_code` (students only) | Typo or exam not created in students file | Create exam first, match code exactly. N/A to questions — questions are exam-scoped and any legacy `exam_code` column is ignored |
| `Duplicate user_id / q_no` | Already in DB or twice in file | Remove or renumber |
| `Invalid correct_option` | Not A–D uppercase | Correct to `A`/`B`/`C`/`D` |
| `Login fails after import` | `is_active=false` or wrong password | Set `true`, verify password |
| Garbled characters | File not UTF-8 | Re-save as UTF-8 CSV |
