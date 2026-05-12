"""Qiita article templates for MT4 Report Viewer development."""

ARTICLES = [
    {
        "title": "ReactとSupabaseでFXトレード管理アプリを個人開発した話",
        "tags": [
            {"name": "React"},
            {"name": "Supabase"},
            {"name": "個人開発"},
            {"name": "FX"},
            {"name": "TypeScript"},
        ],
        "body": """\
## はじめに

FXトレーダーとして自分のトレード成績を管理するツールが欲しくなり、個人開発でWebアプリを作りました。
MT4/MT5のエクスポートHTMLをアップロードするだけでグラフが自動生成されます。

本記事では技術選定の理由と実装の概要を解説します。

## 技術スタック

- **フロントエンド**: React 19 + Vite + Tailwind CSS v4
- **バックエンド**: Supabase（PostgreSQL + Auth + Realtime）
- **ホスティング**: Vercel
- **決済**: Lemon Squeezy

## Supabaseを選んだ理由

Firebase の代替として Supabase を選びました。主な理由は：

1. PostgreSQL なので SQL が使える
2. Row Level Security (RLS) でユーザーデータを安全に分離できる
3. Realtime 購読でリアルタイム更新が簡単
4. 無料枠が十分（500MB DB + 1GB Storage）

```javascript
// supabaseClient.js
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

## RLS によるデータ分離

各ユーザーが自分のデータのみ読み書きできるようにRLSを設定します。

```sql
-- reports テーブルのRLSポリシー
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can only access own reports"
  ON reports FOR ALL
  USING (auth.uid() = user_id);
```

## Realtime 購読でリアルタイム更新

PowerShellスクリプトがMT4データをSupabaseに書き込むと、
ブラウザに即座に反映されます。

```javascript
useEffect(() => {
  const channel = supabase
    .channel('reports')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'reports', filter: `user_id=eq.${userId}` },
      (payload) => setReports(prev => updateReports(prev, payload))
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}, [userId])
```

## まとめ

Supabase を使うことで認証・DB・リアルタイム通信をまとめて解決できました。
個人開発で複数機能を一人で実装する場合、BaaS の活用は非常に効果的です。
""",
    },
    {
        "title": "MT4/MT5のHTMLレポートをJavaScriptでパースする方法",
        "tags": [
            {"name": "JavaScript"},
            {"name": "MT4"},
            {"name": "MT5"},
            {"name": "FX"},
            {"name": "個人開発"},
        ],
        "body": """\
## はじめに

MetaTrader 4/5 は取引履歴を HTML 形式でエクスポートできます。
このHTMLをJavaScriptでパースしてグラフ化する実装を解説します。

## MT4 HTMLレポートの構造

MT4のHTMLレポートはテーブル形式で取引履歴が格納されています。

```html
<table>
  <tr>
    <td>2024.01.15 09:30</td>  <!-- 日時 -->
    <td>123456789</td>          <!-- チケット番号 -->
    <td>buy</td>                <!-- 売買 -->
    <td>0.10</td>               <!-- ロット数 -->
    <td>USDJPY</td>             <!-- 通貨ペア -->
    <td>147.50</td>             <!-- 開始価格 -->
    <td>148.20</td>             <!-- 終了価格 -->
    <td>7000</td>               <!-- 損益（円） -->
  </tr>
</table>
```

## DOMParser を使ったパース

```javascript
export function parseMT4Html(htmlString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlString, 'text/html')
  const rows = doc.querySelectorAll('table tr')
  const trades = []

  rows.forEach(row => {
    const cells = row.querySelectorAll('td')
    if (cells.length < 8) return

    const type = cells[2].textContent.trim().toLowerCase()
    if (!['buy', 'sell'].includes(type)) return

    trades.push({
      openTime:  parseDate(cells[0].textContent.trim()),
      ticket:    cells[1].textContent.trim(),
      type,
      lots:      parseFloat(cells[3].textContent),
      symbol:    cells[4].textContent.trim(),
      openPrice: parseFloat(cells[5].textContent),
      closePrice: parseFloat(cells[6].textContent),
      profit:    parseFloat(cells[7].textContent.replace(/,/g, '')),
    })
  })

  return trades
}
```

## エクイティカーブの計算

```javascript
export function calcEquityCurve(trades, initialBalance = 100000) {
  let balance = initialBalance
  return trades
    .sort((a, b) => a.closeTime - b.closeTime)
    .map(trade => {
      balance += trade.profit
      return { time: trade.closeTime, balance }
    })
}
```

## まとめ

DOMParser を使えばブラウザだけでHTMLレポートをパースできます。
サーバーサイドの処理が不要なので、純粋なフロントエンドアプリとして実装できました。
""",
    },
    {
        "title": "Web Push通知（VAPID）でFXトレードアラートを実装した",
        "tags": [
            {"name": "WebPush"},
            {"name": "ServiceWorker"},
            {"name": "JavaScript"},
            {"name": "個人開発"},
            {"name": "FX"},
        ],
        "body": """\
## はじめに

FXトレード中に損失が閾値を超えたらプッシュ通知で知らせる機能を実装しました。
Web Push API と VAPID 認証の実装手順を解説します。

## Web Push の仕組み

```
ブラウザ → Push Server (Google/Mozilla) → Service Worker → 通知表示
```

VAPID（Voluntary Application Server Identification）を使うことで、
アプリサーバーの認証情報なしにプッシュ通知を送れます。

## VAPID キーの生成

```bash
npx web-push generate-vapid-keys
```

出力される公開鍵・秘密鍵を環境変数に設定します。

## Service Worker の登録

```javascript
// pushNotifications.js
export async function registerPushSubscription(vapidPublicKey) {
  const registration = await navigator.serviceWorker.ready

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  })

  // サブスクリプション情報をSupabaseに保存
  await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    keys: subscription.toJSON().keys,
  })

  return subscription
}
```

## Service Worker での通知受信

```javascript
// sw.js
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'アラート', {
      body: data.body,
      icon: '/icon-192.png',
    })
  )
})
```

## Supabase Edge Function からの送信

```javascript
// supabase/functions/send-alert/index.ts
import webpush from 'npm:web-push'

webpush.setVapidDetails(
  'mailto:your@email.com',
  Deno.env.get('VAPID_PUBLIC_KEY'),
  Deno.env.get('VAPID_PRIVATE_KEY'),
)

await webpush.sendNotification(subscription, JSON.stringify({
  title: '損失アラート',
  body: `${accountName}: ${loss.toFixed(0)}円の損失が発生しました`,
}))
```

## まとめ

Web Push + VAPID でサーバーサイドからブラウザへのプッシュ通知を実装できました。
Supabase Edge Functions と組み合わせることで、サーバーレスな通知システムが構築できます。
""",
    },
    {
        "title": "PowerShellでMT4データをSupabaseへ自動同期する仕組み",
        "tags": [
            {"name": "PowerShell"},
            {"name": "MT4"},
            {"name": "Supabase"},
            {"name": "Windows"},
            {"name": "自動化"},
        ],
        "body": """\
## はじめに

MT4が動くWindowsマシンとWebアプリを同期させるため、
PowerShellスクリプトでSupabaseへ自動アップロードする仕組みを作りました。

## 全体の流れ

```
MT4 (MQL4 EA) → JSONファイル出力
      ↓
PowerShell → Supabase REST API → ブラウザでリアルタイム表示
```

## MQL4 側: JSONエクスポート

MT4のEAがトレード履歴をJSONで出力します。

```mql4
// MT4ReportExporter.mq4
void ExportToJson(string filename) {
  int handle = FileOpen(filename, FILE_WRITE | FILE_TXT | FILE_ANSI);
  if (handle == INVALID_HANDLE) return;

  FileWrite(handle, "[");
  for (int i = OrdersHistoryTotal() - 1; i >= 0; i--) {
    if (!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
    string line = StringFormat(
      "{\"ticket\":%d,\"symbol\":\"%s\",\"profit\":%.2f}",
      OrderTicket(), OrderSymbol(), OrderProfit()
    );
    FileWrite(handle, line + (i > 0 ? "," : ""));
  }
  FileWrite(handle, "]");
  FileClose(handle);
}
```

## PowerShell 側: Supabase へアップロード

```powershell
# sync-to-supabase.ps1
param(
  [string]$JsonPath = "$env:APPDATA\MetaQuotes\Terminal\...\report.json",
  [string]$SupabaseUrl = $env:SUPABASE_URL,
  [string]$AnonKey = $env:SUPABASE_ANON_KEY
)

$json = Get-Content $JsonPath -Raw -Encoding UTF8
$body = @{
  account_name = $env:ACCOUNT_NAME
  report_json  = $json
  updated_at   = (Get-Date -Format "o")
} | ConvertTo-Json -Compress

Invoke-RestMethod `
  -Uri "$SupabaseUrl/rest/v1/reports" `
  -Method POST `
  -Headers @{
    "apikey"        = $AnonKey
    "Authorization" = "Bearer $AnonKey"
    "Content-Type"  = "application/json"
    "Prefer"        = "resolution=merge-duplicates"
  } `
  -Body $body
```

## Windowsタスクスケジューラで定期実行

```xml
<!-- task.xml -->
<Task>
  <Triggers>
    <TimeTrigger>
      <Repetition>
        <Interval>PT5M</Interval>  <!-- 5分ごと -->
      </Repetition>
    </TimeTrigger>
  </Triggers>
  <Actions>
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>-File "C:\sync-to-supabase.ps1"</Arguments>
    </Exec>
  </Actions>
</Task>
```

## まとめ

PowerShell + Supabase REST API でMT4データをクラウド同期できました。
MT4側にWebSocket等の特殊な実装は不要で、JSONファイルの出力だけで連携できます。
""",
    },
    {
        "title": "Lemon SqueezyでFree/Proプランのサブスクリプションを個人開発アプリに実装した",
        "tags": [
            {"name": "個人開発"},
            {"name": "LemonSqueezy"},
            {"name": "SaaS"},
            {"name": "JavaScript"},
            {"name": "マネタイズ"},
        ],
        "body": """\
## はじめに

個人開発のWebアプリにサブスクリプション機能を実装しました。
Stripe の代替として Lemon Squeezy を使った理由と実装を解説します。

## Lemon Squeezy を選んだ理由

1. **MoR（Merchant of Record）**: 消費税・VAT処理を代行してくれる
2. **日本円対応**: 円建て価格設定が可能
3. **API が簡単**: Stripe より学習コストが低い
4. **ダッシュボードが使いやすい**

## チェックアウトセッションの作成

```javascript
// api/create-checkout-session.js (Vercel Serverless Function)
export default async function handler(req, res) {
  const { userId, email, plan } = req.body

  const variantId = plan === 'yearly'
    ? process.env.LS_VARIANT_YEARLY
    : process.env.LS_VARIANT_MONTHLY

  const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
      'Content-Type':  'application/vnd.api+json',
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: { email, custom: { user_id: userId } },
        },
        relationships: {
          store:   { data: { type: 'stores',   id: process.env.LS_STORE_ID } },
          variant: { data: { type: 'variants', id: variantId } },
        },
      },
    }),
  })

  const { data } = await response.json()
  res.json({ url: data.attributes.url })
}
```

## Webhook でサブスクリプション状態を管理

```javascript
// api/lemonsqueezy-webhook.js
export default async function handler(req, res) {
  const event = req.headers['x-event-name']
  const payload = req.body

  if (event === 'subscription_created' || event === 'subscription_updated') {
    const userId = payload.meta.custom_data?.user_id
    const status = payload.data.attributes.status

    await supabase.from('subscriptions').upsert({
      user_id: userId,
      plan: status === 'active' ? 'pro' : 'free',
      ls_subscription_id: payload.data.id,
    })
  }

  res.status(200).json({ ok: true })
}
```

## フロントエンドでのプラン分岐

```javascript
// Pro機能へのアクセス制御
const isPro = subscription?.plan === 'pro'

{isPro ? (
  <AlertSettings />
) : (
  <div>
    <p>Pro プランで利用できます</p>
    <UpgradeButton />
  </div>
)}
```

## まとめ

Lemon Squeezy を使えば個人開発者でも簡単にサブスクリプション機能を実装できます。
MoR として税務処理を代行してくれるので、海外ユーザーへの販売も安心です。
""",
    },
    {
        "title": "Vite + Tailwind CSS v4 でモダンなダッシュボードUIを実装した",
        "tags": [
            {"name": "Vite"},
            {"name": "TailwindCSS"},
            {"name": "React"},
            {"name": "個人開発"},
            {"name": "フロントエンド"},
        ],
        "body": """\
## はじめに

React + Vite + Tailwind CSS v4 でトレードダッシュボードのUIを実装した際の
ポイントと注意点をまとめます。

## Vite を使う理由

- **高速なHMR**: ファイル保存後、ほぼ即座にブラウザへ反映
- **ESM ネイティブ**: バンドルなしで開発中は高速起動
- **設定が少ない**: webpack比でほぼゼロ設定

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

## Tailwind CSS v4 の変更点

v4 では CSS ファイルに直接設定を書く方式に変わりました。

```css
/* src/index.css */
@import "tailwindcss";

@theme {
  --color-brand: #22c55e;
  --font-sans: 'Inter', sans-serif;
}
```

`tailwind.config.js` は不要になり、設定がシンプルになりました。

## ダークテーマの実装

FXツールはダークテーマが見やすいので、デフォルトをダークにしました。

```javascript
// index.css
@layer base {
  :root {
    color-scheme: dark;
    --bg-primary: #0f172a;
    --bg-card:    #1e293b;
    --text-main:  #e2e8f0;
  }
}
```

## レスポンシブなカードレイアウト

```jsx
// AccountCard.jsx
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
  {accounts.map(acc => (
    <div key={acc.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h3 className="text-slate-200 font-semibold">{acc.name}</h3>
      <p className={`text-2xl font-bold ${acc.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {acc.profit.toLocaleString()} 円
      </p>
    </div>
  ))}
</div>
```

## まとめ

Vite + Tailwind v4 の組み合わせは開発体験が非常に良好です。
ビルド設定をほぼ書かずにモダンなUIを素早く実装できました。
""",
    },
    {
        "title": "GitHub ActionsでXとQiitaへの自動投稿を構築した話",
        "tags": [
            {"name": "GitHubActions"},
            {"name": "Python"},
            {"name": "Twitter"},
            {"name": "Qiita"},
            {"name": "自動化"},
        ],
        "body": """\
## はじめに

個人開発アプリの情報発信を自動化するため、GitHub ActionsでX（Twitter）とQiitaへの定期投稿を実装しました。

## X 自動投稿の仕組み

tweepy ライブラリを使って X API v2 で投稿します。

```python
# scripts/twitter/post.py
import tweepy
import json
import random
from pathlib import Path

from posts import POSTS

def pick_post():
    history_path = Path(__file__).parent / "posted_history.json"
    history = json.loads(history_path.read_text()) if history_path.exists() else []
    unused = [i for i in range(len(POSTS)) if i not in history]
    if not unused:
        history, unused = [], list(range(len(POSTS)))
    idx = random.choice(unused)
    history.append(idx)
    history_path.write_text(json.dumps(history))
    return POSTS[idx]

def main():
    client = tweepy.Client(
        consumer_key=os.getenv("X_API_KEY"),
        consumer_secret=os.getenv("X_API_KEY_SECRET"),
        access_token=os.getenv("X_ACCESS_TOKEN"),
        access_token_secret=os.getenv("X_ACCESS_TOKEN_SECRET"),
    )
    client.create_tweet(text=pick_post())
```

## GIF デモの自動録画・投稿

Playwright でアプリを自動操作してスクリーンショットを撮影し、GIF化して投稿します。

```python
from playwright.sync_api import sync_playwright
from PIL import Image
import io

def record_demo():
    frames = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(APP_URL)
        page.wait_for_timeout(2000)
        frames.append(Image.open(io.BytesIO(page.screenshot())))
        # ...操作してスクリーンショット...
        browser.close()

    frames[0].save("demo.gif", save_all=True, append_images=frames[1:],
                   duration=600, loop=0)
```

## GitHub Actions のワークフロー

```yaml
# .github/workflows/tweet.yml
on:
  schedule:
    - cron: '0 23 * * *'   # 08:00 JST
    - cron: '0 12 * * *'   # 21:00 JST
  workflow_dispatch:

jobs:
  tweet:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r scripts/twitter/requirements.txt
      - run: playwright install chromium --with-deps
      - run: python scripts/twitter/post.py
        env:
          X_API_KEY: ${{ secrets.X_API_KEY }}
          # ...他のシークレット...
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "ci: update post history"
```

## Qiita 自動投稿

```yaml
# .github/workflows/qiita.yml
on:
  schedule:
    - cron: '0 0 * * 1'  # 毎週月曜 09:00 JST
  workflow_dispatch:

jobs:
  qiita:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install python-dotenv
      - run: python scripts/qiita/post.py
        env:
          QIITA_TOKEN: ${{ secrets.QIITA_TOKEN }}
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "ci: update qiita post history"
```

## まとめ

GitHub Actions を使うことでPCを起動していなくても定期投稿が動き続けます。
投稿履歴はJSONでリポジトリに保存するため、重複投稿も防止できます。
""",
    },
    {
        "title": "i18next で React アプリを日英二言語対応にした実装メモ",
        "tags": [
            {"name": "React"},
            {"name": "i18next"},
            {"name": "国際化"},
            {"name": "個人開発"},
            {"name": "フロントエンド"},
        ],
        "body": """\
## はじめに

個人開発のFXトレード管理アプリを海外ユーザーにも使ってもらうため、
i18next を使って日英二言語対応を実装しました。

## セットアップ

```bash
npm install i18next react-i18next i18next-browser-languagedetector
```

```javascript
// src/i18n/index.js
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import jaTranslations from './locales/ja'
import enTranslations from './locales/en'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ja: { translation: jaTranslations },
      en: { translation: enTranslations },
    },
    fallbackLng: 'ja',
    interpolation: { escapeValue: false },
  })

export default i18n
```

## 翻訳ファイルの構造

```javascript
// src/i18n/locales/ja/index.js
export default {
  dashboard: {
    title: "ダッシュボード",
    totalProfit: "合計損益",
    winRate: "勝率",
    profitFactor: "プロフィットファクター",
  },
  account: {
    addAccount: "口座を追加",
    noAccounts: "口座が登録されていません",
  },
}
```

## コンポーネントでの使用

```jsx
import { useTranslation } from 'react-i18next'

function Dashboard() {
  const { t, i18n } = useTranslation()

  return (
    <div>
      <h1>{t('dashboard.title')}</h1>
      <p>{t('dashboard.totalProfit')}: {profit.toLocaleString(i18n.language)}</p>
    </div>
  )
}
```

## 言語切替ボタン

```jsx
function LanguageToggle() {
  const { i18n } = useTranslation()
  const toggle = () => i18n.changeLanguage(i18n.language === 'ja' ? 'en' : 'ja')
  return (
    <button onClick={toggle}>
      {i18n.language === 'ja' ? '🇺🇸 EN' : '🇯🇵 JP'}
    </button>
  )
}
```

## 数値・通貨フォーマットの言語対応

```javascript
// src/i18n/format.js
export function formatCurrency(value, lang) {
  return new Intl.NumberFormat(lang === 'ja' ? 'ja-JP' : 'en-US', {
    style: 'currency',
    currency: lang === 'ja' ? 'JPY' : 'USD',
    minimumFractionDigits: lang === 'ja' ? 0 : 2,
  }).format(value)
}
```

## まとめ

i18next の LanguageDetector を使えばブラウザの言語設定を自動検出して切り替わります。
翻訳ファイルを分離しておくことで、後から言語を追加しやすい構造になります。
""",
    },
    {
        "title": "Reactで購読管理画面への遷移前にガイダンスモーダルを表示する実装パターン",
        "tags": [
            {"name": "React"},
            {"name": "モーダル"},
            {"name": "UX"},
            {"name": "個人開発"},
        ],
        "body": """\
## はじめに

FXトレード管理WebアプリMT4 Report Viewerの開発において、ユーザーが購読プランを管理する際の体験を改善するため、ガイダンスモーダルの実装を行いました。本記事では、Reactでモーダルコンポーネントを使用した遷移前確認画面の実装パターンを紹介します。

## 課題背景

従来は、ユーザーメニューの「購読を管理」ボタンをクリックすると、直接Lemon Squeezyの顧客ポータルへリダイレクトしていました。しかし、外部ポータルへの遷移前に、以下の情報をユーザーに案内する必要がありました。

- ポータルにアクセスする際の認証方法（購入時のメールアドレスの確認）
- ポータルで可能な操作内容（請求履歴閲覧、支払い方法更新など）

## 実装内容

### 1. 状態管理の追加

App.jsx内でモーダルの表示/非表示を管理するステートを追加します。

```javascript
const [showManageModal, setShowManageModal] = useState(false)
```

### 2. ボタンのクリックハンドラ変更

従来の直接リダイレクト処理から、モーダル表示への変更を行いました。

```javascript
// 変更前
onClick={() => { handleManagePlan(); setShowUserMenu(false) }}

// 変更後
onClick={() => { setShowManageModal(true); setShowUserMenu(false) }}
```

この変更により、複数のメニュー箇所で一貫した挙動が実現できます。

### 3. モーダルコンポーネントの実装

```jsx
{showManageModal && (
  <div className="fixed inset-0 bg-bg/90 backdrop-blur flex items-center justify-center z-50 p-4"
    onClick={() => setShowManageModal(false)}>
    <div className="bg-surface border border-border rounded-2xl w-full max-w-sm p-6 space-y-4"
      onClick={e => e.stopPropagation()}>
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-slate-200">
          {t('app.manageModal.title')}
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          {t('app.manageModal.body')}
        </p>
      </div>
      <div className="bg-bg border border-border rounded-lg px-3 py-2.5 text-xs text-slate-400">
        {user?.email}
      </div>
      <p className="text-xs text-slate-600">
        {t('app.manageModal.hint')}
      </p>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => setShowManageModal(false)}
          className="flex-1 px-4 py-2 text-xs text-slate-400 hover:text-slate-200 border border-border rounded-lg transition-colors">
          {t('common.cancel', { defaultValue: 'キャンセル' })}
        </button>
        <button
          onClick={() => { setShowManageModal(false); handleManagePlan() }}
          className="flex-1 px-4 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors">
          {t('app.manageModal.cta')}
        </button>
      </div>
    </div>
  </div>
)}
```

### 4. 国際化対応

英語と日本語の両言語に対応するため、i18nファイルにテキストを追加しました。

**en/common.json:**
```json
"manageModal": {
  "title": "Manage Subscription",
  "body": "You'll be redirected to the Lemon Squeezy customer portal. Please sign in with the email address used to purchase your subscription.",
  "hint": "You can view billing history, update payment method, change plan, or cancel.",
  "cta": "Go to Portal"
}
```

**ja/common.json:**
同様に日本語テキストを追加することで、ユーザーの言語設定に対応します。

## 実装のポイント

1. **モーダルの背景クリック処理**: `onClick={e => e.stopPropagation()}`により、モーダル内のクリックが背景クリックとして扱われるのを防ぎます。

2. **確認メール表示**: `{user?.email}`でログインユーザーのメールアドレスを表示し、ポータルアクセス時の認証メールアドレスを視覚的に確認できます。

3. **操作の遅延実行**: キャンセルボタンクリック時はモーダルのみ閉じ、ポータルボタンクリック時は先にモーダルを閉じてから`handleManagePlan()`を実行することで、UI/UXの一貫性を保ちます。

## まとめ

Reactでのモーダル実装を通じて、外部サービスへの遷移前にユーザーガイダンスを挿入することができました。このパターンは、重要な操作確認が必要な他のシーンでも応用可能な実装パターンです。国際化対応により、多言語ユーザーに対しても適切なガイダンスを提供できるようになりました。
""",
    },

]
