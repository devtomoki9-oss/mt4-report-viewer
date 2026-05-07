import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY    = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY   = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT       = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.com'
const WEBHOOK_SECRET      = Deno.env.get('WEBHOOK_SECRET') ?? ''

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

  const userId        = record.user_id as string
  const accountNumber = String(record.account_number)
  const data          = record.data as Record<string, unknown> | undefined
  const positions     = (data?.positions ?? []) as Array<{ profit?: number; swap?: number }>

  if (!userId || !positions.length) return new Response('No positions', { status: 200 })

  const totalNet = positions.reduce((s, p) => s + (p.profit ?? 0) + (p.swap ?? 0), 0)

  const { data: setting } = await supabase
    .from('alert_settings')
    .select('loss_threshold, last_notified_at')
    .eq('user_id', userId)
    .eq('account_number', accountNumber)
    .maybeSingle()

  if (!setting) return new Response('No alert setting', { status: 200 })

  const threshold = Number(setting.loss_threshold)
  if (totalNet >= -threshold) return new Response('OK: under threshold', { status: 200 })

  if (setting.last_notified_at) {
    const elapsed = Date.now() - new Date(setting.last_notified_at as string).getTime()
    if (elapsed < COOLDOWN_MS) return new Response('OK: cooldown', { status: 200 })
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs?.length) return new Response('No subscriptions', { status: 200 })

  const lossAmount = Math.abs(Math.round(totalNet)).toLocaleString('ja-JP')
  const payload = JSON.stringify({
    title: '含み損アラート',
    body:  `口座 ${accountNumber} の含み損が ${lossAmount} に達しました`,
    tag:   `loss-${accountNumber}`,
    url:   '/',
  })

  const results = await Promise.allSettled(
    subs.map(s =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      )
    )
  )

  await supabase
    .from('alert_settings')
    .update({ last_notified_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('account_number', accountNumber)

  const sent = results.filter(r => r.status === 'fulfilled').length
  return new Response(JSON.stringify({ sent, total: subs.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
