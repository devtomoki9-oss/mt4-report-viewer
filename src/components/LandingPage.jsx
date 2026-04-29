import heroImg from '../assets/hero.png'

const FEATURES = [
  {
    icon: '📂',
    title: '複数口座の一括読み込み',
    desc: 'MT4/MT5 の複数口座から出力したレポートファイルをまとめて読み込み、口座ごと・全口座合算それぞれの統計を一覧表示します。',
  },
  {
    icon: '📊',
    title: '統計サマリーの自動集計',
    desc: '総取引数・損益合計・勝率・プロフィットファクター・最大ドローダウンなどの統計値を自動で算出し、表とグラフで表示します。',
  },
  {
    icon: '📈',
    title: 'エクイティカーブの表示',
    desc: '取引履歴から資産推移グラフを生成します。過去のどの時期に損益が増減したかを時系列で確認できます。',
  },
  {
    icon: '📅',
    title: 'カレンダービュー',
    desc: '日別・月別の損益をカレンダー形式で表示します。特定の曜日や時期ごとの傾向を視覚的に把握するのに役立ちます。',
  },
  {
    icon: '🔄',
    title: '自動同期（オプション）',
    desc: 'PowerShell スクリプトとタスクスケジューラを組み合わせることで、MT4/MT5 の最新レポートを定期的に自動取り込みできます。',
  },
]

const USE_CASES = [
  { label: '過去の取引を振り返りたい方', desc: '損益推移やドローダウンの深さを時系列グラフで確認' },
  { label: '複数口座をまとめて把握したい方', desc: '口座ごとの統計を横並びで比較・一覧表示' },
  { label: '取引履歴を整理・記録したい方', desc: '月別・通貨ペア別の集計データを一元管理' },
  { label: 'レポートをビジュアルで確認したい方', desc: 'MT4/MT5 の標準レポートをグラフ形式で可視化' },
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
    desc: 'タスクスケジューラで 1 分ごとに自動取り込み',
  },
  {
    step: '4',
    title: 'データを確認',
    desc: '全口座の取引履歴をブラウザで一括確認',
  },
]

const STATS = [
  { value: 'MT4/MT5', label: '両対応' },
  { value: '複数口座', label: '一括管理' },
  { value: '自動集計', label: '統計サマリー' },
]

const DISCLAIMER = `MT Report Viewer Pro は、MT4/MT5 から出力された取引履歴データの整理・集計・可視化のみを目的としたデータ分析ツールです。本サービスは投資助言・投資推奨・売買シグナルの提供を一切行いません。表示されるすべての統計・グラフはユーザーがアップロードした過去の取引履歴データに基づく記録的な情報であり、将来の運用成果を保証するものではありません。取引に関するすべての判断はユーザー自身の責任において行ってください。本サービスは金融商品取引業者ではなく、金融商品取引法に基づく登録・届出を要する業務は行っておりません。`

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
            <span className="font-semibold text-slate-100 text-sm tracking-tight">MT Report Viewer Pro</span>
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
          MT4 / MT5 対応 · データ分析ツール
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-100 mb-4 leading-tight tracking-tight">
          MT4/MT5 の取引履歴を、<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
            見やすく整理する
          </span>
        </h1>
        <p className="text-slate-400 text-base sm:text-lg max-w-xl mx-auto mb-3 leading-relaxed">
          取引履歴ファイルをアップロードするだけ。勝率・損益・ドローダウンなどの統計情報を自動で集計・グラフ化し、過去の取引データを多角的に可視化します。
        </p>
        <p className="text-slate-600 text-xs max-w-lg mx-auto mb-10">
          ※ 本ツールは取引履歴の整理・可視化のみを目的としています。投資助言・売買判断の提供は行いません。
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
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0a0e17] to-transparent z-10 pointer-events-none rounded-b-2xl" />
          <div className="border border-[#1f2d40] rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
            <img
              src={heroImg}
              alt="MT Report Viewer Pro ダッシュボード画面"
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

      {/* ── サービス説明 ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-100 mb-4">取引履歴を、データとして整理する</h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          MT4/MT5 が出力する HTML / JSON 形式のレポートファイルを読み込むと、取引ごとの損益・保有時間・通貨ペア別の集計など、複数の視点から取引データを整理して表示します。複数口座のデータを同時に読み込んで比較したり、カレンダー形式で日別の損益推移を確認したりと、自身の取引履歴を多角的に把握するための機能を提供します。
        </p>
        <p className="text-slate-600 text-xs mt-4">
          本ツールは記録されたデータの整理・表示のみを目的としており、将来の取引成果に関するいかなる示唆・助言も行いません。
        </p>
      </section>

      {/* ── 機能一覧 ── */}
      <section className="bg-[#0d1117] border-y border-[#1f2d40] py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-3">機能紹介</h2>
            <p className="text-slate-500 text-sm">取引データの整理・可視化に必要な機能を揃えています</p>
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
        </div>
      </section>

      {/* ── ユースケース ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-3">こんな方に</h2>
          <p className="text-slate-500 text-sm">取引履歴の整理・確認に活用できます</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {USE_CASES.map(u => (
            <div
              key={u.label}
              className="bg-[#111827] border border-[#1f2d40] rounded-xl px-5 py-4 flex items-start gap-4"
            >
              <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
              <div>
                <div className="text-sm font-semibold text-slate-200 mb-1">{u.label}</div>
                <div className="text-xs text-slate-500 leading-relaxed">{u.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 使い方 ── */}
      <section className="bg-[#0d1117] border-y border-[#1f2d40] py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-3">かんたんセットアップ</h2>
            <p className="text-slate-500 text-sm">初回のみ。あとは自動で最新データを取り込みます。</p>
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
          取引履歴の整理を、今すぐ始める
        </h2>
        <p className="text-slate-500 text-sm mb-8">アカウント登録は無料です</p>
        <button
          onClick={onStart}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-10 py-3.5 rounded-xl text-sm transition-colors shadow-lg shadow-blue-500/20"
        >
          無料アカウントを作成 →
        </button>
      </section>

      {/* ── フッター ── */}
      <footer className="border-t border-[#1f2d40] py-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-4">
          <div className="text-center text-xs font-semibold text-slate-500 mb-2">免責事項</div>
          <p className="text-xs text-slate-700 leading-relaxed text-center">
            {DISCLAIMER}
          </p>
          <div className="text-center text-xs text-slate-800 pt-2">
            MT Report Viewer Pro
          </div>
        </div>
      </footer>

    </div>
  )
}
