/**
 * Stripe Webhook ハンドラー（支払い完了でプランを pro に昇格）
 *
 * 【セットアップ手順】
 * 1. Stripe ダッシュボード → Webhooks → エンドポイント追加
 *    URL: https://your-app.vercel.app/api/stripe-webhook
 *    イベント: checkout.session.completed
 * 2. Vercel 環境変数に以下を追加:
 *    - STRIPE_WEBHOOK_SECRET    : Webhook 署名シークレット (whsec_xxx)
 *    - SUPABASE_URL             : SupabaseプロジェクトURL
 *    - SUPABASE_SERVICE_ROLE_KEY: サービスロールキー（管理画面 → Settings → API）
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY)
  const rawBody   = await getRawBody(req)
  const signature = req.headers['stripe-signature']

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const userId  = session.metadata?.supabase_user_id

    if (userId) {
      const supabaseAdmin = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { plan: 'pro' },
      })
    }
  }

  return res.status(200).json({ received: true })
}
