import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  calcTradeScore, calcRiskScore,
  generateAlerts, generateInsights, generateSuggestions, analyzeWinPatterns,
} from '../lib/tradeAnalytics'

// ── ユーティリティ ──────────────────────────────────

function fmtHold(minutes, t) {
  if (minutes < 60)   return t('insight.duration.minutes', { count: Math.round(minutes) })
  if (minutes < 1440) return t('insight.duration.hours',   { count: Number((minutes / 60).toFixed(1)) })
  return t('insight.duration.days', { count: Number((minutes / 1440).toFixed(1)) })
}

// rules messages emitted by tradeAnalytics carry { i18nKey, i18nParams? } —
// resolve them through t(), translating sessionId into a localized label first.
function resolveMessage(item, t) {
  if (!item.i18nKey) return item.message ?? ''
  const params = { ...(item.i18nParams ?? {}) }
  if (params.sessionId) {
    params.session = t(`session.${params.sessionId}`)
    delete params.sessionId
  }
  return t(item.i18nKey, params)
}

function makeTradeScoreStyle(t) {
  return (score) => {
    if (score >= 80) return { color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', label: t('insight.score.tradeGrades.excellent') }
    if (score >= 60) return { color: 'text-blue-400',    border: 'border-blue-500/30',    bg: 'bg-blue-500/10',    label: t('insight.score.tradeGrades.good') }
    if (score >= 40) return { color: 'text-amber-400',   border: 'border-amber-500/30',   bg: 'bg-amber-500/10',   label: t('insight.score.tradeGrades.average') }
    return               { color: 'text-red-400',     border: 'border-red-500/30',     bg: 'bg-red-500/10',     label: t('insight.score.tradeGrades.needWork') }
  }
}

function makeRiskScoreStyle(t) {
  return (score) => {
    if (score < 30) return { color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', label: t('insight.score.riskGrades.low') }
    if (score < 60) return { color: 'text-amber-400',   border: 'border-amber-500/30',   bg: 'bg-amber-500/10',   label: t('insight.score.riskGrades.medium') }
    if (score < 80) return { color: 'text-orange-400',  border: 'border-orange-500/30',  bg: 'bg-orange-500/10',  label: t('insight.score.riskGrades.high') }
    return               { color: 'text-red-400',     border: 'border-red-500/30',     bg: 'bg-red-500/10',     label: t('insight.score.riskGrades.danger') }
  }
}

// ── 小コンポーネント ────────────────────────────────

function AlertBanner({ alert, t }) {
  const isDanger = alert.level === 'danger'
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-xs
      ${isDanger
        ? 'bg-red-500/10 border-red-500/30 text-red-300'
        : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
      <span className="text-base flex-shrink-0 mt-0.5">{isDanger ? '🚨' : '⚡'}</span>
      <span>{resolveMessage(alert, t)}</span>
    </div>
  )
}

function ScoreCard({ label, score, styleFn, subtitle, t }) {
  if (score === null) {
    return (
      <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4 flex flex-col items-center justify-center gap-1">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-2xl font-bold text-slate-600 font-mono">—</div>
        <div className="text-[10px] text-slate-600">{t('insight.score.insufficientData')}</div>
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

function PriorityBadge({ priority, t }) {
  if (priority === 'high')
    return <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-bold">{t('insight.priority.high')}</span>
  if (priority === 'medium')
    return <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-bold">{t('insight.priority.medium')}</span>
  return null
}

function InsightRow({ insight, t }) {
  const isWarn = insight.type === 'warning'
  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border text-xs
      ${isWarn
        ? 'bg-amber-500/5 border-amber-500/20 text-amber-200'
        : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-200'}`}>
      <span className="flex-shrink-0 mt-0.5">{isWarn ? '⚠' : '✅'}</span>
      <span className="flex-1">{resolveMessage(insight, t)}</span>
      <PriorityBadge priority={insight.priority} t={t} />
    </div>
  )
}

function SuggestionRow({ item, index, t }) {
  const isHigh = item.priority === 'high'
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-[#1f2d40] bg-[#0d1520] text-xs">
      <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5
        ${isHigh ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
        {index + 1}
      </span>
      <span className="flex-1 text-slate-300">{resolveMessage(item, t)}</span>
      <PriorityBadge priority={item.priority} t={t} />
    </div>
  )
}

function LockedSection({ count, onUpgrade, children, label, t }) {
  return (
    <div className="relative mt-1">
      <div className="space-y-2 blur-[3px] pointer-events-none select-none opacity-60">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <button
          onClick={onUpgrade}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2 rounded-lg font-semibold shadow-lg transition-colors">
          {label ?? t('insight.ai.lockedRemainder', { count })}
        </button>
      </div>
    </div>
  )
}

function WinPatternsContent({ patterns, t }) {
  if (!patterns) return null
  const { topHours, topSymbols, avgWinHold } = patterns
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
      <div>
        <div className="text-slate-500 mb-2 font-medium">{t('insight.winPatterns.topHours')}</div>
        {topHours.length === 0
          ? <div className="text-slate-600">{t('insight.winPatterns.noData')}</div>
          : topHours.map((h, i) => (
            <div key={i} className="flex items-center justify-between py-1 border-b border-[#1a2235]">
              <span className="text-slate-300 font-mono">{h.label}</span>
              <span className="text-emerald-400 font-semibold">{(h.winRate * 100).toFixed(0)}%</span>
              <span className="text-slate-600">{t('units.items', { count: h.total })}</span>
            </div>
          ))}
      </div>
      <div>
        <div className="text-slate-500 mb-2 font-medium">{t('insight.winPatterns.topSymbols')}</div>
        {topSymbols.length === 0
          ? <div className="text-slate-600">{t('insight.winPatterns.noData')}</div>
          : topSymbols.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1 border-b border-[#1a2235]">
              <span className="text-slate-300 font-medium">{s.name}</span>
              <span className="text-emerald-400 font-semibold">{(s.winRate * 100).toFixed(0)}%</span>
              <span className="text-slate-600">{t('units.items', { count: s.total })}</span>
            </div>
          ))}
      </div>
      <div>
        <div className="text-slate-500 mb-2 font-medium">{t('insight.winPatterns.avgWinHoldTitle')}</div>
        <div className="text-2xl font-bold text-emerald-400 font-mono mt-3">
          {avgWinHold > 0 ? fmtHold(avgWinHold, t) : '—'}
        </div>
        <div className="text-slate-600 mt-1">{t('insight.winPatterns.avgWinHoldLabel')}</div>
      </div>
    </div>
  )
}

// ── メインコンポーネント ────────────────────────────

export default function InsightPanel({ trades = [], stats, plan = 'free', onUpgrade, perAccountData = [] }) {
  const { t } = useTranslation()
  const tradeScoreStyle = useMemo(() => makeTradeScoreStyle(t), [t])
  const riskScoreStyle  = useMemo(() => makeRiskScoreStyle(t),  [t])
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
      {alerts.map((a, i) => <AlertBanner key={i} alert={a} t={t} />)}

      {/* スコアカード */}
      <div className="grid grid-cols-2 gap-3">
        <ScoreCard
          label={t('insight.score.trade.title')}
          score={tradeScore}
          styleFn={tradeScoreStyle}
          subtitle={t('insight.score.trade.subtitle')}
          t={t}
        />
        <ScoreCard
          label={t('insight.score.risk.title')}
          score={riskScore}
          styleFn={riskScoreStyle}
          subtitle={t('insight.score.risk.subtitle')}
          t={t}
        />
      </div>

      {/* AI診断カード */}
      <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span>🤖</span>
            <span className="text-sm font-semibold text-slate-200">{t('insight.ai.title')}</span>
          </div>
          <div className="flex items-center gap-2">
            {plan === 'free' && (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium">
                {t('insight.ai.freeBadge')}
              </span>
            )}
            {plan === 'pro' && (
              <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-medium">
                {t('insight.ai.proBadge')}
              </span>
            )}
          </div>
        </div>

        {insights.length === 0 ? (
          <div className="text-xs text-slate-600 py-2">
            {t('insight.ai.insufficient')}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleInsights.map((ins, i) => <InsightRow key={i} insight={ins} t={t} />)}

            {lockedInsightCount > 0 && (
              <LockedSection
                count={lockedInsightCount}
                onUpgrade={onUpgrade}
                t={t}>
                {insights.slice(1).map((ins, i) => <InsightRow key={i} insight={ins} t={t} />)}
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
            <span className="text-sm font-semibold text-slate-200">{t('insight.suggestions.title')}</span>
          </div>
          {plan === 'free' && (
            <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium">
              {t('insight.suggestions.proBadge')}
            </span>
          )}
        </div>

        {plan === 'free' ? (
          <div className="relative">
            <div className="space-y-2 blur-[3px] pointer-events-none select-none opacity-40">
              {(t('insight.demo.suggestions', { returnObjects: true }) || []).map((item, i) => <SuggestionRow key={i} item={item} index={i} t={t} />)}
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={onUpgrade}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2 rounded-lg font-semibold shadow-lg transition-colors">
                {t('insight.suggestions.unlockCta')}
              </button>
            </div>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-xs text-slate-600 py-2">{t('insight.suggestions.noneNeeded')}</div>
        ) : (
          <div className="space-y-2">
            {suggestions.map((item, i) => <SuggestionRow key={i} item={item} index={i} t={t} />)}
          </div>
        )}
      </div>

      {/* 口座別改善提案 */}
      {perAccountSuggestions.length > 0 && (
        <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span>📋</span>
              <span className="text-sm font-semibold text-slate-200">{t('insight.suggestions.perAccountTitle')}</span>
            </div>
            {plan === 'free' && (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium">
                {t('insight.suggestions.proBadge')}
              </span>
            )}
          </div>

          {plan === 'free' ? (
            <div className="relative">
              <div className="space-y-3 blur-[3px] pointer-events-none select-none opacity-40">
                {(t('insight.demo.perAccount', { returnObjects: true }) || []).map(({ name, items }) => (
                  <div key={name} className="border border-[#1f2d40] rounded-lg p-3">
                    <div className="text-xs font-semibold text-slate-400 mb-2">{name}</div>
                    <div className="space-y-1.5">
                      {items.map((msg, i) => (
                        <SuggestionRow key={i} item={{ priority: i === 0 ? 'high' : 'medium', message: msg }} index={i} t={t} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={onUpgrade}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2 rounded-lg font-semibold shadow-lg transition-colors">
                  {t('insight.suggestions.unlockCta')}
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
                        {t('insight.suggestions.perAccountScore', { score: accScore })}
                      </span>
                    )}
                  </div>
                  {accSuggestions.length === 0 ? (
                    <div className="text-xs text-emerald-400/70 py-1">{t('insight.suggestions.perAccountNoneNeeded')}</div>
                  ) : (
                    <div className="space-y-1.5">
                      {accSuggestions.map((item, i) => <SuggestionRow key={i} item={item} index={i} t={t} />)}
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
            <span className="text-sm font-semibold text-slate-200">{t('insight.winPatterns.title')}</span>
          </div>
          {plan === 'free' && (
            <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium">
              {t('insight.suggestions.proBadge')}
            </span>
          )}
        </div>

        {plan === 'free' ? (
          <div className="relative">
            <div className="blur-[3px] pointer-events-none select-none opacity-40">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                {(t('insight.demo.winPatterns', { returnObjects: true }) || []).map(({ title, items }) => (
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
                {t('insight.suggestions.unlockCta')}
              </button>
            </div>
          </div>
        ) : (
          <WinPatternsContent patterns={patterns} t={t} />
        )}
      </div>

    </div>
  )
}
