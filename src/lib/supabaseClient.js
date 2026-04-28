import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase env vars not set. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(
  SUPABASE_URL  ?? '',
  SUPABASE_ANON_KEY ?? '',
  { auth: { persistSession: true } }
)

// ── 認証ヘルパー ──────────────────────────────────────────────

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data.user
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

// ── レポートデータ ────────────────────────────────────────────

export async function fetchReports() {
  const { data, error } = await supabase
    .from('reports')
    .select('filename, data, updated_at')
    .order('account_number')
  if (error) throw error
  return data.map(row => ({
    name: row.filename,
    text: JSON.stringify(row.data),
    lastModified: new Date(row.updated_at).getTime(),
  }))
}

export async function deleteAccount() {
  const { error } = await supabase.rpc('delete_own_account')
  if (error) throw error
}

export async function upsertReport(accountNumber, filename, jsonData) {
  const { error } = await supabase
    .from('reports')
    .upsert(
      { account_number: accountNumber, filename, data: jsonData },
      { onConflict: 'user_id,account_number' }
    )
  if (error) throw error
}
