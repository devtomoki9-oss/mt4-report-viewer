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

export async function resetPasswordForEmail(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  })
  if (error) throw error
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
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

export async function fetchPlan() {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .single()
  if (error || !data) return 'free'
  const active =
    (data.status === 'active' || data.status === 'on_trial') &&
    (!data.current_period_end || new Date(data.current_period_end) > new Date())
  return active ? 'pro' : 'free'
}

export async function fetchAliases() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return {}
  return user.user_metadata?.aliases ?? {}
}

export async function saveAliases(aliases) {
  const { error } = await supabase.auth.updateUser({ data: { aliases } })
  if (error) throw error
}

export async function fetchTradingStates() {
  const { data, error } = await supabase
    .from('ea_controls')
    .select('account_number, enabled')
  if (error) return {}
  return Object.fromEntries((data || []).map(r => [String(r.account_number), r.enabled]))
}

export async function setTradingEnabled(accountNumber, enabled) {
  const { error } = await supabase.rpc('upsert_ea_control', {
    p_account_number: Number(accountNumber),
    p_enabled: enabled,
  })
  if (error) throw error
}

export function subscribeToTradingStates(onUpdate) {
  return supabase
    .channel('ea-controls-realtime')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'ea_controls',
    }, onUpdate)
    .subscribe()
}

export function subscribeToReports(onUpdate) {
  return supabase
    .channel('reports-realtime')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'reports',
    }, onUpdate)
    .subscribe()
}

export async function deleteReport(accountNumber) {
  const { error } = await supabase
    .from('reports')
    .delete()
    .eq('account_number', accountNumber)
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

// ── EA パラメータ管理 ────────────────────────────────────────

export async function fetchEaParams(accountNumber) {
  const { data, error } = await supabase
    .from('ea_params')
    .select('account_number, chart_id, ea_name, symbol, timeframe, manifest, desired, actual, manifest_at, desired_at, actual_at, updated_at')
    .eq('account_number', accountNumber)
    .order('chart_id')
  if (error) throw error
  return data || []
}

export async function setEaParamDesired(accountNumber, chartId, desired) {
  const { error } = await supabase.rpc('upsert_ea_param_desired', {
    p_account_number: Number(accountNumber),
    p_chart_id: String(chartId),
    p_desired: desired,
  })
  if (error) throw error
}

export async function deleteEaParam(accountNumber, chartId) {
  const { error } = await supabase
    .from('ea_params')
    .delete()
    .eq('account_number', accountNumber)
    .eq('chart_id', chartId)
  if (error) throw error
}

export function subscribeToEaParams(accountNumber, onUpdate) {
  return supabase
    .channel(`ea-params-realtime-${accountNumber}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'ea_params',
    }, onUpdate)
    .subscribe()
}

// ── プッシュ通知購読 ──────────────────────────────────

export async function savePushSubscription(subscription) {
  const json = subscription.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: 'user_id,endpoint' }
  )
  if (error) throw error
}

export async function deletePushSubscription(endpoint) {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw error
}

// ── アラート設定 ──────────────────────────────────────

export async function fetchAlertSettings() {
  const { data, error } = await supabase
    .from('alert_settings')
    .select('account_number, loss_threshold')
  if (error) throw error
  return Object.fromEntries((data ?? []).map(r => [String(r.account_number), Number(r.loss_threshold)]))
}

export async function saveAlertSetting(accountNumber, lossThreshold) {
  const { error } = await supabase.from('alert_settings').upsert(
    { account_number: String(accountNumber), loss_threshold: lossThreshold },
    { onConflict: 'user_id,account_number' }
  )
  if (error) throw error
}

export async function deleteAlertSetting(accountNumber) {
  const { error } = await supabase.from('alert_settings').delete().eq('account_number', String(accountNumber))
  if (error) throw error
}
