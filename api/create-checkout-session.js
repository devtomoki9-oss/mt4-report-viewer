/**
 * Stripe Checkout セッション作成
 *
 * 【セットアップ手順】
 * 1. npm install stripe
 * 2. stripe.com でアカウント作成 → 商品「MT Report Viewer Pro」¥1,000/月を作成
 * 3. Vercel 環境変数に以下を設定:
 *    - STRIPE_SECRET_KEY     : Stripe シークレットキー (sk_live_xxx)
 *    - VITE_STRIPE_PRICE_ID  : 作成した Price の ID (price_xxx)
 *    - VITE_APP_URL          : デプロイ先 URL (https://your-app.vercel.app)
 */

import Stripe from 'stripe'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { userId, email, returnUrl } = req.body
  if (!userId || !email) {
    return res.status(400).json({ error: 'userId and email are required' })
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY が設定されていません')
    if (!process.env.VITE_STRIPE_PRICE_ID) throw new Error('VITE_STRIPE_PRICE_ID が設定されていません')

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: process.env.VITE_STRIPE_PRICE_ID,
        quantity: 1,
      }],
      customer_email: email,
      metadata: { supabase_user_id: userId },
      success_url: `${returnUrl}?upgraded=true`,
      cancel_url:  returnUrl,
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('Stripe error:', err)
    return res.status(500).json({ error: err.message })
  }
}
