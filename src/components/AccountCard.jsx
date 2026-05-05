import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const SORT_VALUE = {
  profit:      (s, t) => ({ label: t('app.accountList.sort.profit'), value: (s.totalProfit >= 0 ? '+' : '') + s.totalProfit.toFixed(2), color: s.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400' }),
  trades:      (s, t) => ({ label: t('app.accountList.sort.trades'), value: String(s.totalTrades),                                       color: 'text-slate-300' }),
  pf:          (s, t) => ({ label: t('app.accountList.sort.pf'),     value: isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞', color: 'text-blue-400'  }),
  winRate:     (s, t) => ({ label: t('app.accountList.sort.winRate'),value: s.winRate.toFixed(1) + '%',                                  color: 'text-slate-300' }),
  maxDrawdown: (s, t) => ({ label: t('app.accountList.sort.maxDrawdown'), value: s.maxDrawdown.toFixed(2),                              color: 'text-amber-400' }),
  name:        (s, t) => ({ label: t('app.accountList.sort.profit'), value: (s.totalProfit >= 0 ? '+' : '') + s.totalProfit.toFixed(2), color: s.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400' }),
}

export default function AccountCard({ account, onRemove, aliases = {}, setAlias, sortKey = 'profit', tradingEnabled = true, onTradingToggle }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const { account: info, stats } = account
  const isProfit = stats.totalProfit >= 0
  const displayName = aliases[info.name] || info.name
  const sortVal = (SORT_VALUE[sortKey] || SORT_VALUE.profit)(stats, t)

  const fmt = (n) => {
    const abs = Math.abs(n).toFixed(2)
    return (n >= 0 ? '+' : '-') + abs
  }

  const startEdit = (e) => {
    e.stopPropagation()
    setEditValue(displayName)
    setEditing(true)
  }

  const saveEdit = (e) => {
    e.stopPropagation()
    const v = editValue.trim()
    setAlias?.(info.name, v || info.name)
    setEditing(false)
  }

  const cancelEdit = (e) => {
    e.stopPropagation()
    setEditing(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') saveEdit(e)
    if (e.key === 'Escape') cancelEdit(e)
  }

  return (
    <div className="bg-[#111827] border border-[#1f2d40] rounded-xl overflow-hidden">
      {/* ヘッダ */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#1a2235] transition-colors"
        onClick={() => !editing && setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isProfit ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <div>
            {editing ? (
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <input
                  autoFocus
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="bg-[#0a0e17] border border-blue-500 rounded px-2 py-0.5 text-sm text-slate-200 focus:outline-none w-48"
                />
                <button onClick={saveEdit} className="text-emerald-400 hover:text-emerald-300 text-xs px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded">✓</button>
                <button onClick={cancelEdit} className="text-slate-500 hover:text-slate-300 text-xs px-1.5 py-0.5 bg-[#1a2235] border border-[#1f2d40] rounded">✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group">
                <div className="text-sm font-semibold text-slate-200">{displayName}</div>
                <button
                  onClick={startEdit}
                  className="text-slate-600 hover:text-blue-400 transition-colors text-xs leading-none opacity-0 group-hover:opacity-100"
                  title={t('account.card.rename')}
                >
                  ✎
                </button>
              </div>
            )}
            <div className="text-xs text-slate-500">{t('account.card.tradesCount', { count: stats.totalTrades })}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1 text-xs text-slate-600 font-mono">
            <span>{sortVal.label}</span>
          </div>
          <div className={`font-mono text-sm font-bold ${sortVal.color}`}>
            {sortVal.value}
          </div>
          {sortKey !== 'winRate' && (
            <div className="text-xs text-slate-500 font-mono hidden sm:block">
              WR {stats.winRate.toFixed(1)}%
            </div>
          )}
          {sortKey !== 'pf' && (
            <div className="text-xs text-slate-500 font-mono hidden sm:block">
              PF {isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'}
            </div>
          )}
          {onTradingToggle && (
            <button
              onClick={e => { e.stopPropagation(); onTradingToggle(!tradingEnabled) }}
              title={tradingEnabled ? t('account.card.tradingStopHint') : t('account.card.tradingRunHint')}
              className={`flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all
                ${tradingEnabled
                  ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
                  : 'text-slate-500 border-slate-700 bg-slate-800/50 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30'
                }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${tradingEnabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              {tradingEnabled ? t('account.card.tradingActive') : t('account.card.tradingPaused')}
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onRemove() }}
            className="text-slate-600 hover:text-red-400 transition-colors text-sm px-1"
            title={t('account.card.delete')}
          >
            ✕
          </button>
          <span className="text-slate-600 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* 展開詳細 */}
      {expanded && (
        <div className="border-t border-[#1f2d40] px-4 py-3 space-y-3">
          {/* 口座情報 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: t('account.card.metrics.balance'),  value: (info.balance || 0).toLocaleString('en', { maximumFractionDigits: 2 }) + ' ' + (info.currency || ''), color: 'text-slate-200' },
              { label: t('account.card.metrics.credit'),   value: (info.credit || 0).toLocaleString('en', { maximumFractionDigits: 2 }) + ' ' + (info.currency || ''), color: 'text-blue-400' },
              { label: t('account.card.metrics.equity'),   value: (info.equity  || 0).toLocaleString('en', { maximumFractionDigits: 2 }) + ' ' + (info.currency || ''), color: (info.equity || 0) >= (info.balance || 0) ? 'text-emerald-400' : 'text-amber-400' },
              { label: t('account.card.metrics.floating'), value: ((info.equity || 0) - (info.balance || 0) - (info.credit || 0) >= 0 ? '+' : '') + ((info.equity || 0) - (info.balance || 0) - (info.credit || 0)).toFixed(2), color: (info.equity || 0) - (info.balance || 0) - (info.credit || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
            ].map(item => (
              <div key={item.label} className="bg-[#0a0e17] rounded-lg p-2.5">
                <div className="text-xs text-slate-600 mb-0.5">{item.label}</div>
                <div className={`font-mono text-sm font-semibold ${item.color}`}>{item.value}</div>
              </div>
            ))}
          </div>
          {/* 取引成績 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: t('account.card.metrics.profit'),       value: fmt(stats.totalProfit), color: isProfit ? 'text-emerald-400' : 'text-red-400' },
              { label: t('account.card.metrics.grossProfit'),  value: '+' + stats.grossProfit.toFixed(2), color: 'text-emerald-400' },
              { label: t('account.card.metrics.grossLoss'),    value: '-' + stats.grossLoss.toFixed(2), color: 'text-red-400' },
              { label: t('account.card.metrics.profitFactor'), value: isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞', color: 'text-blue-400' },
              { label: t('account.card.metrics.winRate'),      value: stats.winRate.toFixed(1) + '%', color: 'text-slate-300' },
              { label: t('account.card.metrics.wins'),         value: stats.wins, color: 'text-emerald-400' },
              { label: t('account.card.metrics.losses'),       value: stats.losses, color: 'text-red-400' },
              { label: t('account.card.metrics.maxDrawdown'),  value: stats.maxDrawdown.toFixed(2), color: 'text-amber-400' },
            ].map(item => (
              <div key={item.label} className="bg-[#0a0e17] rounded-lg p-2.5">
                <div className="text-xs text-slate-600 mb-0.5">{item.label}</div>
                <div className={`font-mono text-sm font-semibold ${item.color}`}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
