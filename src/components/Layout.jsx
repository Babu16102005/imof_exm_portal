import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export function FlashTicker() {
  return (
    <div className="ticker-paused border-b border-white/40 bg-amber-400/85 text-[#071E45] backdrop-blur-md" role="status" aria-label="Announcements">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-[13px] font-semibold">
        <span className="relative z-10 shrink-0 rounded-md bg-[#071E45] px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-widest text-white">
          Notice
        </span>
        <div className="relative flex-1 overflow-hidden">
        <div className="ticker-track whitespace-nowrap" aria-hidden="false">
          <span>
            Exam Date Announced — IMOF Olympiads 2026 registrations open &nbsp;•&nbsp; Students: use
            your User ID &amp; password to login and start your exam &nbsp;•&nbsp; For help write to
            info@imofedu.com &nbsp;•&nbsp;
          </span>
          <span aria-hidden="true">
            Exam Date Announced — IMOF Olympiads 2026 registrations open &nbsp;•&nbsp; Students: use
            your User ID &amp; password to login and start your exam &nbsp;•&nbsp; For help write to
            info@imofedu.com &nbsp;•&nbsp;
          </span>
        </div>
        </div>
      </div>
    </div>
  )
}

const primaryLinks = [
  { to: '/', label: 'Home', end: true },
  { to: '/#olympiads', label: 'Olympiads', href: true },
  { to: '/my-exams', label: 'My Exams' },
  { to: '/login', label: 'Exam Login' },
]

