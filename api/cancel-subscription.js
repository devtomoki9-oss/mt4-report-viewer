/**
 * Stripe サブスクリプションをキャンセル
 * アカウント削除前に呼び出す
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { userId } = req.body
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' })
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY が設定されていません')

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (error || !user) return res.status(404).json({ error: 'User not found' })

    const customerId = user.app_metadata?.stripe_customer_id
    if (!customerId) {
      // Stripe 未登録（Free プラン）はスキップ
      return res.status(200).json({ cancelled: false, reason: 'no subscription' })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

    // 有効なサブスクリプションを取得してキャンセル
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 10,
    })

    for (const sub of subscriptions.data) {
      await stripe.subscriptions.cancel(sub.id)
    }

    return res.status(200).json({ cancelled: true, count: subscriptions.data.length })
  } catch (err) {
    console.error('cancel-subscription error:', err)
    return res.status(500).json({ error: err.message })
  }
}
