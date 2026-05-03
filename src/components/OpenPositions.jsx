import { useState, useMemo } from 'react'
import ChartModal from './ChartModal'

export default function OpenPositions({ positions, aliases = {}, charts = {}, trades = [] }) {
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [chartSymbol, setChartSymbol]         = useState(null)

  const accounts = useMemo(() => {
    const seen = new Set()
    return positions.filter(p => { const ok = !seen.has(p.account); seen.add(p.account); return ok })
                    .map(p => p.account)
  }, [positions])

  const filtered = selectedAccount ? positions.filter(p => p.account === selectedAccount) : positions

  const totalProfit = filtered.reduce((s, p) => s + p.profit, 0)
  const totalSwap   = filtered.reduce((s, p) => s + p.swap,   0)
  const totalNet    = totalProfit + totalSwap
  const isProfit = totalNet >= 0

  const displayName = (name) => aliases[name] || name

  // charts は { SYMBOL: { tf, candles[] } } の形式
  const chartSymbols = Object.keys(charts)

  if (!positions || positions.length === 0) return null

  return (
    <>
      <div className="bg-[#111827] border border-[#1f2d40] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1f2d40] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-semibold text-slate-300">保有ポジション</span>
            <span className="text-xs text-slate-500">{filtered.length} 件</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {accounts.length > 1 && (
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => setSelectedAccount(null)}
                  className={`text-xs px-2 py-0.5 rounded-lg transition-colors ${!selectedAccount ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  全口座
                </button>
                {accounts.map(acc => (
                  <button
                    key={acc}
                    onClick={() => setSelectedAccount(selectedAccount === acc ? null : acc)}
                    className={`text-xs px-2 py-0.5 rounded-lg transition-colors truncate max-w-[120px] ${selectedAccount === acc ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    title={displayName(acc)}
                  >
                    {displayName(acc)}
                  </button>
                ))}
              </div>
            )}
            <div className={`font-mono text-sm font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
              {isProfit ? '+' : ''}{totalNet.toFixed(2)}
            </div>
          </div>
        </div>

        {/* モバイルカードビュー */}
        <div className="sm:hidden divide-y divide-[#1f2d40]">
          {filtered.map((p, i) => {
            const net = p.profit + p.swap
            const isLong = p.type === 'buy'
            const hasChart = chartSymbols.includes(p.symbol)
            return (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${isLong ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {isLong ? '買' : '売'}
                    </span>
                    <span className="text-sm font-semibold text-slate-200">{p.symbol}</span>
                    <span className="text-xs text-slate-500">{p.size}lot</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasChart && (
                      <button
                        onClick={() => setChartSymbol(p.symbol)}
                        className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded transition-colors"
                      >
                        📈
                      </button>
                    )}
                    <span className={`font-mono text-sm font-bold flex-shrink-0 ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {net >= 0 ? '+' : ''}{net.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span>建値 <span className="text-slate-400 font-mono">{p.openPrice}</span></span>
                  <span>現在値 <span className="text-slate-400 font-mono">{p.currentPrice}</span></span>
                  <span className="text-slate-600 truncate">{displayName(p.account)}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* デスクトップテーブルビュー */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1f2d40] text-slate-500">
                <th className="px-4 py-2.5 text-left font-medium">口座名</th>
                <th className="px-4 py-2.5 text-left font-medium">通貨ペア</th>
                <th className="px-3 py-2.5 text-left font-medium">種別</th>
                <th className="px-3 py-2.5 text-right font-medium">ロット</th>
                <th className="px-3 py-2.5 text-right font-medium">建値</th>
                <th className="px-3 py-2.5 text-right font-medium">現在値</th>
                <th className="px-3 py-2.5 text-right font-medium">損益</th>
                <th className="px-3 py-2.5 text-right font-medium">スワップ</th>
                <th className="px-3 py-2.5 text-right font-medium">SL</th>
                <th className="px-3 py-2.5 text-right font-medium">TP</th>
                <th className="px-3 py-2.5 text-center font-medium">チャート</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const isLong   = p.type === 'buy'
                const hasChart = chartSymbols.includes(p.symbol)
                return (
                  <tr key={i} className="border-b border-[#1f2d40]/50 hover:bg-[#1a2235]/40 transition-colors">
                    <td className="px-4 py-2.5 text-slate-400 max-w-[150px] truncate" title={displayName(p.account)}>
                      {displayName(p.account)}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-200">{p.symbol}</td>
                    <td className="px-3 py-2.5">
                      <span className={`font-bold px-1.5 py-0.5 rounded ${isLong ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {isLong ? '買' : '売'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-300">{p.size}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-400">{p.openPrice}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-300">{p.currentPrice}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-bold ${p.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {p.profit >= 0 ? '+' : ''}{p.profit.toFixed(2)}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono ${p.swap >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                      {p.swap.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-500">{p.sl || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-500">{p.tp || '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      {hasChart ? (
                        <button
                          onClick={() => setChartSymbol(p.symbol)}
                          className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded transition-colors"
                        >
                          📈
                        </button>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {chartSymbol && (
        <ChartModal
          symbol={chartSymbol}
          chartDataMap={charts[chartSymbol]}
          trades={trades}
          positions={positions.filter(p => p.symbol === chartSymbol)}
          onClose={() => setChartSymbol(null)}
        />
      )}
    </>
  )
}