export function SiteHeader() {
  const { role } = useAuth()
  const [open, setOpen] = useState(false)
  const linkCls =
    'imof-navlink font-display rounded-lg px-3 py-2.5 text-[15px] font-semibold uppercase tracking-wide text-[#050748] transition hover:bg-white/70 hover:text-[#ef7f1b] hover:shadow-[0_2px_12px_rgba(7,30,69,0.08)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-amber-400'
  return (
    <header
      className="sticky top-0 z-40 border-b border-white/60 bg-white/55 shadow-[0_8px_32px_rgba(7,30,69,0.10)] backdrop-blur-2xl"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.55) 100%)',
        backdropFilter: 'blur(24px) saturate(180%) brightness(1.04)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%) brightness(1.04)',
        borderBottom: '1px solid rgba(255,255,255,0.65)',
        boxShadow: '0 8px 32px rgba(7,30,69,0.10), 0 1px 3px rgba(7,30,69,0.06), inset 0 1px 0 rgba(255,255,255,0.90)',
      }}
    >
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8 xl:px-10">
        <Link to="/" className="flex min-w-0 items-center" aria-label="IMOF home">
          <img
            src="/assets/imof/brand/logo.png"
            alt="IMOF Edu Solutions Private Limited - home"
            width={220}
            height={48}
            loading="eager"
            fetchPriority="high"
            className="h-11 w-auto max-w-[220px] shrink-0 bg-transparent object-contain sm:h-[52px] sm:max-w-[280px]"
          />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          <NavLink to="/" end className={({ isActive }) => (isActive ? `${linkCls} bg-orange-50 text-[#ef7f1b]` : linkCls)}>Home</NavLink>
          <a href="/#olympiads" className={linkCls}>Olympiads</a>
          <NavLink to="/my-exams" className={({ isActive }) => (isActive ? `${linkCls} bg-orange-50 text-[#ef7f1b]` : linkCls)}>My Exams</NavLink>
          <NavLink to="/login" className={({ isActive }) => (isActive ? `${linkCls} bg-orange-50 text-[#ef7f1b]` : linkCls)}>Exam Login</NavLink>
          {/* Admin CTA — gold chrome pill */}
          <NavLink
            to="/admin"
            className="ml-2 overflow-hidden rounded-xl px-4 py-2.5 font-display text-sm font-bold text-[#071E45] transition hover:brightness-95 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-white"
            style={{
              background: 'linear-gradient(135deg,#fde68a 0%,#f59e0b 40%,#fbbf24 60%,#b45309 100%)',
              boxShadow: '0 6px 20px rgba(245,158,11,0.45), inset 0 1px 0 rgba(255,255,255,0.62), inset 0 -1px 0 rgba(120,53,15,0.2)',
              border: '1px solid rgba(255,255,255,0.50)',
            }}
          >
            Admin
          </NavLink>
        </nav>
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          <Link
            to="/login"
            className="overflow-hidden rounded-xl px-4 py-2.5 text-sm font-bold text-[#071E45]"
            style={{
              background: 'linear-gradient(135deg,#fde68a 0%,#f59e0b 40%,#fbbf24 60%,#b45309 100%)',
              boxShadow: '0 4px 14px rgba(245,158,11,0.40), inset 0 1px 0 rgba(255,255,255,0.55)',
              border: '1px solid rgba(255,255,255,0.45)',
            }}
          >
            {role === 'admin' ? 'Admin' : 'Login'}
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/60 text-[#050748] hover:bg-white/70"
            style={{ backdropFilter: 'blur(12px) saturate(160%)', WebkitBackdropFilter: 'blur(12px) saturate(160%)', background: 'rgba(255,255,255,0.55)', boxShadow: '0 4px 16px rgba(7,30,69,0.08), inset 0 1px 0 rgba(255,255,255,0.85)' }}
          >
            <span aria-hidden="true" className="relative block h-4 w-5">
              <span className={`absolute left-0 top-0 h-0.5 w-full rounded bg-[#050748] transition-transform ${open ? 'translate-y-[7px] rotate-45' : ''}`} />
              <span className={`absolute left-0 top-[7px] h-0.5 w-full rounded bg-[#050748] transition-opacity ${open ? 'opacity-0' : ''}`} />
              <span className={`absolute left-0 top-[14px] h-0.5 w-full rounded bg-[#050748] transition-transform ${open ? '-translate-y-[7px] -rotate-45' : ''}`} />
            </span>
          </button>
        </div>
      </div>
      {open && (
        <nav
          className="border-t border-white/50 px-4 pb-4 pt-2 lg:hidden"
          style={{ backdropFilter: 'blur(24px) saturate(180%) brightness(1.03)', WebkitBackdropFilter: 'blur(24px) saturate(180%) brightness(1.03)', background: 'linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.65) 100%)', boxShadow: '0 12px 32px rgba(7,30,69,0.10), inset 0 1px 0 rgba(255,255,255,0.85)' }}
          aria-label="Mobile"
        >
          <ul className="space-y-1">
            {primaryLinks.map((l) => (
              <li key={l.label}>
                {l.href ? (
                  <a href={l.to} onClick={() => setOpen(false)} className="imof-navlink block rounded-xl px-3 py-3 text-[15px] font-semibold text-[#050748] hover:bg-white/70 hover:text-[#ef7f1b]">Olympiads</a>
                ) : (
                  <NavLink to={l.to} end={l.end} onClick={() => setOpen(false)} className={({ isActive }) => `imof-navlink block rounded-xl px-3 py-3 text-[15px] font-semibold ${isActive ? 'bg-orange-50 text-[#ef7f1b]' : 'text-[#050748] hover:bg-white/70 hover:text-[#ef7f1b]'}`}>
                    {l.label}
                  </NavLink>
                )}
              </li>
            ))}
            <li>
              <NavLink
                to="/admin"
                onClick={() => setOpen(false)}
                className="mt-1 block overflow-hidden rounded-xl px-3 py-3 text-center font-display text-[15px] font-bold text-[#071E45]"
                style={{
                  background: 'linear-gradient(135deg,#fde68a 0%,#f59e0b 40%,#fbbf24 60%,#b45309 100%)',
                  boxShadow: '0 4px 14px rgba(245,158,11,0.35), inset 0 1px 0 rgba(255,255,255,0.55)',
                }}
              >
                Admin Console
              </NavLink>
            </li>
          </ul>
        </nav>
      )}
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="glass-ink relative overflow-hidden text-slate-300">
      {/* Ambient decoration orbs */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-amber-400/10 blur-[80px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-48 w-48 rounded-full bg-blue-400/8 blur-[60px]" aria-hidden="true" />
      {/* Direct port of imofedu.com footer wave — animated SVG crest */}
      <div className="imof-footer-wave pointer-events-none absolute inset-x-0 top-0" aria-hidden="true">
        <svg viewBox="0 0 1200 100" preserveAspectRatio="none" className="block h-[56px] w-full">
          <path
            d="M0,0 C300,100 900,0 1200,100 L1200,0 L0,0 Z"
            className="imof-footer-wave__path"
          >
            <animate
              attributeName="d"
              dur="8s"
              repeatCount="indefinite"
              values="M0,0 C300,100 900,0 1200,100 L1200,0 L0,0 Z;M0,0 C300,0 900,100 1200,0 L1200,0 L0,0 Z;M0,0 C300,100 900,0 1200,100 L1200,0 L0,0 Z"
            />
          </path>
        </svg>
      </div>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-2">
          <p className="font-display text-xl font-bold text-white">IMOF Edu Solutions Pvt. Ltd.</p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-300">
            Innovative Minds Olympiad Forum — nurturing young achievers through 11 national
            olympiads across 10,000+ schools in India.
          </p>
          <p className="mt-3 text-sm">
            <a href="mailto:info@imofedu.com" className="font-semibold text-amber-300 hover:underline">
              info@imofedu.com
            </a>
            <span className="text-slate-400"> • www.imofedu.com</span>
          </p>
          <p className="mt-1 text-sm text-slate-300">+91 93457 80567 • +91 99628 56892</p>
        </div>
        <nav aria-label="Footer">
          <p className="font-display text-sm font-bold uppercase tracking-widest text-white">Quick Links</p>
          <ul className="mt-3 space-y-2.5 text-sm">
            <li><Link to="/" className="imof-flink">Home</Link></li>
            <li><a href="/#olympiads" className="imof-flink">Olympiads</a></li>
            <li><Link to="/login" className="imof-flink">Exam Login</Link></li>
            <li><Link to="/my-exams" className="imof-flink">My Exams &amp; Results</Link></li>
            <li><Link to="/admin" className="imof-flink">Admin</Link></li>
          </ul>
        </nav>
        <div>
          <p className="font-display text-sm font-bold uppercase tracking-widest text-white">Exam Day</p>
          <ul className="mt-3 space-y-2.5 text-sm text-slate-300">
            <li>Mon–Sat, 9:30 AM – 6:00 PM IST</li>
            <li>Keep User ID &amp; password ready — one attempt per paper</li>
            <li>Use latest Chrome / Edge</li>
          </ul>
        </div>
      </div>
      {/* Glass divider */}
      <div className="glass-divider mx-4" />
      <div className="border-t border-white/8">
        <p className="mx-auto max-w-6xl px-4 py-4 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} IMOF Edu Solutions. Innovative Learning, Limitless Possibilities.
        </p>
      </div>
    </footer>
  )
}

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F6F8FC]">
      <SiteHeader />
      <FlashTicker />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}

