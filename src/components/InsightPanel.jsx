import { useMemo } from 'react'
import { generateInsights, generateAlerts, analyzeWinPatterns } from '../lib/tradeAnalytics'

function fmtHold(minutes) {
  if (minutes < 60)  return `${Math.round(minutes)}分`
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}時間`
  return `${(minutes / 1440).toFixed(1)}日`
}

function AlertBanner({ alert }) {
  const isDanger = alert.level === 'danger'
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-xs
      ${isDanger
        ? 'bg-red-500/10 border-red-500/30 text-red-300'
        : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
      <span className="text-base flex-shrink-0 mt-0.5">{isDanger ? '🚨' : '⚡'}</span>
      <span>{alert.message}</span>
    </div>
  )
}

function InsightRow({ insight }) {
  const isWarn = insight.type === 'warning'
  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border text-xs
      ${isWarn
        ? 'bg-amber-500/5 border-amber-500/20 text-amber-200'
        : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-200'}`}>
      <span className="flex-shrink-0 mt-0.5">{isWarn ? '⚠' : '✅'}</span>
      <span>{insight.message}</span>
    </div>
  )
}

function WinPatternsContent({ patterns }) {
  if (!patterns) return null
  const { topHours, topSymbols, avgWinHold } = patterns
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
      <div>
        <div className="text-slate-500 mb-2 font-medium">勝率の高い時間帯 TOP3</div>
        {topHours.length === 0
          ? <div className="text-slate-600">データ不足</div>
          : topHours.map((h, i) => (
            <div key={i} className="flex items-center justify-between py-1 border-b border-[#1a2235]">
              <span className="text-slate-300 font-mono">{h.label}</span>
              <span className="text-emerald-400 font-semibold">{(h.winRate * 100).toFixed(0)}%</span>
              <span className="text-slate-600">{h.total}件</span>
            </div>
          ))}
      </div>
      <div>
        <div className="text-slate-500 mb-2 font-medium">勝率の高い通貨ペア TOP3</div>
        {topSymbols.length === 0
          ? <div className="text-slate-600">データ不足</div>
          : topSymbols.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1 border-b border-[#1a2235]">
              <span className="text-slate-300 font-medium">{s.name}</span>
              <span className="text-emerald-400 font-semibold">{(s.winRate * 100).toFixed(0)}%</span>
              <span className="text-slate-600">{s.total}件</span>
            </div>
          ))}
      </div>
      <div>
        <div className="text-slate-500 mb-2 font-medium">勝ちトレードの平均保有時間</div>
        <div className="text-2xl font-bold text-emerald-400 font-mono mt-3">
          {avgWinHold > 0 ? fmtHold(avgWinHold) : '—'}
        </div>
        <div className="text-slate-600 mt-1">勝ちトレード平均</div>
      </div>
    </div>
  )
}

export default function InsightPanel({ trades = [], stats, plan = 'free', onUpgrade }) {
  const alerts   = useMemo(() => generateAlerts(trades, stats),   [trades, stats])
  const insights = useMemo(() => generateInsights(trades, stats), [trades, stats])
  const patterns = useMemo(
    () => plan === 'pro' ? analyzeWinPatterns(trades) : null,
    [trades, plan]
  )

  const visibleInsights = plan === 'pro' ? insights : insights.slice(0, 1)
  const lockedCount     = plan === 'free' ? Math.max(0, insights.length - 1) : 0

  if (!trades.length) return null

  return (
    <div className="space-y-3">
      {/* アラートバナー */}
      {alerts.map((a, i) => <AlertBanner key={i} alert={a} />)}

      {/* AI診断カード */}
      <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span>🤖</span>
            <span className="text-sm font-semibold text-slate-200">AIトレード診断</span>
          </div>
          <div className="flex items-center gap-2">
            {plan === 'free' && (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium">
                Free: 1件
              </span>
            )}
            {plan === 'pro' && (
              <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-medium">
                Pro
              </span>
            )}
          </div>
        </div>

        {insights.length === 0 ? (
          <div className="text-xs text-slate-600 py-2">
            取引データが少ないため診断できません（5件以上必要）
          </div>
        ) : (
          <div className="space-y-2">
            {visibleInsights.map((ins, i) => <InsightRow key={i} insight={ins} />)}

            {lockedCount > 0 && (
              <div className="relative mt-1">
                <div className="space-y-2 blur-[3px] pointer-events-none select-none opacity-60">
                  {insights.slice(1).map((ins, i) => <InsightRow key={i} insight={ins} />)}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <button
                    onClick={onUpgrade}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2 rounded-lg font-semibold shadow-lg transition-colors">
                    Pro にアップグレードして残り{lockedCount}件を表示
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 勝ちパターン分析カード */}
      <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span>🏆</span>
            <span className="text-sm font-semibold text-slate-200">勝ちパターン分析</span>
          </div>
          {plan === 'free' && (
            <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium">
              Pro限定
            </span>
          )}
        </div>

        {plan === 'free' ? (
          <div className="relative">
            <div className="blur-[3px] pointer-events-none select-none opacity-40">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                {[
                  ['勝率の高い時間帯 TOP3', ['09:00  68%  42件', '14:00  65%  31件', '21:00  62%  18件']],
                  ['勝率の高い通貨ペア TOP3', ['XAUUSD  71%  88件', 'USDJPY  64%  55件', 'EURUSD  61%  43件']],
                  ['勝ちトレード平均保有時間', ['2.4時間']],
                ].map(([title, items]) => (
                  <div key={title}>
                    <div className="text-slate-500 mb-2 font-medium">{title}</div>
                    {items.map((item, i) => (
                      <div key={i} className="py-1 text-slate-400 font-mono border-b border-[#1a2235]">{item}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={onUpgrade}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2 rounded-lg font-semibold shadow-lg transition-colors">
                Pro にアップグレードして解放
              </button>
            </div>
          </div>
        ) : (
          <WinPatternsContent patterns={patterns} />
        )}
      </div>
    </div>
  )
}
