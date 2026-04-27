import { useState, useMemo } from 'react'
import { buildEquityCurve } from '../lib/mt4Parser'
import EquityChart from './EquityChart'
import TradeTable from './TradeTable'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

function PFBar({ pf }) {
  const capped = Math.min(isFinite(pf) ? pf : 5, 5)
  const pct = (capped / 5) * 100
  const color = pf >= 2 ? '#10b981' : pf >= 1 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-[#0a0e17] rounded-full h-1.5 overflow-hidden">
        <div style={{ width: `${pct}%`, background: color }} className="h-full rounded-full" />
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
        className="w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: `conic-gradient(${color} ${winRate * 3.6}deg, #1f2d40 0deg)` }}
      />
      <span className="font-mono text-xs" style={{ color }}>{winRate.toFixed(1)}%</span>
    </div>
  )
}

export default function EABreakdown({ eaGroups }) {
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('equity')

  const selectedGroup = selected != null ? eaGroups[selected] : null
  const equityCurve = useMemo(
    () => selectedGroup ? buildEquityCurve(selectedGroup.trades) : [],
    [selectedGroup]
  )

  const barData = eaGroups.map(g => ({
    name: g.ea.length > 12 ? g.ea.slice(0, 12) + '…' : g.ea,
    profit: Math.round(g.totalProfit * 100) / 100,
  }))

  return (
    <div className="space-y-4">
      {/* EAごとのバーチャート */}
      {eaGroups.length > 1 && (
        <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4">
          <div className="text-sm font-semibold text-slate-300 mb-3">EA別 損益比較</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} width={55} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #1f2d40', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v) => [v >= 0 ? '+' + v : v, '損益']}
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

      {/* EAリストテーブル */}
      <div className="bg-[#111827] border border-[#1f2d40] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1f2d40]">
          <div className="text-sm font-semibold text-slate-300">EA別成績</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1f2d40] text-slate-500">
                <th className="text-left px-4 py-2.5 font-medium">EA名</th>
                <th className="text-left px-3 py-2.5 font-medium">口座</th>
                <th className="text-right px-3 py-2.5 font-medium">取引数</th>
                <th className="text-right px-3 py-2.5 font-medium">純益</th>
                <th className="text-left px-3 py-2.5 font-medium w-40">PF</th>
                <th className="text-left px-3 py-2.5 font-medium">勝率</th>
                <th className="text-right px-3 py-2.5 font-medium">最大DD</th>
                <th className="text-right px-3 py-2.5 font-medium">平均勝ち</th>
                <th className="text-right px-3 py-2.5 font-medium">平均負け</th>
              </tr>
            </thead>
            <tbody>
              {eaGroups.map((g, i) => {
                const isProfit = g.totalProfit >= 0
                const isSelected = selected === i
                return (
                  <tr
                    key={g.ea}
                    onClick={() => setSelected(isSelected ? null : i)}
                    className={`border-b border-[#1f2d40]/50 cursor-pointer transition-colors
                      ${isSelected ? 'bg-[#1a2235]' : 'hover:bg-[#1a2235]/60'}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isProfit ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span className="text-slate-200 font-medium truncate max-w-[160px]" title={g.ea}>{g.ea}</span>
                        {isSelected && <span className="text-blue-400 text-xs">▶</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {g.accounts.length > 1
                        ? <span className="bg-blue-900/40 text-blue-400 px-1.5 py-0.5 rounded text-xs">{g.accounts.length}口座</span>
                        : <span className="truncate max-w-[80px] block" title={g.accounts[0]}>{g.accounts[0]}</span>
                      }
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-400">
                      <span className="text-emerald-500">{g.wins}</span>
                      <span className="text-slate-600">/</span>
                      <span className="text-red-500">{g.losses}</span>
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isProfit ? '+' : ''}{g.totalProfit.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 w-44">
                      <PFBar pf={g.profitFactor} />
                    </td>
                    <td className="px-3 py-2.5">
                      <WinRatePie winRate={g.winRate} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-amber-400">{g.maxDrawdown.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-400">+{g.avgWin.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-red-400">-{g.avgLoss.toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 選択EAの詳細 */}
      {selectedGroup && (
        <div className="bg-[#111827] border border-[#1f2d40] rounded-xl overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-3 border-b border-[#1f2d40]">
            <div className="text-sm font-semibold text-slate-200 flex-1">
              {selectedGroup.ea}
              <span className="ml-2 text-xs text-slate-500 font-normal">{selectedGroup.totalTrades} trades</span>
            </div>
            <div className="flex gap-1">
              {['equity', 'trades'].map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${tab === t ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {t === 'equity' ? 'エクイティ' : '取引一覧'}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4">
            <div className={tab === 'equity' ? '' : 'hidden'}>
              <EquityChart data={equityCurve} title={`${selectedGroup.ea} — エクイティカーブ`} />
            </div>
            <div className={tab !== 'equity' ? '' : 'hidden'}>
              <TradeTable trades={selectedGroup.trades} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
