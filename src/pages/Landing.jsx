import { Link } from 'react-router-dom'
import MetallicButton from '../components/MetallicButton.jsx'
import { Tilt } from '../components/Tilt.jsx'
import Velaris from '../components/Velaris.jsx'

const ICON = '/assets/olympiads'
const olympiads = [
  // Exactly as imofedu.com product cards map icon → label (fixes mismatch)
  { code: 'SIRO', name: 'State Regional Olympiad', classes: 'Class 1 – 10', desc: "Boosts reasoning, assesses capability and helps students know their true potential.", cat: `${ICON}/languages.png` },
  { code: 'SVMO', name: 'State Visionary Math Olympiad', classes: 'Class 1 – 10', desc: 'Vedic maths, sutras and high-speed mental calculation for young problem-solvers.', cat: `${ICON}/maths.png` },
  { code: 'SISO', name: 'State Inspired Science Olympiad', classes: 'Class 1 – 10', desc: 'Concept-driven science with experiments and application-based thinking.', cat: `${ICON}/design-thinking.png` },
  { code: 'SCTO', name: 'State Computer Tech Olympiad', classes: 'Class 1 – 10', desc: 'Computers, coding logic and digital awareness for the AI generation.', cat: `${ICON}/laptop-computer.png` },
  { code: 'NIKO', name: 'National Innovative Kindergarten Olympiad', classes: 'PREKG – UKG', desc: 'Play-based assessment for kindergarten — curiosity, phonics and early numeracy.', cat: `${ICON}/playtime.png` },
  { code: 'NIPO-Art', name: 'National Innovative Painting Olympiad', classes: 'PREKG – 5', desc: 'Drawing, colour and visual creativity judged at national level.', cat: `${ICON}/brush.png` },
  { code: 'NIEO', name: 'National Inspired Essay Olympiad', classes: 'Class 6 – 10', desc: 'Essay, grammar and expressive writing for confident communicators.', cat: `${ICON}/scientist.png` },
  { code: 'NIGKO', name: 'National Ingenious GK Olympiad', classes: 'Class 1 – 12', desc: 'India & world GK, sports, culture and current affairs.', cat: `${ICON}/think.png` },
  { code: 'NIPO-Phy', name: 'National Innovative Physics Olympiad', classes: 'Class 11 – 12', desc: 'Mechanics, light, electricity and physics numerics for senior students.', cat: `${ICON}/science.png` },
  { code: 'NICO', name: 'National Innovative Chemistry Olympiad', classes: 'Class 11 – 12', desc: 'Mole concept, reactions and chemistry application at 11–12 level.', cat: `${ICON}/chemistry.png` },
  { code: 'NIBO', name: 'National Innovative Biology Olympiad', classes: 'Class 11 – 12', desc: 'Life science, human body and environment — senior biology.', cat: `${ICON}/biology.png` },
]

const stats = [
  { value: '3375+', label: 'Schools' },
  { value: '7.4M+', label: 'Students' },
  { value: '11', label: 'Olympiads' },
]

const steps = [
  { n: '01', title: 'Login with User ID', text: 'Use the ID & password given by your school coordinator. One login, one paper.' },
  { n: '02', title: 'Write the timed paper', text: 'Palette, mark-for-review and auto-save keep you safe even if the browser closes.' },
  { n: '03', title: 'See instant result', text: 'Score, rank signals and question-wise breakdown the moment you submit.' },
]

