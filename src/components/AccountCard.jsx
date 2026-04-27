import { useState } from 'react'

const SORT_VALUE = {
  profit:      (s) => ({ label: '純益',   value: (s.totalProfit >= 0 ? '+' : '') + s.totalProfit.toFixed(2), color: s.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400' }),
  trades:      (s) => ({ label: '取引数', value: String(s.totalTrades),                                       color: 'text-slate-300' }),
  pf:          (s) => ({ label: 'PF',     value: isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞', color: 'text-blue-400'  }),
  winRate:     (s) => ({ label: '勝率',   value: s.winRate.toFixed(1) + '%',                                  color: 'text-slate-300' }),
  maxDrawdown: (s) => ({ label: '最大DD', value: s.maxDrawdown.toFixed(2),                                    color: 'text-amber-400' }),
  name:        (s) => ({ label: '純益',   value: (s.totalProfit >= 0 ? '+' : '') + s.totalProfit.toFixed(2), color: s.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400' }),
}

export default function AccountCard({ account, onRemove, aliases = {}, setAlias, sortKey = 'profit' }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const { account: info, stats } = account
  const isProfit = stats.totalProfit >= 0
  const displayName = aliases[info.name] || info.name
  const sortVal = (SORT_VALUE[sortKey] || SORT_VALUE.profit)(stats)

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
                  title="名前を変更"
                >
                  ✎
                </button>
              </div>
            )}
            <div className="text-xs text-slate-500">{stats.totalTrades} trades</div>
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
          <button
            onClick={e => { e.stopPropagation(); onRemove() }}
            className="text-slate-600 hover:text-red-400 transition-colors text-sm px-1"
            title="削除"
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
              { label: '残高',      value: (info.balance || 0).toLocaleString('en', { maximumFractionDigits: 2 }) + ' ' + (info.currency || ''), color: 'text-slate-200' },
              { label: '有効証拠金', value: (info.equity  || 0).toLocaleString('en', { maximumFractionDigits: 2 }) + ' ' + (info.currency || ''), color: (info.equity || 0) >= (info.balance || 0) ? 'text-emerald-400' : 'text-amber-400' },
              { label: '含み損益',  value: ((info.equity || 0) - (info.balance || 0) - (info.credit || 0) >= 0 ? '+' : '') + ((info.equity || 0) - (info.balance || 0) - (info.credit || 0)).toFixed(2), color: (info.equity || 0) - (info.balance || 0) - (info.credit || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'クレジット', value: (info.credit || 0).toLocaleString('en', { maximumFractionDigits: 2 }) + ' ' + (info.currency || ''), color: 'text-blue-400' },
              { label: 'レバレッジ', value: info.leverage ? '1:' + info.leverage : '—', color: 'text-slate-400' },
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
              { label: '純益', value: fmt(stats.totalProfit), color: isProfit ? 'text-emerald-400' : 'text-red-400' },
              { label: '総利益', value: '+' + stats.grossProfit.toFixed(2), color: 'text-emerald-400' },
              { label: '総損失', value: '-' + stats.grossLoss.toFixed(2), color: 'text-red-400' },
              { label: 'プロフィットファクター', value: isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞', color: 'text-blue-400' },
              { label: '勝率', value: stats.winRate.toFixed(1) + '%', color: 'text-slate-300' },
              { label: '勝ちトレード', value: stats.wins, color: 'text-emerald-400' },
              { label: '負けトレード', value: stats.losses, color: 'text-red-400' },
              { label: '最大DD', value: stats.maxDrawdown.toFixed(2), color: 'text-amber-400' },
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
