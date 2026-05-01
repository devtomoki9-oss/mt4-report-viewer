/**
 * Lemon Squeezy サブスクリプションをキャンセル
 * アカウント削除前に呼び出す
 *
 * 【Vercel 環境変数】
 *   LEMONSQUEEZY_API_KEY     : LS APIキー
 *   SUPABASE_URL             : Supabase プロジェクト URL
 *   SUPABASE_SERVICE_ROLE_KEY: サービスロールキー
 */

import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { userId } = req.body
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' })
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: sub, error } = await supabaseAdmin
    .from('subscriptions')
    .select('lemon_subscription_id, status')
    .eq('user_id', userId)
    .single()

  if (error || !sub?.lemon_subscription_id) {
    // サブスク未登録（Free プラン）はスキップ
    return res.status(200).json({ cancelled: false, reason: 'no subscription' })
  }

  if (sub.status === 'cancelled' || sub.status === 'expired') {
    return res.status(200).json({ cancelled: false, reason: 'already cancelled' })
  }

  if (!process.env.LEMONSQUEEZY_API_KEY) {
    return res.status(500).json({ error: 'LEMONSQUEEZY_API_KEY is not set' })
  }

  try {
    // LS の DELETE /v1/subscriptions/{id} でキャンセル
    const response = await fetch(
      `https://api.lemonsqueezy.com/v1/subscriptions/${sub.lemon_subscription_id}`,
      {
        method: 'DELETE',
        headers: {
          Accept:        'application/vnd.api+json',
          Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
        },
      }
    )

    if (!response.ok) {
      const err = await response.text()
      console.error('LS cancel error:', err)
      return res.status(500).json({ error: 'Cancellation failed' })
    }

    return res.status(200).json({ cancelled: true })
  } catch (err) {
    console.error('cancel-subscription error:', err)
    return res.status(500).json({ error: err.message })
  }
}
