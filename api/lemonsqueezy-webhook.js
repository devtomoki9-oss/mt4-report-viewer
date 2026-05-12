/**
 * Lemon Squeezy Webhook ハンドラー
 *
 * 対応イベント:
 *   subscription_created  : サブスク開始 → subscriptions テーブルに upsert
 *   subscription_updated  : プラン変更・更新 → upsert
 *   subscription_cancelled: 解約 → status を cancelled に更新
 *   subscription_expired  : 期限切れ → status を expired に更新
 *
 * 【Lemon Squeezy ダッシュボード側の設定】
 * Settings → Webhooks → エンドポイント追加
 *   URL    : https://your-app.vercel.app/api/lemonsqueezy-webhook
 *   Events : subscription_created, subscription_updated,
 *            subscription_cancelled, subscription_expired
 *   Secret : 任意の文字列 → LEMONSQUEEZY_WEBHOOK_SECRET に設定
 *
 * 【Vercel 環境変数】
 *   LEMONSQUEEZY_WEBHOOK_SECRET : Webhook署名シークレット
 *   SUPABASE_URL                : Supabase プロジェクト URL
 *   SUPABASE_SERVICE_ROLE_KEY   : サービスロールキー（管理画面 → Settings → API）
 */

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await getRawBody(req)
  const signature = req.headers['x-signature'] ?? ''

  if (!signature) {
    return res.status(401).json({ error: 'Missing x-signature header' })
  }

  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
  if (!secret) {
    console.error('LEMONSQUEEZY_WEBHOOK_SECRET is not set')
    return res.status(500).json({ error: 'Webhook secret not configured' })
  }

  // HMAC-SHA256 署名検証（タイミング攻撃防止のため timingSafeEqual を使用）
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  let isValid = false
  try {
    isValid = crypto.timingSafeEqual(
      Buffer.from(hmac, 'hex'),
      Buffer.from(signature, 'hex')
    )
  } catch {
    return res.status(401).json({ error: 'Invalid signature format' })
  }

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  let payload
  try {
    payload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const eventName = payload.meta?.event_name
  const userId    = payload.meta?.custom_data?.user_id

  if (!userId) {
    return res.status(400).json({ error: 'Missing user_id in custom_data' })
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const attrs = payload.data?.attributes ?? {}

  switch (eventName) {
    case 'subscription_created':
    case 'subscription_updated': {
      const periodEnd = attrs.renews_at ?? attrs.ends_at ?? attrs.trial_ends_at ?? null
      // variant_id は attributes に直接入っている場合と relationships 経由の場合がある
      const variantId = String(
        attrs.variant_id ?? payload.data?.relationships?.variant?.data?.id ?? ''
      )
      const standardVariantId = process.env.LEMONSQUEEZY_STANDARD_VARIANT_ID
      const plan = standardVariantId && variantId === standardVariantId ? 'standard' : 'pro'
      const { error } = await supabaseAdmin
        .from('subscriptions')
        .upsert(
          {
            user_id:               userId,
            plan,
            status:                attrs.status,
            lemon_subscription_id: String(payload.data.id),
            current_period_end:    periodEnd,
          },
          { onConflict: 'user_id' }
        )
      if (error) {
        console.error('Supabase upsert error:', error)
        return res.status(500).json({ error: 'DB error' })
      }
      break
    }

    case 'subscription_cancelled':
    case 'subscription_expired': {
      const newStatus = eventName === 'subscription_expired' ? 'expired' : 'cancelled'
      const { error } = await supabaseAdmin
        .from('subscriptions')
        .update({ status: newStatus })
        .eq('user_id', userId)
      if (error) {
        console.error('Supabase update error:', error)
        return res.status(500).json({ error: 'DB error' })
      }
      break
    }

    default:
      // 未対応イベントは 200 を返して LS に再送させない
      break
  }

  return res.status(200).json({ received: true })
}