const adminLinks = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/exams', label: 'Exams' },
  { to: '/admin/questions', label: 'Exam Questions' },
  { to: '/admin/students', label: 'Students' },
  { to: '/admin/results', label: 'Results' },
]

export function AdminLayout() {
  const { adminId, logout } = useAuth()
  const navigate = useNavigate()
  const handleLogout = () => {
    logout()
    navigate('/login')
  }
  return (
    <div className="flex min-h-screen bg-[#F6F8FC]">
      {/* Sidebar — macOS-style deep glass navigation rail */}
      <aside
        className="hidden w-60 shrink-0 flex-col text-white md:flex"
        style={{
          background: 'linear-gradient(180deg,rgba(11,47,107,0.96) 0%,rgba(7,30,69,0.94) 100%)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          borderRight: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '4px 0 32px rgba(7,30,69,0.22), inset -1px 0 0 rgba(255,255,255,0.06)',
        }}
        aria-label="Admin sidebar"
      >
        {/* Brand */}
        <div className="relative px-5 pb-4 pt-6">
          <p className="font-display text-lg font-bold text-white">IMOF Admin</p>
          <p className="text-xs text-white/55">Exam Portal Console</p>
          {/* Subtle separator */}
          <div className="mt-4 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {adminLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `rounded-xl px-3 py-3 text-sm font-semibold transition ${
                  isActive
                    ? 'text-white'
                    : 'text-white/70 hover:bg-white/8 hover:text-white'
                }`
              }
              style={({ isActive }) => isActive ? {
                background: 'rgba(255,255,255,0.16)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.20)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 8px rgba(0,0,0,0.18)',
              } : {}}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4">
          {/* Subtle separator before View Site */}
          <div className="mb-3 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <Link
            to="/"
            className="block rounded-xl px-3 py-2.5 text-center text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
            style={{
              border: '1px solid rgba(255,255,255,0.18)',
              backdropFilter: 'blur(8px)',
            }}
          >
            ← View Site
          </Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Admin top bar — premium frosted white glass */}
        <header
          className="sticky top-0 z-30 px-4 py-3"
          style={{
            background: 'rgba(255,255,255,0.82)',
            backdropFilter: 'blur(24px) saturate(160%)',
            WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            borderBottom: '1px solid rgba(255,255,255,0.80)',
            boxShadow: '0 1px 0 rgba(203,213,225,0.60), 0 4px 16px rgba(7,30,69,0.06), inset 0 1px 0 rgba(255,255,255,0.90)',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="nice-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 md:hidden" role="navigation" aria-label="Admin sections">
              {adminLinks.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) =>
                    `shrink-0 whitespace-nowrap rounded-lg px-3 py-2.5 text-[13px] font-bold ${
                      isActive ? 'bg-[#071E45] text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </div>
            <span className="hidden min-w-0 truncate text-sm text-slate-500 md:block">
              Welcome, <span className="font-bold text-[#071E45]">{adminId || 'Admin'}</span>
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 md:hidden">
                {adminId || 'Admin'}
              </span>
              <button
                onClick={handleLogout}
                className="min-h-[44px] rounded-xl px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                style={{
                  border: '1px solid rgba(203,213,225,0.9)',
                  backdropFilter: 'blur(8px)',
                  background: 'rgba(255,255,255,0.70)',
                  boxShadow: '0 2px 8px rgba(7,30,69,0.06), inset 0 1px 0 rgba(255,255,255,0.80)',
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
