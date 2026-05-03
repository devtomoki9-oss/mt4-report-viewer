import { useEffect, useRef, useCallback } from 'react'
import { createChart, CrosshairMode, CandlestickSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts'

export default function TradeChart({ chartData, trades = [], positions = [], symbol }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)

  // MT4: "2024.01.15 09:00:00" / MT5: "2024-01-15 09:00:00" を両方処理
  const toUnixSec = (str) =>
    Math.floor(new Date(str.replace(' ', 'T').replace(/\./g, '-')).getTime() / 1000)

  const handleZoom = useCallback((factor) => {
    const chart = chartRef.current
    if (!chart) return
    const range = chart.timeScale().getVisibleLogicalRange()
    if (!range) return
    const center = (range.from + range.to) / 2
    const half   = (range.to - range.from) / 2 * factor
    chart.timeScale().setVisibleLogicalRange({ from: center - half, to: center + half })
  }, [])

  const handleFit = useCallback(() => {
    chartRef.current?.timeScale().fitContent()
  }, [])

  useEffect(() => {
    if (!containerRef.current || !chartData) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0d1117' },
        textColor:  '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1f2d40' },
        horzLines: { color: '#1f2d40' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1f2d40' },
      timeScale: {
        borderColor:    '#1f2d40',
        timeVisible:    true,
        secondsVisible: false,
      },
      width:  containerRef.current.clientWidth,
      height: 420,
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:         '#10b981',
      downColor:       '#ef4444',
      borderUpColor:   '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor:     '#10b981',
      wickDownColor:   '#ef4444',
    })

    const candles = (chartData.candles || []).map(c => ({
      time:  toUnixSec(c.t),
      open:  c.o,
      high:  c.h,
      low:   c.l,
      close: c.c,
    })).filter(c => c.time > 0)

    candleSeries.setData(candles)

    // ローソク足の時間範囲（この範囲外のマーカーは左/右端に集積するため除外）
    const firstTs = candles[0]?.time ?? 0
    const lastTs  = candles[candles.length - 1]?.time ?? 0

    // マーカー生成 + 同一バー・同一方向の重複を統合
    const symTrades = trades.filter(t => t.symbol === symbol)
    const markerMap = new Map() // key: `${time}_${position}` → marker

    const addMarker = (m) => {
      if (m.time < firstTs || m.time > lastTs) return // 範囲外除外
      const key = `${m.time}_${m.position}`
      if (markerMap.has(key)) {
        const ex = markerMap.get(key)
        if (m.text) ex.text = ex.text ? `${ex.text} / ${m.text}` : m.text
      } else {
        markerMap.set(key, { ...m })
      }
    }

    for (const t of symTrades) {
      if (t.openTime) {
        const ts = toUnixSec(t.openTime)
        if (ts > 0) addMarker({
          time:     ts,
          position: t.type === 'buy' ? 'belowBar' : 'aboveBar',
          color:    t.type === 'buy' ? '#10b981'  : '#ef4444',
          shape:    t.type === 'buy' ? 'arrowUp'  : 'arrowDown',
          text:     String(t.size),
        })
      }
      if (t.closeTime) {
        const ts = toUnixSec(t.closeTime)
        const pnl = t.netProfit ?? t.profit ?? 0
        if (ts > 0) addMarker({
          time:     ts,
          position: t.type === 'buy' ? 'aboveBar' : 'belowBar',
          color:    pnl >= 0 ? '#10b981' : '#ef4444',
          shape:    'circle',
          text:     `${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}`,
        })
      }
    }

    const markers = [...markerMap.values()].sort((a, b) => a.time - b.time)
    createSeriesMarkers(candleSeries, markers)

    // 保有ポジションの建値ライン
    for (const p of positions.filter(p => p.symbol === symbol)) {
      const line = chart.addSeries(LineSeries, {
        color:            p.type === 'buy' ? '#34d399' : '#f87171',
        lineWidth:        1,
        lineStyle:        2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      if (candles.length > 0) {
        line.setData([
          { time: candles[0].time,                  value: p.openPrice },
          { time: candles[candles.length - 1].time, value: p.openPrice },
        ])
      }
    }

    chart.timeScale().fitContent()
    chartRef.current = chart

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
    }
  }, [chartData, trades, positions, symbol])

  if (!chartData) {
    return (
      <div className="flex items-center justify-center h-[420px] text-slate-600 text-sm text-center leading-relaxed">
        チャートデータがありません。<br />EA を再コンパイルして再アタッチしてください。
      </div>
    )
  }

  return (
    <div className="relative">
      <div ref={containerRef} className="w-full" />
      {/* 拡大縮小ボタン（左上・価格軸と干渉しない位置） */}
      <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
        <button
          onClick={() => handleZoom(0.6)}
          className="w-7 h-7 bg-[#111827]/80 border border-[#1f2d40] text-slate-300 hover:text-white hover:bg-[#1f2d40] rounded text-base leading-none flex items-center justify-center transition-colors"
          title="拡大"
        >+</button>
        <button
          onClick={handleFit}
          className="w-7 h-7 bg-[#111827]/80 border border-[#1f2d40] text-slate-400 hover:text-white hover:bg-[#1f2d40] rounded text-xs leading-none flex items-center justify-center transition-colors"
          title="全体表示"
        >⊡</button>
        <button
          onClick={() => handleZoom(1.7)}
          className="w-7 h-7 bg-[#111827]/80 border border-[#1f2d40] text-slate-300 hover:text-white hover:bg-[#1f2d40] rounded text-base leading-none flex items-center justify-center transition-colors"
          title="縮小"
        >−</button>
      </div>
    </div>
  )
}
