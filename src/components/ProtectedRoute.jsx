import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export function RequireAdmin({ children }) {
  const { role, ready } = useAuth()
  const loc = useLocation()
  if (!ready) return <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
  if (role !== 'admin') return <Navigate to="/login?tab=admin" replace state={{ from: loc.pathname }} />
  return children
}

export function RequireStudent({ children }) {
  const { role, ready } = useAuth()
  const loc = useLocation()
  if (!ready) return <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
  if (role !== 'student') return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return children
}

export default RequireAdmin
