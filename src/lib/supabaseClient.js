import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * Supabase client. Falls back to `null` when env vars are missing
 * so the app can run in mock mode (VITE_MOCK_MODE=true).
 * Always guard usage: `if (!supabase) useMockDb()`.
 */
export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null

export const isMockMode =
  import.meta.env.VITE_MOCK_MODE === 'true' || !isSupabaseConfigured

/**
 * Admin-scoped client. Table access for admins is authorized server-side via
 * the `x-admin-token` header (validated by RLS policies against the admins
 * table). Instances are cached per token so repeated calls reuse them.
 * Returns `null` when Supabase is not configured or no token is given.
 */
const adminClients = new Map()

export function getAdminClient(token) {
  if (!isSupabaseConfigured || !token) return null
  const key = String(token)
  if (!adminClients.has(key)) {
    adminClients.set(
      key,
      createClient(url, anonKey, {
        global: { headers: { 'x-admin-token': key } },
      }),
    )
  }
  return adminClients.get(key)
}

/**
 * Drop cached admin client(s). Call on admin logout.
 * Pass a token to drop just that entry, or nothing to drop all.
 */
export function clearAdminClient(token) {
  if (token) adminClients.delete(String(token))
  else adminClients.clear()
}
