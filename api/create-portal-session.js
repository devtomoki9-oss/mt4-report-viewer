/**
 * Stripe カスタマーポータルセッション作成
 * （サブスクリプション管理・解約はポータル上で行う）
 *
 * 【Stripe ダッシュボード側の事前設定】
 * Settings → Billing → Customer Portal → 「有効化」して保存
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { userId, returnUrl } = req.body
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' })
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error || !user) {
    return res.status(404).json({ error: 'User not found' })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    // app_metadata に customer_id があればそのまま使う
    let customerId = user.app_metadata?.stripe_customer_id

    // なければメールアドレスで Stripe を検索
    if (!customerId) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 })
      if (customers.data.length > 0) {
        customerId = customers.data[0].id
        // 次回以降のために app_metadata に保存
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          app_metadata: { stripe_customer_id: customerId },
        })
      }
    }

    if (!customerId) {
      return res.status(400).json({ error: 'Stripe customer not found. Please contact support.' })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl ?? process.env.VITE_APP_URL,
    })
    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('Stripe portal error:', err)
    return res.status(500).json({ error: err.message })
  }
}
