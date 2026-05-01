/**
 * Lemon Squeezy Checkout セッション作成
 *
 * 【Lemon Squeezy ダッシュボード側の設定】
 * 1. Products で商品・バリアント（月額プラン）を作成
 * 2. Settings → API → APIキーを発行
 *
 * 【Vercel 環境変数】
 *   LEMONSQUEEZY_API_KEY      : LS APIキー
 *   LEMONSQUEEZY_STORE_ID     : LS ストアID（数値）
 *   LEMONSQUEEZY_VARIANT_ID   : 月額プランのバリアントID（数値）
 *   VITE_APP_URL              : デプロイ先URL (https://your-app.vercel.app)
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { userId, email, returnUrl } = req.body
  if (!userId || !email) {
    return res.status(400).json({ error: 'userId and email are required' })
  }

  const apiKey    = process.env.LEMONSQUEEZY_API_KEY
  const storeId   = process.env.LEMONSQUEEZY_STORE_ID
  const variantId = process.env.LEMONSQUEEZY_VARIANT_ID

  if (!apiKey)    return res.status(500).json({ error: 'LEMONSQUEEZY_API_KEY is not set' })
  if (!storeId)   return res.status(500).json({ error: 'LEMONSQUEEZY_STORE_ID is not set' })
  if (!variantId) return res.status(500).json({ error: 'LEMONSQUEEZY_VARIANT_ID is not set' })

  const baseUrl = returnUrl ?? process.env.VITE_APP_URL ?? ''

  try {
    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        Accept:        'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              email,
              custom: { user_id: userId },
            },
            product_options: {
              // 決済完了後に ?upgraded=true を付けてリダイレクト
              redirect_url: `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}upgraded=true`,
            },
          },
          relationships: {
            store:   { data: { type: 'stores',   id: storeId   } },
            variant: { data: { type: 'variants', id: variantId } },
          },
        },
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('LS checkout error:', err)
      return res.status(500).json({ error: 'Checkout creation failed' })
    }

    const json = await response.json()
    const url  = json.data?.attributes?.url
    if (!url) return res.status(500).json({ error: 'No checkout URL returned from Lemon Squeezy' })

    return res.status(200).json({ url })
  } catch (err) {
    console.error('create-checkout-session error:', err)
    return res.status(500).json({ error: err.message })
  }
}
