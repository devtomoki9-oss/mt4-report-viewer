import heroImg from '../assets/hero.png'

const FEATURES = [
  {
    icon: '📊',
    title: '複数口座を一元管理',
    desc: 'MT4/MT5 の複数口座を一つのダッシュボードで集約。口座ごとの成績比較も簡単に行えます。',
  },
  {
    icon: '🔄',
    title: '自動リアルタイム同期',
    desc: 'タスクスケジューラで1分ごとに自動アップロード。常に最新の取引データをブラウザで確認。',
  },
  {
    icon: '📈',
    title: 'エクイティカーブ表示',
    desc: '資産推移をグラフで可視化。勝率・プロフィットファクター・最大DDなど主要指標を一目で確認。',
  },
  {
    icon: '📅',
    title: 'カレンダー分析',
    desc: '日別・月別の損益をカレンダー形式で表示。パフォーマンスのパターンや弱点を把握できます。',
  },
  {
    icon: '🤖',
    title: 'AI インサイト',
    desc: '取引データをAIが分析し、改善ポイントや傾向を自動レポート。（Pro プラン）',
  },
  {
    icon: '🔒',
    title: 'セキュアなデータ管理',
    desc: 'Supabase で安全にデータを保管。MT4/MT5からの自動同期も暗号化通信で送信されます。',
  },
]

const STEPS = [
  {
    step: '1',
    title: 'ファイルをダウンロード',
    desc: 'install.bat と EA ファイルをアプリ内からダウンロード',
  },
  {
    step: '2',
    title: 'MT4/MT5 にセットアップ',
    desc: 'install.bat を実行して EA を自動インストール',
  },
  {
    step: '3',
    title: '自動同期を設定',
    desc: 'タスクスケジューラで 1 分ごとに自動アップロード',
  },
  {
    step: '4',
    title: '分析スタート',
    desc: '全口座の成績をブラウザでリアルタイム確認',
  },
]

const STATS = [
  { value: 'MT4/MT5', label: '両対応' },
  { value: '複数口座', label: '一括管理' },
  { value: '1分ごと', label: '自動同期' },
]

export default function LandingPage({ onStart }) {
  return (
    <div className="min-h-screen bg-[#0a0e17] text-slate-200 overflow-x-hidden">

      {/* ── ナビ ── */}
      <nav className="border-b border-[#1f2d40] bg-[#0a0e17]/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-sm">
              📈
            </div>
            <span className="font-semibold text-slate-100 text-sm tracking-tight">MT Report Viewer</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onStart}
              className="text-xs text-slate-400 hover:text-slate-200 px-3 py-2 transition-colors"
            >
              ログイン
            </button>
            <button
              onClick={onStart}
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              無料で始める →
            </button>
          </div>
        </div>
      </nav>

      {/* ── ヒーロー ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-12 text-center">
        <div className="inline-block text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full mb-6">
          MT4 / MT5 対応
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-100 mb-4 leading-tight tracking-tight">
          FX取引の成績を<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
            ひとつの画面で分析
          </span>
        </h1>
        <p className="text-slate-400 text-base sm:text-lg max-w-xl mx-auto mb-10 leading-relaxed">
          複数の MT4/MT5 口座をリアルタイムで集約。エクイティカーブ・勝率・PF などを自動計算し、
          取引成績の改善をサポートします。
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
          <button
            onClick={onStart}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors shadow-lg shadow-blue-500/20"
          >
            無料で始める
          </button>
          <button
            onClick={onStart}
            className="bg-[#111827] border border-[#1f2d40] text-slate-300 hover:text-slate-100 hover:border-[#2a3d55] font-semibold px-8 py-3 rounded-xl text-sm transition-colors"
          >
            ログイン
          </button>
        </div>

        {/* スクリーンショット */}
        <div className="relative mx-auto max-w-4xl">
          <div
            className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0a0e17] to-transparent z-10 pointer-events-none rounded-b-2xl"
          />
          <div className="border border-[#1f2d40] rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
            <img
              src={heroImg}
              alt="MT Report Viewer ダッシュボード"
              className="w-full block"
            />
          </div>
        </div>
      </section>

      {/* ── 統計バー ── */}
      <section className="border-y border-[#1f2d40] bg-[#0d1117] py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            {STATS.map(item => (
              <div key={item.label}>
                <div className="text-xl sm:text-2xl font-bold text-blue-400">{item.value}</div>
                <div className="text-xs text-slate-500 mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 機能一覧 ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-3">すべての機能がここに</h2>
          <p className="text-slate-500 text-sm">取引データの分析に必要な機能をすべて揃えています</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div
              key={f.title}
              className="bg-[#111827] border border-[#1f2d40] rounded-xl p-5 hover:border-blue-500/30 transition-colors"
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <div className="font-semibold text-slate-200 mb-1.5 text-sm">{f.title}</div>
              <div className="text-slate-500 text-xs leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 使い方 ── */}
      <section className="bg-[#0d1117] border-y border-[#1f2d40] py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-3">かんたんセットアップ</h2>
            <p className="text-slate-500 text-sm">初回のみ。あとは完全自動です。</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {STEPS.map((s, i) => (
              <div key={s.step} className="flex flex-col items-center text-center relative">
                <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-base mb-4 flex-shrink-0">
                  {s.step}
                </div>
                {i < STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-5 left-[calc(50%+20px)] right-[calc(-50%+20px)] h-px bg-[#1f2d40]" />
                )}
                <div className="font-semibold text-slate-300 text-sm mb-1">{s.title}</div>
                <div className="text-slate-500 text-xs leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-24 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-4">
          今すぐ取引分析を始める
        </h2>
        <p className="text-slate-500 text-sm mb-8">無料で利用できます</p>
        <button
          onClick={onStart}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-10 py-3.5 rounded-xl text-sm transition-colors shadow-lg shadow-blue-500/20"
        >
          無料アカウントを作成 →
        </button>
      </section>

      {/* ── フッター ── */}
      <footer className="border-t border-[#1f2d40] py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-xs text-slate-700">
          MT Report Viewer — MT4/MT5 取引レポートビューア
        </div>
      </footer>
    </div>
  )
}
