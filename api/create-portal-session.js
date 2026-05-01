/**
 * Lemon Squeezy サブスクリプション管理ポータル URL 取得
 *
 * LS の GET /v1/subscriptions/{id} レスポンスに含まれる
 * attributes.urls.customer_portal を返す。
 * サブスク未登録の場合は LS のマイオーダーページへ誘導する。
 *
 * 【Vercel 環境変数】
 *   LEMONSQUEEZY_API_KEY    : LS APIキー
 *   SUPABASE_URL            : Supabase プロジェクト URL
 *   SUPABASE_SERVICE_ROLE_KEY: サービスロールキー
 */

import { createClient } from '@supabase/supabase-js'

const LS_MY_ORDERS_URL = 'https://app.lemonsqueezy.com/my-orders'

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
    .select('lemon_subscription_id')
    .eq('user_id', userId)
    .single()

  if (error || !sub?.lemon_subscription_id) {
    // サブスク未登録 → LS マイオーダーページへ
    return res.status(200).json({ url: LS_MY_ORDERS_URL })
  }

  try {
    const response = await fetch(
      `https://api.lemonsqueezy.com/v1/subscriptions/${sub.lemon_subscription_id}`,
      {
        headers: {
          Accept:        'application/vnd.api+json',
          Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
        },
      }
    )

    if (!response.ok) {
      return res.status(200).json({ url: LS_MY_ORDERS_URL })
    }

    const json = await response.json()
    const portalUrl = json.data?.attributes?.urls?.customer_portal

    return res.status(200).json({ url: portalUrl ?? LS_MY_ORDERS_URL })
  } catch (err) {
    console.error('create-portal-session error:', err)
    return res.status(200).json({ url: LS_MY_ORDERS_URL })
  }
}
