import { useMemo } from 'react'
import {
  calcTradeScore, calcRiskScore,
  generateAlerts, generateInsights, generateSuggestions, analyzeWinPatterns,
} from '../lib/tradeAnalytics'

// ── ユーティリティ ──────────────────────────────────

function fmtHold(minutes) {
  if (minutes < 60)   return `${Math.round(minutes)}分`
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}時間`
  return `${(minutes / 1440).toFixed(1)}日`
}

function tradeScoreStyle(score) {
  if (score >= 80) return { color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', label: '優秀' }
  if (score >= 60) return { color: 'text-blue-400',    border: 'border-blue-500/30',    bg: 'bg-blue-500/10',    label: '良好' }
  if (score >= 40) return { color: 'text-amber-400',   border: 'border-amber-500/30',   bg: 'bg-amber-500/10',   label: '普通' }
  return               { color: 'text-red-400',     border: 'border-red-500/30',     bg: 'bg-red-500/10',     label: '要改善' }
}

function riskScoreStyle(score) {
  if (score < 30) return { color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', label: '低リスク' }
  if (score < 60) return { color: 'text-amber-400',   border: 'border-amber-500/30',   bg: 'bg-amber-500/10',   label: '中リスク' }
  if (score < 80) return { color: 'text-orange-400',  border: 'border-orange-500/30',  bg: 'bg-orange-500/10',  label: '高リスク' }
  return               { color: 'text-red-400',     border: 'border-red-500/30',     bg: 'bg-red-500/10',     label: '危険' }
}

// ── 小コンポーネント ────────────────────────────────

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

function ScoreCard({ label, score, styleFn, subtitle }) {
  if (score === null) {
    return (
      <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4 flex flex-col items-center justify-center gap-1">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-2xl font-bold text-slate-600 font-mono">—</div>
        <div className="text-[10px] text-slate-600">データ不足</div>
      </div>
    )
  }
  const s = styleFn(score)
  return (
    <div className={`${s.bg} border ${s.border} rounded-xl p-4 flex flex-col items-center justify-center gap-1`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-3xl font-bold font-mono ${s.color}`}>{score}</div>
      <div className={`text-[11px] font-semibold ${s.color}`}>{s.label}</div>
      {subtitle && <div className="text-[10px] text-slate-500 mt-0.5">{subtitle}</div>}
    </div>
  )
}

function PriorityBadge({ priority }) {
  if (priority === 'high')
    return <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-bold">高</span>
  if (priority === 'medium')
    return <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-bold">中</span>
  return null
}

function InsightRow({ insight }) {
  const isWarn = insight.type === 'warning'
  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border text-xs
      ${isWarn
        ? 'bg-amber-500/5 border-amber-500/20 text-amber-200'
        : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-200'}`}>
      <span className="flex-shrink-0 mt-0.5">{isWarn ? '⚠' : '✅'}</span>
      <span className="flex-1">{insight.message}</span>
      <PriorityBadge priority={insight.priority} />
    </div>
  )
}

