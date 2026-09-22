import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, isMockMode, clearAdminClient } from '../lib/supabaseClient.js'
import { findStudent } from '../services/dataService.js'

const SESSION_KEY = 'imof_session'
export { SESSION_KEY }
const AuthContext = createContext(null)

function loadSession() {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveSession(data) {
  try {
    if (typeof sessionStorage === 'undefined') return
    if (!data) sessionStorage.removeItem(SESSION_KEY)
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
}

const shouldUseMock = () => isMockMode || !supabase

export function AuthProvider({ children }) {
  const [role, setRole] = useState(null)
  const [adminId, setAdminId] = useState(null)
  const [adminToken, setAdminToken] = useState(null)
  const [student, setStudent] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const s = loadSession()
    if (s) {
      if (s.role === 'admin') {
        setRole('admin')
        setAdminId(s.adminId || null)
        setAdminToken(s.adminToken || null)
        setStudent(null)
      } else if (s.role === 'student' && s.student) {
        setRole('student')
        setStudent(s.student)
        setAdminId(null)
        setAdminToken(null)
      }
    }
    setReady(true)
  }, [])

  const logout = useCallback(() => {
    setRole(null)
    setAdminId(null)
    setAdminToken(null)
    setStudent(null)
    clearAdminClient()
    saveSession(null)
  }, [])

  const loginAdmin = useCallback(
    async (id, pass) => {
      const a = String(id || '').trim()
      const p = String(pass || '')
      if (!a || !p) throw new Error('Enter admin ID and password')
      // Mock / demo path: local credential check (plaintext fine for demo).
      if (shouldUseMock()) {
        const envId = import.meta.env.VITE_ADMIN_ID || 'admin'
        const envPass = import.meta.env.VITE_ADMIN_PASSWORD || 'imof2026'
        if (a === String(envId) && p === String(envPass)) {
          const session = { role: 'admin', adminId: a, adminToken: null, student: null }
          setRole('admin')
          setAdminId(session.adminId)
          setAdminToken(null)
          setStudent(null)
          saveSession(session)
          return { adminId: session.adminId }
        }
        throw new Error('Invalid admin credentials')
      }
      // LIVE path: server-side verification via RPC. No env password compare.
      const { data, error } = await supabase.rpc('verify_admin_login', {
        p_admin_id: a,
        p_password: p,
      })
      if (error) throw new Error(error.message || 'Invalid admin credentials')
      const row = Array.isArray(data) ? data[0] : data
      if (!row?.token) throw new Error('Invalid admin credentials')
      const session = {
        role: 'admin',
        adminId: row.admin_id || a,
        adminToken: row.token,
        student: null,
      }
      setRole('admin')
      setAdminId(session.adminId)
      setAdminToken(session.adminToken)
      setStudent(null)
      saveSession(session)
      return { adminId: session.adminId }
    },
    [],
  )

  const loginStudent = useCallback(async (user_id, password) => {
    const u = String(user_id || '').trim()
    const p = String(password || '')
    if (!u || !p) throw new Error('Enter user ID and password')
    // Mock / demo path: local lookup (plaintext fine for demo).
    if (shouldUseMock()) {
      const found = await findStudent(u, p)
      if (!found) throw new Error('Invalid user ID or password')
      if (found.is_active === false) throw new Error('Account is deactivated. Contact IMOF support.')
      const clean = {
        id: found.id,
        user_id: found.user_id,
        name: found.name,
        class: found.class,
        school: found.school,
        exam_id: found.exam_id,
      }
      const session = { role: 'student', adminId: null, adminToken: null, student: clean }
      setRole('student')
      setStudent(clean)
      setAdminId(null)
      setAdminToken(null)
      saveSession(session)
      return clean
    }
    // LIVE path: server-side verification via RPC (password never leaves the check).
    const { data, error } = await supabase.rpc('verify_student_login', {
      p_user_id: u,
      p_password: p,
    })
    if (error) throw new Error(error.message || 'Invalid user ID or password')
    const found = Array.isArray(data) ? data[0] : data
    if (!found) throw new Error('Invalid user ID or password')
    if (found.is_active === false) throw new Error('Account is deactivated. Contact IMOF support.')
    const clean = {
      id: found.id,
      user_id: found.user_id,
      name: found.name,
      class: found.class,
      school: found.school,
      exam_id: found.exam_id,
    }
    const session = { role: 'student', adminId: null, adminToken: null, student: clean }
    setRole('student')
    setStudent(clean)
    setAdminId(null)
    setAdminToken(null)
    saveSession(session)
    return clean
  }, [])

  /**
   * Validate the stored admin token server-side. Throws (and forces logout)
   * when the session is no longer valid.
   */
  const requireAdmin = useCallback(async () => {
    if (shouldUseMock()) return true
    const token = adminToken || loadSession()?.adminToken || null
    if (!token) {
      logout()
      throw new Error('Admin session expired')
    }
    const { data, error } = await supabase.rpc('admin_touch', { p_token: token })
    if (error || data !== true) {
      logout()
      throw new Error('Admin session expired')
    }
    return true
  }, [adminToken, logout])

  const value = useMemo(
    () => ({ role, adminId, adminToken, student, ready, loginAdmin, loginStudent, logout, requireAdmin }),
    [role, adminId, adminToken, student, ready, loginAdmin, loginStudent, logout, requireAdmin],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export default AuthContext
