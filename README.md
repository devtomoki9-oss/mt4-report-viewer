# MT4/MT5 Report Viewer

MT4 / MT5 の取引履歴を可視化・分析するための Web アプリケーションです。
専用 EA（Expert Advisor）が出力する JSON を取り込み、損益・ドローダウン・勝率などの統計、エクイティカーブ、トレード一覧、カレンダーなどを表示します。
Supabase によるアカウント管理・口座データの同期に対応しています。

## 主な機能

- MT4 / MT5 の HTML / JSON レポートのインポート
- 統計サマリ（総損益、Profit Factor、勝率、最大ドローダウン など）
- エクイティカーブと日別トレードカレンダー
- 複数口座の集計・口座別ブレイクダウン
- オープンポジションと EA パラメータの表示
- ローカルフォルダ監視（File System Access API）による自動取り込み
- Supabase 経由でのクラウド同期 / 複数端末からの閲覧
- 日本語 / 英語の切り替え（i18n）
- Lemon Squeezy によるサブスクリプション連携

## 技術スタック

- React 19 + Vite 8
- Tailwind CSS v4
- Supabase（認証・データストア・Realtime）
- lightweight-charts / recharts
- i18next（ja / en）
- Vercel（ホスティング）/ Lemon Squeezy（決済）
- MQL4 / MQL5（取引履歴エクスポート EA）

## ディレクトリ構成

```
.
├── api/                     Vercel Serverless Functions（決済・Webhook）
├── public/                  EA / 同期用スクリプト・静的アセット
│   ├── MT4ReportExporter.mq4
│   ├── MT5ReportExporter.mq5
│   ├── sync-to-supabase.ps1
│   └── ...
├── scripts/                 ビルド時に install.bat を生成
├── src/
│   ├── components/          UI コンポーネント
│   ├── lib/                 パーサ・Supabase クライアント等
│   ├── i18n/                ロケール（ja / en）
│   ├── App.jsx
│   └── main.jsx
├── supabase_schema.sql      Supabase 用スキーマ
└── vite.config.js
```

## セットアップ

### 必要環境

- Node.js 20 以上
- npm
- Supabase プロジェクト（認証・DB 用）

### インストール

```bash
npm install
```

### 環境変数

`.env.example` を参考に、リポジトリのルートに `.env.local` を作成します。

```bash
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

Supabase 側のテーブル・ポリシーは `supabase_schema.sql` を実行して作成してください。

## 開発

```bash
npm run dev      # 開発サーバ起動（HMR）
npm run lint     # ESLint
npm run build    # 本番ビルド（install.bat の生成も同時に実行）
npm run preview  # ビルド成果物のローカル確認
```

## デプロイ

- Vercel への本番デプロイは `main` ブランチへのマージで自動実行されます。
- プレビュー環境への手動デプロイには `deploy-dev.bat` を利用できます（`mt4-report-viewer-dev.vercel.app` にエイリアスを割り当てます）。

## MT4 / MT5 への EA 設置

1. アプリ内のセットアップ手順、もしくは `public/install.bat` を利用して
   `public/MT4ReportExporter.mq4` / `MT5ReportExporter.mq5` を MetaTrader の
   `MQL4\Experts` / `MQL5\Experts` フォルダに配置します。
2. MT4 / MT5 を起動し、任意のチャートに EA をアタッチします。
   売買は一切行わず、取引履歴の JSON エクスポートのみを行います（自動売買 OFF でも動作します）。
3. 出力先は `%USERPROFILE%\MTExport\<口座番号>.json` です。
4. 同梱の `sync-to-supabase.ps1` / `run-sync.vbs` をタスクスケジューラ等に登録すると、
   ファイル更新を検知して自動で Supabase に同期できます。

## ライセンス

本リポジトリは現時点でライセンス未指定です。利用条件については所有者に確認してください。
