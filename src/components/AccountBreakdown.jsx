import { useState, useMemo } from 'react'
import { buildEquityCurve } from '../lib/mt4Parser'
import EquityChart from './EquityChart'
import TradeTable from './TradeTable'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

function PFBar({ pf }) {
  const capped = Math.min(isFinite(pf) ? pf : 5, 5)
  const color = pf >= 2 ? '#10b981' : pf >= 1 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-[#0a0e17] rounded-full h-1.5 overflow-hidden">
        <div style={{ width: `${(capped / 5) * 100}%`, background: color }} className="h-full rounded-full" />
      </div>
      <span className="font-mono text-xs w-10 text-right" style={{ color }}>
        {isFinite(pf) ? pf.toFixed(2) : '∞'}
      </span>
    </div>
  )
}

function WinRatePie({ winRate }) {
  const color = winRate >= 55 ? '#10b981' : winRate >= 45 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-8 h-8 rounded-full flex-shrink-0"
        style={{ background: `conic-gradient(${color} ${winRate * 3.6}deg, #1f2d40 0deg)` }}
      />
      <span className="font-mono text-xs" style={{ color }}>{winRate.toFixed(1)}%</span>
    </div>
  )
}

function SortTh({ label, col, sortKey, sortDir, onSort, className = '' }) {
  const active = sortKey === col
  return (
    <th
      className={`py-2.5 font-medium cursor-pointer select-none hover:text-slate-300 transition-colors ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-[10px] leading-none">
          {active ? (sortDir === 'desc' ? '▼' : '▲') : <span className="opacity-20">▼</span>}
        </span>
      </span>
    </th>
  )
}

export default function AccountBreakdown({ accounts, filteredTrades, aliases = {}, sortKey, sortDir, onSort }) {
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('equity')

  const selectedAcc = selected != null ? accounts.find(a => a.account.name === selected) ?? null : null
  const selectedTrades = useMemo(
    () => selectedAcc ? filteredTrades.filter(t => t.account === selectedAcc.account.name) : [],
    [selectedAcc, filteredTrades]
  )
  const equityCurve = useMemo(() => buildEquityCurve(selectedTrades), [selectedTrades])

  const displayName = (name) => aliases[name] || name
  const shortName = (name) => {
    const n = displayName(name)
    return n.length > 12 ? n.slice(0, 12) + '…' : n
  }

  const barData = accounts.map(a => ({
    name: shortName(a.account.name),
    profit: Math.round((a.stats.totalProfit ?? 0) * 100) / 100,
  }))

  const thBase  = 'px-3 py-2.5'
  const thRight = `${thBase} text-right`
  const thLeft  = `${thBase} text-left`

  return (
    <div className="space-y-4">
      {accounts.length > 1 && (
        <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4">
          <div className="text-sm font-semibold text-slate-300 mb-3">口座別 損益比較</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} width={55} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #1f2d40', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={v => [v >= 0 ? '+' + v : v, '損益']}
              />
              <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                {barData.map((entry, i) => (
                  <Cell key={i} fill={entry.profit >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-[#111827] border border-[#1f2d40] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1f2d40]">
          <div className="text-sm font-semibold text-slate-300">口座別成績</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1f2d40] text-slate-500">
                <SortTh label="口座名"   col="name"        sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-left px-4 py-2.5" />
                <SortTh label="取引数"   col="trades"      sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={thRight} />
                <SortTh label="純益"     col="profit"      sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={thRight} />
                <SortTh label="PF"       col="pf"          sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={`${thLeft} w-40`} />
                <SortTh label="勝率"     col="winRate"     sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={thLeft} />
                <SortTh label="最大DD"   col="maxDrawdown" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={thRight} />
                <SortTh label="平均勝ち" col="avgWin"      sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={thRight} />
                <SortTh label="平均負け" col="avgLoss"     sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={thRight} />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const s = a.stats
                const isProfit = (s.totalProfit ?? 0) >= 0
                const isSelected = selected === a.account.name
                return (
                  <tr
                    key={a.account.name}
                    onClick={() => setSelected(isSelected ? null : a.account.name)}
                    className={`border-b border-[#1f2d40]/50 cursor-pointer transition-colors
                      ${isSelected ? 'bg-[#1a2235]' : 'hover:bg-[#1a2235]/60'}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isProfit ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span className="text-slate-200 font-medium truncate max-w-[200px]" title={a.account.name}>
                          {displayName(a.account.name)}
                        </span>
                        {isSelected && <span className="text-blue-400 text-xs">▶</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-400">
                      <span className="text-emerald-500">{s.wins ?? 0}</span>
                      <span className="text-slate-600">/</span>
                      <span className="text-red-500">{s.losses ?? 0}</span>
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isProfit ? '+' : ''}{(s.totalProfit ?? 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 w-44"><PFBar pf={s.profitFactor ?? 0} /></td>
                    <td className="px-3 py-2.5"><WinRatePie winRate={s.winRate ?? 0} /></td>
                    <td className="px-3 py-2.5 text-right font-mono text-amber-400">{(s.maxDrawdown ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-400">+{(s.avgWin ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-red-400">-{(s.avgLoss ?? 0).toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedAcc && (
        <div className="bg-[#111827] border border-[#1f2d40] rounded-xl overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-3 border-b border-[#1f2d40]">
            <div className="text-sm font-semibold text-slate-200 flex-1">
              {displayName(selectedAcc.account.name)}
              <span className="ml-2 text-xs text-slate-500 font-normal">{selectedTrades.length} trades</span>
            </div>
            <div className="flex gap-1">
              {['equity', 'trades'].map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${tab === t ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                  {t === 'equity' ? 'エクイティ' : '取引一覧'}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4">
            <div className={tab === 'equity' ? '' : 'hidden'}>
              <EquityChart data={equityCurve} title={`${displayName(selectedAcc.account.name)} — エクイティカーブ`} />
            </div>
            <div className={tab !== 'equity' ? '' : 'hidden'}>
              <TradeTable trades={selectedTrades} aliases={aliases} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
