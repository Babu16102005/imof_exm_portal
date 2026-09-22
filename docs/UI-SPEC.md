# IMOF Exam Portal — UI Spec (v1)

> Stack: React 19 + Vite (scaffold untouched) + Tailwind (to be added by builder).
> Brand reference: https://www.imofedu.com/ — trusted school-olympiad look, rebuilt as a calm exam product.
> Tokens: `src/theme/tokens.js` is the single source of truth. All hex/radii/shadows below come from it.
> Constraint: this spec creates **no app code** — builders implement routes/components later.

---

## 1. Global principles

- **One job per page:** Landing reassures (trust) → Login is frictionless → Exam is distraction-free → Result explains.
- **Signature element:** the saffron `#F59E0B` underline-tick. One per viewport: hero headline tick, section eyebrow tick, exam progress fill, score-circle arc. Everything else stays quiet navy/white.
- **Density:** marketing pages airy (`sectionY: clamp(3rem,7vw,5.5rem)`), exam player dense (max 760px reader column).
- **Copy voice:** plain, active, from student's side. Buttons say what happens: `Start Test`, `Save & Next`, `End Test`, not `Submit`.

---

## 2. Tokens snapshot (see `src/theme/tokens.js`)

| Role | Value | Usage |
|---|---|---|
| Primary navy | `#0B2F6B` | header, footer, exam top bar, primary buttons |
| Primary deep | `#071E45` | footer bg, exam bar, overlays |
| Secondary royal | `#1450A0` / hover `#0F3E7E` | links, active nav, focus rings, info |
| Accent saffron | `#F59E0B` / hover `#D97706` / soft `#FEF3C7` | single CTA per view, ticker, progress, score arc |
| Success / Error | `#16A34A` / `#DC2626` (+ soft/border/ink) | palette states, toasts, result |
| Paper / Surface / Border | `#F8FAFC` / `#FFFFFF` / `#E2E8F0` | page, cards, hairlines |
| Text / Muted | `#0F172A` / `#475569` | headings/body vs secondary copy |
| Display / Body | Plus Jakarta Sans / Inter (+ Noto Sans Tamil fallback) | headings / UI + paragraphs |
| Radii | 8 / 12 / 16 / 24 / 999 | inputs 8, cards 16, pills 999 |
| Shadows | sm / md / lg / navyGlow / accentGlow | cards md, dropdowns lg, focus navyGlow |

Contrast (AA): white on `#0B2F6B` = 12.6:1 ✅; white on `#1450A0` = 7.1:1 ✅; `#92400E` on `#FEF3C7` ✅. Never use `#F59E0B` as text on white — use `#92400E` or navy.

---

## 3. App shell & navigation

### 3.1 Header (all marketing pages + login)

```
┌──────────────────────────────────────────────────────┐
│ [■ IMOF] Innovative Minds Olympiad Forum   [Exam Login│]
│ Home About Olympiads Information Gallery Contact      │
│ Result                                    [Exam Login]│
└──────────────────────────────────────────────────────┘
```

- Top utility strip (navy `#071E45`, 32px, caption 12px): `info@imofedu.com · +91 93457 80567` left; `Result | Exam Login` right. Hides < 768px except Exam Login.
- Main bar (white, sticky, `z-header:40`, `shadow-sm` on scroll): logo mark (navy rounded square with white `IM` + saffron dot) + two-line lockup: `IMOF` (display 800, navy) / `Innovative Minds Olympiad Forum` (caption, muted).
- Nav order (exact): `Home / About / Olympiads / Information / Gallery / Contact / Result / Exam Login`. `Exam Login` is a saffron button (`accent → accentHover`, navy text? use `#061733` text on saffron for AA), others are text links with navy underline on active/hover.
- Mobile < 1024px: hamburger → full-sheet menu, focus-trapped, `Esc` closes, nav list + big Exam Login button. No hover-only dropdowns; `Olympiads`/`Information` accordions expand on tap.

### 3.2 Flash ticker

- Saffron-soft `#FEF3C7` strip, 1px `#FCD34D` borders, megaphone icon + `Flash News:` eyebrow + scrolling/marquee text: `Exam Date Announced. Be prepared for the exam.` + `View Schedule →` link.
- Motion: CSS marquee paused on hover/focus + `prefers-reduced-motion` shows static text. `aria-live="polite"`, duplicated content `aria-hidden`.

### 3.3 Footer (navy deep `#071E45`, white text)

