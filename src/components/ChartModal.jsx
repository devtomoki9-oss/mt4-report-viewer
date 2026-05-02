import TradeChart from './TradeChart'

export default function ChartModal({ symbol, chartData, trades, positions, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-[#0a0e17]/90 backdrop-blur flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#111827] border border-[#1f2d40] rounded-t-2xl sm:rounded-2xl w-full max-w-4xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダ */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1f2d40] flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-100">{symbol}</span>
            {chartData && (
              <span className="text-xs text-slate-500">
                {tfLabel(chartData.tf)} · {chartData.candles?.length ?? 0}本
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl px-2">✕</button>
        </div>

        {/* チャート本体 */}
        <div className="p-4">
          <TradeChart
            symbol={symbol}
            chartData={chartData}
            trades={trades}
            positions={positions}
          />
        </div>

        {/* 凡例 */}
        <div className="px-5 pb-4 flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="text-emerald-400">▲</span> エントリー（買）</span>
          <span className="flex items-center gap-1"><span className="text-red-400">▼</span> エントリー（売）</span>
          <span className="flex items-center gap-1"><span className="text-slate-400">●</span> 決済</span>
          <span className="flex items-center gap-1"><span className="border-t border-dashed border-emerald-400/60 w-4 inline-block" /> 保有中建値</span>
        </div>
      </div>
    </div>
  )
}

function tfLabel(tf) {
  const map = { 1: 'M1', 5: 'M5', 15: 'M15', 30: 'M30', 60: 'H1', 240: 'H4', 1440: 'D1' }
  return map[tf] ?? `M${tf}`
}