export default function Landing() {
  return (
    <div>
      {/* Hero — Velaris WebGL exactly as supplied, grid/glass untouched */}
      <Velaris
        bg="#071E45"
        colors={['#0B2F6B', '#1450A0', '#1E40AF', '#3B82F6']}
        speed={1.15}
        grain={0.22}
        height="auto"
        className="overflow-hidden text-white"
      >
        <div className="relative mx-auto max-w-3xl px-4 py-12 text-center sm:py-16 lg:py-20">
          <div className="flex flex-col items-center">
            {/* Admissions badge — WebGL2 metallic pill (non-clickable status badge) */}
            <div className="flex justify-center">
              <MetallicButton label="Admissions open • 2026–27" />
            </div>
            <h1 className="mt-4 font-display text-[2.5rem] font-bold leading-[1.04] sm:text-6xl">
              Innovative Minds<br />Olympiad Forum
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-white/75 sm:text-base">
              India&apos;s trusted olympiad stage for Classes 1–10. Secure online papers,
              auto-submit timers and instant results — from any device, in one attempt.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/login" className="btn-accent sm:w-auto">
                Start Exam →
              </Link>
              <Link
                to="/my-exams"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 py-2.5 font-display text-sm font-bold text-white transition hover:bg-white/12"
                style={{
                  border: '1px solid rgba(255,255,255,0.32)',
                  backdropFilter: 'blur(12px)',
                  background: 'rgba(255,255,255,0.08)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
                }}
              >
                View My Result
              </Link>
            </div>
            <dl className="mx-auto mt-8 grid w-full max-w-md grid-cols-3 gap-4 pt-5 text-center"
              style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              {stats.map((s) => (
                <div key={s.label} className="flex flex-col items-center">
                  <dt className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-white/50">{s.label}</dt>
                  <dd className="order-first font-display text-2xl font-bold text-white sm:text-3xl">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Velaris>

      {/* Stats ledger — glass-band */}
      <section className="glass-band" aria-label="IMOF in numbers">
        <div className="mx-auto grid max-w-4xl grid-cols-3 gap-6 px-4 py-8 text-center">
          {stats.map((s, i) => (
            <div key={s.label} className="relative flex flex-col items-center">
              {/* Subtle vertical divider between stats */}
              {i > 0 && (
                <span className="absolute -left-3 top-1/2 hidden h-10 w-px -translate-y-1/2 sm:block"
                  style={{ background: 'linear-gradient(to bottom, transparent, rgba(7,30,69,0.12) 50%, transparent)' }} />
              )}
              <p className="font-display text-3xl font-bold text-[#071E45] sm:text-4xl">{s.value}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works — real sequence, numbers justified */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16" aria-labelledby="how-heading">
        <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-amber-600">How it works</p>
        <h2 id="how-heading" className="mt-2 font-display text-3xl font-bold text-[#071E45] sm:text-4xl">
          Three steps. One attempt.
        </h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <Tilt as="li" key={s.n} max={6} className="ticket p-5">
              <p className="font-display text-4xl font-bold text-amber-500" data-tilt-pop aria-hidden="true">{s.n}</p>
              <h3 className="mt-2 font-display text-lg font-bold text-slate-900">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.text}</p>
            </Tilt>
          ))}
        </ol>
      </section>

      {/* Olympiads */}
      <section id="olympiads" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-12 sm:pb-16" aria-labelledby="oly-heading">
        <p className="text-center font-display text-xs font-bold uppercase tracking-[0.2em] text-amber-600">
          Our Olympiads
        </p>
        <h2 id="oly-heading" className="mx-auto mt-2 max-w-2xl text-center font-display text-3xl font-bold text-[#071E45] sm:text-4xl">
          11 Olympiads. One stage for young achievers.
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-slate-600 sm:text-[15px]">
          Every olympiad is grade-mapped with age-appropriate papers, medals and certificates at
          school, state and national levels.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {olympiads.map((o, i) => (
            <Tilt
              as="article"
              key={`${o.code}-${i}`}
              max={6}
              className="card group oly-card overflow-hidden transition-[box-shadow,border-color] duration-300 hover:shadow-xl"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  data-tilt-pop
                  className="oly-code inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-white"
                  style={{
                    background: 'linear-gradient(135deg,#0e3576 0%,#071e45 100%)',
                    boxShadow: '0 2px 8px rgba(7,30,69,0.25), inset 0 1px 0 rgba(255,255,255,0.18)',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }}
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full border border-white/50 text-[9px]" aria-hidden="true">●</span>
                  {o.code}
                </span>
                <span className="oly-class rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800"
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.70)' }}>
                  {o.classes}
                </span>
              </div>
              {/* CAT image */}
              <div
                className="oly-icon-wrap relative z-10 mt-4 flex h-[92px] items-center justify-center overflow-visible rounded-xl p-3"
                style={{
                  background: 'linear-gradient(160deg, rgba(248,250,252,0.90) 0%, rgba(241,245,249,0.80) 100%)',
                  border: '1px solid rgba(255,255,255,0.85)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.90), 0 2px 8px rgba(7,30,69,0.06)',
                }}
              >
                <img
                  src={o.cat}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  width={72}
                  height={72}
                  className="oly-icon relative z-20 h-[72px] w-[72px] object-contain"
                />
              </div>
              <h3 className="mt-3 font-display text-[17px] font-bold leading-snug text-slate-900 group-hover:text-[#0B2F6B]">{o.name}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{o.desc}</p>
            </Tilt>
          ))}
        </div>
      </section>

      {/* Welcome + CTA */}
      <section className="glass-band" aria-labelledby="welcome-heading">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:py-16 lg:grid-cols-2">
          <div>
            <h2 id="welcome-heading" className="font-display text-2xl font-bold text-[#071E45] sm:text-3xl">
              Welcome to the IMOF Exam Portal
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-[15px]">
              Schools register students once — admins upload question papers and student lists via
              Excel, publish the exam window, and students login with their User ID to write the
              test from any device. Scores are computed automatically and toppers are highlighted
              for felicitation.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm text-slate-700 sm:text-[15px]">
              {['Timed player with question palette & mark-for-review', 'Auto-save answers — safe even if the browser closes', 'Instant results with question-wise breakdown'].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-emerald-700"
                    style={{
                      background: 'rgba(209,250,229,0.90)',
                      border: '1px solid rgba(110,231,183,0.60)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.80)',
                    }}
                    aria-hidden="true"
                  >✓</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <Tilt max={4} className="ticket overflow-hidden text-center text-white">
            <div className="glass-ink p-8 sm:p-10">
              <p className="font-display text-xl font-bold sm:text-2xl">Ready to write your olympiad?</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/70">
                Keep your User ID &amp; password ready. You get one attempt per exam — the timer starts the moment you begin.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Link to="/login" className="btn-accent">Start Exam</Link>
                <Link
                  to="/my-exams"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold text-white hover:bg-white/12"
                  style={{
                    border: '1px solid rgba(255,255,255,0.32)',
                    backdropFilter: 'blur(12px)',
                    background: 'rgba(255,255,255,0.08)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
                  }}
                >
                  View Result
                </Link>
              </div>
            </div>
          </Tilt>
        </div>
      </section>
    </div>
  )
}