4 columns: Brand (logo, blurb, socials Facebook/Instagram/YouTube/WhatsApp) · Olympiads (SIRO, SVMO, SISO, SCTO, NIKO, NIPO) · Quick Links (Results, Testimonials, Why IMOF?, Terms, Privacy) · Contact (email, phones, www.imofedu.com). Bottom bar: `© 2025 IMOF Edu Solutions Pvt. Ltd. — Innovative Learning, Limitless Possibilities`.

---

## 4. Landing page (`/`)

### 4.1 Hero

```
┌──────────────────────────────┬───────────────────────┐
│ EYEBROW: INDIA'S INNOVATIVE OLYMPIAD                 │
│ Innovative Minds             │  [student collage /   │
│ Olympiad Forum◟saffron tick◞ │   medal illustration] │
│ Empowering students with…    │  floating chips:      │
│ [Explore Olympiads][Login →] │  7.4M+ · 10,000+      │
└──────────────────────────────┴───────────────────────┘
```

- BG: paper `#F8FAFC` with subtle navy radial wash top-right; left-aligned display `clamp(2rem,5vw,3.5rem)`.
- CTAs: primary navy `Explore Olympiads` + secondary outline `Exam Login →`. One saffron tick under `Forum`.
- Trust row (logos/text): `Trusted by 10,000+ Schools & 7.4M Students`.
- Right visual: single rounded-24 image card (`shadow-lg`), floating stat chips (white, `shadow-md`, `radius-pill`). Decorative only → `aria-hidden`, no auto-carousel.

### 4.2 Stats band (navy `#0B2F6B`, white)

4–6 numbers, mono numerals: `10,000+ Schools · 7.4M+ Students · 652K+ Happy Learners · 552+ Centres · 5,200+ Educators`. Label caption uppercase muted-on-dark `#CBD5E1`. Count-up only if `prefers-reduced-motion: no-preference`; SSR shows final values.

### 4.3 Olympiad grid (11 cards)

Section head: eyebrow `OUR PROGRAMS` + H2 `One Olympiad for every mind` + link `All Olympiads →`.

Grid: 4-col xl / 3-col lg / 2-col sm / 1-col mobile, gap 20px. Card: white, `radius-lg:16`, `shadow-sm` → `md` on hover, top icon tile (secondarySoft bg, navy glyph), code chip (mono, e.g. `SIRO`), title, classes line, 1-line desc, `View details →` link. Whole card clickable (`<a>` stretched-link), focus ring `navyGlow`.

| # | Code | Full name | Classes |
|---|---|---|---|
| 1 | SIRO | State Innovative Reasoning Olympiad | 1st–10th |
| 2 | SVMO | State Visionary Math Olympiad | 1st–10th |
| 3 | SISO | State Inspired Science Olympiad | 1st–10th |
| 4 | SCTO | State Computer Tech Olympiad | 1st–10th |
| 5 | NIKO | National Innovative Kindergarten Olympiad | PreKG–UKG |
| 6 | NIPO (Art) | National Innovative Painting Olympiad | PreKG–5th |
| 7 | NIEO | National Inspired Essay Olympiad | 6th–10th |
| 8 | NIGKO | National Ingenious GK Olympiad | 1st–12th |
| 9 | NIPO (Phy) | National Innovative Physics Olympiad | 11th–12th |
| 10 | NICO | National Innovative Chemistry Olympiad | 11th–12th |
| 11 | NIBO | National Innovative Biology Olympiad | 11th–12th |

> Disambiguation: two NIPOs exist on imofedu.com. Cards must show qualifier `(Art)` / `(Physics)` + distinct icons; detail pages use slugs `nipo-art` / `nipo-physics`.

Below grid: CTA band (accent-soft) `Apply Franchise / Become a Coordinator` two buttons.

### 4.4 Welcome + Testimonials + Partners

- Welcome: 2-col (text + image), H2 `Welcome to Innovative Minds Olympiad Forum`, 3-bullet strengths, `Learn more →`.
- Testimonials: 3 cards (quote, name, school), stars, `More Reviews →`.
- Partners: grayscale logo row, 6 logos, `aria-label="Our partners"`.

---

## 5. Login (`/login`)

```
┌──────────────────┬───────────────────────────────┐
│ navy panel:      │  Card (white, radius 24):     │
│ "Ready to shine? │  [Student|School|Admin tabs]  │
│ 🛡️ instructions │  User ID [____________]       │
│ • timing • help  │  Password [____________] 👁   │
│ helpline         │  [ Login to Exam ]            │
│                  │  Admin? Sign in here →        │
└──────────────────┴───────────────────────────────┘
```

