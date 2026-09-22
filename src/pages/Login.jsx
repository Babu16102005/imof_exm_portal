import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const [params] = useSearchParams()
  const initial = params.get('tab') === 'admin' ? 'admin' : 'student'
  const [tab, setTab] = useState(initial)
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { loginAdmin, loginStudent } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { setTab(params.get('tab') === 'admin' ? 'admin' : 'student') }, [params])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (tab === 'admin') {
        await loginAdmin(userId, password)
        navigate('/admin', { replace: true })
      } else {
        await loginStudent(userId, password)
        navigate('/my-exams', { replace: true })
      }
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      {/* Premium glass login card — multi-layer shadow + specular */}
      <div
        className="grid overflow-hidden rounded-3xl lg:grid-cols-[0.9fr_1.1fr]"
        style={{
          background: 'rgba(255,255,255,0.78)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.75)',
          boxShadow: '0 12px 40px rgba(7,30,69,0.14), 0 32px 80px rgba(7,30,69,0.10), 0 2px 0 rgba(255,255,255,0.90) inset',
        }}
      >
        {/* Brand panel — deep glass-ink */}
        <div className="glass-ink relative hidden flex-col justify-between p-8 text-white lg:flex">
          <div className="ledger-bg pointer-events-none absolute inset-0 opacity-10" aria-hidden="true" />
          {/* Ambient orb decorations */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-400/12 blur-[50px]" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-8 -left-8 h-36 w-36 rounded-full bg-blue-400/10 blur-[40px]" aria-hidden="true" />
          <div className="relative">
            <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-amber-300">IMOF Exam Portal</p>
            <h1 className="mt-3 font-display text-3xl font-bold leading-tight">One ID.<br />One paper.<br />One attempt.</h1>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/70">
              Students enter with the User ID from their hall ticket. Admins manage papers, students and results from a single console.
            </p>
          </div>
          <div
            className="relative mt-8 rounded-2xl p-4 text-sm"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.16)',
              backdropFilter: 'blur(12px)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16)',
            }}
          >
            <p className="font-bold text-amber-300">Exam-day checklist</p>
            <ul className="mt-2 space-y-1.5 text-white/75">
              <li>• Stable internet + quiet room</li>
              <li>• User ID &amp; password ready</li>
              <li>• Timer auto-submits at 00:00</li>
            </ul>
          </div>
        </div>

        {/* Form panel */}
        <div className="p-5 sm:p-8">
          <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-[#0B2F6B] lg:hidden">IMOF Exam Portal</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">Secure sign-in for IMOF students and administrators.</p>

          {/* Tab switcher — liquid glass pill selector */}
          <div
            className="mt-5 grid grid-cols-2 gap-1 rounded-2xl p-1.5"
            style={{
              background: 'rgba(241,245,249,0.80)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.72)',
              boxShadow: 'inset 0 2px 6px rgba(7,30,69,0.07)',
            }}
            role="tablist"
            aria-label="Login type"
          >
            {['student', 'admin'].map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => { setTab(t); setError(''); }}
                className={`min-h-[44px] rounded-xl px-3 py-2.5 font-display text-sm font-bold capitalize transition ${
                  tab === t ? 'text-[#071E45]' : 'text-slate-500 hover:text-slate-700'
                }`}
                style={tab === t ? {
                  background: 'rgba(255,255,255,0.92)',
                  boxShadow: '0 2px 10px rgba(7,30,69,0.10), inset 0 1px 0 rgba(255,255,255,0.90)',
                  border: '1px solid rgba(255,255,255,0.80)',
                } : {}}
              >
                {t === 'student' ? 'Student' : 'Admin'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="label" htmlFor="login-id">{tab === 'admin' ? 'Admin ID' : 'User ID'}</label>
              <input
                id="login-id"
                name="username"
                spellCheck={false}
                className="input font-mono"
                autoComplete="username"
                autoCapitalize="none"
                placeholder={tab === 'admin' ? 'e.g. admin…' : 'e.g. IMOF1001…'}
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="login-pw">Password</label>
              <div className="relative">
                <input
                  id="login-pw"
                  name="current-password"
                  className="input pr-20 font-mono"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter password…"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 min-h-[36px] -translate-y-1/2 rounded-lg px-3 py-1 text-xs font-bold text-[#1450A0] hover:bg-slate-100"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-red-700"
                style={{
                  background: 'rgba(254,242,242,0.90)',
                  border: '1px solid rgba(252,165,165,0.70)',
                  backdropFilter: 'blur(8px)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.70)',
                }}
              >
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className={`w-full ${tab === 'admin' ? 'btn-primary' : 'btn-accent'}`}>
              {busy ? 'Signing in…' : tab === 'admin' ? 'Login as Admin' : 'Login & View My Exams'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            <Link to="/" className="font-bold text-[#1450A0] hover:underline">← Back to home</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