function SuggestionRow({ item, index }) {
  const isHigh = item.priority === 'high'
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-[#1f2d40] bg-[#0d1520] text-xs">
      <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5
        ${isHigh ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
        {index + 1}
      </span>
      <span className="flex-1 text-slate-300">{item.message}</span>
      <PriorityBadge priority={item.priority} />
    </div>
  )
}

function LockedSection({ count, onUpgrade, children, label }) {
  return (
    <div className="relative mt-1">
      <div className="space-y-2 blur-[3px] pointer-events-none select-none opacity-60">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <button
          onClick={onUpgrade}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2 rounded-lg font-semibold shadow-lg transition-colors">
          {label ?? `Pro にアップグレードして残り${count}件を表示`}
        </button>
      </div>
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

// ── メインコンポーネント ────────────────────────────

export default function InsightPanel({ trades = [], stats, plan = 'free', onUpgrade, perAccountData = [] }) {
  const alerts      = useMemo(() => generateAlerts(trades, stats),     [trades, stats])
  const insights    = useMemo(() => generateInsights(trades, stats),   [trades, stats])
  const suggestions = useMemo(() => generateSuggestions(trades, stats),[trades, stats])
  const patterns    = useMemo(
    () => plan === 'pro' ? analyzeWinPatterns(trades) : null,
    [trades, plan]
  )
  const tradeScore  = useMemo(() => calcTradeScore(stats, trades),  [stats, trades])
  const riskScore   = useMemo(() => calcRiskScore(stats, trades),   [stats, trades])

  const perAccountSuggestions = useMemo(() => {
    if (perAccountData.length < 2) return []
    return perAccountData.map(({ account, trades: accTrades, stats: accStats }) => ({
      name: account.name,
      suggestions: generateSuggestions(accTrades, accStats).slice(0, 3),
      tradeScore: calcTradeScore(accStats, accTrades),
    }))
  }, [perAccountData])

  const visibleInsights    = plan === 'pro' ? insights    : insights.slice(0, 1)
  const lockedInsightCount = plan === 'free' ? Math.max(0, insights.length - 1) : 0

  if (!trades.length) return null

  return (
    <div className="space-y-3">

      {/* アラートバナー */}
      {alerts.map((a, i) => <AlertBanner key={i} alert={a} />)}

      {/* スコアカード */}
      <div className="grid grid-cols-2 gap-3">
        <ScoreCard
          label="トレードスコア"
          score={tradeScore}
          styleFn={tradeScoreStyle}
          subtitle="品質 0〜100"
        />
        <ScoreCard
          label="リスクスコア"
          score={riskScore}
          styleFn={riskScoreStyle}
          subtitle="高いほど危険"
        />
      </div>

      {/* AI診断カード */}
      <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span>🤖</span>
            <span className="text-sm font-semibold text-slate-200">AI診断</span>
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

            {lockedInsightCount > 0 && (
              <LockedSection
                count={lockedInsightCount}
                onUpgrade={onUpgrade}
                label={`Pro にアップグレードして残り${lockedInsightCount}件を表示`}>
                {insights.slice(1).map((ins, i) => <InsightRow key={i} insight={ins} />)}
              </LockedSection>
            )}
          </div>
        )}
      </div>

      {/* 改善提案 */}
      <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span>💡</span>
            <span className="text-sm font-semibold text-slate-200">改善提案</span>
          </div>
          {plan === 'free' && (
            <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium">
              Pro限定
            </span>
          )}
        </div>

        {plan === 'free' ? (
          <div className="relative">
            <div className="space-y-2 blur-[3px] pointer-events-none select-none opacity-40">
              {[
                { priority: 'high',   message: 'ストップロスを見直し、リスクリワード比を改善してください' },
                { priority: 'medium', message: 'ロンドン時間のトレードを削減することを検討してください' },
                { priority: 'medium', message: 'ドローダウンが大きいため、ロットサイズを下げることを検討してください' },
              ].map((item, i) => <SuggestionRow key={i} item={item} index={i} />)}
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={onUpgrade}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2 rounded-lg font-semibold shadow-lg transition-colors">
                Pro にアップグレードして解放
              </button>
            </div>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-xs text-slate-600 py-2">改善提案なし（良好なパフォーマンスです）</div>
        ) : (
          <div className="space-y-2">
            {suggestions.map((item, i) => <SuggestionRow key={i} item={item} index={i} />)}
          </div>
        )}
      </div>

      {/* 口座別改善提案 */}
      {perAccountSuggestions.length > 0 && (
        <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span>📋</span>
              <span className="text-sm font-semibold text-slate-200">口座別改善提案</span>
            </div>
            {plan === 'free' && (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium">
                Pro限定
              </span>
            )}
          </div>

          {plan === 'free' ? (
            <div className="relative">
              <div className="space-y-3 blur-[3px] pointer-events-none select-none opacity-40">
                {[
                  { name: '口座A', items: ['ストップロスを見直し、リスクリワード比を改善してください', 'ドローダウンが大きいためロットサイズを下げてください'] },
                  { name: '口座B', items: ['エントリー条件を根本から見直してください', 'ロンドン時間のトレードを削減することを検討してください'] },
                ].map(({ name, items }) => (
                  <div key={name} className="border border-[#1f2d40] rounded-lg p-3">
                    <div className="text-xs font-semibold text-slate-400 mb-2">{name}</div>
                    <div className="space-y-1.5">
                      {items.map((msg, i) => (
                        <SuggestionRow key={i} item={{ priority: i === 0 ? 'high' : 'medium', message: msg }} index={i} />
                      ))}
                    </div>
                  </div>
                ))}
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
            <div className="space-y-4">
              {perAccountSuggestions.map(({ name, suggestions: accSuggestions, tradeScore: accScore }) => (
                <div key={name} className="border border-[#1f2d40] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-slate-300 bg-[#0d1520] px-2 py-0.5 rounded border border-[#2a3a50]">
                      {name}
                    </span>
                    {accScore !== null && (
                      <span className={`text-xs font-mono ${tradeScoreStyle(accScore).color}`}>
                        スコア {accScore}
                      </span>
                    )}
                  </div>
                  {accSuggestions.length === 0 ? (
                    <div className="text-xs text-emerald-400/70 py-1">改善点なし（良好なパフォーマンスです）</div>
                  ) : (
                    <div className="space-y-1.5">
                      {accSuggestions.map((item, i) => <SuggestionRow key={i} item={item} index={i} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 勝ちパターン分析 */}
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
