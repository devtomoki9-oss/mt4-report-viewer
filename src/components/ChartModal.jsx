import { useState, useRef } from 'react'
import TradeChart from './TradeChart'

const TF_ORDER  = ['1', '5', '15', '60', '240', '1440']
const TF_LABELS = { '1': 'M1', '5': 'M5', '15': 'M15', '60': 'H1', '240': 'H4', '1440': 'D1' }

export default function ChartModal({ symbol, chartDataMap, trades, positions, onClose }) {
  const available = TF_ORDER.filter(tf => chartDataMap?.[tf]?.candles?.length > 0)
  const defaultTf = available.includes('15') ? '15' : (available[0] ?? null)
  const [selectedTf, setSelectedTf] = useState(defaultTf)
  const tradeChartRef = useRef(null)

  const chartData = chartDataMap?.[selectedTf] ?? null

  const btnCls = "w-7 h-7 bg-[#0d1117] border border-[#1f2d40] text-slate-400 hover:text-white hover:bg-[#1f2d40] rounded leading-none flex items-center justify-center transition-colors flex-shrink-0"

  return (
    <div
      className="fixed inset-0 bg-[#0a0e17]/90 backdrop-blur flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#111827] border border-[#1f2d40] rounded-t-2xl sm:rounded-2xl w-full max-w-5xl flex flex-col h-[75dvh] max-h-[100dvh] sm:h-[680px] sm:max-h-[90dvh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダ */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1f2d40] flex-shrink-0 gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-slate-100">{symbol}</span>

            {/* 時間足セレクター */}
            <div className="flex items-center gap-1">
              {available.length > 0
                ? TF_ORDER.filter(tf => available.includes(tf)).map(tf => (
                    <button
                      key={tf}
                      onClick={() => setSelectedTf(tf)}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        selectedTf === tf
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-500 hover:text-slate-300 border border-[#1f2d40]'
                      }`}
                    >
                      {TF_LABELS[tf]}
                    </button>
                  ))
                : <span className="text-xs text-slate-600">データなし</span>
              }
            </div>

            {chartData && (
              <span className="text-xs text-slate-600">{chartData.candles?.length ?? 0}本</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* ズームボタン（ヘッダに配置・価格軸と重ならない） */}
            <div className="flex gap-1">
              <button onClick={() => tradeChartRef.current?.zoomIn()}    className={btnCls} title="拡大"><span className="text-base">+</span></button>
              <button onClick={() => tradeChartRef.current?.fitContent()} className={btnCls} title="全体表示"><span className="text-xs">⊡</span></button>
              <button onClick={() => tradeChartRef.current?.zoomOut()}   className={btnCls} title="縮小"><span className="text-base">−</span></button>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl px-2">✕</button>
          </div>
        </div>

        {/* チャート本体 */}
        <div className="p-4 flex-1 min-h-0 overflow-hidden">
          <TradeChart
            ref={tradeChartRef}
            symbol={symbol}
            chartData={chartData}
            tf={selectedTf}
            trades={trades}
            positions={positions}
          />
        </div>

        {/* 凡例 */}
        <div className="px-5 pb-4 flex items-center gap-4 text-xs text-slate-500 flex-wrap flex-shrink-0 landscape:max-sm:hidden">
          <span className="flex items-center gap-1"><span className="text-emerald-400">▲</span> エントリー（買）</span>
          <span className="flex items-center gap-1"><span className="text-red-400">▼</span> エントリー（売）</span>
          <span className="flex items-center gap-1"><span className="text-slate-400">●</span> 決済</span>
          <span className="flex items-center gap-1"><span className="border-t border-dashed border-emerald-400/60 w-4 inline-block" /> 保有中建値</span>
          <span className="text-slate-600">マーカーにホバーで詳細</span>
        </div>
      </div>
    </div>
  )
}