- Split layout ≥1024px (navy left with checklist + helpline `+91 73389 00374`), centered card < 1024px. Card width 440px, `shadow-lg`.
- Fields: `User ID` (mono, autocomplete `username`) + `Password` (show/hide toggle, autocomplete `current-password`). Labels always visible; errors inline with `role="alert"` + red border + icon (never color alone).
- Roles: tabs or `?role=admin` link `Admin? Sign in here →` switches endpoint + heading; student default. Caps-lock hint on password.
- States: idle / loading (button spinner + `aria-busy`, disabled) / error (`Invalid User ID or password. Try again or contact your school coordinator.`) / locked (`Too many attempts. Try in 15 min.`).
- On success: `POST /auth/login` → store httpOnly session (no localStorage token), redirect `student → /exam`, `admin → /admin`. “Remember” not offered on shared school devices.

---

## 6. Admin (`/admin/*`)

Shell: navy sidebar (icons + labels: Dashboard, Exams, Students, Schools, Questions, Results, Settings) → top bar (page title + school selector + avatar). Content bg paper.

```
┌────────┬──────────────────────────────────────────┐
│ side   │ KPI row: [Active Exams][Students][Schools]│
│ nav    │ [Today's Exams table] [Quick actions]    │
│        │ [Recent results table w/ status pills]  │
└────────┴──────────────────────────────────────────┘
```

- KPI cards (4): white, `radius-lg`, big mono number + delta chip (`+12%` green soft / `-3%` red soft) + sparkline (aria-hidden, table fallback).
- Tables: sticky header, zebra `muted` rows, status pills (Scheduled=info, Live=success pulse, Ended=muted, Flagged=error) with icon+text, row actions (⋯ menu, keyboard reachable), pagination + CSV export. Empty state: illustration + `No exams yet — Create exam` button. All tables `<table>` with `<th scope>`, sortable headers `aria-sort`.
- Forms (Create exam): 2-col, sections (Details / Schedule / Questions / Access), inline validation, destructive actions need typed confirm modal.

---

## 7. Exam player (`/exam/:id`) — distraction-free

Chrome: slim navy top bar (exam title + code chip + `End Test` outline-white button) → sticky timer bar below.

```
┌───────────────────────────────────────────────────┐
│ IMOF · SVMO 2026-27 · Grade 5        [⏱ 42:10][End]│
│ ▓▓▓▓▓▓▓░░░░░ Q14/30 · 47% · Saved ✓               │
├──────────┬────────────────────────────┬───────────┤
│ Palette  │ Q14. Which shape…?         │ (mobile:  │
│ 1..30    │ ( ) A  ( ) B  ( ) C ( ) D  │ bottom    │
│ legend   │ [Clear]                    │ sheet)    │
│          │ [← Prev][Save & Next →]    │           │
└──────────┴────────────────────────────┴───────────┘
```

- Timer bar: linear progress (saffron fill) + mono countdown `MM:SS`, `role="timer" aria-live="off"` (announce only at 10/5/1-min via polite live region). <5 min: bar turns error + `Time running out` text (not color alone).
- Palette (left desktop 240px, bottom sheet mobile): numbered buttons 36px, states — unvisited outline, unanswered red outline, answered green fill, marked violet + `⚑`, current navy double-ring. Legend with counts. Keyboard: `[`/`]` prev/next, `1–4` options, `M` mark.
- Question card (reader 760px, white, `radius-lg`, `shadow-md`): `Q14 of 30 · +2 marks` caption, stem body 18px/1.6, options as large radio rows (48px target, `radius-md`, selected = secondarySoft bg + navy border + filled radio). Images get alt + zoom. `Clear response` text button. Flag `Mark for review` checkbox.
- Footer nav: `← Previous` (ghost) · `Save & Next →` (primary navy) · `End Test` (danger-outline, opens confirm modal with answered/unanswered/marked summary + type-to-confirm? just explicit `End test` button). Auto-save every answer (`Saved ✓ HH:MM:SS`, retry on offline with `Offline — will retry` warning + queue).
- Guards: `beforeunload` while live, anti-double-submit, heartbeat; no webcam claims in UI unless implemented.

---

## 8. Result (`/result/:attemptId`)

```
┌──────────────────────────────────────────────────┐
│  ◯ 78%  Score circle (saffron arc)               │
│  39/50 · Rank #12 · 42:10 taken · Passed ✓       │
│  [Download Scorecard][Review Answers][Retake?]    │
│  Section bars: Math ▓▓▓▓ 85% · Science ▓▓ 62%…   │
│  Q-by-Q review list (✓/✗/○ + explainer)          │
└──────────────────────────────────────────────────┘
```

