# Deploy Guide — IMOF Exam Portal

Target: Supabase (database) + Vercel (hosting). Optional custom domain `exam.imofedu.com`.

## 1. Create Supabase Project

1. Go to https://supabase.com/dashboard → New Project.
2. Name: `imof-exam-portal`, set strong DB password, choose region closest to users (e.g., Mumbai / Singapore for India).
3. Wait for provisioning. Note:
   - Settings → API → Project URL → `VITE_SUPABASE_URL`
   - Settings → API → `anon` public key → `VITE_SUPABASE_ANON_KEY`
4. Keep `service_role` key secret — never expose in frontend env.

## 2. SQL Runbook

Run in Dashboard → SQL Editor → New Query, in this order:

**Step A — Schema**
1. Open repo file `supabase/schema.sql`.
2. Paste entire contents into SQL Editor → Run.
3. Confirm tables created: exams, students, questions, attempts/results (check Table Editor).

**Step B — Seed**
1. Open repo file `supabase/seed.sql`.
2. Paste entire contents → Run.
3. Verify: demo exam `IMOF-SVMO-2026`, students `demo001`/`demo002`, sample questions present.

Rules:
- Always run `schema.sql` before `seed.sql` on a fresh project.
- Do not re-run `schema.sql` on a live project without backup — risk of data loss.
- For a clean reset: create a new Supabase project and repeat A → B.

## 3. Vercel Setup

1. Push code to GitHub.
2. https://vercel.com → Add New → Project → import repo.
3. Framework Preset: Vite. Build Command: `npm run build`. Output Directory: `dist`.
4. `vercel.json` already contains SPA fallback (`/(.*)` → `/index.html`) — no extra config needed.
5. Add Environment Variables (Production + Preview):

| Key | Value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_ADMIN_ID` | `admin` (or production ID) |
| `VITE_ADMIN_PASSWORD` | strong production password |
| `VITE_MOCK_MODE` | `false` |

6. Deploy → open `https://<project>.vercel.app/login` and smoke test:
   - Admin login → dashboard loads, tables render.
   - Student `demo001` / `mcq@imof` → exam loads → answer → End Test → result shows.

## 4. Custom Domain (suggested: exam.imofedu.com)

1. Vercel Project → Settings → Domains → Add `exam.imofedu.com`.
2. At DNS provider (domain registrar), add CNAME: host `exam` → `cname.vercel-dns.com`.
3. Wait for DNS + SSL issuance (usually minutes). Vercel auto-provisions HTTPS.
4. Verify `https://exam.imofedu.com/login` works. Keep the `*.vercel.app` URL as fallback.

## 5. Post-Deploy Checklist

- [ ] `VITE_MOCK_MODE=false` in production.
- [ ] Admin password changed from default `imof2026`.
- [ ] Seed demo accounts removed or deactivated if not needed.
- [ ] Exam schedules and question imports verified.
- [ ] Result export and scorecard print checked.
