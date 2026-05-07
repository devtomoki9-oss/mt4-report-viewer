import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY     = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY    = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT        = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.com'
const WEBHOOK_SECRET       = Deno.env.get('WEBHOOK_SECRET') ?? ''

const COOLDOWN_MS = 30 * 60 * 1000

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('OK', { status: 200 })

  if (WEBHOOK_SECRET) {
    if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET)
      return new Response('Unauthorized', { status: 401 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return new Response('Bad request', { status: 400 }) }

  const record = body.record as Record<string, unknown> | undefined
  if (!record) return new Response('No record', { status: 200 })

  const userId = record.user_id as string
  if (!userId) return new Response('No userId', { status: 200 })

  // このユーザーの全アラート設定を取得
  const { data: allSettings } = await supabase
    .from('alert_settings')
    .select('account_number, loss_threshold, last_notified_at')
    .eq('user_id', userId)

  if (!allSettings?.length) return new Response('No alert settings', { status: 200 })

  // エイリアス（口座表示名）をユーザーメタデータから取得
  const { data: { user } } = await supabase.auth.admin.getUserById(userId)
  const aliases = (user?.user_metadata?.aliases ?? {}) as Record<string, string>

  // このユーザーの全レポートを取得
  const { data: reports } = await supabase
    .from('reports')
    .select('account_number, filename, data')
    .eq('user_id', userId)

  const reportMap = new Map(
    (reports ?? []).map((r: Record<string, unknown>) => [String(r.account_number), r])
  )

  // 各アラート設定をチェックしてしきい値超過の口座を収集
  const now = Date.now()
  const exceeding: Array<{ accountNumber: string; accountName: string; lossAmount: number }> = []

  for (const setting of allSettings) {
    const accountNumber = String(setting.account_number)
    const report = reportMap.get(accountNumber)
    if (!report) continue

    const positions = ((report.data as Record<string, unknown>)?.positions ?? []) as Array<{ profit?: number; swap?: number }>
    if (!positions.length) continue

    const totalNet = positions.reduce((s: number, p) => s + (p.profit ?? 0) + (p.swap ?? 0), 0)
    const threshold = Number(setting.loss_threshold)

    console.log(`[send-alerts] account=${accountNumber} totalNet=${totalNet} threshold=${threshold}`)

    if (totalNet >= -threshold) continue

    // クールダウンチェック
    if (setting.last_notified_at) {
      const elapsed = now - new Date(setting.last_notified_at as string).getTime()
      if (elapsed < COOLDOWN_MS) {
        console.log(`[send-alerts] account=${accountNumber} cooldown`)
        continue
      }
    }

    // 表示名: エイリアス > ファイル名 > 口座番号
    const filename = (report.filename as string)?.replace(/\.json$/i, '') ?? accountNumber
    const accountName = aliases[filename] || filename

    exceeding.push({ accountNumber, accountName, lossAmount: Math.abs(Math.round(totalNet)) })
  }

  console.log(`[send-alerts] exceeding=${exceeding.length}`)
  if (!exceeding.length) return new Response('No accounts exceeding threshold', { status: 200 })

  // プッシュ購読を取得
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs?.length) return new Response('No subscriptions', { status: 200 })

  // 通知メッセージを組み立て（複数口座はまとめて1件）
  let title: string
  let bodyText: string

  if (exceeding.length === 1) {
    const { accountName, lossAmount } = exceeding[0]
    title = '含み損アラート'
    bodyText = `${accountName} の含み損が ${lossAmount.toLocaleString('ja-JP')} に達しました`
  } else {
    title = `含み損アラート（${exceeding.length}口座）`
    bodyText = exceeding
      .map(e => `${e.accountName}: −${e.lossAmount.toLocaleString('ja-JP')}`)
      .join('\n')
  }

  const payload = JSON.stringify({
    title,
    body:  bodyText,
    tag:   `loss-${userId}`,
    url:   '/',
  })

  const results = await Promise.allSettled(
    subs.map((s: Record<string, string>) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      )
    )
  )

  // しきい値超過した全口座の last_notified_at を更新
  await Promise.all(
    exceeding.map(({ accountNumber }) =>
      supabase
        .from('alert_settings')
        .update({ last_notified_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('account_number', accountNumber)
    )
  )

  const sent = results.filter(r => r.status === 'fulfilled').length
  console.log(`[send-alerts] sent=${sent}/${subs.length} accounts=${exceeding.length}`)
  return new Response(JSON.stringify({ sent, total: subs.length, accounts: exceeding.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