- Hero card (narrow 880px): SVG score circle (saffron arc, navy track, mono `%`, `role="img" aria-label="Scored 39 of 50, 78 percent"`), status pill (Passed=success / Needs practice=warning), meta row (rank, accuracy, time, date).
- Section breakdown: horizontal bars (navy fill, % labels outside bar — not color alone) + per-section correct/total.
- Review list: each item shows stem (truncated) + `Your: B · Correct: C` + ✓/✗/skipped icon + 1-line explainer; filter chips `All / Correct / Wrong / Skipped`. Print stylesheet: white, no nav, QR + attempt ID.
- Share/scorecard: `Download Scorecard (PDF)` primary; `Back to Home` ghost. No raw correct-answers leak before release window — show `Answers release on <date>` gate if needed.

---

## 9. Responsive behavior

| Breakpoint | Shell | Landing | Exam | Admin/Result |
|---|---|---|---|---|
| <640 (mobile) | hamburger sheet; ticker static | hero stacks (CTA full-width), grid 1-col | palette → bottom sheet + `Palette (14/30)` button; options full-width; timer condenses to `⏱42:10` | tables → card list (`data-label` cells); KPI 1-col |
| 640–1023 | utility strip hides contact | grid 2-col, stats 2×2 | palette overlay drawer, question full-width | sidebar → icon rail |
| ≥1024 | full nav, sticky header | grid 3-col, hero 2-col | 3-col (palette + reader); sticky timer | full sidebar + multi-col tables |
| ≥1280 | 1126px container centered | grid 4-col (last row 3) | reader 760 centered, palette sticky | KPI 4-across |

Touch: all targets ≥44px; exam options 48px. No hover-only content. Tables scroll-x with sticky first col + shadow hint.

---

## 10. Accessibility notes (must-pass)

- Landmarks: `header/nav/main/footer`, one `h1` per page, heading order unbroken; skip-link `Skip to content`.
- Focus: 3px navy outline + `navyGlow`, always visible; focus-trap in menu/modal/sheet; return focus on close; `Esc` closes.
- Forms: explicit `<label>`, `aria-describedby` hints/errors, `aria-invalid`, password toggle `aria-pressed`, `role="alert"` errors.
- Exam: radios as real `<input type="radio">` fieldset+legend; palette buttons `aria-pressed`/`aria-current`; timer `role="timer"` silent + separate polite announcer; never color-alone (icon + label + pattern).
- Motion: `prefers-reduced-motion` disables marquee/count-up/progress animation. Contrast: body ≥4.5:1, large ≥3:1; test saffron only as fill, never body text.
- i18n: Tamil fallback fonts loaded; strings externalized for EN/TA; numbers use `Intl.NumberFormat('en-IN')` (7,40,000 style where relevant, 7.4M in hero per brand).

---

## 11. Component hierarchy (for builders)

```
<App>
  <SkipLink /> <FlashTicker /> <SiteHeader /> <main> <SiteFooter /> <Toasts />
  <LandingPage> : Hero + StatsBand + OlympiadGrid(OlympiadCard×11) + Welcome + Testimonials + Partners + CtaBand
  <LoginPage>   : AuthSplitPanel + LoginCard(RoleTabs + UserIdField + PasswordField + SubmitButton + AdminLink)
  <AdminShell>  : SideNav + TopBar + <DashboardPage(KpiCard×4 + ExamsTable + ResultsTable) | ExamsPage | StudentsPage …>
  <ExamPlayer>  : ExamTopBar + TimerBar + PalettePanel(PaletteButton×N + Legend) + QuestionCard(OptionRow×4) + ExamNav + EndTestModal
  <ResultPage>  : ScoreHero(ScoreCircle + StatusPill + MetaRow) + SectionBars + ReviewList(ReviewItem×N + FilterChips)
  primitives: Button / Input / Card / Pill / Modal / Table / Progress / Tabs / EmptyState
```

State/data (suggestion): `AuthContext` (role, session) · `ExamContext` (currentQ, answers, marks, palette, timer, syncStatus) · API: `POST /auth/login`, `GET /exams/:id`, `PUT /attempts/:id/answer`, `POST /attempts/:id/finish`, `GET /attempts/:id/result`.

---

## 12. Handoff checklist

- [ ] Add Tailwind (builder) and map `src/theme/tokens.js` → config; inject Google Fonts link from `fonts.googleFontsHref`.
- [ ] Routes: `/ /about /olympiads /information /gallery /contact /result /login /exam/:id /admin/*` — nav order must match §3.1.
- [ ] Olympiad slugs: disambiguate `nipo-art` vs `nipo-physics`.
- [ ] Empty/loading/error/offline states for every table + exam auto-save.
- [ ] Print CSS for result scorecard. `lang="en"` (+ `ta` toggle later).
